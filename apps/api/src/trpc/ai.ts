import { z } from 'zod';
import { and, desc, gte, inArray, lte } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from './trpc.js';
import { db } from '../db/index.js';
import { aiReports, transactions } from '../db/schema.js';
import { stripPII } from '../services/piiStripper.js';
import {
  askFinanceQuestionWithOptions,
  categorizeTransactions,
  generateInsightsWithOptions,
  type PeriodSummary,
} from '../services/aiProvider.js';

const dateRangeSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
});

const monthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'Expected month format YYYY-MM');

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

function isInternalMovementCategory(name: string | null | undefined): boolean {
  return /(transfer|credit card payment|bill payment|payment received)/i.test(name ?? '');
}

function getMonthDateRange(month: string): { startDate: string; endDate: string } {
  const [yearRaw, monthRaw] = month.split('-');
  const year = Number(yearRaw);
  const monthNumber = Number(monthRaw);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 0));
  const toIsoDate = (d: Date) => d.toISOString().split('T')[0]!;
  return { startDate: toIsoDate(start), endDate: toIsoDate(end) };
}

function buildPeriodSummary(
  rows: Array<{
    date: string;
    amountCad: string;
    category: { name: string } | null;
  }>,
  input: { label: string; startDate: string; endDate: string },
): PeriodSummary {
  let totalIncome = 0;
  let operatingExpenses = 0;
  let internalMovements = 0;
  const categoryTotals = new Map<string, number>();
  const monthlyNet = new Map<string, number>();

  for (const row of rows) {
    const amountCad = Number(row.amountCad);
    const month = row.date.slice(0, 7);
    monthlyNet.set(month, (monthlyNet.get(month) ?? 0) + amountCad);

    if (amountCad > 0) {
      totalIncome += amountCad;
      continue;
    }

    const magnitude = Math.abs(amountCad);
    if (isInternalMovementCategory(row.category?.name)) {
      internalMovements += magnitude;
      continue;
    }

    operatingExpenses += magnitude;
    const categoryName = row.category?.name ?? 'Uncategorized';
    categoryTotals.set(categoryName, (categoryTotals.get(categoryName) ?? 0) + magnitude);
  }

  const topExpenseCategories = Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, amount]) => ({
      name,
      amount: Math.round(amount * 100) / 100,
      sharePct:
        operatingExpenses > 0 ? Math.round((amount / operatingExpenses) * 1000) / 10 : 0,
    }));

  return {
    label: input.label,
    startDate: input.startDate,
    endDate: input.endDate,
    transactionCount: rows.length,
    totalIncome: Math.round(totalIncome * 100) / 100,
    operatingExpenses: Math.round(operatingExpenses * 100) / 100,
    internalMovements: Math.round(internalMovements * 100) / 100,
    operatingNet: Math.round((totalIncome - operatingExpenses) * 100) / 100,
    topExpenseCategories,
    monthlyNet: Array.from(monthlyNet.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, net]) => ({ month, net: Math.round(net * 100) / 100 })),
  };
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
  insights: protectedProcedure
    .input(
      dateRangeSchema.extend({
        refresh: z.boolean().optional(),
        variationToken: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
    const rows = await db.query.transactions.findMany({
      where: and(
        gte(transactions.date, input.startDate),
        lte(transactions.date, input.endDate),
      ),
      with: { category: true, account: true },
    });

    const anonymized = stripPII(rows);
      return generateInsightsWithOptions(anonymized, {
        bypassCache: input.refresh === true,
        variationToken: input.variationToken,
      });
    }),

  ask: protectedProcedure
    .input(
      dateRangeSchema.extend({
        question: z.string().min(3).max(800),
        compareStartDate: z.string().optional(),
        compareEndDate: z.string().optional(),
        refresh: z.boolean().optional(),
        variationToken: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const primaryRows = await db.query.transactions.findMany({
        where: and(
          gte(transactions.date, input.startDate),
          lte(transactions.date, input.endDate),
        ),
        with: { category: true },
      });

      const primary = buildPeriodSummary(primaryRows, {
        label: 'Primary period',
        startDate: input.startDate,
        endDate: input.endDate,
      });

      let comparison: PeriodSummary | undefined;
      if (input.compareStartDate && input.compareEndDate) {
        const comparisonRows = await db.query.transactions.findMany({
          where: and(
            gte(transactions.date, input.compareStartDate),
            lte(transactions.date, input.compareEndDate),
          ),
          with: { category: true },
        });
        comparison = buildPeriodSummary(comparisonRows, {
          label: 'Comparison period',
          startDate: input.compareStartDate,
          endDate: input.compareEndDate,
        });
      }

      return askFinanceQuestionWithOptions(
        {
          question: input.question,
          primary,
          comparison,
        },
        {
          bypassCache: input.refresh === true,
          variationToken: input.variationToken,
        },
      );
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

  monthlyReportGenerate: protectedProcedure
    .input(
      z.object({
        month: monthSchema,
        refresh: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { startDate, endDate } = getMonthDateRange(input.month);
      const rows = await db.query.transactions.findMany({
        where: and(gte(transactions.date, startDate), lte(transactions.date, endDate)),
        with: { category: true, account: true },
      });

      const anonymized = stripPII(rows);
      const insights = await generateInsightsWithOptions(anonymized, {
        bypassCache: input.refresh === true,
        variationToken:
          input.refresh === true ? `monthly-${input.month}-${Date.now()}` : undefined,
      });

      let saved:
        | {
            id: string;
          }
        | undefined;
      try {
        [saved] = await db
          .insert(aiReports)
          .values({
            reportMonth: `${input.month}-01`,
            periodStart: startDate,
            periodEnd: endDate,
            prompt: 'Monthly AI summary',
            response: JSON.stringify(insights),
            provider: insights.meta.provider,
          })
          .returning({ id: aiReports.id });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to save monthly report';
        if (message.toLowerCase().includes('ai_reports')) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message:
              'Monthly reports table is missing. Run `pnpm db:push` and restart the API.',
          });
        }
        throw error;
      }

      return {
        reportId: saved!.id,
        month: input.month,
        insights,
      };
    }),

  monthlyReports: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(24).default(6),
      }),
    )
    .query(async ({ input }) => {
      let rows: Array<typeof aiReports.$inferSelect> = [];
      try {
        rows = await db
          .select()
          .from(aiReports)
          .orderBy(desc(aiReports.createdAt))
          .limit(input.limit);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to load monthly reports';
        if (message.toLowerCase().includes('ai_reports')) {
          return [];
        }
        throw error;
      }

      return rows.map((row) => {
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(row.response);
        } catch {
          parsed = null;
        }
        return {
          id: row.id,
          reportMonth: row.reportMonth,
          periodStart: row.periodStart,
          periodEnd: row.periodEnd,
          provider: row.provider,
          createdAt: row.createdAt,
          response: parsed,
        };
      });
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
