/**
 * Seed script — inserts default categories and the two initial savings goals.
 * Run with: pnpm db:seed
 */
import { eq } from 'drizzle-orm';
import { db } from './index.js';
import { categories, goals, accounts } from './schema.js';

const CATEGORY_TREE = [
  {
    name: 'Income',
    icon: '💰',
    color: '#2DD4A0',
    isIncome: true,
    children: ['Salary', 'Freelance', 'Etsy / Surpride', 'Other Income'],
  },
  {
    name: 'Housing',
    icon: '🏠',
    color: '#1A7A8A',
    children: ['Rent', 'Utilities', 'Internet'],
  },
  {
    name: 'Food & Drink',
    icon: '🍽',
    color: '#F472B6',
    children: ['Groceries', 'Restaurants', 'Coffee', 'Delivery'],
  },
  {
    name: 'Transportation',
    icon: '🚇',
    color: '#2DD4A0',
    children: ['Metro / Bus (STM)', 'Uber / Taxi', 'Gas'],
  },
  {
    name: 'Subscriptions',
    icon: '📱',
    color: '#8B9EE0',
    children: ['Software / SaaS', 'Streaming', 'Cloud / Hosting'],
  },
  {
    name: 'Health',
    icon: '⚕',
    color: '#F97352',
    children: ['Pharmacy', 'Insurance', 'Medical'],
  },
  {
    name: 'Shopping',
    icon: '🛍',
    color: '#F472B6',
    children: ['Electronics', 'Clothing', 'Home'],
  },
  {
    name: 'Entertainment',
    icon: '🎭',
    color: '#8B9EE0',
    children: ['Events', 'Games', 'Travel'],
  },
  {
    name: 'Financial',
    icon: '🏦',
    color: '#0D4F6A',
    children: ['Bank Fees', 'FX Fees', 'Credit Card Interest', 'Savings Transfer'],
  },
  {
    name: 'Other',
    icon: '📌',
    color: '#7A8BA8',
    children: [],
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
    name: 'Nubank',
    type: 'checking' as const,
    institution: 'Nubank',
    currency: 'BRL' as const,
    country: 'BR' as const,
  },
  {
    name: 'Itaú Visa',
    type: 'credit_card' as const,
    institution: 'Itaú',
    currency: 'BRL' as const,
    country: 'BR' as const,
  },
  {
    name: 'ScotiaBank Amex (historical)',
    type: 'credit_card' as const,
    institution: 'ScotiaBank',
    currency: 'CAD' as const,
    country: 'CA' as const,
  },
];

async function ensureCategories(): Promise<void> {
  for (let i = 0; i < CATEGORY_TREE.length; i++) {
    const cat = CATEGORY_TREE[i]!;

    let parent = await db.query.categories.findFirst({
      where: (c, { and, eq, isNull }) => and(eq(c.name, cat.name), isNull(c.parentId)),
    });

    if (!parent) {
      const [created] = await db
        .insert(categories)
        .values({
          name: cat.name,
          icon: cat.icon,
          color: cat.color,
          isIncome: cat.isIncome ?? false,
          sortOrder: i,
        })
        .returning();
      parent = created;
    } else {
      await db
        .update(categories)
        .set({
          icon: cat.icon,
          color: cat.color,
          isIncome: cat.isIncome ?? false,
          sortOrder: i,
        })
        .where(eq(categories.id, parent.id));
    }

    if (!parent) continue;

    for (let j = 0; j < cat.children.length; j++) {
      const childName = cat.children[j]!;
      const existingChild = await db.query.categories.findFirst({
        where: (c, { and, eq }) => and(eq(c.name, childName), eq(c.parentId, parent!.id)),
      });

      if (!existingChild) {
        await db.insert(categories).values({
          name: childName,
          parentId: parent.id,
          isIncome: cat.isIncome ?? false,
          sortOrder: j,
        });
      } else {
        await db
          .update(categories)
          .set({
            isIncome: cat.isIncome ?? false,
            sortOrder: j,
          })
          .where(eq(categories.id, existingChild.id));
      }
    }
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

    const existing = await db.query.accounts.findFirst({
      where: (a, { eq }) => eq(a.name, seed.name),
    });

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
