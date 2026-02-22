import { z } from 'zod';
import { eq, and, gte, lte, like, sql, desc, asc, inArray } from 'drizzle-orm';
import { router, protectedProcedure } from './trpc.js';
import { db } from '../db/index.js';
import { transactions } from '../db/schema.js';
import { convertToCad } from '../services/currencyConverter.js';

const transactionFiltersSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  accountId: z.string().uuid().optional(),
  accountIds: z.array(z.string().uuid()).default([]),
  categoryId: z.string().uuid().optional(),
  categoryIds: z.array(z.string().uuid()).default([]),
  minAmount: z.number().optional(),
  maxAmount: z.number().optional(),
  search: z.string().optional(),
  sortBy: z.enum(['date', 'amount', 'category', 'account']).default('date'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  recurring: z.boolean().optional(),
  currency: z.enum(['CAD', 'BRL', 'EUR']).optional(),
});

const createTransactionSchema = z.object({
  accountId: z.string().uuid(),
  date: z.string(), // ISO date string YYYY-MM-DD
  description: z.string().min(1),
  amount: z.number(),
  currency: z.enum(['CAD', 'BRL', 'EUR']),
  amountCad: z.number().optional(),
  exchangeRate: z.number().optional(),
  categoryId: z.string().uuid().optional(),
  subcategoryId: z.string().uuid().optional(),
  notes: z.string().optional(),
  isRecurring: z.boolean().default(false),
});

const updateTransactionSchema = createTransactionSchema.partial().extend({
  id: z.string().uuid(),
});

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

export const transactionsRouter = router({
  list: protectedProcedure.input(transactionFiltersSchema).query(async ({ input }) => {
    const conditions = [];

    if (input.startDate) conditions.push(gte(transactions.date, input.startDate));
    if (input.endDate) conditions.push(lte(transactions.date, input.endDate));
    if (input.accountIds.length > 0) {
      conditions.push(inArray(transactions.accountId, input.accountIds));
    } else if (input.accountId) {
      conditions.push(eq(transactions.accountId, input.accountId));
    }

    const requestedCategoryIds = [
      ...(input.categoryId ? [input.categoryId] : []),
      ...input.categoryIds,
    ];
    const expandedCategoryIds = await expandCategoryFilterIds(requestedCategoryIds);
    if (expandedCategoryIds.length > 0) {
      conditions.push(inArray(transactions.categoryId, expandedCategoryIds));
    }

    if (input.currency) conditions.push(eq(transactions.currency, input.currency));
    if (input.recurring !== undefined)
      conditions.push(eq(transactions.isRecurring, input.recurring));
    if (input.search) conditions.push(like(transactions.description, `%${input.search}%`));

    const orderCol =
      input.sortBy === 'date'
        ? transactions.date
        : input.sortBy === 'amount'
          ? transactions.amountCad
          : transactions.date;

    const orderFn = input.sortOrder === 'asc' ? asc : desc;

    const offset = (input.page - 1) * input.limit;

    const [data, countResult] = await Promise.all([
      db.query.transactions.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        with: { account: true, category: true, subcategory: true },
        orderBy: orderFn(orderCol),
        limit: input.limit,
        offset,
      }),
      db
        .select({ count: sql<number>`count(*)` })
        .from(transactions)
        .where(conditions.length > 0 ? and(...conditions) : undefined),
    ]);

    return {
      data,
      total: Number(countResult[0]?.count ?? 0),
      page: input.page,
      limit: input.limit,
    };
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      return db.query.transactions.findFirst({
        where: eq(transactions.id, input.id),
        with: { account: true, category: true, subcategory: true },
      });
    }),

  create: protectedProcedure
    .input(createTransactionSchema)
    .mutation(async ({ input }) => {
      const conversion =
        input.amountCad !== undefined
          ? { amountCad: input.amountCad, rate: input.exchangeRate }
          : await convertToCad(input.amount, input.currency, input.date);

      const [tx] = await db
        .insert(transactions)
        .values({
          ...input,
          amount: String(input.amount),
          amountCad: String(conversion.amountCad),
          exchangeRate:
            conversion.rate !== undefined && conversion.rate !== null
              ? String(conversion.rate)
              : null,
        })
        .returning();
      return tx!;
    }),

  update: protectedProcedure.input(updateTransactionSchema).mutation(async ({ input }) => {
    const { id, ...data } = input;
    const updateData: Record<string, unknown> = { ...data, updatedAt: new Date() };
    if (data.amount !== undefined) updateData.amount = String(data.amount);
    if (data.amountCad !== undefined) updateData.amountCad = String(data.amountCad);
    if (data.exchangeRate !== undefined)
      updateData.exchangeRate = String(data.exchangeRate);

    const needsConversion =
      data.amountCad === undefined &&
      (data.amount !== undefined || data.currency !== undefined || data.date !== undefined);

    if (needsConversion) {
      const existing = await db.query.transactions.findFirst({
        where: eq(transactions.id, id),
      });
      if (!existing) throw new Error('Transaction not found');

      const amount = data.amount ?? Number(existing.amount);
      const currency = (data.currency ?? existing.currency) as 'CAD' | 'BRL' | 'EUR';
      const date = data.date ?? existing.date;
      const conversion = await convertToCad(amount, currency, date);
      updateData.amountCad = String(conversion.amountCad);
      updateData.exchangeRate =
        conversion.rate !== undefined && conversion.rate !== null
          ? String(conversion.rate)
          : null;
    }

    const [tx] = await db
      .update(transactions)
      .set(updateData)
      .where(eq(transactions.id, id))
      .returning();
    return tx!;
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await db.delete(transactions).where(eq(transactions.id, input.id));
    }),

  bulkUpdate: protectedProcedure
    .input(
      z.object({
        ids: z.array(z.string().uuid()),
        categoryId: z.string().uuid().optional(),
        isRecurring: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { ids, ...data } = input;
      let updated = 0;
      for (const id of ids) {
        await db
          .update(transactions)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(transactions.id, id));
        updated++;
      }
      return { updated };
    }),
});
