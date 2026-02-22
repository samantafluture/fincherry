/**
 * Seed script — inserts default categories and the two initial savings goals.
 * Run with: pnpm db:seed
 */
import { eq } from 'drizzle-orm';
import { db } from './index.js';
import { categories, goals, accounts } from './schema.js';

type CategorySeed = {
  name: string;
  icon?: string;
  color?: string;
  isIncome?: boolean;
  children?: CategorySeed[];
};

const CATEGORY_ALIASES: Record<string, string[]> = {
  Surpride: ['Etsy / Surpride'],
  'Food Delivery': ['Delivery'],
};

const CATEGORY_TREE: CategorySeed[] = [
  {
    name: 'Income',
    icon: '💰',
    color: '#2DD4A0',
    isIncome: true,
    children: [
      { name: 'Salary' },
      { name: 'Partner' },
      { name: 'Surpride' },
      { name: 'Interest & Dividends' },
      { name: 'Other Income' },
    ],
  },
  {
    name: 'Expense',
    icon: '💸',
    color: '#F97352',
    children: [
      {
        name: 'Housing',
        icon: '🏠',
        children: [{ name: 'Rent' }, { name: 'Insurance' }],
      },
      {
        name: 'Utilities',
        icon: '🔌',
        children: [{ name: 'Electricity' }, { name: 'Internet' }, { name: 'Mobile' }],
      },
      {
        name: 'Food & Drink',
        icon: '🍽',
        children: [
          { name: 'Groceries' },
          { name: 'Ready-to-Eat Meals' },
          { name: 'Food Delivery' },
          { name: 'Restaurants' },
          { name: 'Coffee' },
        ],
      },
      {
        name: 'Shopping',
        icon: '🛍',
        children: [
          { name: 'Thrift' },
          { name: 'Books' },
          { name: 'Clothing' },
          { name: 'Electronics' },
          { name: 'Home' },
        ],
      },
      {
        name: 'Cats',
        icon: '🐾',
        children: [{ name: 'Food' }, { name: 'Vet' }, { name: 'Care' }],
      },
      {
        name: 'Transportation',
        icon: '🚇',
        children: [{ name: 'Metro / Bus (STM)' }, { name: 'Uber / Taxi' }, { name: 'Gas' }],
      },
      {
        name: 'Health',
        icon: '⚕',
        children: [{ name: 'Pharmacy' }, { name: 'Medical' }],
      },
      { name: 'Subscriptions', icon: '📱' },
      { name: 'Travel', icon: '✈' },
      { name: 'Brazil Contribution', icon: '🇧🇷' },
      { name: 'Etsy Related Expenses', icon: '🧶' },
      { name: 'Course / Learning', icon: '📚' },
      { name: 'Bank Fees', icon: '🏦' },
      { name: 'FX Fees', icon: '💱' },
      { name: 'Credit Card Interest', icon: '💳' },
      { name: 'Other Expense', icon: '📌' },
    ],
  },
  {
    name: 'Transfer',
    icon: '🔁',
    color: '#8B9EE0',
    children: [{ name: 'Savings Transfer' }, { name: 'Credit Card Payment' }],
  },
  {
    name: 'Other',
    icon: '📌',
    color: '#7A8BA8',
    children: [{ name: 'Uncategorized' }],
  },
];

const GOAL_SEEDS = [
  {
    name: 'Private Health Fund',
    targetAmount: '4000.00',
    currency: 'CAD' as const,
    goalType: 'annual_recurring' as const,
    deadline: '2026-12-31',
  },
  {
    name: 'Moving / House',
    targetAmount: '50000.00',
    currency: 'CAD' as const,
    goalType: 'milestone' as const,
    deadline: '2028-12-31',
  },
];

const ACCOUNT_SEEDS = [
  {
    name: 'Desjardins Checking',
    type: 'checking' as const,
    institution: 'Desjardins',
    currency: 'CAD' as const,
    country: 'CA' as const,
  },
  {
    name: 'Desjardins Mastercard',
    type: 'credit_card' as const,
    institution: 'Desjardins',
    currency: 'CAD' as const,
    country: 'CA' as const,
  },
  {
    name: 'Desjardins Savings (Health)',
    type: 'savings' as const,
    institution: 'Desjardins',
    currency: 'CAD' as const,
    country: 'CA' as const,
    goalName: 'Private Health Fund',
  },
  {
    name: 'Desjardins Savings (House)',
    type: 'savings' as const,
    institution: 'Desjardins',
    currency: 'CAD' as const,
    country: 'CA' as const,
    goalName: 'Moving / House',
  },
  {
    name: 'N26',
    type: 'checking' as const,
    institution: 'N26',
    currency: 'EUR' as const,
    country: 'EU' as const,
  },
  {
    name: 'Itaú Checking',
    type: 'checking' as const,
    institution: 'Itaú',
    currency: 'BRL' as const,
    country: 'BR' as const,
    legacyNames: ['Nubank'],
  },
  {
    name: 'Itaú Visa Credit Card',
    type: 'credit_card' as const,
    institution: 'Itaú',
    currency: 'BRL' as const,
    country: 'BR' as const,
    legacyNames: ['Itaú Visa'],
  },
  {
    name: 'ScotiaBank Amex (historical)',
    type: 'credit_card' as const,
    institution: 'ScotiaBank',
    currency: 'CAD' as const,
    country: 'CA' as const,
  },
];

async function upsertCategoryNode(
  node: CategorySeed,
  parentId: string | null,
  sortOrder: number,
  inheritedIsIncome: boolean,
): Promise<string> {
  const isIncome = node.isIncome ?? inheritedIsIncome;

  let existing = await db.query.categories.findFirst({
    where: (c, { and, eq, isNull }) =>
      parentId ? and(eq(c.name, node.name), eq(c.parentId, parentId)) : and(eq(c.name, node.name), isNull(c.parentId)),
  });

  // If it exists under another parent, reuse and reparent to avoid duplicates.
  if (!existing) {
    const sameName = await db.query.categories.findMany({
      where: (c, { eq }) => eq(c.name, node.name),
      orderBy: (c, { asc }) => [asc(c.sortOrder)],
      limit: 1,
    });
    existing = sameName[0];
  }

  // Alias support for legacy category names.
  if (!existing) {
    const aliases = CATEGORY_ALIASES[node.name] ?? [];
    for (const alias of aliases) {
      const aliasMatch = await db.query.categories.findMany({
        where: (c, { eq }) => eq(c.name, alias),
        orderBy: (c, { asc }) => [asc(c.sortOrder)],
        limit: 1,
      });
      if (aliasMatch[0]) {
        existing = aliasMatch[0];
        break;
      }
    }
  }

  if (!existing) {
    const [created] = await db
      .insert(categories)
      .values({
        name: node.name,
        parentId,
        icon: node.icon ?? null,
        color: node.color ?? null,
        isIncome,
        sortOrder,
      })
      .returning();
    existing = created;
  } else {
    await db
      .update(categories)
      .set({
        name: node.name,
        parentId,
        icon: node.icon ?? null,
        color: node.color ?? null,
        isIncome,
        sortOrder,
      })
      .where(eq(categories.id, existing.id));
  }

  const children = node.children ?? [];
  for (let i = 0; i < children.length; i++) {
    await upsertCategoryNode(children[i]!, existing.id, i, isIncome);
  }

  return existing.id;
}

async function ensureCategories(): Promise<void> {
  for (let i = 0; i < CATEGORY_TREE.length; i++) {
    await upsertCategoryNode(CATEGORY_TREE[i]!, null, i, false);
  }
}

async function ensureGoals(): Promise<Map<string, string>> {
  const goalIdByName = new Map<string, string>();

  for (const seed of GOAL_SEEDS) {
    const existing = await db.query.goals.findFirst({
      where: (g, { eq }) => eq(g.name, seed.name),
    });

    if (!existing) {
      const [created] = await db.insert(goals).values(seed).returning();
      if (created) goalIdByName.set(seed.name, created.id);
      continue;
    }

    await db
      .update(goals)
      .set({
        targetAmount: seed.targetAmount,
        currency: seed.currency,
        goalType: seed.goalType,
        deadline: seed.deadline,
      })
      .where(eq(goals.id, existing.id));

    goalIdByName.set(seed.name, existing.id);
  }

  return goalIdByName;
}

async function ensureAccounts(goalIdByName: Map<string, string>): Promise<void> {
  for (const seed of ACCOUNT_SEEDS) {
    const desiredGoalId = seed.goalName ? (goalIdByName.get(seed.goalName) ?? null) : null;

    let existing = await db.query.accounts.findFirst({
      where: (a, { eq }) => eq(a.name, seed.name),
    });

    if (!existing && seed.legacyNames && seed.legacyNames.length > 0) {
      for (const legacyName of seed.legacyNames) {
        const legacy = await db.query.accounts.findFirst({
          where: (a, { eq }) => eq(a.name, legacyName),
        });
        if (legacy) {
          existing = legacy;
          break;
        }
      }
    }

    if (!existing) {
      await db.insert(accounts).values({
        name: seed.name,
        type: seed.type,
        institution: seed.institution,
        currency: seed.currency,
        country: seed.country,
        goalId: desiredGoalId,
      });
      continue;
    }

    await db
      .update(accounts)
      .set({
        name: seed.name,
        type: seed.type,
        institution: seed.institution,
        currency: seed.currency,
        country: seed.country,
        goalId: desiredGoalId,
      })
      .where(eq(accounts.id, existing.id));
  }
}

async function seed() {
  console.log('🌱 Seeding categories...');
  await ensureCategories();

  console.log('🌱 Seeding goals...');
  const goalIdByName = await ensureGoals();

  console.log('🌱 Seeding accounts...');
  await ensureAccounts(goalIdByName);

  console.log('✅ Seed complete');
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
