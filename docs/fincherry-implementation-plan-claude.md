# FinCherry — Implementation Plan

**Companion to:** fincherry-tdd-claude.md
**Approach:** Ship and iterate — get a working end-to-end slice first, then layer features

---

## Current Status Update (Feb 2026)

- ✅ Phase 1 complete locally.
- ✅ Phase 2 complete (Desjardins upload/parse/import/categorization workflow).
- ✅ Phase 3 complete (multi-currency + dashboard + parser expansion + transaction CRUD).
- ✅ Phase 4 complete with Gemini:
  - goals/projections fixed to use authoritative snapshots,
  - insights with date ranges + regenerate,
  - Ask AI (free prompt) with optional period comparison,
  - what-if scenarios with decrease/increase,
  - monthly report generation/history.
- 🟡 Phase 5 is the active phase now (polish + hardening).

Implementation note: runtime AI provider is `Gemini` via `GEMINI_API_KEY` (not Anthropic).

---

## Revised Approach — Local First, Deploy Later

> **Decision (Feb 2026):** VPS setup, DNS, SSL, and auto-deploy tasks are deferred until the app is functional and tested locally. Phases 1.1–1.3 (VPS hardening, Docker on VPS, DNS + SSL) are skipped for now. The deploy portion of Phase 3.7 will be revisited once the core app works end-to-end on localhost.
>
> **GitHub CI (quality checks) is NOT deferred** — it runs on GitHub without any VPS and should be set up as soon as local dev works (see Phase 1.5).

**Why:** Getting the full stack running locally (API + DB + frontend) lets us iterate on features much faster without dealing with network, SSL, and infra concerns. The Docker Compose config and nginx config are written and ready — deploying is a single session of work once the app is built. But CI (type-check + build on every push) costs nothing and prevents errors from accumulating.

**Revised Phase 1 checklist (local focus):**
- [x] Project scaffolding (monorepo, packages, config files)
- [x] Database schema (Drizzle + PostgreSQL)
- [x] Fastify + tRPC server with auth
- [x] React frontend with routing and layout shell
- [ ] Run locally: `pnpm dev:api` + `pnpm dev:web` — see README for full setup
- [ ] Confirm login works (set passphrase hash in `apps/api/.env`)
- [ ] Confirm `/api/health` returns OK
- [ ] Confirm seeded accounts and categories appear in Settings
- [ ] Set up GitHub CI workflow (Phase 1.5) — push with green checks

**Deferred (do after Phase 2–3 are working locally):**
- VPS hardening (section 1.1)
- Docker on VPS (section 1.2)
- DNS + SSL (section 1.3)
- GitHub Actions CD — auto-deploy to VPS (section 3.7) — requires VPS to be set up first

---

## When You (Sam) Are Needed

Throughout the implementation, a coding agent (Claude Code, Gemini CLI, Codex) can handle most tasks autonomously. However, certain steps require **your manual input, decisions, or access** that an agent cannot do alone. These are marked throughout the plan with a 🧑 icon, and summarized here:

| Phase | What's Needed From You | Why |
|-------|----------------------|-----|
| **Phase 1** | SSH into VPS, run hardening commands | Root/sudo access, security decisions |
| **Phase 1** | Choose your passphrase for auth | Security — only you should know this |
| **Phase 1** | DNS: point subdomain to VPS IP | Requires access to your domain registrar |
| **Phase 1** | Set up GitHub Secrets for CI/CD | Requires GitHub repo admin access |
| **Phase 2** | Provide 1 real PDF per Desjardins account type | Agent can't access your bank accounts |
| **Phase 2** | Review parsed transactions for accuracy | Only you know if the parser got it right |
| **Phase 2** | Initial category assignments (first ~50 transactions) | Trains the rule engine with your personal patterns |
| **Phase 3** | Provide remaining bank/CC PDFs (Itaú checking, N26, Itaú Visa, ScotiaBank Amex) | Agent needs real samples to build parsers |
| **Phase 3** | Validate exchange rate conversions look correct | Spot-check BRL/EUR → CAD amounts |
| **Phase 3** | Review dashboard layout on your actual phone | Agent can't test on your device |
| **Phase 4** | Confirm goal targets and deadlines are accurate | Financial decisions are yours |
| **Phase 4** | Set `GEMINI_API_KEY` env variable on VPS/local env | API key management — only you |
| **Phase 4** | Review AI insights for quality/relevance | Judge if the AI output is actually useful |
| **Phase 5** | Test backup restore procedure once | Verify you can actually recover data |

---

## Guiding Principles

1. **Vertical slices over horizontal layers.** Don't build the entire backend, then the entire frontend. Build one feature end-to-end (DB → API → UI), deploy it, then move to the next.
2. **Real data early.** Upload your most-used bank's PDF in week 2. Seeing your actual transactions in the app will keep momentum high.
3. **VPS first.** Set up the server before writing app code. Deploy a "hello world" Fastify app on day 1 so every subsequent feature gets deployed incrementally.
4. **Don't over-abstract.** You're the only user. Skip complex patterns until you need them. Refactor when it hurts, not before.

---

## Phase 1 — Infrastructure & Skeleton

The goal is: VPS is hardened, a Fastify API serves a React app behind nginx with SSL, PostgreSQL is running, and you can deploy updates with a single command.

### 1.1 VPS Hardening

🧑 **Manual input required:** You need to run these commands yourself via SSH — a coding agent cannot access your VPS root account.

```bash
# SSH into your Hostinger VPS
ssh root@your-vps-ip

# Create a non-root user
adduser sam
usermod -aG sudo sam

# Set up SSH key auth (on your local machine first: ssh-keygen)
ssh-copy-id sam@your-vps-ip

# Disable password auth
sudo nano /etc/ssh/sshd_config
# → PasswordAuthentication no
# → PermitRootLogin no
sudo systemctl restart sshd

# Firewall
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable

# Fail2ban
sudo apt install fail2ban -y
sudo systemctl enable fail2ban

# Auto security updates
sudo apt install unattended-upgrades -y
sudo dpkg-reconfigure -plow unattended-upgrades
```

**Checkpoint:** You can SSH in as `sam` with key auth. Root login is disabled. Only ports 22, 80, 443 are open.

### 1.2 Install Docker on VPS

```bash
# Install Docker Engine
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker sam
# Log out and back in for group to take effect

# Verify
docker --version
docker compose version

# Create project directory
mkdir -p ~/fincherry/backups
```

**Checkpoint:** `docker compose version` works without sudo.

### 1.3 DNS + Initial SSL Setup

🧑 **Manual input required:** Point your DNS (fincherry.yourdomain.com → VPS IP) in your domain registrar before this step.

SSL setup with Docker requires a two-step bootstrap (chicken-and-egg: nginx needs certs, certbot needs nginx):

```bash
# Step 1: Create a temporary nginx config (HTTP only, for certbot challenge)
mkdir -p ~/fincherry/nginx
cat > ~/fincherry/nginx/nginx.conf << 'EOF'
server {
    listen 80;
    server_name fincherry.yourdomain.com;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 200 'FinCherry setup in progress'; }
}
EOF

# Step 2: Start nginx + certbot containers for initial cert
docker compose up -d nginx
docker compose run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d fincherry.yourdomain.com \
  --email your@email.com --agree-tos --no-eff-email

# Step 3: Update nginx.conf with full HTTPS config (see design doc section 8.4)
# Step 4: docker compose restart nginx
```

**Checkpoint:** `https://fincherry.yourdomain.com` shows a page with valid SSL.

### 1.4 Project Scaffolding

On your local machine:

```bash
mkdir fincherry && cd fincherry
pnpm init

# Create monorepo structure
mkdir -p apps/api apps/web packages/shared nginx

# ── API scaffolding ──
cd apps/api
pnpm init
pnpm add fastify @fastify/cors @fastify/cookie @fastify/multipart
pnpm add drizzle-orm postgres
pnpm add @trpc/server zod
pnpm add -D drizzle-kit typescript @types/node tsx

# ── Web scaffolding ──
cd ../web
pnpm create vite . --template react-ts
pnpm add react-router-dom @tanstack/react-query recharts
pnpm add @trpc/client @trpc/react-query
pnpm add -D tailwindcss @tailwindcss/vite

# ── shadcn/ui setup ──
pnpm dlx shadcn@latest init
# → Choose: New York style, CSS variables: yes
# → Customize with FinCherry theme tokens (see design doc section 3.5)
pnpm dlx shadcn@latest add button card skeleton tabs

# ── No separate shared types package needed ──
# With tRPC, types flow from server → client automatically.
# The frontend imports only the AppRouter type from the API.

# ── Docker + workspace config ──
cd ..
# Create pnpm-workspace.yaml, docker-compose.yml, apps/api/Dockerfile,
# nginx/nginx.conf, .env.example (see design doc section 8.3-8.4)
```

### 1.5 Database Schema

The PostgreSQL database is defined in `docker-compose.yml` and created automatically when the `db` container starts. Migrations and seeding run from your local machine (or inside the api container):

```bash
# Start just the db container first
# On VPS:
cd ~/fincherry && docker compose up -d db

# Run migrations (from local machine, or exec into api container)
DATABASE_URL=postgresql://fincherry:password@localhost:5432/fincherry \
  pnpm drizzle-kit migrate

# Seed default categories
pnpm tsx src/db/seed.ts
```

### 1.6 Hello World Deploy

Create a minimal Fastify server:

```typescript
// apps/api/src/server.ts
import Fastify from 'fastify';

const app = Fastify({ logger: true });
app.get('/api/health', async () => ({ status: 'ok', time: new Date().toISOString() }));
app.listen({ port: 3000, host: '0.0.0.0' });
```

Deploy the full stack:

```bash
# Build frontend locally
pnpm --filter web build

# Sync everything to VPS
rsync -avz . sam@vps:~/fincherry/ \
  --exclude node_modules --exclude .git

# On VPS — bring up the entire stack
cd ~/fincherry
cp .env.example .env  # Edit with your real secrets
docker compose build
docker compose up -d

# Check logs
docker compose logs -f api
```

**Checkpoint:** `https://fincherry.yourdomain.com` shows your React app. `/api/health` returns JSON. You can redeploy with `rsync` + `docker compose build && docker compose up -d`.

### 1.7 Auth

🧑 **Manual input required:** Choose your passphrase and add it to the `.env` file on the VPS. Don't commit it to git.

Simple passphrase-based auth since you're the only user:

```
trpc.auth.login.useMutation({ passphrase: "your-secret" })
→ Sets httpOnly cookie with JWT
→ All other tRPC procedures check this cookie via middleware
```

Use `@fastify/cookie` + `jsonwebtoken`. Store the hashed passphrase in the `.env` file, not in the database. tRPC middleware checks the JWT on every request.

**Phase 1 deliverable (local):** Local dev stack runs — API + DB + frontend all working on localhost, login works, seeded data visible in Settings.

---

## Phase 1.5 — GitHub CI (Quality Gates)

**Do this as soon as local dev is working, before Phase 2.** Set up a GitHub Actions workflow that runs on every push and PR. This ensures the TypeScript build and Vite bundle stay clean throughout development — no surprises accumulate.

No VPS, secrets, or infrastructure needed. This runs entirely inside the GitHub Actions runner.

### What CI checks

- **TypeScript** — `tsc --noEmit` on both `apps/api` and `apps/web`
- **Vite build** — `pnpm --filter web build` catches import errors and missing modules that tsc alone misses
- **pnpm lockfile integrity** — `--frozen-lockfile` to catch drift

### Workflow file

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: ['*']
  pull_request:
    branches: [main]

jobs:
  typecheck-and-build:
    name: Type-check & build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Type-check API
        run: pnpm --filter api exec tsc --noEmit

      - name: Type-check web
        run: pnpm --filter web exec tsc --noEmit

      - name: Build web (Vite)
        run: pnpm --filter web build
```

### How to set up

1. Create `.github/workflows/ci.yml` with the content above.
2. Push to GitHub (any branch).
3. Go to the Actions tab — CI should run and pass green.

**Checkpoint:** Every push to GitHub shows a CI status badge. Type errors or broken imports are caught in CI before they pile up. The `main` branch always builds cleanly.

---

## Phase 2 — PDF Parsing & Transaction Core

The goal is: upload a real PDF, see your transactions in a table, and categorize them.

### 2.1 PDF Upload Endpoint

```
POST /api/uploads  (multipart form: pdf file + account_id)
→ Standard Fastify multipart route (tRPC doesn't handle binary uploads)
→ Saves PDF to uploads Docker volume (/app/uploads inside container)
→ Creates upload record in DB (status: 'pending')
→ Returns upload ID
```

Use `@fastify/multipart`. Validate file is actually a PDF (check magic bytes, not just extension).

### 2.2 First Bank Parsers (Desjardins)

🧑 **Manual input required:** Provide at least 1 real PDF statement from each: Desjardins checking, Desjardins Mastercard, and Desjardins savings. The agent cannot access your bank. Also review the parsed output for accuracy — only you know if "IGA Supermarché $67.23" was correctly extracted.

Start with Desjardins since it covers 3 of your 8 accounts (checking, Mastercard, savings). Note that each will likely have a **different PDF format** — the checking statement, credit card statement, and savings statement from the same bank rarely share the same layout. Steps for each:

1. Open a real PDF statement in a text editor or run `pdf-parse` on it to see the raw text output.
2. Study the format: how dates appear, how amounts are formatted, how descriptions are structured.
3. Write a parser class with regex patterns for that specific format.
4. Write tests against a sample statement.

```typescript
// apps/api/src/parsers/desjardins-bank.ts  (checking account)
export class DesjardinsBankParser implements StatementParser {
  readonly institution = 'desjardins';
  readonly accountType = 'checking';

  parse(text: string): ParsedTransaction[] {
    // Checking statement format — deposits and withdrawals
  }
}

// apps/api/src/parsers/desjardins-cc.ts  (Mastercard)
export class DesjardinsCCParser implements StatementParser {
  readonly institution = 'desjardins';
  readonly accountType = 'credit_card';

  parse(text: string): ParsedTransaction[] {
    // Credit card statement format — different layout
    // (may show statement period, min payment, interest, etc.)
  }
}

// apps/api/src/parsers/desjardins-savings.ts  (savings)
export class DesjardinsSavingsParser implements StatementParser {
  readonly institution = 'desjardins';
  readonly accountType = 'savings';

  parse(text: string): ParsedTransaction[] {
    // May be simpler: deposits/withdrawals + current balance
    // Key: extract current balance for goal snapshots
  }
}
```

Register all three in the parser registry. The upload UI auto-selects the right parser based on which account the user picks.

### 2.3 Parse Preview & Confirm

Via tRPC (fully typed):

```typescript
// Frontend:
const { data: preview } = trpc.uploads.preview.useQuery({ uploadId });
// → Runs the parser on the stored PDF
// → Returns parsed transactions (not yet committed)
// → Includes duplicate detection results
// → Includes auto-categorization suggestions (rule-based)

const confirm = trpc.uploads.confirm.useMutation();
// → Commits transactions to the database
// → Applies exchange rates for non-CAD transactions
// → Updates goal snapshots for savings accounts
// → Updates upload status to 'parsed'
```

### 2.4 Upload UI

Build the upload flow:

1. **Dropzone** — drag-and-drop or file picker for PDF.
2. **Account selector** — shadcn `Select` component, choose which account this statement belongs to.
3. **Parse preview** — shadcn `DataTable` showing parsed transactions with columns: date, description, amount, suggested category. Flagged duplicates in orange. Editable category column.
4. **Confirm button** — commits to DB.

```bash
# Add shadcn components for this phase
pnpm dlx shadcn@latest add select data-table dialog badge toast
```

### 2.5 Transaction List

The main transactions page. This is where you'll spend the most time in the app, so invest in getting it right:

1. **shadcn DataTable** with columns: date, description, amount (CAD), original amount + currency (if non-CAD), category, account.
2. **Filter bar:** date range picker (shadcn `Popover` + calendar), account filter (`Select`), category filter (`Select`), amount range, keyword search (`Input`).
3. **Inline category editing:** click a category cell → shadcn `Command` palette with search to pick a new category.
4. **Bulk actions:** select multiple rows → "Categorize as..." action.
5. **Manual transaction form:** shadcn `Dialog` with form fields for date, description, amount, currency, account, category. For cash expenses, corrections, or anything not in a PDF.
6. **Edit/Delete:** click a transaction row → `Sheet` panel slides in with full edit form + delete button with undo toast.

```bash
pnpm dlx shadcn@latest add command popover input checkbox dropdown-menu sheet
```

### 2.6 Auto-Categorization Rules

🧑 **Manual input required:** The first ~50 transactions need your manual categorization. This seeds the rule engine — the agent can build the UI and rule engine, but only you know that "Café Myriade" is "Food & Drink > Coffee" and not "Entertainment."

A simple rules engine:

```sql
CREATE TABLE categorization_rules (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern     VARCHAR(200) NOT NULL,  -- keyword or regex
    category_id UUID NOT NULL REFERENCES categories(id),
    priority    INTEGER DEFAULT 0
);
```

When you manually categorize a transaction, the app suggests: "Create a rule for this? All transactions containing 'IGA' → Food & Drink > Groceries." One click to create the rule.

Add a settings page to manage rules.

**Phase 2 deliverable:** You can upload real PDFs from Desjardins (checking, Mastercard, and savings), review parsed transactions, categorize them, manually add/edit/delete transactions, and browse/filter all your transactions. Savings uploads automatically update goal progress. Auto-categorization rules learn from your manual edits.

---

## Phase 3 — Multi-Currency & Dashboard

The goal is: all three currencies work, the dashboard answers your key financial questions at a glance.

### 3.1 Exchange Rate Service

```typescript
// apps/api/src/services/currencyConverter.ts
// Fetch from frankfurter.app (free, no API key, supports BRL/EUR/CAD)
// Cache rates in exchange_rates table
// For historical transactions: use the rate on the transaction date
// For current display: use today's rate
```

Set up a daily cron job (host-level or via a scheduled Docker container) to fetch and cache today's rates. Backfill historical rates for the date range of your existing transactions.

### 3.2 Remaining Parsers

🧑 **Manual input required:** Provide 1 real PDF statement from each remaining account. The agent builds the parsers, but needs your real samples and your validation that the output is correct.

Build parsers for your remaining accounts (4 parsers):

- **Itaú checking** (BRL checking account statement).
- **N26** (EUR checking statement) — N26 statements are typically clean and well-structured.
- **Itaú Visa** (BRL credit card).
- **ScotiaBank Amex** (CAD credit card, canceled) — Only needed for historical data import. Build this last, or skip if you don't need past ScotiaBank transactions.

Each parser follows the same `StatementParser` interface. Upload real statements, iterate on the regex until parsing is accurate.

**Full parser list after Phase 3:**

| Parser | Account | Currency | Phase |
|--------|---------|----------|-------|
| `desjardins-bank` | Checking | CAD | Phase 2 |
| `desjardins-cc` | Mastercard | CAD | Phase 2 |
| `desjardins-savings` | Savings × 2 | CAD | Phase 2 |
| `itau-checking` | Checking | BRL | Phase 3 |
| `n26` | Checking + card | EUR | Phase 3 |
| `itau-credit_card` | Visa credit card | BRL | Phase 3 |
| `scotiabank-cc` | Amex (historical) | CAD | Phase 3 (optional) |

### 3.3 Dashboard — Summary Cards

Build the top-level summary cards component. These query the analytics procedures via tRPC:

```typescript
// Frontend — fully typed, auto-completed
const { data } = trpc.analytics.summary.useQuery({ month: '2026-02' });
// data: { income, expenses, netSaved, savingsRate, deltas }
```

Use shadcn `Card` components. Show: total income, total expenses, net saved, savings rate % — all with month-over-month deltas (green up arrow or red down arrow).

### 3.4 Dashboard — Charts

Build each chart as a standalone component backed by an API endpoint:

| Chart | Endpoint | Component |
|-------|----------|-----------|
| Income vs Expenses (bar) | `/api/analytics/income-vs-expense?months=6` | `<IncomeVsExpense />` |
| Category breakdown (donut) | `/api/analytics/by-category?month=2026-02` | `<CategoryBreakdown />` |
| Category trends (line) | `/api/analytics/trends?months=6&top=5` | `<CategoryTrends />` |
| Account balances | `/api/accounts` (with computed CAD balances) | `<AccountCards />` |
| Recent transactions | `/api/transactions?limit=10&sortBy=date` | `<RecentTransactions />` |

Each endpoint returns data already shaped for Recharts (array of objects with the right keys). Don't make the frontend do heavy data transformation.

### 3.4b Dashboard — Interactive Controls

Add a global control bar at the top of the dashboard:

- **Date range selector:** shadcn `Select` with presets (This month, Last 3 months, Last 6 months, YTD, All time) + custom date range via `Popover` calendar.
- **Account filter:** multi-select to show all or specific accounts.
- **Category filter:** multi-select to include/exclude categories from charts.
- **Comparison toggle:** overlay previous period on charts for trend comparison.
- **Click-to-drill-down:** click a donut slice → navigates to transaction list filtered by that category. Click a month bar → shows that month's breakdown.

These controls update the query params on the analytics API calls, so all charts re-render with the filtered data.

### 3.5 Dashboard — Layout

🧑 **Manual input required:** Test the dashboard on your actual phone and give feedback on layout, readability, and chart usability. The agent can build responsive layouts but can't judge the experience on your specific device.

Assemble the dashboard with responsive layout:

- Mobile (< 640px): single column, stacked cards and charts.
- Tablet (640-1024px): two-column grid for cards, full-width charts.
- Desktop (> 1024px): three-column summary cards, two-column grid for charts.

Use Tailwind's responsive utilities (`sm:`, `md:`, `lg:`). Test on your phone.

### 3.6 Navigation

- **Mobile:** bottom tab bar (Dashboard, Transactions, Upload, Goals, AI) — fixed position, 5 tabs.
- **Desktop:** sidebar with the same links + settings.

Use shadcn `Tabs` for the bottom nav styling, or build a simple custom component. Use React Router for routing.

### 3.7 GitHub CD — Auto-deploy to VPS

> **Note:** CI (type-check + build) was already set up in Phase 1.5 and runs on every push. This section adds the **CD** (continuous deploy) step — pushing the built app to the VPS after a successful CI run. Requires VPS to be live first (sections 1.1–1.3).

🧑 **Manual input required:** Set up GitHub Secrets (VPS_HOST, VPS_USER, VPS_SSH_KEY) in your repository settings.

Now that deploys are frequent, automate them:

```yaml
# .github/workflows/deploy.yml
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

**Phase 3 deliverable:** All three currencies work with automatic conversion. The dashboard shows your real financial data with interactive charts. Push to main runs CI checks automatically; CD to VPS is set up if VPS is live.

> **Phase 3 polish update (Feb 2026):** route-level lazy loading was added in the web app, and the previous Vite `chunk above 500 kB` warning no longer appears in local builds. Transaction CRUD on the Transactions page now supports manual add, edit, and delete flows. Keep bundle-size monitoring as a Phase 5 optimization task.

---

## Phase 4 — Goals & AI

> **Phase 4 completion update (Feb 2026):** Implemented with Gemini in `apps/api/src/services/aiProvider.ts` and `apps/api/src/trpc/ai.ts`. Includes insights, ask, comparison, prediction, decrease/increase what-if, and monthly reports. The older Anthropic/Claude snippets below are historical design notes only.

The goal is: savings goals are tracked with projections, and AI gives you actionable insights.

### 4.1 Goals CRUD

🧑 **Manual input required:** Confirm your exact goal targets, deadlines, and which savings accounts link to which goals. The agent can build the CRUD system but you define the financial targets.

```typescript
// tRPC procedures — fully typed:
trpc.goals.create.useMutation()   // { name, target, type, deadline, accountId }
trpc.goals.list.useQuery()        // → Goal[] with current progress
trpc.goals.progress.useQuery()    // → detail + snapshot history + projections
```

Link savings accounts to goals in the accounts table. Create the two initial goals:
- Private Health Fund — $4,000/year, recurring annual
- Moving / House — $50,000, milestone

### 4.2 Goal Tracking UI

- **Goal cards** with progress bar, current vs. target, on-track indicator.
- **Expandable detail** — click a goal to see the area chart (actual vs. ideal pace).
- **Projection text** — calculated from rolling 3-month average contribution rate.

Each time you upload a savings account statement, a new goal snapshot is created automatically.

### 4.3 PII Stripper

```typescript
// apps/api/src/services/piiStripper.ts
export function anonymize(transactions: Transaction[]): AnonymizedTransaction[] {
  return transactions.map(tx => ({
    date: tx.date,
    amount: tx.amountCad,
    category: tx.category.name,
    subcategory: tx.subcategory?.name,
    isRecurring: tx.isRecurring,
    // Strip: description, account numbers, merchant names, locations
  }));
}
```

The anonymized data only contains: dates, CAD amounts, category names, and flags (recurring, income/expense). No merchant names, no descriptions, no account identifiers.

### 4.4 Claude API Integration

🧑 **Manual input required:** Add your `ANTHROPIC_API_KEY` to the `.env` file on the VPS. The agent cannot access your Anthropic account.

```typescript
// apps/api/src/services/claude.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

// Sonnet 4.5 for complex analysis (insights, scenarios)
export async function generateInsights(anonymizedData: AnonymizedTransaction[]) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 2000,
    system: `You are a personal finance analyst. The user will provide anonymized 
      spending data (amounts, categories, dates — no personal identifiers). 
      Analyze patterns, flag concerns, and give actionable suggestions. 
      Be specific with numbers.`,
    messages: [{
      role: 'user',
      content: `Here is my spending data for the last 3 months:\n${JSON.stringify(anonymizedData, null, 2)}\n\nProvide 3-5 key insights.`
    }]
  });
  return response;
}

// Haiku 4.5 for fast, cheap categorization
export async function categorizeTransaction(description: string, categories: string[]) {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 100,
    system: `Categorize the transaction. Respond with only the category name.`,
    messages: [{
      role: 'user',
      content: `Transaction: "${description}"\nCategories: ${categories.join(', ')}`
    }]
  });
  return response;
}
```

### 4.5 AI Endpoints

```typescript
// tRPC procedures:
trpc.ai.insights.useMutation()    // → monthly spending analysis
trpc.ai.predict.useQuery()        // → "at this rate, when do I hit my goal?"
trpc.ai.scenario.useMutation()    // → "what if I cut dining by 30%?"
trpc.ai.categorize.useMutation()  // → suggest category for unknown transactions
```

Cache responses using a hash of the input data. Don't call the API for the same data twice.

### 4.6 AI UI

🧑 **Manual input required:** Review the AI-generated insights with your real data and judge whether they're useful, accurate, and actionable. The agent can build the UI and API integration, but only you can evaluate if "your food spending is up 14%" is a meaningful insight or noise.

- **Insights panel** — styled cards showing AI-generated insights with icons (trend, warning, suggestion).
- **Scenario builder** — input form: select a category, enter a percentage change, see projected impact on savings rate + goal timelines.
- **Prediction view** — timeline chart showing projected goal completion.

### 4.7 Smart Categorization

For transactions the rule engine can't match, batch them and send descriptions (anonymized — stripped to generic terms) to Claude for category suggestions. Show suggestions inline in the transaction table with a "confirm" button.

**Phase 4 deliverable:** Both savings goals are tracked with visual progress and projections. AI generates monthly insights from anonymized data. You can run what-if scenarios.

---

## Phase 5 — Polish & Hardening

### 5.1 Automated Backups

🧑 **Manual input required:** After setting up backups, test the restore procedure once. Drop the test database, restore from dump, verify data is intact. Only you can confirm your data survived the round-trip.

```bash
# Create backup script
sudo nano /usr/local/bin/fincherry-backup.sh
# #!/bin/bash
# docker compose -f /home/sam/fincherry/docker-compose.yml exec -T db \
#   pg_dump -Fc -U fincherry fincherry > /home/sam/fincherry/backups/fincherry_$(date +%Y%m%d).dump
# find /home/sam/fincherry/backups/ -name "*.dump" -mtime +7 -delete

sudo chmod +x /usr/local/bin/fincherry-backup.sh

# Cron: daily at 3 AM
echo "0 3 * * * sam /usr/local/bin/fincherry-backup.sh" | sudo tee /etc/cron.d/fincherry-backup

# Test restore:
# docker compose exec -T db pg_restore -U fincherry -d fincherry_test /path/to/dump
```

> **Phase 5 update (Feb 2026):** repository scripts now implement this workflow locally:
> `pnpm db:backup`, `pnpm db:restore`, and `pnpm db:backup:cron`. The manual restore verification step is still required once per environment.

### 5.2 Loading States & Error Handling

- Add shadcn `Skeleton` components for every data-loading state.
- Add shadcn `Toast` notifications for: upload success, parsing errors, save confirmations.
- Add error boundaries around chart components (a broken chart shouldn't crash the page).

> **Phase 5 update (Feb 2026):** Added reusable app-level toast notifications and wired them into upload parse/import and transaction save/delete/export flows. Added shared skeleton loaders for route/auth loading plus upload/transactions data-loading states. Chart error boundaries are active on Dashboard and Goals pages.

### 5.3 Performance

- **Virtual scrolling** for transaction list if it grows past 500 rows (TanStack Virtual, integrates with DataTable).
- **Query optimization** — add `EXPLAIN ANALYZE` to slow queries, add missing indexes.
- **Image optimization** — lazy load charts that are below the fold.

> **Phase 5 update (Feb 2026):** Transactions page now uses debounced search, configurable page size, and row windowing for large pages. Additional transaction indexes were added for common date/account/category/recurring filter patterns.

### 5.4 PWA Manifest

Add a basic web app manifest so you can "Add to Home Screen" on your phone:

```json
{
  "name": "FinCherry",
  "short_name": "FinCherry",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0d0d1a",
  "theme_color": "#10b981"
}
```

This gives you a full-screen app experience without browser chrome.

### 5.5 Recurring Transaction Detection

After a few months of data, add a background job that detects recurring patterns:
- Same merchant + similar amount + regular interval (monthly, weekly).
- Flag them in the UI so you know your fixed costs vs. variable spending.

> **Phase 5 update (Feb 2026):** an on-demand recurring detector is available in Settings. It scans recent transactions for interval + amount consistency and flags matched rows as recurring. Background scheduling remains optional for later.

### 5.6 Budget vs Actual Tracking

- Set monthly CAD budgets by category (including parent categories).
- Compare actual spending vs budget for any selected period.
- Surface over-budget categories in dashboard summaries.

> **Phase 5 update (Feb 2026):** budget CRUD and period-based budget-vs-actual summary are implemented (Settings + Dashboard).

### 5.7 Export

- **CSV export** of filtered transactions (for tax prep or manual analysis).
- **Monthly PDF report** — summary of the month, auto-generated. (Nice-to-have, not essential.)

> **Phase 5 update (Feb 2026):** CSV export is implemented in the Transactions page and respects active filters (account/category/date/search). Monthly report export is implemented on the AI page via print-ready PDF export.

---

## Phase 6 — AI-Generated Visualizations (Post-MVP)

The goal is: when the AI gives you an insight, it also generates a custom chart to visualize it — not just text.

### 6.1 Architecture

Extend the Claude API response to include a structured chart definition alongside the text insight:

```typescript
// AI returns structured output like:
{
  text: "Your restaurant spending peaks on Fridays and Saturdays...",
  visualization: {
    type: "bar",           // bar, line, pie, heatmap
    title: "Dining Spending by Day of Week",
    data: [
      { label: "Mon", value: 45 },
      { label: "Tue", value: 30 },
      // ...
      { label: "Sat", value: 120 },
    ],
    colors: ["var(--sapphire)", "var(--cherry-pink)"],
    highlight: ["Fri", "Sat"]  // emphasize these
  }
}
```

### 6.2 Frontend Renderer

A `<DynamicChart />` component that takes the AI's chart definition and renders it with Recharts. The AI chooses the chart type and data shape; the frontend renders it consistently with the FinCherry design system.

### 6.3 Prompt Engineering

The system prompt instructs Claude to:
- Always include a `visualization` object when the insight has a spatial or temporal pattern.
- Choose the most appropriate chart type for the data.
- Keep data arrays small (< 20 data points) for readability.
- Use the app's color token names so the frontend maps them correctly.

---

## Development Workflow

### Daily Pattern

```
1. Pick a task from the current phase
2. Build the DB migration / API endpoint first
3. Test with curl or a REST client (locally or via docker compose up)
4. Build the UI component
5. Test on phone (responsive)
6. Commit + push → auto-deploys to VPS (docker compose build + up)
7. Verify on production
```

### Tools

| Tool | Purpose |
|------|---------|
| **Claude Code** | Primary coding assistant — scaffold components, write parsers, debug |
| **Bruno / Insomnia** | Test API endpoints locally |
| **pgcli** | Interactive PostgreSQL client (`docker compose exec db psql`) |
| **docker compose logs** | Monitor server logs in production |
| **Chrome DevTools (mobile mode)** | Test responsive layout |
| **Phone browser** | Final mobile testing on real device |

### Git Strategy

Single `main` branch with CI/CD. For bigger features, use short-lived feature branches:

```
main ← always deployable
  └── feat/pdf-parser-nubank ← merge when parser works
  └── feat/ai-insights ← merge when endpoint + UI complete
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| PDF parsing breaks on a new statement format | Each parser has tests against real samples. Parser errors don't crash the app — they surface in the upload review screen for manual handling. |
| Exchange rate API goes down | Cached rates in DB. Fall back to most recent cached rate. App still works, just with slightly stale conversion. |
| Claude API costs spike | Response caching (prompt hash). Sonnet (not Opus) for all calls. Monthly cost cap alert. Batch insights, don't call per-transaction. |
| VPS goes down | Automated daily backups. `docker-compose.yml` is version-controlled — you can rebuild the entire stack on a new VPS in under 1 hour with `docker compose up -d`. |
| PDF format changes (bank redesigns statement) | Parser tests will fail on new format. Update regex patterns. Historical data is unaffected. |
| Scope creep | Stick to the phase structure. Each phase has a clear deliverable. Don't start Phase N+1 until Phase N is deployed and usable. |

---

## Success Criteria

After Phase 4, you should be able to:

- [ ] Upload a PDF from any of your banks and see transactions in the app within 2 minutes.
- [ ] Open the dashboard on your phone and immediately see: how much you spent this month, where it went, and whether you're on track for your goals.
- [ ] Search for any transaction by keyword, date range, category, or account.
- [ ] See AI-generated insights that tell you something you didn't already know about your spending.
- [ ] Run a "what-if" scenario and see the impact on your savings goals.
- [ ] Feel confident that your financial data is private — PII never leaves your server except anonymized.
- [ ] Deploy updates by pushing to GitHub — no manual SSH needed (Docker Compose handles the rest).
- [ ] Understand your VPS + Docker setup well enough to replicate it for another project (Surpride, recordoc).
