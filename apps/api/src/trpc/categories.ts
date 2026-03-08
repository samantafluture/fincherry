import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, isNull, or } from 'drizzle-orm';
import { router, protectedProcedure, adminProcedure } from './trpc.js';
import { db } from '../db/index.js';
import { categories, categorizationRules, transactions } from '../db/schema.js';
import { categorizerService } from '../services/categorizer.js';

const ROOT_CATEGORY_NAMES = new Set(['Income', 'Expense', 'Transfer', 'Other']);

function mutationMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export const categoriesRouter = router({
  list: protectedProcedure.query(async () => {
    // Return flat list — frontend builds tree
    return db.query.categories.findMany({
      orderBy: (c, { asc }) => [asc(c.sortOrder), asc(c.name)],
    });
  }),

  listTree: protectedProcedure.query(async () => {
    const ACTIVE_ROOTS = new Set(['Income', 'Expense', 'Transfer', 'Other']);
    const all = await db.query.categories.findMany({
      orderBy: (c, { asc }) => [asc(c.sortOrder), asc(c.name)],
    });
    type CategoryTreeNode = (typeof all)[number] & { children: CategoryTreeNode[] };

    const byParent = new Map<string | null, typeof all>();
    for (const category of all) {
      const key = category.parentId;
      const siblings = byParent.get(key) ?? [];
      siblings.push(category);
      byParent.set(key, siblings);
    }

    const buildTree = (parentId: string | null): CategoryTreeNode[] => {
      const children = byParent.get(parentId) ?? [];
      return children.map((child) => ({
        ...child,
        children: buildTree(child.id),
      }));
    };

    return buildTree(null).filter((root) => ACTIVE_ROOTS.has(root.name));
  }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        parentId: z.string().uuid().optional(),
        icon: z.string().max(50).optional(),
        color: z.string().length(7).optional(),
        isIncome: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input }) => {
      const parent = input.parentId
        ? await db.query.categories.findFirst({
            where: eq(categories.id, input.parentId),
          })
        : null;

      if (input.parentId && !parent) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Parent category not found.',
        });
      }

      const siblings = await db.query.categories.findMany({
        where: input.parentId
          ? eq(categories.parentId, input.parentId)
          : isNull(categories.parentId),
      });
      const nextSortOrder =
        siblings.reduce((max, sibling) => Math.max(max, sibling.sortOrder), -1) + 1;

      const [category] = await db
        .insert(categories)
        .values({
          ...input,
          parentId: input.parentId ?? null,
          isIncome: parent?.isIncome ?? input.isIncome,
          sortOrder: nextSortOrder,
        })
        .returning();
      return category!;
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        icon: z.string().max(50).optional(),
        color: z.string().length(7).optional(),
        parentId: z.string().uuid().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const existing = await db.query.categories.findFirst({
        where: eq(categories.id, id),
      });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Category not found.' });
      }
      if (!existing.parentId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Root categories cannot be edited.',
        });
      }

      const updateData: Record<string, unknown> = {
        name: data.name,
        icon: data.icon,
        color: data.color,
      };

      if (data.parentId !== undefined) {
        if (data.parentId === null) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Custom categories must stay under a parent category.',
          });
        }
        if (data.parentId === id) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'A category cannot be its own parent.',
          });
        }

        const allCategories = await db.query.categories.findMany({
          columns: { id: true, parentId: true, isIncome: true },
        });
        const categoryById = new Map(allCategories.map((category) => [category.id, category]));
        const parent = categoryById.get(data.parentId);
        if (!parent) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Selected parent category does not exist.',
          });
        }

        let cursor: string | null = data.parentId;
        while (cursor) {
          if (cursor === id) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Cannot move a category under one of its descendants.',
            });
          }
          cursor = categoryById.get(cursor)?.parentId ?? null;
        }

        const siblings = await db.query.categories.findMany({
          where: eq(categories.parentId, data.parentId),
        });
        const nextSortOrder =
          siblings
            .filter((sibling) => sibling.id !== id)
            .reduce((max, sibling) => Math.max(max, sibling.sortOrder), -1) + 1;

        updateData.parentId = data.parentId;
        updateData.isIncome = parent.isIncome;
        updateData.sortOrder = nextSortOrder;
      }

      const [category] = await db
        .update(categories)
        .set(updateData)
        .where(eq(categories.id, id))
        .returning();
      return category!;
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const category = await db.query.categories.findFirst({
        where: eq(categories.id, input.id),
      });
      if (!category) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Category not found.' });
      }

      if (!category.parentId || ROOT_CATEGORY_NAMES.has(category.name)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Root categories cannot be deleted.',
        });
      }

      const child = await db.query.categories.findFirst({
        where: eq(categories.parentId, input.id),
      });
      if (child) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Delete or move child categories first.',
        });
      }

      const usedByTransaction = await db.query.transactions.findFirst({
        where: or(
          eq(transactions.categoryId, input.id),
          eq(transactions.subcategoryId, input.id),
        ),
      });
      if (usedByTransaction) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Category is used by transactions and cannot be deleted.',
        });
      }

      const usedByRule = await db.query.categorizationRules.findFirst({
        where: eq(categorizationRules.categoryId, input.id),
      });
      if (usedByRule) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Category is used by rules and cannot be deleted.',
        });
      }

      await db.delete(categories).where(eq(categories.id, input.id));
      return { ok: true };
    }),

  listRules: protectedProcedure.query(async () => {
    return db.query.categorizationRules.findMany({
      with: { category: true },
      orderBy: (r, { desc }) => [desc(r.priority)],
    });
  }),

  addRule: adminProcedure
    .input(
      z.object({
        pattern: z.string().min(1).max(200),
        categoryId: z.string().uuid(),
        priority: z.number().int().default(0),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const [rule] = await db.insert(categorizationRules).values(input).returning();
        const appliedCount = await categorizerService.applyRuleToExistingTransactions({
          pattern: rule!.pattern,
          categoryId: rule!.categoryId,
        });
        return { ...rule!, appliedCount };
      } catch (err) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: mutationMessage(err, 'Unable to add rule.'),
        });
      }
    }),

  applyRules: adminProcedure
    .input(z.object({ onlyUncategorized: z.boolean().default(true) }).default({ onlyUncategorized: true }))
    .mutation(async ({ input }) => {
      return categorizerService.applyRulesToExistingTransactions({
        onlyUncategorized: input.onlyUncategorized,
      });
    }),

  deleteRule: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await db.delete(categorizationRules).where(eq(categorizationRules.id, input.id));
    }),
});
