import { z } from 'zod';
import { and, gte, lte, eq, lt, inArray } from 'drizzle-orm';
import { router, protectedProcedure } from './trpc.js';
import { db } from '../db/index.js';
import { transactions, type Category } from '../db/schema.js';

const dateRangeSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
});

const analyticsFiltersSchema = dateRangeSchema.extend({
  accountIds: z.array(z.string().uuid()).default([]),
  categoryIds: z.array(z.string().uuid()).default([]),
});

const TRANSFER_ROOT_NAME = 'Transfer';
const CATEGORY_PALETTE = [
  '#F472B6',
  '#8B9EE0',
  '#1A7A8A',
  '#F97352',
  '#2DD4A0',
  '#EAB308',
  '#14B8A6',
  '#FB7185',
];

type CategoryContext = {
  nameById: Map<string, string>;
  rootNameById: Map<string, string>;
  colorById: Map<string, string | null>;
  childrenByParentId: Map<string, string[]>;
  isTransferCategory: (categoryId: string | null) => boolean;
  expandCategoryFilterIds: (categoryIds: string[]) => string[];
};

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function colorForCategoryName(name: string): string {
  return CATEGORY_PALETTE[hashString(name) % CATEGORY_PALETTE.length]!;
}

async function loadCategoryContext(): Promise<CategoryContext> {
  const all = await db.query.categories.findMany({
    columns: { id: true, name: true, parentId: true, color: true },
  });

  const byId = new Map(all.map((category) => [category.id, category]));
  const nameById = new Map(all.map((category) => [category.id, category.name]));
  const colorById = new Map(all.map((category) => [category.id, category.color]));
  const childrenByParentId = new Map<string, string[]>();
  const rootNameById = new Map<string, string>();

  for (const category of all) {
    if (!category.parentId) continue;
    const children = childrenByParentId.get(category.parentId) ?? [];
    children.push(category.id);
    childrenByParentId.set(category.parentId, children);
  }

  const getRootName = (id: string): string => {
    const cached = rootNameById.get(id);
    if (cached) return cached;

    const category = byId.get(id);
    if (!category) return '';
    if (!category.parentId) {
      rootNameById.set(id, category.name);
      return category.name;
    }

    const rootName = getRootName(category.parentId);
    rootNameById.set(id, rootName);
    return rootName;
  };

  for (const category of all) {
    getRootName(category.id);
  }

  return {
    nameById,
    rootNameById,
    colorById,
    childrenByParentId,
    isTransferCategory: (categoryId: string | null) =>
      Boolean(categoryId && rootNameById.get(categoryId) === TRANSFER_ROOT_NAME),
    expandCategoryFilterIds: (categoryIds: string[]) => {
      if (categoryIds.length === 0) return [];

      const expanded = new Set<string>();
      const stack = [...categoryIds];

      while (stack.length > 0) {
        const id = stack.pop()!;
        if (expanded.has(id)) continue;
        expanded.add(id);
        const children = childrenByParentId.get(id) ?? [];
        for (const childId of children) stack.push(childId);
      }

      return Array.from(expanded);
    },
  };
}

export const analyticsRouter = router({
  summary: protectedProcedure.input(analyticsFiltersSchema).query(async ({ input }) => {
    const { startDate, endDate, accountIds, categoryIds } = input;
    const categoryContext = await loadCategoryContext();
    const expandedCategoryIds = categoryContext.expandCategoryFilterIds(categoryIds);

    const conditions = [gte(transactions.date, startDate), lte(transactions.date, endDate)];
    if (accountIds.length > 0) conditions.push(inArray(transactions.accountId, accountIds));
    if (expandedCategoryIds.length > 0) {
      conditions.push(inArray(transactions.categoryId, expandedCategoryIds));
    }

    const rows = await db
      .select({
        amountCad: transactions.amountCad,
        categoryId: transactions.categoryId,
      })
      .from(transactions)
      .where(and(...conditions));

    let income = 0;
    let expenses = 0;
    for (const r of rows) {
      if (categoryContext.isTransferCategory(r.categoryId)) continue;
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
      .select({
        amountCad: transactions.amountCad,
        categoryId: transactions.categoryId,
      })
      .from(transactions)
      .where(
        and(
          gte(transactions.date, prevStart),
          lte(transactions.date, prevEnd),
          ...(accountIds.length > 0 ? [inArray(transactions.accountId, accountIds)] : []),
          ...(expandedCategoryIds.length > 0
            ? [inArray(transactions.categoryId, expandedCategoryIds)]
            : []),
        ),
      );

    let prevIncome = 0;
    let prevExpenses = 0;
    for (const r of prevRows) {
      if (categoryContext.isTransferCategory(r.categoryId)) continue;
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
    const { startDate, endDate, accountIds, categoryIds } = input;
    const categoryContext = await loadCategoryContext();
    const expandedCategoryIds = categoryContext.expandCategoryFilterIds(categoryIds);

    const conditions = [
      gte(transactions.date, startDate),
      lte(transactions.date, endDate),
      lt(transactions.amountCad, '0'), // expenses only
    ];
    if (accountIds.length > 0) conditions.push(inArray(transactions.accountId, accountIds));
    if (expandedCategoryIds.length > 0) {
      conditions.push(inArray(transactions.categoryId, expandedCategoryIds));
    }

    const rows = await db.query.transactions.findMany({
      where: and(...conditions),
      with: { category: true },
    });

    const byCategory: Record<string, { categoryId: string | null; name: string; color: string | null; amount: number }> = {};
    let total = 0;

    for (const tx of rows) {
      if (categoryContext.isTransferCategory(tx.categoryId)) continue;
      const category = tx.category as Category | null | undefined;
      const catName =
        (tx.categoryId ? categoryContext.nameById.get(tx.categoryId) : null) ??
        category?.name ??
        'Uncategorized';
      const catColor =
        (tx.categoryId ? categoryContext.colorById.get(tx.categoryId) : null) ??
        colorForCategoryName(catName);
      const amount = Math.abs(Number(tx.amountCad));
      total += amount;

      const key = tx.categoryId ?? '__uncategorized__';
      if (!byCategory[key]) {
        byCategory[key] = {
          categoryId: tx.categoryId,
          name: catName,
          color: catColor,
          amount: 0,
        };
      }
      byCategory[key]!.amount += amount;
    }

    return Object.values(byCategory)
      .map((c) => ({
        ...c,
        amount: Math.round(c.amount * 100) / 100,
        pct: total > 0 ? Math.round((c.amount / total) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }),

  incomeVsExpense: protectedProcedure.input(analyticsFiltersSchema).query(async ({ input }) => {
    const categoryContext = await loadCategoryContext();
    const expandedCategoryIds = categoryContext.expandCategoryFilterIds(input.categoryIds);
    const conditions = [gte(transactions.date, input.startDate), lte(transactions.date, input.endDate)];
    if (input.accountIds.length > 0) conditions.push(inArray(transactions.accountId, input.accountIds));
    if (expandedCategoryIds.length > 0) {
      conditions.push(inArray(transactions.categoryId, expandedCategoryIds));
    }

    // Return monthly buckets between startDate and endDate
    const rows = await db.query.transactions.findMany({
      where: and(...conditions),
      columns: { date: true, amountCad: true, categoryId: true },
    });

    const months: Record<
      string,
      { month: string; monthKey: string; income: number; expenses: number }
    > = {};

    for (const tx of rows) {
      if (categoryContext.isTransferCategory(tx.categoryId)) continue;
      const monthKey = tx.date.substring(0, 7); // YYYY-MM
      const label = new Date(tx.date + 'T00:00:00').toLocaleString('en-CA', {
        month: 'short',
        year: '2-digit',
      });

      if (!months[monthKey]) {
        months[monthKey] = { month: label, monthKey, income: 0, expenses: 0 };
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
    const categoryContext = await loadCategoryContext();
    const expandedCategoryIds = categoryContext.expandCategoryFilterIds(input.categoryIds);

    const conditions = [
      gte(transactions.date, input.startDate),
      lte(transactions.date, input.endDate),
      lt(transactions.amountCad, '0'),
    ];
    if (input.accountIds.length > 0) conditions.push(inArray(transactions.accountId, input.accountIds));
    if (expandedCategoryIds.length > 0) {
      conditions.push(inArray(transactions.categoryId, expandedCategoryIds));
    }

    // Top 5 categories by spend and their monthly trend
    const rows = await db.query.transactions.findMany({
      where: and(...conditions),
      with: { category: true },
    });

    const catTotals: Record<string, number> = {};
    const monthlyData: Record<string, Record<string, number>> = {};

    for (const tx of rows) {
      if (categoryContext.isTransferCategory(tx.categoryId)) continue;
      const category = tx.category as Category | null | undefined;
      const catName =
        (tx.categoryId ? categoryContext.nameById.get(tx.categoryId) : null) ??
        category?.name ??
        'Uncategorized';
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
