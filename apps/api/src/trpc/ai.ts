import { z } from 'zod';
import { and, gte, inArray, lte } from 'drizzle-orm';
import { router, protectedProcedure } from './trpc.js';
import { db } from '../db/index.js';
import { transactions } from '../db/schema.js';
import { stripPII } from '../services/piiStripper.js';
import { generateInsights, categorizeTransactions } from '../services/claude.js';

const dateRangeSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
});

type SnapshotSource = 'transfer' | 'statement' | 'manual';

function getSnapshotSource(notes: string | null): SnapshotSource {
  if (notes?.startsWith('Auto transfer mapping')) return 'transfer';
  if (notes?.startsWith('Auto from Desjardins savings table')) return 'statement';
  return 'manual';
}

function snapshotPriority(source: SnapshotSource): number {
  if (source === 'manual') return 3;
  if (source === 'statement') return 2;
  return 1;
}

function monthsBetween(startIsoDate: string, endIsoDate: string): number {
  const start = new Date(`${startIsoDate}T00:00:00Z`);
  const end = new Date(`${endIsoDate}T00:00:00Z`);
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return 0;
  return ms / (1000 * 60 * 60 * 24 * 30.4375);
}

async function expandCategoryFilterIds(categoryIds: string[]): Promise<string[]> {
  if (categoryIds.length === 0) return [];

  const allCategories = await db.query.categories.findMany({
    columns: { id: true, parentId: true },
  });
  const childrenByParentId = new Map<string, string[]>();
  for (const category of allCategories) {
    if (!category.parentId) continue;
    const children = childrenByParentId.get(category.parentId) ?? [];
    children.push(category.id);
    childrenByParentId.set(category.parentId, children);
  }

  const expanded = new Set<string>();
  const stack = [...categoryIds];

  while (stack.length > 0) {
    const id = stack.pop()!;
    if (expanded.has(id)) continue;
    expanded.add(id);
    const children = childrenByParentId.get(id) ?? [];
    for (const childId of children) {
      stack.push(childId);
    }
  }

  return Array.from(expanded);
}

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
        categoryId: z.string().uuid(),
        reductionPercent: z.number().min(1).max(100),
        startDate: z.string(),
        endDate: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const selectedCategory = await db.query.categories.findFirst({
        where: (c, { eq }) => eq(c.id, input.categoryId),
      });
      if (!selectedCategory) {
        throw new Error('Category not found');
      }

      const expandedCategoryIds = await expandCategoryFilterIds([input.categoryId]);

      const rows = await db.query.transactions.findMany({
        where: and(
          gte(transactions.date, input.startDate),
          lte(transactions.date, input.endDate),
          inArray(transactions.categoryId, expandedCategoryIds),
        ),
      });

      const totalInPeriod = rows.reduce((sum, tx) => {
        const amountCad = Number(tx.amountCad);
        // Scenario reduction only applies to outgoing spend.
        return amountCad < 0 ? sum + Math.abs(amountCad) : sum;
      }, 0);
      const periodMonths = Math.max(monthsBetween(input.startDate, input.endDate), 1 / 30);
      const currentMonthlySpend = totalInPeriod / periodMonths;
      const monthlySavings = currentMonthlySpend * (input.reductionPercent / 100);

      return {
        categoryId: selectedCategory.id,
        categoryName: selectedCategory.name,
        reductionPercent: input.reductionPercent,
        currentMonthlySpend: Math.round(currentMonthlySpend * 100) / 100,
        monthlySavings: Math.round(monthlySavings * 100) / 100,
        yearlySavings: Math.round(monthlySavings * 12 * 100) / 100,
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

      const canonicalByDate = new Map<
        string,
        { snapshotDate: string; currentAmount: number; source: SnapshotSource }
      >();
      for (const snapshot of goal.snapshots) {
        const source = getSnapshotSource(snapshot.notes);
        const normalized = {
          snapshotDate: snapshot.snapshotDate,
          currentAmount: Number(snapshot.currentAmount),
          source,
        };
        const existing = canonicalByDate.get(snapshot.snapshotDate);
        if (!existing || snapshotPriority(source) >= snapshotPriority(existing.source)) {
          canonicalByDate.set(snapshot.snapshotDate, normalized);
        }
      }

      const snapshots = Array.from(canonicalByDate.values()).sort((a, b) =>
        a.snapshotDate.localeCompare(b.snapshotDate),
      );
      const authoritative = snapshots.filter((s) => s.source !== 'transfer');
      const projectionSeries =
        authoritative.length >= 2 ? authoritative.slice(-3) : snapshots.slice(-3);

      if (projectionSeries.length < 2) {
        return { message: 'Not enough data for prediction. Upload more statements.' };
      }

      const latest = projectionSeries[projectionSeries.length - 1]!;
      const first = projectionSeries[0]!;
      const current = Number(latest.currentAmount);
      const target = Number(goal.targetAmount);

      const spanMonths = monthsBetween(first.snapshotDate, latest.snapshotDate);
      if (spanMonths <= 0) {
        return { message: 'Not enough data for prediction. Upload more statements.' };
      }
      const monthlyRate = (Number(latest.currentAmount) - Number(first.currentAmount)) / spanMonths;

      const monthsLeft = monthlyRate > 0 ? Math.ceil((target - current) / monthlyRate) : null;
      const projectedDate = monthsLeft
        ? (() => {
            const d = new Date(`${latest.snapshotDate}T00:00:00Z`);
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
