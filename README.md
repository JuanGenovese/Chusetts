# Chusetts Web

Bar POS / management app, migrated from the legacy Python + Streamlit + SQLite app
to **Next.js + Supabase (Postgres)** with a **hexagonal architecture**.

Stack: Next.js (App Router) - TypeScript strict - Tailwind - Drizzle ORM (postgres.js) - Zod - Vitest.
UI copy is Spanish (neutral); code, comments, tests and docs are English.

## Architecture

```
src/
├── app/                       Next routing only: thin pages/layouts, no business logic
├── server/                    Composition root + Server Actions + server-side queries
│   ├── composition.ts         Manual dependency injection: adapters -> use cases
│   ├── actions/               "use server" actions (Zod validation -> use case -> revalidate)
│   └── queries/               Data loaders for pages
├── modules/
│   └── <module>/              e.g. cash
│       ├── domain/            Pure TS: entities, rules, domain errors (no frameworks)
│       ├── application/       Use cases (one file per use case) + ports/ (interfaces)
│       ├── infrastructure/    Drizzle adapters implementing the ports
│       ├── ui/                React components (containers hold state; views are presentational)
│       └── index.ts           Public API - the ONLY entry point for other code
└── shared/
    ├── domain/                DomainError, Money helpers (integer cents)
    ├── application/           UnitOfWork + CurrentUser ports
    ├── infrastructure/db/     Drizzle client, schema (one file per module), UoW, migrate/seed scripts
    ├── infrastructure/dev/    DEV-ONLY adapters (TODO(phase-2))
    └── ui/                    Small UI kit
```

### Dependency rules (enforced by ESLint `no-restricted-imports`, see `eslint.config.mjs`)

```
app -> server (actions/queries/composition) -> module public API (index.ts)
module: ui -> application -> domain      infrastructure implements application ports
```

- `domain` and `application` cannot import `next`, `react`, `drizzle-orm`, `postgres`, `zod`, `infrastructure`, `ui` or `server`.
- `ui` cannot import infrastructure, `server` or DB packages; it receives Server Actions as props from the route.
- `shared/domain` and `shared/application` cannot import feature modules.
- Other code may import a module only through `@/modules/<name>` (deep `@/modules/<name>/...` imports are errors).
  Inside a module use relative imports.
- Ports exist only for persistence and external concerns (clock, ids, current user). No extra layers.

### Key decisions

- **Money** = integer cents (`Cents`, `bigint` columns in `number` mode). Convert to/from pesos only at the edges
  (`parsePesosToCents`, `formatCents`). The legacy app used floating point.
- **Server Actions live in `src/server/actions`**, not in modules, so modules never touch Next APIs. Routes inject
  actions into module UI via props.
- **Unit of work**: `drizzleUnitOfWork(db, buildRepos)` opens one `db.transaction` per `run` and builds the module's
  repositories bound to it. Every use case runs inside one. Throwing rolls everything back. Needs a direct Postgres
  connection (not a stateless HTTP driver).
- **Concurrency**: session rows are locked with `SELECT ... FOR UPDATE` before balance + insert; the
  "one open session per user" rule is also a partial unique index.
- **Closed sessions are immutable.** A closed cash session is final and cannot be edited; to continue, the user opens a new
  session. There is no way back from CLOSED to OPEN.
  - Cash sale, expense and reversal hooks are rejected on a closed session (`CASH_SESSION_CLOSED`).
  - **Voiding a ticket sold in a closed session is rejected.** Corrections are made with a manual adjustment in the
    current open session. The sales module (TODO(phase-4)) must call `assertCashSessionAllowsVoid(sessionId)` from the
    cash public API FIRST in its void flow, before any sales/stock writes in the same unit of work.
- **Errors**: business rule violations throw `DomainError` subclasses with Spanish user-facing messages
  (`CashSessionError`, `PermissionDeniedError`); actions turn them into form messages.

## Local setup

```bash
pnpm install
cp .env.example .env.local          # DATABASE_URL for the local docker Postgres
docker compose up -d --wait         # Postgres 16 on localhost:54329
pnpm db:migrate                     # apply drizzle/ migrations
pnpm db:seed:dev                    # fixed dev admin user (Phase 1 has no auth)
pnpm dev                            # http://localhost:3000/caja
```

Scripts: `dev`, `build`, `lint`, `typecheck`, `test` (unit, no DB), `test:integration` (needs `DATABASE_URL`;
skips with a warning if unset), `db:generate` (create a migration after editing `src/shared/infrastructure/db/schema`),
`db:migrate`, `db:seed:dev`.

## Testing approach

Domain and application are developed test-first with Vitest and in-memory fakes
(`src/modules/cash/application/testing`). Infrastructure is covered by `*.integration.test.ts` against real Postgres.

## Adding a new module

1. Create `src/modules/<name>/{domain,application/ports,infrastructure,ui}` and an `index.ts` exporting the public API.
2. Write domain rules and use cases test-first against in-memory fakes; define ports under `application/ports`.
3. Add `src/shared/infrastructure/db/schema/<name>.ts`, export it from `schema/index.ts`, run `pnpm db:generate`.
4. Implement the Drizzle repositories in `infrastructure/` and an integration test.
5. Wire it in `src/server/composition.ts`; add actions in `src/server/actions/<name>.ts` and loaders in `src/server/queries/`.
6. Add a thin route in `src/app/` that injects data + actions into the module UI.
7. Cross-module calls (e.g. sales -> cash) go through the other module's `index.ts` and share one unit of work in the
   composition root.

## Roadmap

1. **Cash** (this phase): cash sessions, movements, closing, `/caja` page, dev-only current user.
2. **Supabase Auth**: real `CurrentUserProvider`, roles, remove the dev adapter.
3. **Catalog + inventory**: products, categories, stock.
4. **Sales / POS** with atomic checkout (sale + stock + cash movement in one transaction); replaces the empty
   `SessionLedgerReader` stub with real sales queries.
5. **Reporting + Vercel deploy** (Hobby, region `gru1`, Supabase Postgres).
