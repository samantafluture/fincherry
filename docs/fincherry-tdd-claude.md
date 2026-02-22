# FinCherry — Personal Finance Web App
## Technical Design Document

**Author:** Sam  
**Date:** February 2026  
**Status:** Draft  
**Version:** 1.0

---

## Status Update (Feb 2026)

- Phases 1–4 are implemented in the current codebase.
- Active phase is Phase 5 (polish/hardening).
- Runtime AI provider is Gemini (`GEMINI_API_KEY`) with local fallback and response caching.
- Historical references to "Claude" below reflect original planning language.

---

## 1. Overview

FinCherry is a self-hosted, mobile-friendly personal finance web app for tracking income, expenses, investments, and savings goals across multiple currencies (CAD, BRL, EUR). It ingests bank and credit card statements via PDF upload, normalizes transactions into a single CAD-denominated view, and provides AI-powered insights through the Gemini API with anonymized data.

### 1.1 Goals

- **Single source of truth** for all financial data across Canadian, Brazilian, and European accounts.
- **Visual spending intelligence** — charts and graphs showing where money goes, trends over time, and income vs. expense breakdowns.
- **Transaction management** — categorize, search, and filter transactions across all accounts.
- **Savings goal tracking** — monitor progress toward specific financial targets tied to savings accounts.
- **AI-powered insights** — spending analysis, suggestions, predictions, and "what-if" scenarios via Gemini API with stripped PII.

### 1.2 Non-Goals (for v1)

- Multi-user support or authentication beyond basic access control.
- Real-time bank API integrations (Open Banking, Plaid, etc.).
- Automated PDF ingestion (email forwarding, scraping).
- Native mobile app.

---

## 2. User Profile

| Attribute | Detail |
|-----------|--------|
| Location | Montreal, QC, Canada |
| Base currency | CAD |

### 2.1 Accounts

| Account | Type | Institution | Currency | Country | Parser |
|---------|------|-------------|----------|---------|--------|
| Desjardins Checking | Checking | Desjardins | CAD | CA | `desjardins-bank` |
| Desjardins Mastercard | Credit card | Desjardins | CAD | CA | `desjardins-cc` |
| ScotiaBank Amex (canceled) | Credit card | ScotiaBank | CAD | CA | `scotiabank-cc` (historical only) |
| Desjardins Savings (Health) | Savings | Desjardins | CAD | CA | `desjardins-savings` |
| Desjardins Savings (House) | Savings | Desjardins | CAD | CA | `desjardins-savings` |
| N26 | Checking + card | N26 | EUR | EU | `n26` |
| Itaú Checking | Checking | Itaú | BRL | BR | `itau-checking` |
| Itaú Visa | Credit card | Itaú | BRL | BR | `itau-credit_card` |

**Note:** Credit card PDFs often have a different format than bank account PDFs from the same institution. Desjardins checking and Desjardins Mastercard will likely need separate parser classes (different regex patterns), even though they're the same bank. The savings accounts may appear on the same statement as checking or have their own — the parser handles both cases.

**Parsers needed:** 7 distinct parsers (desjardins-bank, desjardins-cc, desjardins-savings, scotiabank-cc, n26, nubank, itau-cc).

### 2.2 Savings Goals

| Goal | Target | Linked Account | Contribution | Type |
|------|--------|----------------|-------------|------|
| Private Health Fund | $4,000 CAD/year | Desjardins Savings (Health) | Bi-weekly from checking (payday) | Recurring annual |
| Moving / House | $50,000 CAD | Desjardins Savings (House) | Bi-weekly from checking (payday) | One-time milestone |
| *(slot for future goal)* | — | — | — | — |

### 2.3 How Goals Connect to Your Money

Sam receives salary bi-weekly into Desjardins Checking, and on the same day transfers a portion to each of the two Desjardins Savings accounts. This creates a clear data trail:

```
Payday (bi-weekly)
│
├── Salary deposit → Desjardins Checking           (detected as income)
├── Transfer out  → Desjardins Savings (Health)    (detected as savings contribution)
└── Transfer out  → Desjardins Savings (House)     (detected as savings contribution)
```

**How the app tracks this:**

1. **Transfer detection:** When you upload both your checking and savings statements, the app sees matching outgoing/incoming amounts on the same date. It auto-tags these as "savings transfers" rather than expenses — they don't count against your spending.

2. **Goal snapshots:** Each time a savings statement is uploaded, the parser extracts the current balance. This creates a `goal_snapshot` record (date + balance). Over time, these form the progress line on goal charts. With bi-weekly contributions, you get ~26 data points per year — much more granular than monthly.

3. **Contribution tracking:** The app identifies the bi-weekly transfer pattern and calculates your actual contribution rate (per pay period and per month). This is compared against the required pace to hit your target by the deadline.

4. **Projections:** Based on your rolling contribution rate:
   - Health Fund ($4K/year): "At $X per pay period, you'll hit $4,000 by [month]."
   - House Fund ($50K): "At $X per pay period, you'll reach $50K by [date]. To hit your 2028 deadline, increase to $Y per pay period."

5. **Annual reset (Health Fund only):** Each January, the Health Fund goal resets its progress tracker for the new year while preserving historical data.

**What counts as "spending" vs "savings":**

| Transaction | Classified as | Counts in expenses? |
|-------------|--------------|-------------------|
| Salary deposit | Income | No |
| Transfer to savings | Savings contribution | **No** — excluded from spending |
| Rent payment | Expense (Housing) | Yes |
| Grocery purchase | Expense (Food) | Yes |
| Credit card payment from checking | Internal transfer | **No** — the CC expenses are on the CC statement |

This distinction is critical: without it, bi-weekly savings transfers would inflate the "expenses" number, and paying off a credit card from checking would double-count spending.

---

## 3. Branding & Visual Identity

Inspired by the [Deserve fintech branding](https://abduzeedo.com/crafting-fintech-identity-closer-look-deserve-branding) by Humbleteam — bold, modern fintech aesthetic with 80s futurism undertones.

### 3.1 Name

**FinCherry** — "Fin" (financial) + "Cherry" (cherry-picking the best decisions, keeping finances cherry, the cherry on top of your financial life). The name pairs naturally with the pink accent color from the palette.

### 3.2 Color Palette

| Token | Name | Hex | Usage |
|-------|------|-----|-------|
| `--deep-blue` | Deep Blue | `#0B1628` | Primary background |
| `--surface` | Surface Blue | `#0F2035` | Card/panel backgrounds |
| `--surface-hover` | Surface Hover | `#142A42` | Hover states, elevated surfaces |
| `--cherry-pink` | Cherry Pink | `#F472B6` | Primary accent, brand color, positive highlights |
| `--indigo-dye` | Indigo Dye | `#0D4F6A` | Secondary surfaces, subtle borders |
| `--sapphire` | Blue Sapphire | `#1A7A8A` | Chart color, secondary accent |
| `--soft-blue` | Soft Blue | `#8B9EE0` | Chart color, secondary text highlights |
| `--coral` | Coral Orange | `#F97352` | Warnings, negative values, alerts |
| `--white` | White | `#F0F0EC` | Primary text |
| `--muted` | Muted | `#7A8BA8` | Secondary text, labels |
| `--border` | Border | `#1A2D45` | Borders, dividers |

### 3.3 Typography

- **Primary font:** Suisse Intl (or fallback: `"Suisse Intl", "DM Sans", system-ui, sans-serif`)
- **Monospace (numbers):** JetBrains Mono — for financial figures, amounts, percentages
- **Style:** Clean, regular weight for body. Medium/Semibold for headings. No heavy bold.

### 3.4 Design Principles

- Dark theme only (matches Deserve deep blue background).
- Pink as the hero accent — used for brand name, key metrics, positive indicators.
- Coral/orange for warnings, negative deltas, overspending alerts.
- Soft blue and sapphire for chart colors and data visualization variety.
- Generous spacing, rounded corners (12px cards), subtle borders.
- Gradient accents (pink → soft blue) for key CTAs and progress bars.
- Cards with subtle glass effect (`backdrop-filter: blur`) for layered depth.

### 3.5 CSS Variables (shadcn/ui integration)

```css
:root {
  --background: 213 52% 7%;        /* Deep Blue */
  --foreground: 60 5% 94%;          /* White */
  --card: 210 45% 13%;              /* Surface Blue */
  --card-foreground: 60 5% 94%;
  --primary: 330 86% 70%;           /* Cherry Pink */
  --primary-foreground: 213 52% 7%;
  --secondary: 195 76% 24%;         /* Indigo Dye */
  --muted: 213 20% 57%;
  --accent: 185 68% 32%;            /* Blue Sapphire */
  --destructive: 12 94% 65%;        /* Coral Orange */
  --border: 212 42% 18%;
  --radius: 0.75rem;
}
```

---

## 4. Architecture

### 3.1 High-Level Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Client (Browser)                      │
│         React + Vite (responsive, mobile-first)          │
│    Recharts · TanStack Table · TanStack Query            │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS (nginx reverse proxy)
                       ▼
┌─────────────────────────────────────────────────────────┐
│                  API Server (Fastify)                     │
│               TypeScript · Node.js · pm2                 │
│                                                          │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────────┐  │
│  │ PDF      │  │ Currency  │  │ AI Module            │  │
│  │ Parser   │  │ Converter │  │ (Claude API +        │  │
│  │          │  │           │  │  PII stripper)        │  │
│  └──────────┘  └───────────┘  └──────────────────────┘  │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│              PostgreSQL (on VPS)                          │
│     accounts · transactions · categories ·               │
│     goals · exchange_rates · ai_cache                    │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Stack Decision Matrix

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Frontend** | React + Vite + TypeScript | Familiar stack, fast builds, great ecosystem |
| **UI** | Tailwind CSS | Responsive-first utility classes, mobile-friendly |
| **Component library** | shadcn/ui | Copy-paste ownership, built on Radix primitives, dark mode via CSS vars, data table built on TanStack Table |
| **Charts** | Recharts | React-native, composable, good for financial dashboards |
| **Tables** | shadcn/ui Data Table (TanStack Table) | Pre-wired sorting, filtering, pagination UI on top of TanStack Table |
| **Data fetching** | tRPC + TanStack Query | End-to-end type safety, auto-generated hooks, built-in TanStack Query integration |
| **Backend** | Fastify + tRPC + TypeScript | Fastify as HTTP server, tRPC adapter for type-safe API layer. No separate type definitions needed — types flow from server to client automatically |
| **Database** | PostgreSQL | Relational fits financial data well; strong date/numeric handling |
| **ORM** | Drizzle ORM | Type-safe, lightweight, SQL-like syntax |
| **PDF parsing** | pdf-parse + custom parsers | Extract text from bank PDFs per-format |
| **AI** | Claude API (Haiku 4.5 + Sonnet 4.5) | Tiered: Haiku for high-volume tasks (categorization), Sonnet for complex analysis (insights, scenarios). Optimized for cost. |
| **Auth** | Simple token/passphrase | Solo user — no need for full auth system |
| **Hosting** | Hostinger VPS | Learning goal — build VPS + Docker skills to eventually self-host all projects (experienced with Railway/Supabase already) |
| **Containerization** | Docker + Docker Compose | All services (API, DB, nginx) in containers. Portable, reproducible, transferable to future projects |
| **Reverse proxy** | nginx (containerized) | SSL termination, static file serving, API proxy — runs as a Docker container |

---

## 4. Data Model

### 4.1 Core Schema

```sql
-- Accounts (bank accounts, credit cards, savings)
CREATE TABLE accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,        -- "Itaú Visa Credit Card"
    type            VARCHAR(20) NOT NULL,          -- 'checking', 'credit_card', 'savings'
    institution     VARCHAR(100) NOT NULL,         -- "Itaú", "N26", "Desjardins"
    currency        VARCHAR(3) NOT NULL,           -- 'CAD', 'BRL', 'EUR'
    country         VARCHAR(2) NOT NULL,           -- 'CA', 'BR', 'EU'
    is_investment   BOOLEAN DEFAULT FALSE,
    goal_id         UUID REFERENCES goals(id),     -- linked savings goal
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Transactions
CREATE TABLE transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      UUID NOT NULL REFERENCES accounts(id),
    date            DATE NOT NULL,
    description     TEXT NOT NULL,                  -- original from statement
    amount          DECIMAL(12,2) NOT NULL,         -- negative = expense, positive = income
    currency        VARCHAR(3) NOT NULL,            -- original currency
    amount_cad      DECIMAL(12,2) NOT NULL,         -- converted to CAD
    exchange_rate   DECIMAL(10,6),                  -- rate used for conversion
    category_id     UUID REFERENCES categories(id),
    subcategory_id  UUID REFERENCES categories(id),
    notes           TEXT,
    is_recurring    BOOLEAN DEFAULT FALSE,
    source_file     VARCHAR(255),                   -- original PDF filename
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Categories (two-level: category + subcategory)
CREATE TABLE categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    parent_id       UUID REFERENCES categories(id), -- NULL = top-level
    icon            VARCHAR(50),
    color           VARCHAR(7),                     -- hex color for charts
    is_income       BOOLEAN DEFAULT FALSE,
    sort_order      INTEGER DEFAULT 0
);

-- Savings Goals
CREATE TABLE goals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,          -- "Private Health Fund"
    target_amount   DECIMAL(12,2) NOT NULL,         -- 4000.00
    currency        VARCHAR(3) DEFAULT 'CAD',
    goal_type       VARCHAR(20) NOT NULL,           -- 'annual_recurring', 'milestone'
    deadline        DATE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Goal Progress Snapshots (monthly tracking)
CREATE TABLE goal_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id         UUID NOT NULL REFERENCES goals(id),
    snapshot_date   DATE NOT NULL,
    current_amount  DECIMAL(12,2) NOT NULL,
    target_amount   DECIMAL(12,2) NOT NULL,
    notes           TEXT
);

-- Exchange Rates (cached daily)
CREATE TABLE exchange_rates (
    id              SERIAL PRIMARY KEY,
    from_currency   VARCHAR(3) NOT NULL,
    to_currency     VARCHAR(3) DEFAULT 'CAD',
    rate            DECIMAL(10,6) NOT NULL,
    rate_date       DATE NOT NULL,
    UNIQUE(from_currency, to_currency, rate_date)
);

-- PDF Upload Log
CREATE TABLE uploads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename        VARCHAR(255) NOT NULL,
    account_id      UUID REFERENCES accounts(id),
    status          VARCHAR(20) DEFAULT 'pending',  -- 'pending','parsed','error'
    transactions_count INTEGER DEFAULT 0,
    error_message   TEXT,
    uploaded_at     TIMESTAMPTZ DEFAULT NOW()
);

-- AI Interaction Cache
CREATE TABLE ai_cache (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_hash     VARCHAR(64) NOT NULL,
    response        JSONB NOT NULL,
    model           VARCHAR(50),
    tokens_used     INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_account ON transactions(account_id);
CREATE INDEX idx_transactions_category ON transactions(category_id);
CREATE INDEX idx_exchange_rates_lookup ON exchange_rates(from_currency, to_currency, rate_date);
```

### 4.2 Default Categories

```
Income
├── Salary
├── Freelance
├── Etsy / Surpride
└── Other Income

Housing
├── Rent
├── Utilities
└── Internet

Food & Drink
├── Groceries
├── Restaurants
├── Coffee
└── Delivery

Transportation
├── Metro / Bus (STM)
├── Uber / Taxi
└── Gas

Subscriptions
├── Software / SaaS
├── Streaming
└── Cloud / Hosting

Health
├── Pharmacy
├── Insurance
└── Medical

Shopping
├── Electronics
├── Clothing
└── Home

Entertainment
├── Events
├── Games
└── Travel

Financial
├── Bank Fees
├── FX Fees
├── Credit Card Interest
└── Savings Transfer

Other
```

---

## 5. Feature Specifications

### 5.1 PDF Statement Parsing

**Flow:**

1. User uploads PDF via drag-and-drop or file picker.
2. User selects which account the statement belongs to.
3. Backend extracts text using `pdf-parse`.
4. A **parser registry** matches the account's institution to a specific parsing strategy.
5. Parser extracts: date, description, amount, and currency for each transaction.
6. Amounts are converted to CAD using the exchange rate for the transaction date.
7. Auto-categorization runs (rule-based first, then AI-assisted for unknowns).
8. User reviews parsed transactions in a confirmation screen before committing.

**Parser Architecture:**

```typescript
interface StatementParser {
    institution: string;
    parse(text: string): ParsedTransaction[];
}

// Registry pattern — add new parsers as you onboard new banks
const parsers: Map<string, StatementParser> = new Map();
parsers.set('itau-checking', new ItauCheckingParser());
parsers.set('n26', new N26Parser());
parsers.set('desjardins', new DesjardinsParser());
```

Each parser is a TypeScript class with regex patterns tailored to that bank's PDF format. When a new bank format is encountered, a new parser class is added.

**Duplicate Detection:**

Before committing, the system checks for duplicates using a composite key of `(account_id, date, amount, description_hash)`. Overlapping statement periods won't create duplicate transactions.

### 5.2 Multi-Currency Handling

- All transactions store both the **original amount + currency** and the **CAD equivalent**.
- Exchange rates are fetched from a free API (e.g., ExchangeRate-API or frankfurter.app) and cached in the `exchange_rates` table.
- Historical rates are used for past transactions (rate on the transaction date).
- The dashboard always displays CAD totals, with the option to hover/click to see the original currency amount.

### 6.3 Transaction Management

**CRUD Operations:**

- **Create:** Manually add transactions via a form (date, description, amount, currency, account, category). Useful for cash transactions, corrections, or one-off entries not in any PDF.
- **Read:** Transaction list with full filtering and sorting (see below).
- **Update:** Edit any field on a transaction — amount, date, description, category, notes. Inline editing for category, full dialog for other fields.
- **Delete:** Remove individual transactions or bulk-delete selected rows. Soft-delete with undo option (toast notification with "Undo" for 10 seconds).

**Filtering & Sorting:**

- **Filters:** date range, account, category, subcategory, amount range (min/max), keyword search (full-text), currency, income/expense toggle, recurring flag.
- **Sorting:** by date (default), amount, category, account — ascending or descending.
- **Pagination:** 50 per page default, virtual scrolling for large datasets.
- **Saved filters:** save frequently-used filter combinations (e.g., "Restaurants this month", "All BRL expenses").
- **Bulk actions:** categorize multiple transactions, mark as recurring, delete selected.
- **Inline editing:** click a category to reassign, click description to add notes.
- **Auto-categorization rules:** user-defined keyword → category mappings stored in a rules table (e.g., "STM" → Transportation > Metro/Bus).

**Search:**

Full-text search on transaction descriptions using PostgreSQL's `tsvector`:

```sql
ALTER TABLE transactions ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (to_tsvector('english', description)) STORED;
CREATE INDEX idx_transactions_search ON transactions USING GIN(search_vector);
```

### 5.4 Dashboard & Visualizations

**Main Dashboard (default view):**

- **Monthly summary cards:** Total income, total expenses, net savings, savings rate %.
- **Income vs. Expenses bar chart** (last 12 months).
- **Spending by category** — donut/pie chart for current month.
- **Spending trend** — line chart showing top 3-5 categories over time.
- **Goal progress bars** — visual progress toward each savings goal.
- **Recent transactions** — last 10 transactions, quick-glance.

**Dashboard Interactivity:**

All charts on the dashboard are interactive and filterable:

- **Global date range selector** at the top of the dashboard — change the period for all charts at once (this month, last 3 months, last 6 months, YTD, custom range).
- **Category filter** — select/deselect categories to focus on specific spending areas.
- **Account filter** — view data for all accounts or a specific one.
- **Chart hover tooltips** — hover on any bar/slice/point to see exact values.
- **Click-to-drill-down** — click a category in the donut chart to see all transactions in that category. Click a bar in the monthly chart to see that month's breakdown.
- **Comparison toggle** — overlay the previous period for trend comparison.

**Detailed Views:**

- **Monthly breakdown:** drill into any month to see category-level spending.
- **Category deep-dive:** select a category to see all transactions, trend over time.
- **Account view:** per-account balance history and transaction list.
- **Year-over-year comparison:** compare spending patterns across years.

**Chart Library: Recharts**

Recharts is React-native and composable. Key chart types used:

| Chart | Purpose |
|-------|---------|
| `BarChart` (stacked) | Income vs. expenses by month |
| `PieChart` / `RadialBarChart` | Category breakdown |
| `LineChart` | Spending trends, goal progress projection |
| `AreaChart` | Net worth / balance over time |
| `ComposedChart` | Mixed views (bar + line overlays) |

### 6.5 Savings Goal Tracking

**CRUD Operations:**

- **Create:** Add a new goal with name, target amount, type (recurring annual / milestone), deadline, and link to a savings account.
- **Update:** Edit target amount, deadline, or linked account. Adjust goal if plans change.
- **Delete:** Remove a goal (preserves historical snapshots for reference).
- **Reorder:** Drag to prioritize goals in the UI.

**Goal Types:**

- **Recurring annual** (e.g., Health Fund — $4K/year): resets each January, shows year-to-date progress, monthly contribution needed to stay on track.
- **Milestone** (e.g., House — $50K): cumulative progress, projected completion date based on current contribution rate.

**Visualizations:**

- Progress bar with percentage and remaining amount.
- Line chart: actual contributions vs. ideal pace (straight line to target).
- Projected completion date based on rolling 3-month average contributions.

**Data Source:**

Goal snapshots are created monthly (or on each PDF upload that includes the savings account). The `goal_snapshots` table tracks the balance over time, and the `accounts` table links savings accounts to goals.

### 5.6 AI Module (Claude API Integration)

**Privacy Architecture:**

```
Raw Transaction Data
        │
        ▼
┌─────────────────┐
│   PII Stripper   │
│                  │
│  • Replace merchant names with category labels    │
│  • Remove account numbers                          │
│  • Generalize locations ("Montreal" → "city")      │
│  • Hash any remaining identifiers                  │
│  • Keep: amounts, dates, categories, frequencies   │
└────────┬────────┘
         │ Anonymized data
         ▼
┌─────────────────┐
│  Claude API      │
│  (Sonnet)        │
│                  │
│  System prompt   │
│  with financial  │
│  analyst persona │
└────────┬────────┘
         │ Analysis / insights
         ▼
    Displayed in app
```

**PII Stripping Rules:**

| Original | Anonymized |
|----------|-----------|
| "Café Myriade - Montreal" | "Coffee shop - city" |
| "Transfer to Sam Costa" | "Transfer to [PERSON]" |
| Account numbers | Removed entirely |
| Specific addresses | Removed |
| Amounts, dates, categories | **Kept as-is** (essential for analysis) |

**AI Features:**

1. **Spending Insights** (monthly)
   - Top spending categories and changes from previous month.
   - Unusual transactions or spikes.
   - Recurring expense detection.
   - Prompt: *"Analyze this month's anonymized spending data and identify patterns, anomalies, and actionable suggestions."*

2. **Budget Suggestions**
   - Based on income and spending patterns, suggest category budgets.
   - Prompt: *"Given this 6-month spending history, suggest realistic monthly budgets per category."*

3. **Predictions**
   - "At this rate, you'll reach your house goal by [date]."
   - "Your food spending is trending up 12% month-over-month."
   - Prompt: *"Project these trends forward 3-6 months and flag any concerns."*

4. **What-If Scenarios**
   - User asks: "What if I reduce dining out by 30%?"
   - AI calculates impact on savings rate and goal timelines.
   - Prompt: *"The user wants to simulate reducing [category] spending by [X%]. Show the impact on monthly savings and goal completion dates."*

5. **Smart Categorization**
   - For transactions the rule engine can't categorize, send the description (anonymized) to Haiku 4.5 for a suggested category. Fast and cheap enough to run on every unknown transaction.

**Cost Control:**

- Cache AI responses using `prompt_hash` to avoid duplicate API calls.
- Use Haiku 4.5 for simple tasks, Sonnet 4.5 only for complex analysis.
- Batch insights generation (run once per upload cycle, not per-transaction).
- Estimated cost: ~$0.50-1.00/month for a solo user with monthly analysis.

---

## 6. API Design (tRPC)

### 6.1 Why tRPC over REST

Since FinCherry uses TypeScript on both ends (Fastify + React) with a single client, tRPC eliminates an entire category of bugs by flowing types from server to client automatically. No duplicate type definitions, no `packages/shared` types package, and TanStack Query integration is built in — each tRPC procedure becomes a typed hook on the frontend.

Fastify acts as the HTTP server and tRPC runs as a plugin on top of it (via `@trpc/server/adapters/fastify`). File uploads (PDFs) still use a standard Fastify multipart route since tRPC isn't designed for binary uploads.

### 6.2 Router Structure

```typescript
// apps/api/src/trpc/router.ts
export const appRouter = router({

  // ── Accounts ──
  accounts: router({
    list:   publicProcedure.query(/* → Account[] */),
    create: publicProcedure.input(createAccountSchema).mutation(/* → Account */),
    update: publicProcedure.input(updateAccountSchema).mutation(/* → Account */),
    delete: publicProcedure.input(z.object({ id: z.string().uuid() })).mutation(/* → void */),
  }),

  // ── Transactions ──
  transactions: router({
    list:         publicProcedure.input(transactionFiltersSchema).query(/* → { data: Transaction[], total: number } */),
    getById:      publicProcedure.input(z.object({ id: z.string().uuid() })).query(/* → Transaction */),
    create:       publicProcedure.input(createTransactionSchema).mutation(/* → Transaction */),
    update:       publicProcedure.input(updateTransactionSchema).mutation(/* → Transaction */),
    bulkUpdate:   publicProcedure.input(bulkUpdateSchema).mutation(/* → { updated: number } */),
    delete:       publicProcedure.input(z.object({ id: z.string().uuid() })).mutation(/* → void (soft-delete) */),
  }),

  // ── PDF Upload & Parsing ──
  // NOTE: File upload uses standard Fastify multipart route (POST /api/uploads)
  // tRPC handles the preview and confirm steps:
  uploads: router({
    preview: publicProcedure.input(z.object({ uploadId: z.string().uuid() })).query(/* → ParsedTransaction[] */),
    confirm: publicProcedure.input(z.object({ uploadId: z.string().uuid() })).mutation(/* → { imported: number, duplicates: number } */),
  }),

  // ── Categories ──
  categories: router({
    list:       publicProcedure.query(/* → CategoryTree[] */),
    create:     publicProcedure.input(createCategorySchema).mutation(/* → Category */),
    update:     publicProcedure.input(updateCategorySchema).mutation(/* → Category */),
    listRules:  publicProcedure.query(/* → CategorizationRule[] */),
    addRule:    publicProcedure.input(createRuleSchema).mutation(/* → CategorizationRule */),
  }),

  // ── Goals ──
  goals: router({
    list:     publicProcedure.query(/* → Goal[] */),
    create:   publicProcedure.input(createGoalSchema).mutation(/* → Goal */),
    update:   publicProcedure.input(updateGoalSchema).mutation(/* → Goal */),
    delete:   publicProcedure.input(z.object({ id: z.string().uuid() })).mutation(/* → void */),
    progress: publicProcedure.input(z.object({ id: z.string().uuid() })).query(/* → GoalProgress */),
  }),

  // ── Analytics ──
  analytics: router({
    summary:         publicProcedure.input(dateRangeSchema).query(/* → MonthlySummary */),
    byCategory:      publicProcedure.input(analyticsFiltersSchema).query(/* → CategoryBreakdown[] */),
    trends:          publicProcedure.input(analyticsFiltersSchema).query(/* → CategoryTrend[] */),
    incomeVsExpense: publicProcedure.input(dateRangeSchema).query(/* → MonthlyComparison[] */),
  }),

  // ── AI ──
  ai: router({
    insights:   publicProcedure.input(dateRangeSchema).mutation(/* → InsightResult */),
    predict:    publicProcedure.input(z.object({ goalId: z.string().uuid() })).query(/* → Prediction */),
    scenario:   publicProcedure.input(scenarioSchema).mutation(/* → ScenarioResult */),
    categorize: publicProcedure.input(z.object({ descriptions: z.array(z.string()) })).mutation(/* → SuggestedCategory[] */),
  }),

  // ── Exchange Rates ──
  exchangeRates: router({
    current: publicProcedure.query(/* → ExchangeRate[] */),
    history: publicProcedure.input(dateRangeSchema).query(/* → ExchangeRate[] */),
  }),

  // ── Auth ──
  auth: router({
    login:  publicProcedure.input(z.object({ passphrase: z.string() })).mutation(/* → { token: string } */),
    verify: publicProcedure.query(/* → { valid: boolean } */),
  }),
});

export type AppRouter = typeof appRouter;
```

### 6.3 Frontend Usage (auto-typed)

```typescript
// apps/web/src/lib/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@fincherry/api/src/trpc/router';

export const trpc = createTRPCReact<AppRouter>();

// Usage in a component — fully typed, no manual type imports needed:
function TransactionList() {
  const { data } = trpc.transactions.list.useQuery({
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    sortBy: 'date',        // ← autocomplete works
    sortOrder: 'desc',     // ← type-checked
  });
  // data is typed as { data: Transaction[], total: number }
}
```

### 6.4 Filter Schema (shared via tRPC — no separate types package)

```typescript
// Defined once on the server, types flow to client automatically
const transactionFiltersSchema = z.object({
  page: z.number().default(1),
  limit: z.number().default(50),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  accountId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  minAmount: z.number().optional(),
  maxAmount: z.number().optional(),
  search: z.string().optional(),
  sortBy: z.enum(['date', 'amount', 'category', 'account']).default('date'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  recurring: z.boolean().optional(),
  currency: z.enum(['CAD', 'BRL', 'EUR']).optional(),
});
```

---

## 7. Frontend Structure

### 7.1 Page Map

```
/                       → Dashboard (main overview)
/transactions           → Transaction list with filters
/transactions/:id       → Transaction detail / edit
/upload                 → PDF upload + parsing review
/goals                  → Goal tracking overview
/goals/:id              → Goal detail + history
/analytics              → Deep-dive charts & reports
/analytics/categories   → Category breakdown
/analytics/trends       → Trend analysis
/ai                     → AI insights, predictions, scenarios
/settings               → Accounts, categories, rules, preferences
```

### 7.2 Component Architecture

```
src/
├── components/
│   ├── ui/                       # shadcn/ui components (copy-pasted, owned)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── command.tsx           # Command palette for transaction search
│   │   ├── data-table.tsx        # Built on TanStack Table
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── input.tsx
│   │   ├── popover.tsx
│   │   ├── select.tsx
│   │   ├── sheet.tsx             # Mobile slide-over panels
│   │   ├── skeleton.tsx          # Loading states
│   │   ├── tabs.tsx
│   │   └── toast.tsx
│   ├── layout/
│   │   ├── AppShell.tsx          # Mobile-first shell with bottom nav
│   │   ├── Sidebar.tsx           # Desktop sidebar nav
│   │   └── Header.tsx
│   ├── dashboard/
│   │   ├── SummaryCards.tsx       # Income / Expense / Net / Rate
│   │   ├── IncomeVsExpense.tsx    # Bar chart
│   │   ├── CategoryBreakdown.tsx  # Donut chart
│   │   ├── GoalProgress.tsx       # Progress bars
│   │   └── RecentTransactions.tsx
│   ├── transactions/
│   │   ├── TransactionTable.tsx   # shadcn DataTable with filters
│   │   ├── TransactionRow.tsx
│   │   ├── FilterBar.tsx          # shadcn Select + Popover for date range
│   │   └── CategoryPicker.tsx     # shadcn Command for category search
│   ├── upload/
│   │   ├── PdfDropzone.tsx        # Drag-and-drop upload
│   │   ├── AccountSelector.tsx    # shadcn Select
│   │   └── ParsePreview.tsx       # DataTable for review before commit
│   ├── goals/
│   │   ├── GoalCard.tsx
│   │   ├── GoalProgressChart.tsx
│   │   └── GoalProjection.tsx
│   ├── ai/
│   │   ├── InsightsPanel.tsx
│   │   ├── ScenarioBuilder.tsx
│   │   └── PredictionChart.tsx
│   └── charts/
│       ├── SpendingTrend.tsx
│       ├── MonthlyComparison.tsx
│       └── CategoryTrend.tsx
├── hooks/
│   ├── useTransactions.ts
│   ├── useAnalytics.ts
│   ├── useGoals.ts
│   └── useAI.ts
├── lib/
│   ├── api.ts                    # Fetch wrapper
│   ├── formatCurrency.ts         # CAD/BRL/EUR formatting
│   ├── utils.ts                  # shadcn cn() helper
│   └── dateUtils.ts
├── pages/                        # Route-level components
├── styles/
│   └── globals.css               # Tailwind + shadcn CSS variables (dark theme)
└── types/                        # Shared TypeScript types
```

### 7.3 Mobile-First Responsive Strategy

| Breakpoint | Layout |
|------------|--------|
| < 640px (mobile) | Bottom tab navigation, single-column, stacked cards, swipeable charts |
| 640-1024px (tablet) | Side drawer nav, two-column grid for dashboard |
| > 1024px (desktop) | Persistent sidebar, three-column dashboard, full table views |

Key mobile UX decisions:
- Bottom navigation bar (5 tabs: Dashboard, Transactions, Upload, Goals, AI).
- Touch-friendly tap targets (min 44px).
- Charts are horizontally scrollable on small screens.
- Transaction list uses virtual scrolling (TanStack Virtual) for performance.

---

## 8. Infrastructure & Deployment

### 8.1 Why VPS + Docker (Learning Context)

Sam has production experience with managed platforms (Railway, Supabase) and some Docker experience. FinCherry is the ideal vehicle to level up on both VPS operations and containerized deployments, with the goal of eventually self-hosting all projects this way.

- It's a solo-user app, so downtime during learning is low-stakes.
- Docker Compose teaches you how to define, connect, and manage multi-service apps — a skill that transfers directly to deploying Surpride, recordoc, and future projects.
- The VPS layer teaches networking, security, and SSL — Docker handles the app, the VPS handles the infrastructure around it.

**Learning Progression (built into the roadmap):**

| Phase | Skill | What You'll Set Up |
|-------|-------|--------------------|
| Phase 1 | Linux basics + SSH | User setup, SSH keys, `ufw` firewall, fail2ban |
| Phase 1 | Docker fundamentals | Dockerfile for API, docker-compose.yml for full stack |
| Phase 1 | Docker networking | Internal network between API, DB, nginx containers |
| Phase 1 | SSL | Certbot + Let's Encrypt with nginx container |
| Phase 1 | Volumes | Persistent PostgreSQL data, PDF uploads, SSL certs |
| Phase 2 | Docker builds | Multi-stage Dockerfile for optimized production images |
| Phase 3 | CI/CD | GitHub Actions: build image → SSH → docker compose up |
| Phase 5 | Backups | Dockerized pg_dump via cron container or host cron |
| Future | Multi-app hosting | Add more docker-compose stacks for other projects on same VPS |
| Future | Monitoring | Uptime Kuma container, Grafana + Prometheus stack |

### 8.2 VPS Setup (Hostinger)

```
Hostinger VPS (Ubuntu 24.04)
│
├── System (host-level)
│   ├── ufw (firewall: 22, 80, 443 only)
│   ├── fail2ban (SSH brute-force protection)
│   ├── unattended-upgrades (security patches)
│   └── Docker Engine + Docker Compose
│
├── Docker Compose Stack
│   │
│   ├── nginx (reverse proxy + SSL)
│   │   ├── fincherry.yourdomain.com → api:3000
│   │   ├── Serves frontend static files
│   │   └── Let's Encrypt certs (mounted volume)
│   │
│   ├── api (Fastify + Node.js 20)
│   │   ├── Runs on internal port 3000
│   │   ├── Connects to db via Docker network
│   │   └── Accesses PDF uploads volume
│   │
│   └── db (PostgreSQL 16)
│       ├── NOT exposed to host network
│       ├── Data persisted via Docker volume
│       └── Only accessible from api container
│
└── Volumes
    ├── pg_data          → PostgreSQL data
    ├── uploads          → PDF storage
    ├── backups          → pg_dump files
    └── certbot          → SSL certificates
```

### 8.3 Docker Configuration

**docker-compose.yml:**

```yaml
version: "3.9"

services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: fincherry
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: fincherry
    volumes:
      - pg_data:/var/lib/postgresql/data
    networks:
      - internal
    # No ports exposed — only accessible from api container

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: postgresql://fincherry:${DB_PASSWORD}@db:5432/fincherry
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
    volumes:
      - uploads:/app/uploads
    depends_on:
      - db
    networks:
      - internal

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./apps/web/dist:/usr/share/nginx/html:ro
      - certbot_conf:/etc/letsencrypt:ro
      - certbot_www:/var/www/certbot:ro
    depends_on:
      - api
    networks:
      - internal

  certbot:
    image: certbot/certbot
    volumes:
      - certbot_conf:/etc/letsencrypt
      - certbot_www:/var/www/certbot
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h & wait $${!}; done;'"

volumes:
  pg_data:
  uploads:
  backups:
  certbot_conf:
  certbot_www:

networks:
  internal:
```

**apps/api/Dockerfile (multi-stage build):**

```dockerfile
# ── Build stage ──
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile

COPY apps/api/ apps/api/
COPY packages/shared/ packages/shared/
RUN pnpm --filter api build

# ── Production stage ──
FROM node:20-alpine
WORKDIR /app
RUN npm install -g pnpm

COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

### 8.4 nginx Configuration

```nginx
server {
    listen 80;
    server_name fincherry.yourdomain.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name fincherry.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/fincherry.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fincherry.yourdomain.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # API proxy — routes to api container via Docker network
    location /api/ {
        proxy_pass http://api:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 20M;  # PDF uploads
    }

    # Frontend (static files served by nginx directly)
    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;  # SPA fallback
    }
}
```

### 8.5 Environment Variables

```bash
# .env (on VPS, never committed to git)
DB_PASSWORD=your-strong-db-password
ANTHROPIC_API_KEY=sk-ant-...
AUTH_PASSPHRASE_HASH=...  # bcrypt hash of your passphrase
```

### 8.6 Deployment Flow

**Manual deploy:**

```bash
# On local machine
pnpm --filter web build                    # Build frontend
rsync -avz . sam@vps:~/fincherry/ \        # Sync code to VPS
  --exclude node_modules --exclude .git

# On VPS
cd ~/fincherry
docker compose build api                    # Rebuild API image
docker compose up -d                        # Start/restart all services
docker compose logs -f api                  # Watch logs
```

**Automated deploy (GitHub Actions):**

```yaml
name: Deploy to VPS
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install && pnpm --filter web build
      - uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          source: "."
          target: "~/fincherry"
      - uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd ~/fincherry
            docker compose build api
            docker compose up -d
```

### 8.7 Backup Strategy

```bash
# Run backup via Docker exec (from host cron)
# /usr/local/bin/fincherry-backup.sh
#!/bin/bash
docker compose -f ~/fincherry/docker-compose.yml exec -T db \
  pg_dump -Fc -U fincherry fincherry > ~/fincherry/backups/fincherry_$(date +%Y%m%d).dump
find ~/fincherry/backups/ -name "*.dump" -mtime +7 -delete

# Cron: daily at 3 AM
# 0 3 * * * /usr/local/bin/fincherry-backup.sh
```

### 8.8 Security (Solo User)

Since this is a single-user app with sensitive financial data:

- **Access:** passphrase-based login generating a JWT stored in an httpOnly cookie. No registration endpoint.
- **Network:** HTTPS only (Let's Encrypt). HTTP redirects to HTTPS.
- **Database:** PostgreSQL runs in a container with no ports exposed to the host — only accessible from the API container via Docker's internal network.
- **VPS firewall:** Only ports 80, 443, and SSH open. Docker's default iptables rules are locked down.
- **PDF uploads:** Validated server-side (check MIME type + magic bytes), stored in a Docker volume not served by nginx.
- **AI requests:** PII stripped before any external API call. No raw financial data leaves the server except anonymized to Claude API.
- **Backups:** Automated daily `pg_dump` to a compressed file, rotated weekly.

---

## 9. Implementation Roadmap

### Phase 1 — Foundation & VPS + Docker Setup

- [ ] **VPS hardening:** SSH keys, disable password auth, `ufw` firewall (22/80/443), fail2ban.
- [ ] **Docker:** Install Docker Engine + Docker Compose on VPS.
- [ ] **docker-compose.yml:** Define api, db, nginx, certbot services.
- [ ] **Dockerfile:** Multi-stage build for the Fastify API.
- [ ] **SSL:** Certbot container + Let's Encrypt, verify auto-renewal.
- [ ] **nginx:** Containerized reverse proxy config for fincherry subdomain.
- [ ] Database schema migration (Drizzle ORM, runs inside api container).
- [ ] Fastify + tRPC project scaffolding with TypeScript.
- [ ] React + Vite project scaffolding with Tailwind + shadcn/ui (FinCherry theme).
- [ ] Auth (passphrase login + JWT).
- [ ] Account CRUD (register all bank accounts).
- [ ] Basic responsive layout shell with bottom nav.
- [ ] **First deploy:** `docker compose up -d`, verify everything works end-to-end.

### Phase 2 — PDF Parsing & Transactions (Week 3-4)

- [ ] PDF upload endpoint + file storage.
- [ ] First parser: write parser for the most-used bank (start with one).
- [ ] Parse preview UI: review + confirm parsed transactions.
- [ ] Transaction list with TanStack Table (sort, filter, paginate).
- [ ] Category system + manual categorization.
- [ ] Auto-categorization rules engine.
- [ ] Duplicate detection.

### Phase 3 — Multi-Currency, Analytics & CI/CD (Week 5-6)

- [ ] Exchange rate fetching + caching.
- [ ] CAD conversion for all transactions.
- [ ] Dashboard: summary cards, income vs. expense chart.
- [ ] Category breakdown (donut chart).
- [ ] Spending trends (line charts).
- [ ] Monthly/yearly comparison views.
- [ ] Additional bank parsers (one per bank).
- [ ] **GitHub Actions CI/CD:** automated deploy to VPS on push to main.

### Phase 4 — Goals & AI (Week 7-8)

- [ ] Goal CRUD + goal-to-account linking.
- [ ] Goal progress tracking + snapshots.
- [ ] Goal projection charts.
- [ ] PII stripper module.
- [ ] Claude API integration: insights endpoint.
- [ ] AI insights panel in UI.
- [ ] Scenario builder: "what-if" UI.
- [ ] AI-assisted categorization for unknowns.

### Phase 5 — Polish & Iterate (Ongoing)

- [ ] Recurring transaction detection.
- [ ] Budget setting + budget vs. actual tracking.
- [x] Export (CSV).
- [ ] Export (PDF reports).
- [ ] Performance optimization (virtual scrolling, query optimization).
- [x] PWA manifest (installable on mobile home screen).
- [ ] Automated backups.

---

## 10. Key Technical Decisions & Trade-offs

### Why PostgreSQL over SQLite?

SQLite would be simpler for a solo-user app, but PostgreSQL was chosen because:
- Full-text search (`tsvector`) is built-in and mature.
- Better handling of concurrent reads/writes during PDF parsing.
- `DECIMAL` type for precise financial math.
- Already familiar with deploying PostgreSQL on VPS.
- Easily handles future growth if the app evolves.

### Why tRPC over REST?

- **End-to-end type safety** — define a Zod schema on the server, get full autocomplete and type checking on the client. No manual type duplication.
- **No `packages/shared`** — types flow from `AppRouter` automatically. One less package to maintain.
- **Built-in TanStack Query** — `@trpc/react-query` wraps every procedure as a typed `useQuery`/`useMutation` hook. No manual fetch calls or type casting.
- **Fastify compatible** — tRPC runs as a Fastify plugin via `@trpc/server/adapters/fastify`. Fastify still handles file uploads and serves as the HTTP server.
- **Trade-off acknowledged:** If you ever need to call the API from a non-TypeScript client (mobile app, automation script), tRPC is less ergonomic than REST. For a solo-user web app, this isn't a concern.

### Why Fastify over Express?

- Significantly faster (benchmarks show 2-3x throughput).
- Built-in TypeScript support and schema validation (via JSON Schema or Typebox).
- Better plugin architecture.
- Sam's stated preference.

### Why Recharts over D3?

- Much less boilerplate for standard financial charts.
- React-native components (no DOM manipulation).
- Good enough for dashboard use cases.
- D3 can be added later for any highly custom visualizations.

### Why shadcn/ui?

- **Data Table** is built directly on TanStack Table — sorting, filtering, pagination UI comes pre-wired. For a transaction list, this saves days of work.
- Copy-paste model means components live in your codebase (`src/components/ui/`). Full ownership — no fighting library abstractions when customizing.
- Built on Radix primitives — accessible, composable, unstyled at the core.
- Dark mode via CSS variables fits the dashboard aesthetic.
- Key components for FinCherry: DataTable (transactions), Command (search), Sheet (mobile panels), Select (filters), Dialog (editing), Skeleton (loading states).
- Cherry-pick only what you need — no bloated bundle.

### Why not a mobile app?

- Responsive web accessed via mobile browser is sufficient for a solo-user dashboard.
- Avoids the overhead of React Native, Capacitor, or app store deployment.
- Can be added to home screen as a bookmark or PWA for app-like access.

### AI Model Strategy

| Task | Model | Rationale |
|------|-------|-----------|
| Transaction categorization | Haiku 4.5 | High volume, simple classification. Fast and cheap. |
| Pattern detection | Haiku 4.5 | Recurring expenses, anomalies — structured input/output. |
| Monthly spending insights | Sonnet 4.5 | Needs nuanced analysis, natural language output. |
| What-if scenarios | Sonnet 4.5 | Complex reasoning about projections and trade-offs. |
| Budget suggestions | Sonnet 4.5 | Requires understanding spending context holistically. |

### AI Cost Projection

| Usage | Model | Est. Tokens | Monthly Cost |
|-------|-------|-------------|-------------|
| Categorization (50 unknowns) | Haiku 4.5 | ~500 per | ~$0.03 |
| Pattern detection | Haiku 4.5 | ~2K in + 1K out | ~$0.01 |
| Monthly insights | Sonnet 4.5 | ~4K in + 2K out | ~$0.05 |
| What-if scenarios (5/month) | Sonnet 4.5 | ~3K per | ~$0.10 |
| **Total** | | | **~$0.50-1.00/month** |

---

## 11. File & Folder Structure

```
fincherry/
├── apps/
│   ├── api/                        # Fastify + tRPC backend
│   │   ├── src/
│   │   │   ├── server.ts           # Fastify app setup + tRPC adapter
│   │   │   ├── trpc/
│   │   │   │   ├── router.ts       # Root appRouter
│   │   │   │   ├── context.ts      # Request context (auth, db)
│   │   │   │   ├── accounts.ts
│   │   │   │   ├── transactions.ts
│   │   │   │   ├── uploads.ts      # tRPC preview/confirm + Fastify upload route
│   │   │   │   ├── categories.ts
│   │   │   │   ├── goals.ts
│   │   │   │   ├── analytics.ts
│   │   │   │   ├── ai.ts
│   │   │   │   └── auth.ts
│   │   │   ├── parsers/
│   │   │   │   ├── registry.ts
│   │   │   │   ├── desjardins-bank.ts
│   │   │   │   ├── desjardins-cc.ts
│   │   │   │   ├── desjardins-savings.ts
│   │   │   │   ├── nubank.ts
│   │   │   │   ├── n26.ts
│   │   │   │   ├── itau-cc.ts
│   │   │   │   ├── scotiabank-cc.ts
│   │   │   │   └── types.ts
│   │   │   ├── services/
│   │   │   │   ├── piiStripper.ts
│   │   │   │   ├── currencyConverter.ts
│   │   │   │   ├── categorizer.ts
│   │   │   │   └── claude.ts
│   │   │   ├── db/
│   │   │   │   ├── schema.ts       # Drizzle schema
│   │   │   │   ├── migrations/
│   │   │   │   └── index.ts
│   │   │   └── utils/
│   │   ├── package.json
│   │   ├── Dockerfile              # Multi-stage build for production
│   │   └── tsconfig.json
│   └── web/                        # React frontend
│       ├── src/
│       │   ├── components/
│       │   ├── pages/
│       │   ├── hooks/
│       │   ├── lib/
│       │   │   ├── trpc.ts         # tRPC client setup (imports AppRouter type)
│       │   │   └── utils.ts
│       │   └── main.tsx
│       ├── index.html
│       ├── package.json
│       ├── tailwind.config.ts
│       ├── vite.config.ts
│       └── tsconfig.json
├── nginx/
│   └── nginx.conf                  # nginx reverse proxy config
├── docker-compose.yml              # Full stack: api, db, nginx, certbot
├── .env.example                    # Template for secrets
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

> **Note:** No `packages/shared` directory. With tRPC, types flow automatically from server to client — the frontend only imports the `AppRouter` type from the API package.

---

## 13. Future Considerations

These are explicitly out of scope for v1 but worth noting for later iterations:

- **AI-generated visualizations** — extend the AI insights module to generate React chart code (using Recharts) alongside text analysis. Claude would produce both a written insight and a custom chart definition (chart type, data shape, colors) that the frontend renders dynamically. This enables insights like "Your restaurant spending peaks on weekends" accompanied by a day-of-week heatmap the AI designed.
- **Multi-app hosting on VPS** — reuse the Docker Compose pattern to add more project stacks (Surpride, recordoc) on the same VPS with nginx routing to each.
- **Migrate other projects to VPS** — use FinCherry's Docker Compose setup as a template to bring Surpride, recordoc, and other projects off Railway/Supabase.
- **Monitoring & observability** — add uptime monitoring (e.g., Uptime Kuma, self-hosted), resource alerts, and centralized logging.
- **Open Banking / bank API integration** — automate transaction ingestion to replace PDF parsing. Currently deferred because: Canadian Open Banking regulation is still rolling out, Plaid charges per connection, Brazilian Open Finance requires TPP registration, and European PSD2 access requires regulatory approval. Revisit when free/affordable aggregators emerge or regulations simplify for personal use.
- **Receipt scanning** — OCR receipts and match to transactions.
- **Budget alerts** — push notifications when nearing category limits (requires PWA push).
- **Multi-user** — if a partner needs access in the future.
- **Email-forward ingestion** — auto-import statements forwarded to a dedicated email.
- **Tax reporting** — categorize by tax-deductible vs. not, generate annual summaries.
- **Surpride integration** — pull Etsy/Printful revenue data via API for automated business income tracking.
