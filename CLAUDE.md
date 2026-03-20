# CLAUDE.md — FinCherry Architectural Fence

This file is the single source of truth for AI agents working on FinCherry.
Read it completely before writing any code. Every rule here is a hard constraint,
not a suggestion.

---

## 1. What is FinCherry?

FinCherry is a self-hosted personal finance dashboard. Multi-currency (CAD/BRL/EUR),
AI-powered insights via Gemini, PDF bank statement ingestion with automatic
categorization. Single-user passphrase auth with optional read-only partner access.

**Design principles:** privacy-first (self-hosted, PII stripping), multi-currency
normalization to CAD, AI-assisted but human-controlled.

---

## 2. Technology Stack

| Layer      | Technology                                  |
| ---------- | ------------------------------------------- |
| Monorepo   | pnpm workspaces (`apps/*`)                  |
| Language   | TypeScript (strict mode)                    |
| Frontend   | React 18, Vite 6, Tailwind v4, shadcn/ui   |
| Routing    | React Router v7                             |
| Data       | TanStack React Query v5                     |
| Charts     | Recharts                                    |
| Backend    | Fastify 5, tRPC v11                         |
| ORM        | Drizzle ORM 0.38                            |
| Database   | PostgreSQL 16                               |
| AI         | Gemini 2.5 Flash (vision + JSON mode)       |
| Validation | Zod                                         |
| Auth       | bcryptjs + JWT (signed cookie)              |
| Testing    | _(not yet configured)_                      |

**Do NOT add** state management libraries (React Query + tRPC handles it),
alternative CSS frameworks, or any dependency not listed above without explicit approval.

---

## 3. Project Structure

```
fincherry/
├── apps/
│   ├── api/                    # Fastify + tRPC backend
│   │   └── src/
│   │       ├── server.ts       # Entry point
│   │       ├── trpc/           # tRPC routers (one per domain)
│   │       │   ├── auth.ts
│   │       │   ├── accounts.ts
│   │       │   ├── transactions.ts
│   │       │   ├── categories.ts
│   │       │   ├── goals.ts
│   │       │   ├── budgets.ts
│   │       │   ├── ai.ts
│   │       │   ├── uploads.ts
│   │       │   ├── analytics.ts
│   │       │   └── exchangeRates.ts
│   │       ├── db/             # Drizzle schema, migrations, seed
│   │       │   ├── schema.ts   # All tables defined here
│   │       │   └── migrations/
│   │       ├── routes/         # Non-tRPC routes (PDF uploads)
│   │       ├── services/       # Business logic (AI, categorizer, currency, PII)
│   │       └── utils/
│   └── web/                    # React SPA
│       └── src/
│           ├── pages/          # Login, Dashboard, Transactions, Upload, Goals, AI, Settings
│           ├── components/     # charts/, layout/, ui/
│           ├── lib/            # trpc client, dateUtils, formatCurrency, categoryPaths
│           ├── styles/         # globals.css (Tailwind + CSS custom properties)
│           └── hooks/
├── infra/                      # Docker Compose, nginx
├── scripts/                    # db-backup.sh, db-restore.sh, check-web-bundle-size.mjs
├── nginx/                      # Reverse proxy config
├── docker-compose.yml          # Dev: db, api, nginx, certbot
├── Dockerfile.prod             # Multi-stage production build
└── .env.example
```

**Where new code goes:**

- New tRPC router? → `apps/api/src/trpc/routername.ts` + register in appRouter
- New business logic? → `apps/api/src/services/`
- New DB table? → `apps/api/src/db/schema.ts` + generate migration
- New page? → `apps/web/src/pages/PageName.tsx` + add route
- New component? → `apps/web/src/components/`
- New hook? → `apps/web/src/hooks/useX.ts`

---

## 4. Naming Conventions

| Thing         | Convention     | Example                                 |
| ------------- | -------------- | --------------------------------------- |
| Files (API)   | camelCase      | `aiProvider.ts`, `piiStripper.ts`       |
| Files (Web)   | PascalCase     | `Dashboard.tsx`, `TransactionRow.tsx`    |
| tRPC routers  | camelCase      | `authRouter`, `transactionsRouter`      |
| Variables     | camelCase      | `accountId`, `amountCad`                |
| Types         | PascalCase     | `Transaction`, `CategoryNode`           |
| CSS vars      | kebab-case     | `--color-deep-blue`, `--color-surface`  |
| DB columns    | camelCase      | Drizzle maps to snake_case automatically |

---

## 5. Key Patterns

### tRPC Procedures
- `publicProcedure` — no auth required (login)
- `protectedProcedure` — JWT cookie validated, `ctx.user` available with `role` ('admin' | 'partner')
- Input validated with Zod schemas
- Error handling via `TRPCError`

### Multi-Currency
- All amounts stored in original currency AND `amountCad` (normalized)
- `exchangeRate` stored per transaction
- Display logic uses user's preferred currency

### AI Integration
- Gemini API with PII stripping before sending data
- Vision mode for PDF parsing
- JSON mode for structured responses (categorization, insights)
- Bank-specific PDF parsers: Desjardins, Itaú, N26, Scotia

### Auth
- Single passphrase (bcrypt hash in env var)
- Optional partner passphrase (read-only role)
- JWT stored in signed HTTP-only cookie

---

## 6. Commands Reference

```bash
# Development
pnpm install              # Install all dependencies
pnpm dev:api              # Start API server (tsx watch)
pnpm dev:web              # Start web dev server (Vite)

# Build
pnpm build                # Build all packages
pnpm build:api            # TypeScript compile API
pnpm build:web            # Vite build web

# Database
pnpm db:up                # Start PostgreSQL (Docker)
pnpm db:push              # Push schema changes (dev)
pnpm db:migrate           # Run migrations (production)
pnpm db:generate          # Generate migration from schema diff
pnpm db:seed              # Seed database
pnpm db:studio            # Drizzle Studio (visual DB browser)
pnpm db:backup            # Backup PostgreSQL
pnpm db:restore           # Restore from backup

# Quality
pnpm --filter web lint    # ESLint web
pnpm --filter api exec tsc --noEmit   # Typecheck API
pnpm --filter web exec tsc --noEmit   # Typecheck web

# Bundle
pnpm web:bundle:check     # Check web bundle size
pnpm web:bundle:report    # Generate bundle report
```

---

## 7. Do NOT List

- **No `any`** — use `unknown` and narrow, or define a proper type
- **No direct DB queries in tRPC routers** — delegate to services
- **No PII in AI prompts** — always run through PII stripper first
- **No hardcoded currencies** — use the currency system (account → transaction → display)
- **No raw SQL** — use Drizzle ORM query builder
- **No `console.log`** — use Fastify logger
- **No storing secrets in code** — use `.env` (never commit `.env`)
- **No business logic in route/router files** — keep routers thin

---

## 8. Environment Variables

Required: `DB_PASSWORD`, `DATABASE_URL`, `AUTH_PASSPHRASE_HASH`, `JWT_SECRET`
Optional: `PARTNER_PASSPHRASE_HASH`, `GEMINI_API_KEY`, `GEMINI_INSIGHTS_MODEL`, `GEMINI_CATEGORIZATION_MODEL`
See `.env.example` for full list.

---

## 9. Git & Workflow

- **Commits:** conventional commits (`feat:`, `fix:`, `chore:`, etc.)
- **Before committing:** typecheck both packages, build
- **Deploy:** Docker multi-stage build → VPS

---

## Task Management
Tasks: .claude/tasks.md
