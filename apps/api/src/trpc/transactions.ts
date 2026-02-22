import { z } from 'zod';
import { eq, and, gte, lte, like, sql, desc, asc, inArray } from 'drizzle-orm';
import { router, protectedProcedure } from './trpc.js';
import { db } from '../db/index.js';
import { categories, transactions } from '../db/schema.js';
import { convertToCad } from '../services/currencyConverter.js';
import { detectRecurringCandidates } from '../services/recurringDetection.js';

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

const transactionExportSchema = transactionFiltersSchema
  .omit({ page: true, limit: true })
  .extend({
    maxRows: z.number().int().min(1).max(20000).default(10000),
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

const detectRecurringSchema = z.object({
  apply: z.boolean().default(true),
  lookbackMonths: z.number().int().min(1).max(60).default(24),
});

type TransactionFilterInput = Pick<
  z.infer<typeof transactionFiltersSchema>,
  | 'startDate'
  | 'endDate'
  | 'accountId'
  | 'accountIds'
  | 'categoryId'
  | 'categoryIds'
  | 'minAmount'
  | 'maxAmount'
  | 'search'
  | 'recurring'
  | 'currency'
>;

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

function buildTransactionConditions(
  input: TransactionFilterInput,
  expandedCategoryIds: string[],
) {
  const conditions = [];

  if (input.startDate) conditions.push(gte(transactions.date, input.startDate));
  if (input.endDate) conditions.push(lte(transactions.date, input.endDate));
  if (input.accountIds.length > 0) {
    conditions.push(inArray(transactions.accountId, input.accountIds));
  } else if (input.accountId) {
    conditions.push(eq(transactions.accountId, input.accountId));
  }
  if (expandedCategoryIds.length > 0) {
    conditions.push(inArray(transactions.categoryId, expandedCategoryIds));
  }
  if (input.currency) conditions.push(eq(transactions.currency, input.currency));
  if (input.recurring !== undefined) {
    conditions.push(eq(transactions.isRecurring, input.recurring));
  }
  if (input.search) conditions.push(like(transactions.description, `%${input.search}%`));
  if (input.minAmount !== undefined) {
    conditions.push(sql`${transactions.amountCad} >= ${input.minAmount}`);
  }
  if (input.maxAmount !== undefined) {
    conditions.push(sql`${transactions.amountCad} <= ${input.maxAmount}`);
  }

  return conditions;
}

function csvEscape(value: string): string {
  const escaped = value.replace(/"/g, '""');
  if (/[",\n]/.test(escaped)) return `"${escaped}"`;
  return escaped;
}

function toCsv(rows: string[][]): string {
  return `${rows.map((row) => row.map(csvEscape).join(',')).join('\n')}\n`;
}

export const transactionsRouter = router({
  list: protectedProcedure.input(transactionFiltersSchema).query(async ({ input }) => {
    const requestedCategoryIds = [
      ...(input.categoryId ? [input.categoryId] : []),
      ...input.categoryIds,
    ];
    const expandedCategoryIds = await expandCategoryFilterIds(requestedCategoryIds);
    const conditions = buildTransactionConditions(input, expandedCategoryIds);

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

  exportCsv: protectedProcedure
    .input(transactionExportSchema)
    .mutation(async ({ input }) => {
      const requestedCategoryIds = [
        ...(input.categoryId ? [input.categoryId] : []),
        ...input.categoryIds,
      ];
      const expandedCategoryIds = await expandCategoryFilterIds(requestedCategoryIds);
      const conditions = buildTransactionConditions(input, expandedCategoryIds);
      const orderFn = input.sortOrder === 'asc' ? asc : desc;
      const orderCol =
        input.sortBy === 'date'
          ? transactions.date
          : input.sortBy === 'amount'
            ? transactions.amountCad
            : transactions.date;

      const [txRows, allCategories] = await Promise.all([
        db.query.transactions.findMany({
          where: conditions.length > 0 ? and(...conditions) : undefined,
          with: { account: true, category: true, subcategory: true },
          orderBy: orderFn(orderCol),
          limit: input.maxRows,
        }),
        db
          .select({ id: categories.id, name: categories.name, parentId: categories.parentId })
          .from(categories),
      ]);

      const categoryById = new Map(
        allCategories.map((category) => [category.id, category] as const),
      );
      const categoryPathCache = new Map<string, string>();
      const getCategoryPath = (id: string | null) => {
        if (!id) return '';
        const cached = categoryPathCache.get(id);
        if (cached) return cached;
        const parts: string[] = [];
        let cursor: string | null = id;
        while (cursor) {
          const node = categoryById.get(cursor);
          if (!node) break;
          parts.unshift(node.name);
          cursor = node.parentId;
        }
        const path = parts.join(' / ');
        categoryPathCache.set(id, path);
        return path;
      };

      const csvRows: string[][] = [
        [
          'Date',
          'Description',
          'Account',
          'Institution',
          'Category Path',
          'Category',
          'Subcategory',
          'Amount',
          'Currency',
          'Amount CAD',
          'Recurring',
          'Notes',
        ],
      ];

      for (const tx of txRows) {
        csvRows.push([
          tx.date,
          tx.description ?? '',
          tx.account?.name ?? '',
          tx.account?.institution ?? '',
          getCategoryPath(tx.categoryId),
          tx.category?.name ?? '',
          tx.subcategory?.name ?? '',
          tx.amount ?? '',
          tx.currency ?? '',
          tx.amountCad ?? '',
          tx.isRecurring ? 'yes' : 'no',
          tx.notes ?? '',
        ]);
      }

      const now = new Date().toISOString().slice(0, 10);
      return {
        filename: `fincherry-transactions-${now}.csv`,
        mimeType: 'text/csv;charset=utf-8',
        rowCount: txRows.length,
        truncated: txRows.length >= input.maxRows,
        csv: toCsv(csvRows),
      };
    }),

  detectRecurring: protectedProcedure
    .input(detectRecurringSchema)
    .mutation(async ({ input }) => {
      const now = new Date();
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      start.setUTCMonth(start.getUTCMonth() - input.lookbackMonths);
      const startDate = start.toISOString().slice(0, 10);

      const rows = await db.query.transactions.findMany({
        where: gte(transactions.date, startDate),
        columns: {
          id: true,
          accountId: true,
          date: true,
          description: true,
          amountCad: true,
          isRecurring: true,
        },
      });

      const candidates = detectRecurringCandidates(rows);
      const detectedIdSet = new Set(
        candidates.flatMap((candidate) => candidate.transactionIds),
      );
      const detectedIds = Array.from(detectedIdSet);
      const toUpdate = rows
        .filter((tx) => detectedIdSet.has(tx.id) && !tx.isRecurring)
        .map((tx) => tx.id);

      if (input.apply && toUpdate.length > 0) {
        await db
          .update(transactions)
          .set({ isRecurring: true, updatedAt: new Date() })
          .where(inArray(transactions.id, toUpdate));
      }

      return {
        scanned: rows.length,
        groups: candidates.length,
        detected: detectedIds.length,
        updated: input.apply ? toUpdate.length : 0,
        applied: input.apply,
        lookbackMonths: input.lookbackMonths,
        topCandidates: candidates.slice(0, 12),
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
