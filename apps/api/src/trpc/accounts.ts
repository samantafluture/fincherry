import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { router, protectedProcedure } from './trpc.js';
import { db } from '../db/index.js';
import { accounts } from '../db/schema.js';

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
    return db.query.accounts.findMany({
      with: { goal: true },
      orderBy: (a, { asc }) => [asc(a.institution), asc(a.name)],
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
