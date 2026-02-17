import { z } from 'zod';
import { and, gte, lte } from 'drizzle-orm';
import { router, protectedProcedure } from './trpc.js';
import { db } from '../db/index.js';
import { transactions, type Category } from '../db/schema.js';
import { stripPII } from '../services/piiStripper.js';
import { generateInsights, categorizeTransactions } from '../services/claude.js';

const dateRangeSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
});

export const aiRouter = router({
  insights: protectedProcedure.input(dateRangeSchema).mutation(async ({ input }) => {
    const rows = await db.query.transactions.findMany({
      where: and(
        gte(transactions.date, input.startDate),
        lte(transactions.date, input.endDate),
      ),
      with: { category: true, account: true },
    });

    const anonymized = stripPII(rows);
    return generateInsights(anonymized);
  }),

  categorize: protectedProcedure
    .input(z.object({ descriptions: z.array(z.string()).min(1).max(50) }))
    .mutation(async ({ input }) => {
      const allCategories = await db.query.categories.findMany({
        where: (c, { isNull }) => isNull(c.parentId),
      });
      const categoryNames = allCategories.map((c) => c.name);

      return categorizeTransactions(input.descriptions, categoryNames);
    }),

  scenario: protectedProcedure
    .input(
      z.object({
        categoryName: z.string(),
        reductionPercent: z.number().min(1).max(100),
        startDate: z.string(),
        endDate: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const rows = await db.query.transactions.findMany({
        where: and(
          gte(transactions.date, input.startDate),
          lte(transactions.date, input.endDate),
        ),
        with: { category: true },
      });

      const anonymized = stripPII(rows);

      // Calculate current spending in that category
      const catRows = rows.filter((tx) => {
        const cat = tx.category as Category | null | undefined;
        return cat?.name?.toLowerCase() === input.categoryName.toLowerCase();
      });
      const currentCatSpend = catRows.reduce((s, tx) => s + Math.abs(Number(tx.amountCad)), 0);
      const savings = currentCatSpend * (input.reductionPercent / 100);

      return {
        categoryName: input.categoryName,
        reductionPercent: input.reductionPercent,
        currentMonthlySpend: Math.round(currentCatSpend * 100) / 100,
        monthlySavings: Math.round(savings * 100) / 100,
        yearlySavings: Math.round(savings * 12 * 100) / 100,
      };
    }),

  predict: protectedProcedure
    .input(z.object({ goalId: z.string().uuid() }))
    .query(async ({ input }) => {
      const goal = await db.query.goals.findFirst({
        where: (g, { eq }) => eq(g.id, input.goalId),
        with: {
          snapshots: { orderBy: (s, { asc }) => [asc(s.snapshotDate)] },
        },
      });

      if (!goal) throw new Error('Goal not found');

      const snapshots = goal.snapshots;
      if (snapshots.length < 2) {
        return { message: 'Not enough data for prediction. Upload more statements.' };
      }

      const latest = snapshots[snapshots.length - 1]!;
      const prev = snapshots[snapshots.length - 2]!;
      const current = Number(latest.currentAmount);
      const target = Number(goal.targetAmount);

      const days =
        (new Date(latest.snapshotDate).getTime() -
          new Date(prev.snapshotDate).getTime()) /
        (1000 * 60 * 60 * 24);
      const monthlyRate =
        ((Number(latest.currentAmount) - Number(prev.currentAmount)) / days) * 30;

      const monthsLeft = monthlyRate > 0 ? Math.ceil((target - current) / monthlyRate) : null;
      const projectedDate = monthsLeft
        ? (() => {
            const d = new Date();
            d.setMonth(d.getMonth() + monthsLeft);
            return d.toISOString().split('T')[0];
          })()
        : null;

      return {
        goalName: goal.name,
        current,
        target,
        percentage: Math.round((current / target) * 100),
        monthlyContribution: Math.round(monthlyRate * 100) / 100,
        monthsToCompletion: monthsLeft,
        projectedDate,
      };
    }),
});
