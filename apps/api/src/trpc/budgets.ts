import { z } from 'zod';
import { and, asc, eq, gte, inArray, lt, lte } from 'drizzle-orm';
import { router, protectedProcedure } from './trpc.js';
import { db } from '../db/index.js';
import { budgets, transactions } from '../db/schema.js';

const upsertBudgetSchema = z.object({
  categoryId: z.string().uuid(),
  monthlyCad: z.number().positive(),
  isActive: z.boolean().default(true),
});

const budgetSummarySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  accountIds: z.array(z.string().uuid()).default([]),
});

const deleteBudgetSchema = z.object({
  id: z.string().uuid(),
});

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function firstDayOfMonth(isoDate: string): string {
  const dt = new Date(`${isoDate}T00:00:00Z`);
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

function monthsInclusive(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth()) +
    1;
  return Math.max(1, months);
}

export const budgetsRouter = router({
  list: protectedProcedure.query(async () => {
    const rows = await db.query.budgets.findMany({
      with: { category: true },
      orderBy: asc(budgets.createdAt),
    });
    return rows.map((row) => ({
      ...row,
      monthlyCad: Number(row.monthlyCad),
    }));
  }),

  upsert: protectedProcedure.input(upsertBudgetSchema).mutation(async ({ input }) => {
    const [row] = await db
      .insert(budgets)
      .values({
        categoryId: input.categoryId,
        monthlyCad: String(input.monthlyCad),
        isActive: input.isActive,
      })
      .onConflictDoUpdate({
        target: budgets.categoryId,
        set: {
          monthlyCad: String(input.monthlyCad),
          isActive: input.isActive,
          updatedAt: new Date(),
        },
      })
      .returning();

    return {
      ...row,
      monthlyCad: Number(row!.monthlyCad),
    };
  }),

  delete: protectedProcedure.input(deleteBudgetSchema).mutation(async ({ input }) => {
    await db.delete(budgets).where(eq(budgets.id, input.id));
  }),

  summary: protectedProcedure.input(budgetSummarySchema).query(async ({ input }) => {
    const today = new Date().toISOString().slice(0, 10);
    const endDate = input.endDate ?? today;
    const startDate = input.startDate ?? firstDayOfMonth(endDate);
    const monthCount = monthsInclusive(startDate, endDate);

    const [budgetRows, allCategories] = await Promise.all([
      db.query.budgets.findMany({
        where: eq(budgets.isActive, true),
        with: { category: true },
      }),
      db.query.categories.findMany({
        columns: { id: true, name: true, parentId: true },
      }),
    ]);

    if (budgetRows.length === 0) {
      return {
        startDate,
        endDate,
        monthCount,
        totals: {
          budgetCad: 0,
          actualCad: 0,
          remainingCad: 0,
          utilizationPct: 0,
        },
        items: [],
      };
    }

    const byId = new Map(allCategories.map((c) => [c.id, c]));
    const childrenByParentId = new Map<string, string[]>();
    for (const category of allCategories) {
      if (!category.parentId) continue;
      const children = childrenByParentId.get(category.parentId) ?? [];
      children.push(category.id);
      childrenByParentId.set(category.parentId, children);
    }

    const pathCache = new Map<string, string>();
    const getPath = (id: string): string => {
      const cached = pathCache.get(id);
      if (cached) return cached;
      const category = byId.get(id);
      if (!category) return '';
      if (!category.parentId) {
        pathCache.set(id, category.name);
        return category.name;
      }
      const path = `${getPath(category.parentId)} / ${category.name}`;
      pathCache.set(id, path);
      return path;
    };

    const descendantsCache = new Map<string, Set<string>>();
    const getDescendants = (id: string): Set<string> => {
      const cached = descendantsCache.get(id);
      if (cached) return cached;
      const set = new Set<string>([id]);
      for (const childId of childrenByParentId.get(id) ?? []) {
        for (const childDesc of getDescendants(childId)) set.add(childDesc);
      }
      descendantsCache.set(id, set);
      return set;
    };

    const allBudgetCategoryIds = new Set<string>();
    const budgetCategorySets = new Map<string, Set<string>>();
    for (const budget of budgetRows) {
      const ids = getDescendants(budget.categoryId);
      budgetCategorySets.set(budget.id, ids);
      for (const id of ids) allBudgetCategoryIds.add(id);
    }

    const conditions = [
      gte(transactions.date, startDate),
      lte(transactions.date, endDate),
      lt(transactions.amountCad, '0'),
      inArray(transactions.categoryId, Array.from(allBudgetCategoryIds)),
    ];
    if (input.accountIds.length > 0) {
      conditions.push(inArray(transactions.accountId, input.accountIds));
    }

    const expenseRows = await db.query.transactions.findMany({
      where: and(...conditions),
      columns: {
        categoryId: true,
        amountCad: true,
      },
    });

    const budgetsByCategoryId = new Map<string, string[]>();
    for (const budget of budgetRows) {
      for (const categoryId of budgetCategorySets.get(budget.id) ?? []) {
        const list = budgetsByCategoryId.get(categoryId) ?? [];
        list.push(budget.id);
        budgetsByCategoryId.set(categoryId, list);
      }
    }

    const actualByBudgetId = new Map<string, number>();
    for (const tx of expenseRows) {
      if (!tx.categoryId) continue;
      const matchingBudgetIds = budgetsByCategoryId.get(tx.categoryId) ?? [];
      if (matchingBudgetIds.length === 0) continue;
      const amount = Math.abs(Number(tx.amountCad));
      for (const budgetId of matchingBudgetIds) {
        const current = actualByBudgetId.get(budgetId) ?? 0;
        actualByBudgetId.set(budgetId, current + amount);
      }
    }

    const items = budgetRows
      .map((budget) => {
        const monthlyCad = Number(budget.monthlyCad);
        const budgetCad = round2(monthlyCad * monthCount);
        const actualCad = round2(actualByBudgetId.get(budget.id) ?? 0);
        const remainingCad = round2(budgetCad - actualCad);
        const utilizationPct = budgetCad > 0 ? round2((actualCad / budgetCad) * 100) : 0;
        const status =
          utilizationPct <= 100 ? 'on_track' : utilizationPct <= 110 ? 'at_risk' : 'over';

        return {
          id: budget.id,
          categoryId: budget.categoryId,
          categoryName: budget.category?.name ?? 'Unknown',
          categoryPath: getPath(budget.categoryId),
          monthCount,
          monthlyCad: round2(monthlyCad),
          budgetCad,
          actualCad,
          remainingCad,
          utilizationPct,
          status,
          isActive: budget.isActive,
        };
      })
      .sort((a, b) => b.utilizationPct - a.utilizationPct);

    const totals = items.reduce(
      (acc, item) => {
        acc.budgetCad += item.budgetCad;
        acc.actualCad += item.actualCad;
        return acc;
      },
      { budgetCad: 0, actualCad: 0 },
    );

    const roundedTotals = {
      budgetCad: round2(totals.budgetCad),
      actualCad: round2(totals.actualCad),
      remainingCad: round2(totals.budgetCad - totals.actualCad),
      utilizationPct:
        totals.budgetCad > 0 ? round2((totals.actualCad / totals.budgetCad) * 100) : 0,
    };

    return {
      startDate,
      endDate,
      monthCount,
      totals: roundedTotals,
      items,
    };
  }),
});
