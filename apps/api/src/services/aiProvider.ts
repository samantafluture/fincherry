/**
 * AI provider integration (Gemini API).
 * Uses response caching via the ai_cache table (keyed by SHA-256 of prompt).
 */
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { aiCache } from '../db/schema.js';
import type { AnonymizedTransaction } from './piiStripper.js';

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  usageMetadata?: {
    totalTokenCount?: number;
  };
}

type InsightItem = {
  type: 'positive' | 'warning' | 'suggestion';
  title: string;
  body: string;
};
type FallbackReason = 'missing_api_key' | 'provider_error' | 'parse_error';

interface ResponseMeta {
  provider: 'gemini' | 'local-fallback';
  generatedAt: string;
  cached: boolean;
  model?: string;
  fallbackReason?: FallbackReason;
}

export interface InsightsResponse {
  insights: InsightItem[];
  meta: ResponseMeta;
}

export interface PeriodSummary {
  label: string;
  startDate: string;
  endDate: string;
  transactionCount: number;
  totalIncome: number;
  operatingExpenses: number;
  internalMovements: number;
  operatingNet: number;
  topExpenseCategories: Array<{
    name: string;
    amount: number;
    sharePct: number;
  }>;
  monthlyNet: Array<{
    month: string;
    net: number;
  }>;
}

export interface AskResponse {
  answer: string;
  meta: ResponseMeta;
}

function hasGeminiApiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

function getGeminiApiKey(): string | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  return apiKey && apiKey.length > 0 ? apiKey : null;
}

async function generateWithGemini(input: {
  model: string;
  systemInstruction: string;
  userPrompt: string;
  maxOutputTokens: number;
  temperature: number;
  responseMimeType?: 'application/json' | 'text/plain';
  responseSchema?: unknown;
}): Promise<{ text: string; totalTokenCount: number }> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: input.systemInstruction }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: input.userPrompt }],
        },
      ],
      generationConfig: {
        temperature: input.temperature,
        maxOutputTokens: input.maxOutputTokens,
        ...(input.responseMimeType
          ? { responseMimeType: input.responseMimeType }
          : {}),
        ...(input.responseSchema ? { responseSchema: input.responseSchema } : {}),
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${errorBody}`);
  }

  const payload = (await response.json()) as GeminiGenerateResponse;
  const text =
    payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim() ?? '';

  return {
    text,
    totalTokenCount: payload.usageMetadata?.totalTokenCount ?? 0,
  };
}

function isInternalTransferCategory(category: string): boolean {
  return /(transfer|credit card payment|bill payment|payment received)/i.test(category);
}

function fallbackInsights(data: AnonymizedTransaction[]): InsightsResponse {
  const generatedAt = new Date().toISOString();
  if (data.length === 0) {
    return {
      insights: [
        {
          type: 'suggestion',
          title: 'No transactions in selected period',
          body: 'Upload statements or widen the date range to generate meaningful insights.',
        },
      ],
      meta: {
        provider: 'local-fallback',
        generatedAt,
        cached: false,
        fallbackReason: 'missing_api_key',
      },
    };
  }

  let totalIncome = 0;
  let totalOperatingExpense = 0;
  let totalMovementExpense = 0;
  const expenseByCategory = new Map<string, number>();
  const netByMonth = new Map<string, number>();

  for (const tx of data) {
    const signed = tx.isIncome ? tx.amountCad : -tx.amountCad;
    netByMonth.set(tx.month, (netByMonth.get(tx.month) ?? 0) + signed);

    if (tx.isIncome) {
      totalIncome += tx.amountCad;
      continue;
    }

    if (isInternalTransferCategory(tx.category)) {
      totalMovementExpense += tx.amountCad;
      continue;
    }

    totalOperatingExpense += tx.amountCad;
    expenseByCategory.set(tx.category, (expenseByCategory.get(tx.category) ?? 0) + tx.amountCad);
  }

  const net = totalIncome - (totalOperatingExpense + totalMovementExpense);
  const operatingNet = totalIncome - totalOperatingExpense;
  const sortedCategories = Array.from(expenseByCategory.entries()).sort((a, b) => b[1] - a[1]);
  const topCategory = sortedCategories[0];
  const topCategoryShare =
    topCategory && totalOperatingExpense > 0
      ? Math.round((topCategory[1] / totalOperatingExpense) * 100)
      : 0;
  const monthlyNets = Array.from(netByMonth.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, value]) => value);
  const latestMonthNet = monthlyNets[monthlyNets.length - 1] ?? net;
  const avgMonthlyNet =
    monthlyNets.length > 0
      ? monthlyNets.reduce((sum, value) => sum + value, 0) / monthlyNets.length
      : net;

  const insights: InsightItem[] = [
    {
      type: operatingNet >= 0 ? 'positive' : 'warning',
      title:
        operatingNet >= 0
          ? 'Positive operating cash flow'
          : 'Negative operating cash flow',
      body:
        operatingNet >= 0
          ? `Income exceeded operating spend by CAD ${operatingNet.toFixed(2)} (transfers excluded).`
          : `Operating spend exceeded income by CAD ${Math.abs(operatingNet).toFixed(2)} (transfers excluded).`,
    },
  ];

  if (totalMovementExpense > 0) {
    insights.push({
      type: 'suggestion',
      title: 'Internal cash movement detected',
      body: `Detected CAD ${totalMovementExpense.toFixed(2)} in transfers/credit-card payments. These are excluded from spending-category analysis.`,
    });
  }

  if (topCategory) {
    insights.push({
      type: topCategoryShare >= 25 ? 'warning' : 'suggestion',
      title: `Largest expense: ${topCategory[0]}`,
      body: `This category represents ${topCategoryShare}% of operating spending (CAD ${topCategory[1].toFixed(2)}).`,
    });
  }

  insights.push({
    type: latestMonthNet >= avgMonthlyNet ? 'positive' : 'suggestion',
    title: 'Monthly trend check',
    body: `Latest month net is CAD ${latestMonthNet.toFixed(2)} vs average CAD ${avgMonthlyNet.toFixed(2)}.`,
  });

  return {
    insights,
    meta: {
      provider: 'local-fallback',
      generatedAt,
      cached: false,
      fallbackReason: 'missing_api_key',
    },
  };
}

function fallbackInsightsWithReason(
  data: AnonymizedTransaction[],
  reason: FallbackReason,
): InsightsResponse {
  const base = fallbackInsights(data);
  return {
    ...base,
    meta: {
      ...base.meta,
      fallbackReason: reason,
    },
  };
}

function fallbackQuestionAnswer(input: {
  question: string;
  primary: PeriodSummary;
  comparison?: PeriodSummary;
  reason: FallbackReason;
}): AskResponse {
  const generatedAt = new Date().toISOString();
  const primaryTop = input.primary.topExpenseCategories[0];
  const primaryLine = primaryTop
    ? `Top operating category in ${input.primary.label}: ${primaryTop.name} (CAD ${primaryTop.amount.toFixed(2)}).`
    : `No categorized operating expenses found in ${input.primary.label}.`;
  const comparisonLine = input.comparison
    ? `Operating net changed from CAD ${input.comparison.operatingNet.toFixed(2)} (${input.comparison.label}) to CAD ${input.primary.operatingNet.toFixed(2)} (${input.primary.label}).`
    : '';
  const reasonLine =
    input.reason === 'missing_api_key'
      ? 'Gemini key is missing, so this is a local fallback response.'
      : 'Gemini request failed, so this is a local fallback response.';

  return {
    answer: [
      `Question: ${input.question}`,
      primaryLine,
      comparisonLine,
      `Operating net in ${input.primary.label}: CAD ${input.primary.operatingNet.toFixed(2)}.`,
      reasonLine,
    ]
      .filter(Boolean)
      .join(' '),
    meta: {
      provider: 'local-fallback',
      generatedAt,
      cached: false,
      fallbackReason: input.reason,
    },
  };
}

function extractJsonPayload(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  return text.trim();
}

function normalizeInsightType(value: string | undefined): 'positive' | 'warning' | 'suggestion' {
  const lowered = (value ?? '').toLowerCase();
  if (lowered === 'positive' || lowered === 'warning' || lowered === 'suggestion') {
    return lowered;
  }
  return 'suggestion';
}

function parseInsightsFromModelText(text: string): InsightItem[] | null {
  const candidates = [extractJsonPayload(text), text];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const rows = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object' && Array.isArray((parsed as { insights?: unknown }).insights)
          ? (parsed as { insights: unknown[] }).insights
          : parsed && typeof parsed === 'object'
            ? [parsed]
            : [];

      const normalized: InsightItem[] = [];
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const r = row as { type?: string; title?: string; body?: string };
        const title = (r.title ?? '').trim();
        const body = (r.body ?? '').trim();
        if (!title || !body) continue;
        normalized.push({
          type: normalizeInsightType(r.type),
          title,
          body,
        });
      }

      if (normalized.length > 0) return normalized;
    } catch {
      // Try next candidate format.
    }
  }

  return null;
}

const INSIGHTS_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    insights: {
      type: 'ARRAY',
      minItems: 3,
      maxItems: 5,
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', enum: ['positive', 'warning', 'suggestion'] },
          title: { type: 'STRING' },
          body: { type: 'STRING' },
        },
        required: ['type', 'title', 'body'],
        propertyOrdering: ['type', 'title', 'body'],
      },
    },
  },
  required: ['insights'],
  propertyOrdering: ['insights'],
} as const;

async function repairInsightsWithGemini(input: {
  rawText: string;
  model: string;
}): Promise<InsightItem[] | null> {
  const response = await generateWithGemini({
    model: input.model,
    maxOutputTokens: 900,
    temperature: 0,
    responseMimeType: 'application/json',
    responseSchema: INSIGHTS_RESPONSE_SCHEMA,
    systemInstruction: `You repair malformed model output.
Return ONLY valid JSON matching the target insights schema.
Do not add markdown. Do not add commentary.`,
    userPrompt: `Repair this into valid JSON with the target schema:

${input.rawText}`,
  });

  return parseInsightsFromModelText(response.text || '');
}

async function getCachedResponse(hash: string): Promise<unknown | null> {
  const cached = await db.query.aiCache.findFirst({
    where: eq(aiCache.promptHash, hash),
  });
  if (!cached) return null;
  try {
    return JSON.parse(cached.response) as unknown;
  } catch {
    return null;
  }
}

async function cacheResponse(
  hash: string,
  response: unknown,
  model: string,
  tokensUsed: number,
): Promise<void> {
  await db
    .insert(aiCache)
    .values({
      promptHash: hash,
      response: JSON.stringify(response),
      model,
      tokensUsed,
    })
    .onConflictDoNothing();
}

export async function generateInsights(data: AnonymizedTransaction[]): Promise<{
  insights: Array<{ type: string; title: string; body: string }>;
  meta: ResponseMeta;
}> {
  return generateInsightsWithOptions(data, {});
}

export async function generateInsightsWithOptions(
  data: AnonymizedTransaction[],
  options: { bypassCache?: boolean; variationToken?: string },
): Promise<InsightsResponse> {
  const prompt = JSON.stringify(data);
  const provider = hasGeminiApiKey() ? 'gemini' : 'local';
  const modelForKey =
    provider === 'gemini'
      ? process.env.GEMINI_INSIGHTS_MODEL?.trim() || 'gemini-2.5-flash'
      : 'local-fallback';
  const variationKey = options.bypassCache
    ? options.variationToken ?? `refresh-${Date.now()}`
    : 'stable';
  const hash = crypto
    .createHash('sha256')
    .update(`insights:${provider}:${modelForKey}:${variationKey}:${prompt}`)
    .digest('hex');

  if (!options.bypassCache) {
    const cached = await getCachedResponse(hash);
    if (cached) {
      const parsed = cached as Partial<InsightsResponse>;
      return {
        insights: Array.isArray(parsed.insights) ? parsed.insights : [],
        meta: {
          provider:
            parsed.meta?.provider === 'gemini' ? 'gemini' : 'local-fallback',
          generatedAt: parsed.meta?.generatedAt ?? new Date().toISOString(),
          cached: true,
          model: parsed.meta?.model,
          fallbackReason: parsed.meta?.fallbackReason,
        },
      };
    }
  }

  if (!hasGeminiApiKey()) {
    const fallback = fallbackInsights(data);
    await cacheResponse(hash, fallback, 'local-fallback', 0);
    return fallback;
  }

  try {
    const model = modelForKey;
    const generatedAt = new Date().toISOString();
    const response = await generateWithGemini({
      model,
      maxOutputTokens: 1800,
      temperature: options.bypassCache ? 0.55 : 0.35,
      responseMimeType: 'application/json',
      responseSchema: INSIGHTS_RESPONSE_SCHEMA,
      systemInstruction: `You are a personal finance analyst. The user will provide anonymized spending data
(amounts in CAD, categories, dates — no personal identifiers).
Analyze patterns, flag concerns, and give actionable suggestions.
Be specific with numbers.
Treat internal transfers and credit-card bill payments as cash movement, not operating spending.
Focus insights on recurring habits, large categories, and improvement opportunities.
Keep insights concise.

Respond with valid JSON in this format:
{
  "insights": [
    { "type": "positive|warning|suggestion", "title": "Short title", "body": "1-2 sentence detail" }
  ]
}
Provide 3-5 insights. No markdown, just JSON.`,
      userPrompt: `Here is my spending data:\n${prompt}\n\nProvide 3-5 key insights as JSON.${
        options.bypassCache ? `\n\nVariation token: ${variationKey}` : ''
      }`,
    });

    let parsedInsights = parseInsightsFromModelText(response.text || '');
    if (!parsedInsights && (response.text || '').trim().length > 0) {
      try {
        parsedInsights = await repairInsightsWithGemini({
          rawText: response.text,
          model,
        });
      } catch {
        // Fall through to local fallback if repair fails.
      }
    }

    const result: InsightsResponse = {
      insights: parsedInsights ?? fallbackInsights(data).insights,
      meta: {
        provider: parsedInsights ? 'gemini' : 'local-fallback',
        generatedAt,
        cached: false,
        model,
        ...(parsedInsights ? {} : { fallbackReason: 'parse_error' as const }),
      },
    };

    await cacheResponse(
      hash,
      result,
      model,
      response.totalTokenCount,
    );
    return result;
  } catch {
    return fallbackInsightsWithReason(data, 'provider_error');
  }
}

export async function askFinanceQuestionWithOptions(
  input: {
    question: string;
    primary: PeriodSummary;
    comparison?: PeriodSummary;
  },
  options: { bypassCache?: boolean; variationToken?: string },
): Promise<AskResponse> {
  const provider = hasGeminiApiKey() ? 'gemini' : 'local';
  const modelForKey =
    provider === 'gemini'
      ? process.env.GEMINI_INSIGHTS_MODEL?.trim() || 'gemini-2.5-flash'
      : 'local-fallback';
  const variationKey = options.bypassCache
    ? options.variationToken ?? `refresh-${Date.now()}`
    : 'stable';
  const payload = JSON.stringify(input);
  const hash = crypto
    .createHash('sha256')
    .update(`ask:${provider}:${modelForKey}:${variationKey}:${payload}`)
    .digest('hex');

  if (!options.bypassCache) {
    const cached = await getCachedResponse(hash);
    if (cached) {
      const parsed = cached as Partial<AskResponse>;
      if (typeof parsed.answer === 'string') {
        return {
          answer: parsed.answer,
          meta: {
            provider:
              parsed.meta?.provider === 'gemini' ? 'gemini' : 'local-fallback',
            generatedAt: parsed.meta?.generatedAt ?? new Date().toISOString(),
            cached: true,
            model: parsed.meta?.model,
            fallbackReason: parsed.meta?.fallbackReason,
          },
        };
      }
    }
  }

  if (!hasGeminiApiKey()) {
    const fallback = fallbackQuestionAnswer({
      ...input,
      reason: 'missing_api_key',
    });
    await cacheResponse(hash, fallback, 'local-fallback', 0);
    return fallback;
  }

  try {
    const model = modelForKey;
    const generatedAt = new Date().toISOString();
    const response = await generateWithGemini({
      model,
      maxOutputTokens: 1100,
      temperature: options.bypassCache ? 0.5 : 0.25,
      systemInstruction: `You are a personal finance analyst.
Answer only from the provided structured summary. Do not invent values.
Treat internal transfers and credit-card payments as cash movement, not operating spend.
If comparison summary is present, highlight the biggest changes with concrete numbers.
Keep response concise, practical, and numeric.`,
      userPrompt: `User question: ${input.question}

Primary period summary (JSON):
${JSON.stringify(input.primary, null, 2)}

Comparison period summary (JSON or null):
${JSON.stringify(input.comparison ?? null, null, 2)}

Return plain text only (no markdown).${
        options.bypassCache ? `\nVariation token: ${variationKey}` : ''
      }`,
    });

    const result: AskResponse = {
      answer: extractJsonPayload(response.text || '').trim(),
      meta: {
        provider: 'gemini',
        generatedAt,
        cached: false,
        model,
      },
    };

    await cacheResponse(hash, result, model, response.totalTokenCount);
    return result;
  } catch {
    const fallback = fallbackQuestionAnswer({
      ...input,
      reason: 'provider_error',
    });
    return fallback;
  }
}

export async function categorizeTransactions(
  descriptions: string[],
  categories: string[],
): Promise<Array<{ description: string; suggestedCategory: string | null }>> {
  const prompt = JSON.stringify({ descriptions, categories });
  const provider = hasGeminiApiKey() ? 'gemini' : 'local';
  const modelForKey =
    provider === 'gemini'
      ? process.env.GEMINI_CATEGORIZATION_MODEL?.trim() || 'gemini-2.5-flash'
      : 'local-fallback';
  const hash = crypto
    .createHash('sha256')
    .update(`categorize:${provider}:${modelForKey}:${prompt}`)
    .digest('hex');

  const cached = await getCachedResponse(hash);
  if (cached) return cached as Array<{ description: string; suggestedCategory: string | null }>;

  if (!hasGeminiApiKey()) {
    const fallback = descriptions.map((description) => {
      const descriptionLower = description.toLowerCase();
      const suggestion =
        categories.find((category) => descriptionLower.includes(category.toLowerCase())) ?? null;
      return { description, suggestedCategory: suggestion };
    });
    await cacheResponse(hash, fallback, 'local-fallback', 0);
    return fallback;
  }

  try {
    const model = modelForKey;
    const response = await generateWithGemini({
      model,
      maxOutputTokens: 900,
      temperature: 0,
      responseMimeType: 'application/json',
      systemInstruction: `Categorize transactions into the provided categories.
Respond with JSON array matching the input descriptions order.
Format: [{"description": "...", "suggestedCategory": "CategoryName or null"}]`,
      userPrompt: `Transactions: ${JSON.stringify(descriptions)}\nCategories: ${categories.join(', ')}`,
    });

    const text = extractJsonPayload(response.text || '[]');
    let result: Array<{ description: string; suggestedCategory: string | null }>;

    try {
      result = JSON.parse(text) as typeof result;
    } catch {
      result = descriptions.map((d) => ({ description: d, suggestedCategory: null }));
    }

    await cacheResponse(
      hash,
      result,
      model,
      response.totalTokenCount,
    );
    return result;
  } catch {
    return descriptions.map((description) => ({ description, suggestedCategory: null }));
  }
}
