import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { router, protectedProcedure } from './trpc.js';
import { db } from '../db/index.js';
import { goals, goalSnapshots } from '../db/schema.js';

const createGoalSchema = z.object({
  name: z.string().min(1).max(100),
  targetAmount: z.number().positive(),
  currency: z.enum(['CAD', 'BRL', 'EUR']).default('CAD'),
  goalType: z.enum(['annual_recurring', 'milestone']),
  deadline: z.string().optional(), // ISO date YYYY-MM-DD
});

export const goalsRouter = router({
  list: protectedProcedure.query(async () => {
    const allGoals = await db.query.goals.findMany({
      with: { snapshots: { orderBy: (s, { desc }) => [desc(s.snapshotDate)], limit: 1 } },
    });

    return allGoals.map((g) => ({
      ...g,
      currentAmount: g.snapshots[0]?.currentAmount ?? '0',
    }));
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      return db.query.goals.findFirst({
        where: eq(goals.id, input.id),
        with: { snapshots: { orderBy: (s, { asc }) => [asc(s.snapshotDate)] } },
      });
    }),

  create: protectedProcedure.input(createGoalSchema).mutation(async ({ input }) => {
    const [goal] = await db
      .insert(goals)
      .values({ ...input, targetAmount: String(input.targetAmount) })
      .returning();
    return goal!;
  }),

  update: protectedProcedure
    .input(createGoalSchema.partial().extend({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const { id, targetAmount, ...data } = input;
      const [goal] = await db
        .update(goals)
        .set({
          ...data,
          ...(targetAmount !== undefined ? { targetAmount: String(targetAmount) } : {}),
        })
        .where(eq(goals.id, id))
        .returning();
      return goal!;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await db.delete(goals).where(eq(goals.id, input.id));
    }),

  progress: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const goal = await db.query.goals.findFirst({
        where: eq(goals.id, input.id),
        with: {
          snapshots: { orderBy: (s, { asc }) => [asc(s.snapshotDate)] },
          accounts: true,
        },
      });

      if (!goal) throw new Error('Goal not found');

      const latest = goal.snapshots[goal.snapshots.length - 1];
      const current = Number(latest?.currentAmount ?? 0);
      const target = Number(goal.targetAmount);
      const pct = target > 0 ? Math.round((current / target) * 100) : 0;

      // Rolling 3-month average contribution
      const recent = goal.snapshots.slice(-3);
      const avgMonthlyContrib =
        recent.length >= 2
          ? (Number(recent[recent.length - 1]!.currentAmount) -
              Number(recent[0]!.currentAmount)) /
            (recent.length - 1)
          : 0;

      // Projected completion date
      let projectedDate: string | null = null;
      if (avgMonthlyContrib > 0 && target > current) {
        const monthsLeft = Math.ceil((target - current) / avgMonthlyContrib);
        const projected = new Date();
        projected.setMonth(projected.getMonth() + monthsLeft);
        projectedDate = projected.toISOString().split('T')[0] ?? null;
      }

      return {
        ...goal,
        currentAmount: current,
        percentage: pct,
        avgMonthlyContribution: Math.round(avgMonthlyContrib),
        projectedCompletionDate: projectedDate,
      };
    }),

  addSnapshot: protectedProcedure
    .input(
      z.object({
        goalId: z.string().uuid(),
        snapshotDate: z.string(),
        currentAmount: z.number(),
        targetAmount: z.number(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const [snapshot] = await db
        .insert(goalSnapshots)
        .values({
          ...input,
          currentAmount: String(input.currentAmount),
          targetAmount: String(input.targetAmount),
        })
        .returning();
      return snapshot!;
    }),
});
