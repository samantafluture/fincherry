import {
  pgTable,
  uuid,
  varchar,
  text,
  decimal,
  boolean,
  integer,
  date,
  timestamp,
  serial,
  unique,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ── Categories ──────────────────────────────────────────────────────────
// Defined first — no dependencies

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  parentId: uuid('parent_id').references((): AnyPgColumn => categories.id),
  icon: varchar('icon', { length: 50 }),
  color: varchar('color', { length: 7 }),
  isIncome: boolean('is_income').default(false).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
});

// ── Goals ───────────────────────────────────────────────────────────────
// Defined before accounts (accounts references goals)

export const goals = pgTable('goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  targetAmount: decimal('target_amount', { precision: 12, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).default('CAD').notNull(),
  goalType: varchar('goal_type', { length: 20 }).notNull(), // 'annual_recurring' | 'milestone'
  deadline: date('deadline'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Accounts ────────────────────────────────────────────────────────────

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  type: varchar('type', { length: 20 }).notNull(), // 'checking' | 'credit_card' | 'savings'
  institution: varchar('institution', { length: 100 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull(), // 'CAD' | 'BRL' | 'EUR'
  country: varchar('country', { length: 2 }).notNull(), // 'CA' | 'BR' | 'EU'
  isInvestment: boolean('is_investment').default(false).notNull(),
  goalId: uuid('goal_id').references(() => goals.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Transactions ────────────────────────────────────────────────────────

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    date: date('date').notNull(),
    description: text('description').notNull(),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(), // negative=expense, positive=income
    currency: varchar('currency', { length: 3 }).notNull(),
    amountCad: decimal('amount_cad', { precision: 12, scale: 2 }).notNull(),
    exchangeRate: decimal('exchange_rate', { precision: 10, scale: 6 }),
    categoryId: uuid('category_id').references(() => categories.id),
    subcategoryId: uuid('subcategory_id').references(() => categories.id),
    notes: text('notes'),
    isRecurring: boolean('is_recurring').default(false).notNull(),
    sourceFile: varchar('source_file', { length: 255 }),
    uploadId: uuid('upload_id').references(() => uploads.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    hiddenFromPartner: boolean('hidden_from_partner').default(false).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_transactions_date').on(table.date),
    index('idx_transactions_account').on(table.accountId),
    index('idx_transactions_category').on(table.categoryId),
    index('idx_transactions_account_date').on(table.accountId, table.date),
    index('idx_transactions_category_date').on(table.categoryId, table.date),
    index('idx_transactions_recurring_date').on(table.isRecurring, table.date),
    index('idx_transactions_amount_cad').on(table.amountCad),
    index('idx_transactions_upload').on(table.uploadId),
  ],
);

// ── Goal Progress Snapshots ─────────────────────────────────────────────

export const goalSnapshots = pgTable('goal_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  goalId: uuid('goal_id')
    .notNull()
    .references(() => goals.id),
  snapshotDate: date('snapshot_date').notNull(),
  currentAmount: decimal('current_amount', { precision: 12, scale: 2 }).notNull(),
  targetAmount: decimal('target_amount', { precision: 12, scale: 2 }).notNull(),
  notes: text('notes'),
});

// ── Exchange Rates ──────────────────────────────────────────────────────

export const exchangeRates = pgTable(
  'exchange_rates',
  {
    id: serial('id').primaryKey(),
    fromCurrency: varchar('from_currency', { length: 3 }).notNull(),
    toCurrency: varchar('to_currency', { length: 3 }).default('CAD').notNull(),
    rate: decimal('rate', { precision: 10, scale: 6 }).notNull(),
    rateDate: date('rate_date').notNull(),
  },
  (table) => [
    unique('exchange_rates_unique').on(table.fromCurrency, table.toCurrency, table.rateDate),
    index('idx_exchange_rates_lookup').on(table.fromCurrency, table.toCurrency, table.rateDate),
  ],
);

// ── PDF Upload Log ──────────────────────────────────────────────────────

export const uploads = pgTable('uploads', {
  id: uuid('id').primaryKey().defaultRandom(),
  filename: varchar('filename', { length: 255 }).notNull(),
  accountId: uuid('account_id').references(() => accounts.id),
  status: varchar('status', { length: 20 }).default('pending').notNull(), // 'pending' | 'parsed' | 'error'
  transactionsCount: integer('transactions_count').default(0).notNull(),
  errorMessage: text('error_message'),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── AI Interaction Cache ────────────────────────────────────────────────

export const aiCache = pgTable('ai_cache', {
  id: uuid('id').primaryKey().defaultRandom(),
  promptHash: varchar('prompt_hash', { length: 64 }).notNull().unique(),
  response: text('response').notNull(), // JSON string
  model: varchar('model', { length: 50 }),
  tokensUsed: integer('tokens_used'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const aiReports = pgTable(
  'ai_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reportMonth: date('report_month').notNull(), // first day of month
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    prompt: text('prompt').notNull(),
    response: text('response').notNull(), // JSON string
    provider: varchar('provider', { length: 40 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_ai_reports_month').on(table.reportMonth, table.createdAt)],
);

// ── Budgets ─────────────────────────────────────────────────────────────

export const budgets = pgTable(
  'budgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id),
    monthlyCad: decimal('monthly_cad', { precision: 12, scale: 2 }).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique('budgets_category_unique').on(table.categoryId)],
);

// ── Categorization Rules ────────────────────────────────────────────────

export const categorizationRules = pgTable('categorization_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  pattern: varchar('pattern', { length: 200 }).notNull(),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => categories.id),
  priority: integer('priority').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Relations ───────────────────────────────────────────────────────────

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, { fields: [categories.parentId], references: [categories.id] }),
  children: many(categories),
  transactions: many(transactions),
  budgets: many(budgets),
  rules: many(categorizationRules),
}));

export const goalsRelations = relations(goals, ({ many }) => ({
  accounts: many(accounts),
  snapshots: many(goalSnapshots),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  goal: one(goals, { fields: [accounts.goalId], references: [goals.id] }),
  transactions: many(transactions),
  uploads: many(uploads),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  account: one(accounts, { fields: [transactions.accountId], references: [accounts.id] }),
  category: one(categories, { fields: [transactions.categoryId], references: [categories.id] }),
  subcategory: one(categories, {
    fields: [transactions.subcategoryId],
    references: [categories.id],
    relationName: 'subcategoryRelation',
  }),
  upload: one(uploads, { fields: [transactions.uploadId], references: [uploads.id] }),
}));

export const goalSnapshotsRelations = relations(goalSnapshots, ({ one }) => ({
  goal: one(goals, { fields: [goalSnapshots.goalId], references: [goals.id] }),
}));

export const uploadsRelations = relations(uploads, ({ one, many }) => ({
  account: one(accounts, { fields: [uploads.accountId], references: [accounts.id] }),
  transactions: many(transactions),
}));

export const budgetsRelations = relations(budgets, ({ one }) => ({
  category: one(categories, {
    fields: [budgets.categoryId],
    references: [categories.id],
  }),
}));

export const categorizationRulesRelations = relations(categorizationRules, ({ one }) => ({
  category: one(categories, {
    fields: [categorizationRules.categoryId],
    references: [categories.id],
  }),
}));

// ── Type exports ─────────────────────────────────────────────────────────

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Goal = typeof goals.$inferSelect;
export type NewGoal = typeof goals.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type GoalSnapshot = typeof goalSnapshots.$inferSelect;
export type ExchangeRate = typeof exchangeRates.$inferSelect;
export type Upload = typeof uploads.$inferSelect;
export type CategorizationRule = typeof categorizationRules.$inferSelect;
export type AiReport = typeof aiReports.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;
