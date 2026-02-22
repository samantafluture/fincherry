# FinCherry

Personal finance dashboard — self-hosted, multi-currency, AI-powered insights.

Tracks income, expenses, and savings goals across CAD, BRL, and EUR accounts. Ingests bank statements via PDF upload, normalizes everything to CAD, and surfaces AI insights via Gemini API (with PII stripped before any external call).

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | React 18 + Vite + Tailwind v4 |
| Components | shadcn/ui (Radix + TanStack Table) |
| Charts | Recharts |
| API | Fastify 5 + tRPC v11 |
| Database | PostgreSQL 16 + Drizzle ORM |
| Auth | Passphrase → bcrypt → JWT (httpOnly cookie) |
| AI | Gemini API (`gemini-2.0-flash` by default; configurable via env) |
| Monorepo | pnpm workspaces |

---

## Local Development

### Prerequisites

- **Node.js** 20+
- **pnpm** 10+ (`npm install -g pnpm`)
- **PostgreSQL** 16 — via Docker (recommended) or a local install

---

### Option A — pnpm dev servers + PostgreSQL in Docker

This is the fastest way to iterate locally. The API and web app run natively with hot reload; only the database runs in a container.

Run all commands in this section from the repo root: `~/Development/fincherry`.

#### 1. Create local env (root `.env`)

```bash
cp .env.example .env
```

Then edit `.env` and set:

```bash
# Database
DB_PASSWORD=change-me-strong-password
DATABASE_URL=postgresql://fincherry:change-me-strong-password@localhost:5432/fincherry

# Auth
# Quote this value to avoid Docker Compose `$` interpolation warnings
AUTH_PASSPHRASE_HASH='$2b$12$...'
JWT_SECRET=your-random-secret-min-32-chars

# App
NODE_ENV=development
PORT=3000

# Optional (AI features only)
GEMINI_API_KEY=
GEMINI_INSIGHTS_MODEL=gemini-2.0-flash
GEMINI_CATEGORIZATION_MODEL=gemini-2.0-flash
```

Generate `AUTH_PASSPHRASE_HASH` with:

```bash
pnpm --filter @fincherry/api exec node -e "const b=require('bcryptjs');console.log(b.hashSync('your-passphrase',12))"
```

#### 2. Install dependencies

```bash
pnpm install
```

#### 3. Start (or recreate) the database

```bash
docker compose up -d db --force-recreate
docker compose ps
```

Confirm `db` is healthy and has a host port mapping like `0.0.0.0:5432->5432/tcp`.

#### 4. Run database migrations and seed

```bash
# One-command setup (recommended)
pnpm db:setup

# Or run steps manually:
# Push the Drizzle schema to the database (creates all tables)
pnpm --filter @fincherry/api db:push

# Seed default categories, savings goals, and accounts
pnpm db:seed

# Optional after taxonomy updates:
# backfill only uncategorized transactions (plus legacy Delivery -> Food Delivery)
pnpm db:backfill-categories
```

#### 5. Start the development servers

Open two terminals:

```bash
# Terminal 1 — API (hot reload via tsx watch)
pnpm dev:api

# Terminal 2 — Web (Vite HMR)
pnpm dev:web
```

The app will be available at:

- **Web:** http://localhost:5173
- **API:** http://localhost:3000
- **Health check:** http://localhost:3000/api/health

#### 6. Log in

Go to http://localhost:5173 — you'll see the login screen. Enter the passphrase you chose in step 1.

#### 7. If something fails, rerun these commands

- `relation "categories" does not exist`:
  - Run `pnpm --filter @fincherry/api db:push`, then `pnpm db:seed`.
- `password authentication failed for user "fincherry"`:
  - Your DB container was initialized with a different password.
  - Run:
    ```bash
    docker compose down -v
    docker compose up -d db
    pnpm --filter @fincherry/api db:push
    pnpm db:seed
    ```
- `ECONNREFUSED 127.0.0.1:5432`:
  - DB is not reachable from host.
  - Run `docker compose up -d db --force-recreate`, then check `docker compose ps`.
- `Upload/transactions show outdated category names after pulling latest changes`:
  - Run:
    ```bash
    pnpm db:seed
    pnpm db:backfill-categories
    ```

---

### Option B — Full Docker Compose stack

This runs API + DB + nginx together, mirroring the production setup. The frontend is served as static files (no HMR).

> **Note:** This option does not have hot reload. Rebuild is needed after code changes. Use Option A for active development.

#### 1. Create environment files

Root `.env` (read by Docker Compose):

```bash
cat > .env << 'EOF'
DB_PASSWORD=change-me-strong-password
JWT_SECRET=dev-secret-change-this-in-production-32chars
AUTH_PASSPHRASE_HASH='$2b$12$...'  # generate with bcryptjs (see Option A step 1)
GEMINI_API_KEY=your-gemini-api-key   # optional
GEMINI_INSIGHTS_MODEL=gemini-2.0-flash
GEMINI_CATEGORIZATION_MODEL=gemini-2.0-flash
NODE_ENV=production
PORT=3000
EOF
```

#### 2. Build the frontend

```bash
pnpm --filter web build
```

#### 3. Build and start all containers

```bash
docker compose build
docker compose up -d
```

The stack starts: `db` → `api` → `nginx`.

#### 4. Run migrations and seed

```bash
# Run inside the api container
docker compose exec api node dist/db/seed.js
```

Or push the schema with drizzle-kit from your local machine (pointing at the container's port, if you expose it):

```bash
DATABASE_URL=postgresql://fincherry:change-me@localhost:5432/fincherry pnpm --filter @fincherry/api db:push
pnpm db:seed
```

#### 5. Access

The nginx container serves everything on port 80. Open http://localhost.

> **SSL note:** The SSL config in `nginx/nginx.conf` is for production. For local Docker dev, you may need to simplify it to HTTP-only or comment out the SSL server block.

---

### Option C — Fully local PostgreSQL (no Docker)

If you have PostgreSQL 16 installed locally:

```bash
# Create the database and user
psql postgres -c "CREATE USER fincherry WITH PASSWORD 'localpass';"
psql postgres -c "CREATE DATABASE fincherry OWNER fincherry;"
```

Then set `DATABASE_URL=postgresql://fincherry:localpass@localhost:5432/fincherry` in root `.env` and follow Option A from step 4.

---

## Useful Commands

```bash
# Dev servers
pnpm dev:api          # Fastify API with tsx watch (hot reload)
pnpm dev:web          # Vite dev server (HMR)

# Database
pnpm db:up           # Start/recreate local PostgreSQL container
pnpm db:setup        # db:up + db:push + db:seed
pnpm --filter @fincherry/api db:push  # Push Drizzle schema to DB (dev — no migration files)
pnpm db:generate      # Generate migration files (for production)
pnpm db:migrate       # Run migrations
pnpm db:seed          # Insert default categories, goals, and accounts
pnpm db:backfill-categories  # Backfill uncategorized tx after category tree updates
pnpm db:studio        # Open Drizzle Studio (visual DB browser) at localhost:4983

# Build
pnpm build            # Build both API (tsc) and web (vite)
pnpm build:api        # API only
pnpm build:web        # Web only

# Docker
docker compose up -d db          # Start only PostgreSQL
docker compose up -d             # Full stack
docker compose logs -f api       # Watch API logs
docker compose exec db psql -U fincherry fincherry  # PostgreSQL shell
docker compose down              # Stop all containers
docker compose down -v           # Stop and delete volumes (⚠ deletes data)
```

---

## Project Structure

```
fincherry/
├── apps/
│   ├── api/                    # Fastify + tRPC backend
│   │   ├── src/
│   │   │   ├── server.ts       # Entry point
│   │   │   ├── trpc/           # tRPC routers (auth, accounts, transactions, …)
│   │   │   ├── db/             # Drizzle schema, migrations, seed
│   │   │   ├── parsers/        # Bank PDF parsers (Phase 2)
│   │   │   ├── services/       # Currency, categorizer, AI provider, PII stripper
│   │   │   └── routes/         # Non-tRPC routes (PDF upload)
│   │   └── .env                # Local secrets (gitignored)
│   └── web/                    # React frontend
│       └── src/
│           ├── pages/          # Dashboard, Transactions, Upload, Goals, AI, Settings
│           ├── components/     # Layout shell, UI primitives
│           └── lib/            # tRPC client, formatCurrency, dateUtils
├── nginx/nginx.conf            # Reverse proxy config (production)
├── docker-compose.yml
├── .env                        # Root env for Docker Compose (gitignored)
└── docs/                       # Design doc + implementation plan
```

---

## Auth

FinCherry uses simple passphrase auth (single user). To generate your passphrase hash:

```bash
pnpm --filter @fincherry/api exec node -e "const b=require('bcryptjs');console.log(b.hashSync('your-chosen-passphrase',12))"
```

Paste the output into `AUTH_PASSPHRASE_HASH` in your `.env`. The hash is safe to commit to `.env.example` placeholders but **never commit the actual hash** — it's in `.gitignore`.
At login, enter the original plain passphrase you chose, not the hash string.

---

## Roadmap

| Phase | Status | Focus |
|-------|--------|-------|
| 1 — Foundation | ✅ Done locally | Monorepo, schema, tRPC, React shell, auth |
| 2 — PDF Parsing | ✅ Done (Desjardins flow) | Upload + preview + confirm, duplicate detection, category rules, transaction review/edit workflow |
| 3 — Multi-currency + Dashboard | 🟡 In progress | Exchange-rate conversion + dashboard analytics/filters shipped, transaction CRUD (manual add/edit/delete) added; remaining non-Desjardins parsers are optional before Phase 4 |
| 4 — Goals + AI | 🔜 | Goal tracking UI, Gemini insights, what-if scenarios |
| 5 — Polish | 🔜 | Virtual scrolling, CSV export, recurring detection, ongoing web bundle optimization |
| VPS Deploy | ⏸ Deferred | Set up after Phase 2–3 work locally |

### Phase 2/3 Manual Input Status (before Phase 4)

- ✅ Done: Desjardins checking + credit card statements provided and validated in-app.
- ✅ Done: Initial manual categorization and rule creation completed.
- ✅ Done: Dashboard UX review feedback applied (desktop/mobile behavior validated during iteration).
- Optional if you want full original Phase 3 scope now: provide real PDFs for N26, Itaú Checking, Itaú Visa Credit Card, and (optionally) ScotiaBank Amex parsers.
- Optional if you want BRL/EUR sign-off now: spot-check converted CAD totals against your BRL/EUR statements.
