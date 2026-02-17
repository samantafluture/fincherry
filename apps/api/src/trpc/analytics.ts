import { z } from 'zod';
import { and, gte, lte, sql, eq, lt } from 'drizzle-orm';
import { router, protectedProcedure } from './trpc.js';
import { db } from '../db/index.js';
import { transactions, type Category } from '../db/schema.js';

const dateRangeSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
});

const analyticsFiltersSchema = dateRangeSchema.extend({
  accountId: z.string().uuid().optional(),
});

export const analyticsRouter = router({
  summary: protectedProcedure.input(dateRangeSchema).query(async ({ input }) => {
    const { startDate, endDate } = input;

    const rows = await db
      .select({
        amountCad: transactions.amountCad,
      })
      .from(transactions)
      .where(and(gte(transactions.date, startDate), lte(transactions.date, endDate)));

    let income = 0;
    let expenses = 0;
    for (const r of rows) {
      const v = Number(r.amountCad);
      if (v > 0) income += v;
      else expenses += Math.abs(v);
    }

    const netSaved = income - expenses;
    const savingsRate = income > 0 ? Math.round((netSaved / income) * 100) : 0;

    // Previous period delta
    const periodMs =
      new Date(endDate).getTime() - new Date(startDate).getTime();
    const prevEnd = new Date(new Date(startDate).getTime() - 1).toISOString().split('T')[0]!;
    const prevStart = new Date(new Date(startDate).getTime() - periodMs)
      .toISOString()
      .split('T')[0]!;

    const prevRows = await db
      .select({ amountCad: transactions.amountCad })
      .from(transactions)
      .where(and(gte(transactions.date, prevStart), lte(transactions.date, prevEnd)));

    let prevIncome = 0;
    let prevExpenses = 0;
    for (const r of prevRows) {
      const v = Number(r.amountCad);
      if (v > 0) prevIncome += v;
      else prevExpenses += Math.abs(v);
    }

    return {
      income: Math.round(income * 100) / 100,
      expenses: Math.round(expenses * 100) / 100,
      netSaved: Math.round(netSaved * 100) / 100,
      savingsRate,
      deltas: {
        income: Math.round((income - prevIncome) * 100) / 100,
        expenses: Math.round((expenses - prevExpenses) * 100) / 100,
        netSaved: Math.round((netSaved - (prevIncome - prevExpenses)) * 100) / 100,
      },
    };
  }),

  byCategory: protectedProcedure.input(analyticsFiltersSchema).query(async ({ input }) => {
    const { startDate, endDate, accountId } = input;

    const conditions = [
      gte(transactions.date, startDate),
      lte(transactions.date, endDate),
      lt(transactions.amountCad, '0'), // expenses only
    ];
    if (accountId) conditions.push(eq(transactions.accountId, accountId));

    const rows = await db.query.transactions.findMany({
      where: and(...conditions),
      with: { category: true },
    });

    const byCategory: Record<string, { name: string; color: string | null; amount: number }> = {};
    let total = 0;

    for (const tx of rows) {
      const category = tx.category as Category | null | undefined;
      const catName = category?.name ?? 'Uncategorized';
      const catColor = category?.color ?? '#7A8BA8';
      const amount = Math.abs(Number(tx.amountCad));
      total += amount;

      if (!byCategory[catName]) {
        byCategory[catName] = { name: catName, color: catColor, amount: 0 };
      }
      byCategory[catName]!.amount += amount;
    }

    return Object.values(byCategory)
      .map((c) => ({
        ...c,
        amount: Math.round(c.amount * 100) / 100,
        pct: total > 0 ? Math.round((c.amount / total) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }),

  incomeVsExpense: protectedProcedure.input(dateRangeSchema).query(async ({ input }) => {
    // Return monthly buckets between startDate and endDate
    const rows = await db.query.transactions.findMany({
      where: and(
        gte(transactions.date, input.startDate),
        lte(transactions.date, input.endDate),
      ),
    });

    const months: Record<string, { month: string; income: number; expenses: number }> = {};

    for (const tx of rows) {
      const monthKey = tx.date.substring(0, 7); // YYYY-MM
      const label = new Date(tx.date + 'T00:00:00').toLocaleString('en-CA', {
        month: 'short',
        year: '2-digit',
      });

      if (!months[monthKey]) {
        months[monthKey] = { month: label, income: 0, expenses: 0 };
      }

      const v = Number(tx.amountCad);
      if (v > 0) months[monthKey]!.income += v;
      else months[monthKey]!.expenses += Math.abs(v);
    }

    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => ({
        ...v,
        income: Math.round(v.income * 100) / 100,
        expenses: Math.round(v.expenses * 100) / 100,
        savings: Math.round((v.income - v.expenses) * 100) / 100,
      }));
  }),

  trends: protectedProcedure.input(analyticsFiltersSchema).query(async ({ input }) => {
    // Top 5 categories by spend and their monthly trend
    const rows = await db.query.transactions.findMany({
      where: and(
        gte(transactions.date, input.startDate),
        lte(transactions.date, input.endDate),
        lt(transactions.amountCad, '0'),
      ),
      with: { category: true },
    });

    const catTotals: Record<string, number> = {};
    const monthlyData: Record<string, Record<string, number>> = {};

    for (const tx of rows) {
      const category = tx.category as Category | null | undefined;
      const catName = category?.name ?? 'Uncategorized';
      const monthKey = tx.date.substring(0, 7);
      const amount = Math.abs(Number(tx.amountCad));

      catTotals[catName] = (catTotals[catName] ?? 0) + amount;

      if (!monthlyData[monthKey]) monthlyData[monthKey] = {};
      monthlyData[monthKey]![catName] =
        (monthlyData[monthKey]![catName] ?? 0) + amount;
    }

    const top5 = Object.entries(catTotals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name]) => name);

    return Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, data]) => {
        const label = new Date(key + '-01T00:00:00').toLocaleString('en-CA', {
          month: 'short',
        });
        const row: Record<string, string | number> = { month: label };
        for (const cat of top5) {
          row[cat] = Math.round((data[cat] ?? 0) * 100) / 100;
        }
        return row;
      });
  }),
});
