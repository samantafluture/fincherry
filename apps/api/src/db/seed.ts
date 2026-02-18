/**
 * Seed script — inserts default categories and the two initial savings goals.
 * Run with: pnpm db:seed
 */
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

async function seed() {
  console.log('🌱 Seeding categories...');

  for (let i = 0; i < CATEGORY_TREE.length; i++) {
    const cat = CATEGORY_TREE[i]!;

    const [parent] = await db
      .insert(categories)
      .values({
        name: cat.name,
        icon: cat.icon,
        color: cat.color,
        isIncome: cat.isIncome ?? false,
        sortOrder: i,
      })
      .onConflictDoNothing()
      .returning();

    if (!parent) continue;

    for (let j = 0; j < cat.children.length; j++) {
      await db
        .insert(categories)
        .values({
          name: cat.children[j]!,
          parentId: parent.id,
          isIncome: cat.isIncome ?? false,
          sortOrder: j,
        })
        .onConflictDoNothing();
    }
  }

  console.log('🌱 Seeding goals...');

  const [healthGoal] = await db
    .insert(goals)
    .values({
      name: 'Private Health Fund',
      targetAmount: '4000.00',
      currency: 'CAD',
      goalType: 'annual_recurring',
      deadline: '2026-12-31',
    })
    .returning();

  const [houseGoal] = await db
    .insert(goals)
    .values({
      name: 'Moving / House',
      targetAmount: '50000.00',
      currency: 'CAD',
      goalType: 'milestone',
      deadline: '2028-12-31',
    })
    .returning();

  console.log('🌱 Seeding accounts...');

  await db.insert(accounts).values([
    {
      name: 'Desjardins Checking',
      type: 'checking',
      institution: 'Desjardins',
      currency: 'CAD',
      country: 'CA',
    },
    {
      name: 'Desjardins Mastercard',
      type: 'credit_card',
      institution: 'Desjardins',
      currency: 'CAD',
      country: 'CA',
    },
    {
      name: 'Desjardins Savings (Health)',
      type: 'savings',
      institution: 'Desjardins',
      currency: 'CAD',
      country: 'CA',
      goalId: healthGoal?.id,
    },
    {
      name: 'Desjardins Savings (House)',
      type: 'savings',
      institution: 'Desjardins',
      currency: 'CAD',
      country: 'CA',
      goalId: houseGoal?.id,
    },
    {
      name: 'N26',
      type: 'checking',
      institution: 'N26',
      currency: 'EUR',
      country: 'EU',
    },
    {
      name: 'Nubank',
      type: 'checking',
      institution: 'Nubank',
      currency: 'BRL',
      country: 'BR',
    },
    {
      name: 'Itaú Visa',
      type: 'credit_card',
      institution: 'Itaú',
      currency: 'BRL',
      country: 'BR',
    },
    {
      name: 'ScotiaBank Amex (historical)',
      type: 'credit_card',
      institution: 'ScotiaBank',
      currency: 'CAD',
      country: 'CA',
    },
  ]);

  console.log('✅ Seed complete');
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
