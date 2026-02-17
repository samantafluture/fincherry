import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { router, protectedProcedure } from './trpc.js';
import { db } from '../db/index.js';
import { categories, categorizationRules } from '../db/schema.js';

export const categoriesRouter = router({
  list: protectedProcedure.query(async () => {
    // Return flat list — frontend builds tree
    return db.query.categories.findMany({
      orderBy: (c, { asc }) => [asc(c.sortOrder), asc(c.name)],
    });
  }),

  listTree: protectedProcedure.query(async () => {
    const all = await db.query.categories.findMany({
      orderBy: (c, { asc }) => [asc(c.sortOrder)],
    });

    // Build tree structure
    const roots = all.filter((c) => c.parentId === null);
    return roots.map((root) => ({
      ...root,
      children: all.filter((c) => c.parentId === root.id),
    }));
  }),

  create: protectedProcedure
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
      const [category] = await db.insert(categories).values(input).returning();
      return category!;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        icon: z.string().max(50).optional(),
        color: z.string().length(7).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const [category] = await db
        .update(categories)
        .set(data)
        .where(eq(categories.id, id))
        .returning();
      return category!;
    }),

  listRules: protectedProcedure.query(async () => {
    return db.query.categorizationRules.findMany({
      with: { category: true },
      orderBy: (r, { desc }) => [desc(r.priority)],
    });
  }),

  addRule: protectedProcedure
    .input(
      z.object({
        pattern: z.string().min(1).max(200),
        categoryId: z.string().uuid(),
        priority: z.number().int().default(0),
      }),
    )
    .mutation(async ({ input }) => {
      const [rule] = await db.insert(categorizationRules).values(input).returning();
      return rule!;
    }),

  deleteRule: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await db.delete(categorizationRules).where(eq(categorizationRules.id, input.id));
    }),
});
