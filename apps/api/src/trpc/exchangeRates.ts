import { z } from 'zod';
import { and, gte, lte, eq, desc } from 'drizzle-orm';
import { router, protectedProcedure } from './trpc.js';
import { db } from '../db/index.js';
import { exchangeRates } from '../db/schema.js';
import { fetchAndCacheRates } from '../services/currencyConverter.js';

export const exchangeRatesRouter = router({
  current: protectedProcedure.query(async () => {
    const today = new Date().toISOString().split('T')[0]!;

    // Try to get today's rates, fetch if missing
    const existing = await db.query.exchangeRates.findMany({
      where: eq(exchangeRates.rateDate, today),
    });

    if (existing.length === 0) {
      await fetchAndCacheRates(today);
      return db.query.exchangeRates.findMany({
        where: eq(exchangeRates.rateDate, today),
      });
    }

    return existing;
  }),

  history: protectedProcedure.input(z.object({ startDate: z.string(), endDate: z.string() })).query(
    async ({ input }) => {
      return db.query.exchangeRates.findMany({
        where: and(
          gte(exchangeRates.rateDate, input.startDate),
          lte(exchangeRates.rateDate, input.endDate),
        ),
        orderBy: desc(exchangeRates.rateDate),
      });
    },
  ),

  refresh: protectedProcedure.mutation(async () => {
    const today = new Date().toISOString().split('T')[0]!;
    await fetchAndCacheRates(today);
    return { ok: true };
  }),
});
