/**
 * Claude API integration.
 * Uses response caching via the ai_cache table (keyed by SHA-256 of prompt).
 */
import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { aiCache } from '../db/schema.js';
import type { AnonymizedTransaction } from './piiStripper.js';

const client = new Anthropic();

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
  const hash = crypto.createHash('sha256').update('insights:' + prompt).digest('hex');

  const cached = await getCachedResponse(hash);
  if (cached) return cached as { insights: Array<{ type: string; title: string; body: string }> };

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: `You are a personal finance analyst. The user will provide anonymized spending data
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
    messages: [
      {
        role: 'user',
        content: `Here is my spending data:\n${prompt}\n\nProvide 3-5 key insights as JSON.`,
      },
    ],
  });

  const text = response.content[0]?.type === 'text' ? response.content[0].text : '{}';
  let parsed: { insights: Array<{ type: string; title: string; body: string }> };

  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    parsed = { insights: [{ type: 'suggestion', title: 'Analysis complete', body: text }] };
  }

  await cacheResponse(hash, parsed, 'claude-sonnet-4-6', response.usage.input_tokens + response.usage.output_tokens);
  return parsed;
}

export async function categorizeTransactions(
  descriptions: string[],
  categories: string[],
): Promise<Array<{ description: string; suggestedCategory: string | null }>> {
  const prompt = JSON.stringify({ descriptions, categories });
  const hash = crypto.createHash('sha256').update('categorize:' + prompt).digest('hex');

  const cached = await getCachedResponse(hash);
  if (cached) return cached as Array<{ description: string; suggestedCategory: string | null }>;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    system: `Categorize transactions into the provided categories.
Respond with JSON array matching the input descriptions order.
Format: [{"description": "...", "suggestedCategory": "CategoryName or null"}]`,
    messages: [
      {
        role: 'user',
        content: `Transactions: ${JSON.stringify(descriptions)}\nCategories: ${categories.join(', ')}`,
      },
    ],
  });

  const text = response.content[0]?.type === 'text' ? response.content[0].text : '[]';
  let result: Array<{ description: string; suggestedCategory: string | null }>;

  try {
    result = JSON.parse(text) as typeof result;
  } catch {
    result = descriptions.map((d) => ({ description: d, suggestedCategory: null }));
  }

  await cacheResponse(hash, result, 'claude-haiku-4-5-20251001', response.usage.input_tokens + response.usage.output_tokens);
  return result;
}
