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

function toNumber(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

function monthsBetween(startIsoDate: string, endIsoDate: string): number {
  const start = new Date(`${startIsoDate}T00:00:00Z`);
  const end = new Date(`${endIsoDate}T00:00:00Z`);
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return 0;
  return ms / (1000 * 60 * 60 * 24 * 30.4375);
}

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

      const canonicalByDate = new Map<
        string,
        {
          id: string;
          snapshotDate: string;
          currentAmount: number;
          targetAmount: number;
          notes: string | null;
          source: SnapshotSource;
        }
      >();

      for (const snapshot of goal.snapshots) {
        const source = getSnapshotSource(snapshot.notes);
        const normalized = {
          id: snapshot.id,
          snapshotDate: snapshot.snapshotDate,
          currentAmount: toNumber(snapshot.currentAmount),
          targetAmount: toNumber(snapshot.targetAmount),
          notes: snapshot.notes,
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

      const latest = snapshots[snapshots.length - 1];
      const current = toNumber(latest?.currentAmount);
      const target = Number(goal.targetAmount);
      const pct = target > 0 ? Math.round((current / target) * 100) : 0;

      const authoritative = snapshots.filter((s) => s.source !== 'transfer');
      const projectionSeries =
        authoritative.length >= 2 ? authoritative.slice(-3) : snapshots.slice(-3);
      const projectionStart = projectionSeries[0];
      const projectionEnd = projectionSeries[projectionSeries.length - 1];

      let avgMonthlyContrib = 0;
      if (projectionStart && projectionEnd && projectionSeries.length >= 2) {
        const contributionDelta = projectionEnd.currentAmount - projectionStart.currentAmount;
        const spanMonths = monthsBetween(
          projectionStart.snapshotDate,
          projectionEnd.snapshotDate,
        );
        if (spanMonths > 0) {
          avgMonthlyContrib = contributionDelta / spanMonths;
        }
      }

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
        snapshots,
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
