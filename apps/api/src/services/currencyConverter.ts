/**
 * Currency conversion service.
 * Uses frankfurter.app (free, no API key, supports BRL/EUR/CAD).
 * Caches rates in the exchange_rates table.
 */
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { exchangeRates } from '../db/schema.js';

const SUPPORTED = ['BRL', 'EUR', 'USD'] as const;
type NonCadCurrency = (typeof SUPPORTED)[number];
type SupportedCurrency = NonCadCurrency | 'CAD';

interface FrankfurterResponse {
  rates: Record<string, number>;
  date: string;
}

async function fetchRateFromApi(
  fromCurrency: string,
  date: string,
): Promise<number | null> {
  try {
    const url =
      date === new Date().toISOString().split('T')[0]
        ? `https://api.frankfurter.app/latest?from=${fromCurrency}&to=CAD`
        : `https://api.frankfurter.app/${date}?from=${fromCurrency}&to=CAD`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const data = (await res.json()) as FrankfurterResponse;
    return data.rates['CAD'] ?? null;
  } catch {
    return null;
  }
}

export async function fetchAndCacheRates(date: string): Promise<void> {
  for (const currency of SUPPORTED) {
    const rate = await fetchRateFromApi(currency, date);
    if (rate === null) continue;

    await db
      .insert(exchangeRates)
      .values({ fromCurrency: currency, toCurrency: 'CAD', rate: String(rate), rateDate: date })
      .onConflictDoUpdate({
        target: [exchangeRates.fromCurrency, exchangeRates.toCurrency, exchangeRates.rateDate],
        set: { rate: String(rate) },
      });
  }
}

export async function convertToCad(
  amount: number,
  currency: SupportedCurrency,
  date: string,
): Promise<{ amountCad: number; rate: number | null }> {
  if (currency === 'CAD') {
    return { amountCad: amount, rate: null };
  }

  // Try cached rate for exact date
  let rateRow = await db.query.exchangeRates.findFirst({
    where: and(
      eq(exchangeRates.fromCurrency, currency),
      eq(exchangeRates.toCurrency, 'CAD'),
      eq(exchangeRates.rateDate, date),
    ),
  });

  // Fallback: fetch from API and cache
  if (!rateRow) {
    const rate = await fetchRateFromApi(currency, date);
    if (rate !== null) {
      await db
        .insert(exchangeRates)
        .values({ fromCurrency: currency, toCurrency: 'CAD', rate: String(rate), rateDate: date })
        .onConflictDoNothing();
      rateRow = { id: 0, fromCurrency: currency, toCurrency: 'CAD', rate: String(rate), rateDate: date };
    }
  }

  if (!rateRow) {
    // Last resort: use most recent cached rate
    const recent = await db.query.exchangeRates.findFirst({
      where: and(eq(exchangeRates.fromCurrency, currency), eq(exchangeRates.toCurrency, 'CAD')),
      orderBy: (r, { desc }) => [desc(r.rateDate)],
    });
    if (recent) {
      console.warn(
        `Using stale exchange rate from ${recent.rateDate} for ${currency}→CAD`,
      );
      const rate = Number(recent.rate);
      return { amountCad: Math.round(amount * rate * 100) / 100, rate };
    }
    // No rate available — return original amount as 1:1
    console.error(`No exchange rate available for ${currency}→CAD on ${date}`);
    return { amountCad: amount, rate: null };
  }

  const rate = Number(rateRow.rate);
  return { amountCad: Math.round(amount * rate * 100) / 100, rate };
}
