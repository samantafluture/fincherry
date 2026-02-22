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

function fallbackInsights(data: AnonymizedTransaction[]): {
  insights: Array<{ type: string; title: string; body: string }>;
} {
  if (data.length === 0) {
    return {
      insights: [
        {
          type: 'suggestion',
          title: 'No transactions in selected period',
          body: 'Upload statements or widen the date range to generate meaningful insights.',
        },
      ],
    };
  }

  let totalIncome = 0;
  let totalExpense = 0;
  const expenseByCategory = new Map<string, number>();
  const netByMonth = new Map<string, number>();

  for (const tx of data) {
    const signed = tx.isIncome ? tx.amountCad : -tx.amountCad;
    netByMonth.set(tx.month, (netByMonth.get(tx.month) ?? 0) + signed);

    if (tx.isIncome) {
      totalIncome += tx.amountCad;
      continue;
    }

    totalExpense += tx.amountCad;
    expenseByCategory.set(tx.category, (expenseByCategory.get(tx.category) ?? 0) + tx.amountCad);
  }

  const net = totalIncome - totalExpense;
  const sortedCategories = Array.from(expenseByCategory.entries()).sort((a, b) => b[1] - a[1]);
  const topCategory = sortedCategories[0];
  const topCategoryShare =
    topCategory && totalExpense > 0 ? Math.round((topCategory[1] / totalExpense) * 100) : 0;
  const monthlyNets = Array.from(netByMonth.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, value]) => value);
  const latestMonthNet = monthlyNets[monthlyNets.length - 1] ?? net;
  const avgMonthlyNet =
    monthlyNets.length > 0
      ? monthlyNets.reduce((sum, value) => sum + value, 0) / monthlyNets.length
      : net;

  const insights: Array<{ type: string; title: string; body: string }> = [
    {
      type: net >= 0 ? 'positive' : 'warning',
      title: net >= 0 ? 'Positive net cash flow' : 'Negative net cash flow',
      body:
        net >= 0
          ? `Income exceeded expenses by CAD ${net.toFixed(2)} in the selected period.`
          : `Expenses exceeded income by CAD ${Math.abs(net).toFixed(2)} in the selected period.`,
    },
  ];

  if (topCategory) {
    insights.push({
      type: topCategoryShare >= 25 ? 'warning' : 'suggestion',
      title: `Largest expense: ${topCategory[0]}`,
      body: `This category represents ${topCategoryShare}% of your total spending (CAD ${topCategory[1].toFixed(2)}).`,
    });
  }

  insights.push({
    type: latestMonthNet >= avgMonthlyNet ? 'positive' : 'suggestion',
    title: 'Monthly trend check',
    body: `Latest month net is CAD ${latestMonthNet.toFixed(2)} vs average CAD ${avgMonthlyNet.toFixed(2)}.`,
  });

  return { insights };
}

function extractJsonPayload(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  return text.trim();
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
}> {
  const prompt = JSON.stringify(data);
  const provider = hasGeminiApiKey() ? 'gemini' : 'local';
  const hash = crypto
    .createHash('sha256')
    .update(`insights:${provider}:${prompt}`)
    .digest('hex');

  const cached = await getCachedResponse(hash);
  if (cached) return cached as { insights: Array<{ type: string; title: string; body: string }> };

  if (!hasGeminiApiKey()) {
    const fallback = fallbackInsights(data);
    await cacheResponse(hash, fallback, 'local-fallback', 0);
    return fallback;
  }

  try {
    const model = process.env.GEMINI_INSIGHTS_MODEL?.trim() || 'gemini-2.0-flash';
    const response = await generateWithGemini({
      model,
      maxOutputTokens: 1800,
      temperature: 0.2,
      systemInstruction: `You are a personal finance analyst. The user will provide anonymized spending data
(amounts in CAD, categories, dates — no personal identifiers).
Analyze patterns, flag concerns, and give actionable suggestions.
Be specific with numbers.

Respond with valid JSON in this format:
{
  "insights": [
    { "type": "positive|warning|suggestion", "title": "Short title", "body": "1-2 sentence detail" }
  ]
}
Provide 3-5 insights. No markdown, just JSON.`,
      userPrompt: `Here is my spending data:\n${prompt}\n\nProvide 3-5 key insights as JSON.`,
    });

    const text = extractJsonPayload(response.text || '{}');
    let parsed: { insights: Array<{ type: string; title: string; body: string }> };

    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {
      parsed = { insights: [{ type: 'suggestion', title: 'Analysis complete', body: text }] };
    }

    await cacheResponse(
      hash,
      parsed,
      model,
      response.totalTokenCount,
    );
    return parsed;
  } catch {
    return fallbackInsights(data);
  }
}

export async function categorizeTransactions(
  descriptions: string[],
  categories: string[],
): Promise<Array<{ description: string; suggestedCategory: string | null }>> {
  const prompt = JSON.stringify({ descriptions, categories });
  const provider = hasGeminiApiKey() ? 'gemini' : 'local';
  const hash = crypto
    .createHash('sha256')
    .update(`categorize:${provider}:${prompt}`)
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
    const model = process.env.GEMINI_CATEGORIZATION_MODEL?.trim() || 'gemini-2.0-flash';
    const response = await generateWithGemini({
      model,
      maxOutputTokens: 900,
      temperature: 0,
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
