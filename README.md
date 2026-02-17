# FinCherry

Personal finance dashboard — self-hosted, multi-currency, AI-powered insights.

Tracks income, expenses, and savings goals across CAD, BRL, and EUR accounts. Ingests bank statements via PDF upload, normalizes everything to CAD, and surfaces AI insights via Claude API (with PII stripped before any external call).

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
| AI | Claude API (Haiku 4.5 for categorization, Sonnet 4.6 for insights) |
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

#### 1. Install dependencies

```bash
pnpm install
```

#### 2. Start the database

```bash
# Start only the db container (no nginx, no api container)
docker compose up -d db
```

The database will be available at `localhost:5432`.

#### 3. Set up environment variables

Create `apps/api/.env` (this file is gitignored):

```bash
cp .env.example apps/api/.env
```

Then edit `apps/api/.env` and fill in:

```bash
# Database
DATABASE_URL=postgresql://fincherry:change-me-strong-password@localhost:5432/fincherry
DB_PASSWORD=change-me-strong-password   # must match the password in DATABASE_URL

# Auth — generate a bcrypt hash of your chosen passphrase:
#   node -e "const b=require('bcryptjs');console.log(b.hashSync('your-passphrase',12))"
AUTH_PASSPHRASE_HASH=$2b$12$...

# JWT — any random string, min 32 chars
JWT_SECRET=dev-secret-change-this-in-production-32chars

# Optional — needed only for AI features
ANTHROPIC_API_KEY=sk-ant-...

NODE_ENV=development
PORT=3000
```

> **Note on DB_PASSWORD:** The Docker Compose `db` service uses `DB_PASSWORD` to create the PostgreSQL user. It must match the password in `DATABASE_URL`. The default value in `docker-compose.yml` is read from `.env` at the **root** of the repo. For local dev, you can either create a root `.env` with `DB_PASSWORD=...`, or pass it inline when starting the container.

The simplest approach — create a root `.env` (gitignored) with just the password:

```bash
echo "DB_PASSWORD=change-me-strong-password" > .env
```

Then start the db again so it picks up the password:

```bash
docker compose up -d db
```

#### 4. Run database migrations and seed

```bash
# Push the Drizzle schema to the database (creates all tables)
pnpm db:push

# Seed default categories, savings goals, and accounts
pnpm db:seed
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

Go to http://localhost:5173 — you'll see the login screen. Enter the passphrase you chose in step 3.

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
AUTH_PASSPHRASE_HASH=$2b$12$...  # generate with bcryptjs (see Option A step 3)
ANTHROPIC_API_KEY=sk-ant-...     # optional
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
DATABASE_URL=postgresql://fincherry:change-me@localhost:5432/fincherry pnpm db:push
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

Then set `DATABASE_URL=postgresql://fincherry:localpass@localhost:5432/fincherry` in `apps/api/.env` and follow Option A from step 4.

---

## Useful Commands

```bash
# Dev servers
pnpm dev:api          # Fastify API with tsx watch (hot reload)
pnpm dev:web          # Vite dev server (HMR)

# Database
pnpm db:push          # Push Drizzle schema to DB (dev — no migration files)
pnpm db:generate      # Generate migration files (for production)
pnpm db:migrate       # Run migrations
pnpm db:seed          # Insert default categories, goals, and accounts
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
│   │   │   ├── services/       # Currency, categorizer, Claude AI, PII stripper
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
node -e "const b=require('bcryptjs');console.log(b.hashSync('your-chosen-passphrase',12))"
```

Paste the output into `AUTH_PASSPHRASE_HASH` in your `.env`. The hash is safe to commit to `.env.example` placeholders but **never commit the actual hash** — it's in `.gitignore`.

---

## Roadmap

| Phase | Status | Focus |
|-------|--------|-------|
| 1 — Foundation | ✅ Done locally | Monorepo, schema, tRPC, React shell, auth |
| 2 — PDF Parsing | 🔜 Next | Bank parsers (needs real PDF samples), transaction table |
| 3 — Multi-currency + Dashboard | 🔜 | Exchange rates live, charts wired to real data |
| 4 — Goals + AI | 🔜 | Goal tracking UI, Claude insights, what-if scenarios |
| 5 — Polish | 🔜 | Virtual scrolling, CSV export, recurring detection |
| VPS Deploy | ⏸ Deferred | Set up after Phase 2–3 work locally |
