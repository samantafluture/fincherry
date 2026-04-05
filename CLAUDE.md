# FinCherry

Self-hosted personal finance dashboard. Multi-currency (CAD/BRL/EUR), AI insights via Gemini, PDF bank statement ingestion. Single-user passphrase auth with optional read-only partner access.

## Stack

TypeScript (strict), React 18 + Vite 6 + Tailwind v4 + shadcn/ui, Fastify 5 + tRPC v11, PostgreSQL 16, Drizzle ORM, Gemini 2.5 Flash, Zod, pnpm workspaces.

## Structure

```
apps/
  api/src/
    server.ts            # Entry point
    trpc/                # Routers: auth, accounts, transactions, categories, goals, budgets, ai, uploads, analytics, exchangeRates
    db/schema.ts         # All Drizzle tables
    db/migrations/       # Drizzle migrations
    services/            # Business logic (AI, categorizer, currency, PII stripper)
    routes/              # Non-tRPC routes (PDF uploads)
  web/src/
    pages/               # Login, Dashboard, Transactions, Upload, Goals, AI, Settings
    components/          # charts/, layout/, ui/
    lib/                 # trpc client, dateUtils, formatCurrency, categoryPaths
scripts/                 # db-backup.sh, db-restore.sh, check-web-bundle-size.mjs
nginx/                   # Reverse proxy config
```

## Commands

```bash
pnpm dev:api             # API server (tsx watch)
pnpm dev:web             # Web dev server (Vite)
pnpm build               # Build all
pnpm db:push             # Push schema (dev)
pnpm db:generate         # Generate migration from diff
pnpm db:migrate          # Run migrations (prod)
pnpm db:studio           # Drizzle Studio
pnpm db:backup           # Backup PostgreSQL
pnpm db:restore          # Restore from backup
```

## Key Patterns

- **Multi-currency:** amounts stored in original currency + `amountCad` (normalized). Exchange rate per transaction.
- **AI:** Gemini with PII stripping before sending. Vision mode for PDFs. JSON mode for categorization/insights.
- **PDF parsers:** bank-specific — Desjardins, Itau, N26, Scotia (`apps/api/src/services/`).
- **Auth:** bcrypt passphrase -> JWT in signed HTTP-only cookie. Partner = read-only role.
- **tRPC:** `publicProcedure` (no auth), `protectedProcedure` (JWT validated, `ctx.user` with role).

## Deploy

Docker multi-stage build -> VPS. Env: `DB_PASSWORD`, `DATABASE_URL`, `AUTH_PASSPHRASE_HASH`, `JWT_SECRET`. See `.env.example`.

## Rules

- No `any`, no raw SQL (use Drizzle), no PII in AI prompts, no `console.log` (use Fastify logger)
- No business logic in routers — delegate to services
- Conventional commits
