import { z } from 'zod';
import { eq, inArray, sql } from 'drizzle-orm';
import { router, protectedProcedure } from './trpc.js';
import { db } from '../db/index.js';
import { accounts, transactions, goalSnapshots } from '../db/schema.js';

const accountTypeEnum = z.enum(['checking', 'credit_card', 'savings']);
const currencyEnum = z.enum(['CAD', 'BRL', 'EUR']);
const countryEnum = z.enum(['CA', 'BR', 'EU']);

const createAccountSchema = z.object({
  name: z.string().min(1).max(100),
  type: accountTypeEnum,
  institution: z.string().min(1).max(100),
  currency: currencyEnum,
  country: countryEnum,
  isInvestment: z.boolean().default(false),
  goalId: z.string().uuid().optional(),
});

const updateAccountSchema = createAccountSchema.partial().extend({
  id: z.string().uuid(),
});

export const accountsRouter = router({
  list: protectedProcedure.query(async () => {
    const accountRows = await db.query.accounts.findMany({
      with: { goal: true },
      orderBy: (a, { asc }) => [asc(a.institution), asc(a.name)],
    });

    if (accountRows.length === 0) return accountRows;

    const sums = await db
      .select({
        accountId: transactions.accountId,
        balanceNative: sql<string>`coalesce(sum(${transactions.amount}), 0)`,
        balanceCad: sql<string>`coalesce(sum(${transactions.amountCad}), 0)`,
      })
      .from(transactions)
      .where(inArray(transactions.accountId, accountRows.map((account) => account.id)))
      .groupBy(transactions.accountId);

    const sumsByAccountId = new Map(sums.map((row) => [row.accountId, row]));
    const goalIds = accountRows
      .filter((account) => account.type === 'savings' && account.goalId)
      .map((account) => account.goalId!)
      .filter((goalId, idx, arr) => arr.indexOf(goalId) === idx);

    const snapshots = goalIds.length
      ? await db.query.goalSnapshots.findMany({
          where: inArray(goalSnapshots.goalId, goalIds),
          orderBy: (s, { asc, desc }) => [asc(s.goalId), desc(s.snapshotDate)],
        })
      : [];
    const latestSnapshotByGoalId = new Map<string, (typeof snapshots)[number]>();
    for (const snapshot of snapshots) {
      if (!latestSnapshotByGoalId.has(snapshot.goalId)) {
        latestSnapshotByGoalId.set(snapshot.goalId, snapshot);
      }
    }

    return accountRows.map((account) => {
      const sum = sumsByAccountId.get(account.id);
      const latestGoalSnapshot =
        account.type === 'savings' && account.goalId
          ? latestSnapshotByGoalId.get(account.goalId)
          : undefined;
      const snapshotBalance = latestGoalSnapshot ? Number(latestGoalSnapshot.currentAmount) : null;
      const currentBalanceNative = snapshotBalance ?? (sum ? Number(sum.balanceNative) : 0);
      const currentBalanceCad = snapshotBalance ?? (sum ? Number(sum.balanceCad) : 0);

      return {
        ...account,
        currentBalanceNative,
        currentBalanceCad,
      };
    });
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const account = await db.query.accounts.findFirst({
        where: eq(accounts.id, input.id),
        with: { goal: true },
      });
      if (!account) throw new Error('Account not found');
      return account;
    }),

  create: protectedProcedure
    .input(createAccountSchema)
    .mutation(async ({ input }) => {
      const [account] = await db.insert(accounts).values(input).returning();
      return account!;
    }),

  update: protectedProcedure
    .input(updateAccountSchema)
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const [account] = await db
        .update(accounts)
        .set(data)
        .where(eq(accounts.id, id))
        .returning();
      if (!account) throw new Error('Account not found');
      return account;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      await db.delete(accounts).where(eq(accounts.id, input.id));
    }),
});
