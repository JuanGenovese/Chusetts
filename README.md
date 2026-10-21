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
│   └── <module>/              cash, catalog, inventory, ledger, reporting
│       ├── domain/            Pure TS: entities, rules, domain errors (no frameworks)
│       ├── application/       Use cases (one file per use case) + ports/ (interfaces)
│       ├── infrastructure/    Drizzle adapters implementing the ports
│       ├── ui/                React components (containers hold state; views are presentational)
│       └── index.ts           Public API - the ONLY entry point for other code
└── shared/
    ├── domain/                DomainError, Money helpers (integer cents), auth rules (username, 12h TTL, permissions)
    ├── application/           UnitOfWork + CurrentUser ports, login / provisioning use cases
    ├── infrastructure/db/     Drizzle client, schema (one file per module), UoW, migrate/seed scripts
    ├── infrastructure/auth/   Supabase Auth adapters (CurrentUser, password sign-in, proxy session, admin API)
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
- **Unit of work**: `drizzleUnitOfWork(db, buildRepos)` opens one `db.transaction` per `run` and builds the repositories
  bound to it. Every use case runs inside one. Throwing rolls everything back. Needs a direct Postgres connection (not a
  stateless HTTP driver).
- **One transaction across modules**: `src/server/app-repositories.ts` builds the repositories of EVERY module
  (`{ cash, catalog, inventory, ... }`) on the same transaction handle; `appUnitOfWork()` in `composition.ts` is the wide
  unit of work and each module gets a narrowed view (`narrowUnitOfWork(uow, r => r.cash)`). A use case that spans modules
  (the ledger: sale + stock + cash) runs in the wide one and calls the other modules' PUBLIC,
  transaction-scoped services - `createInventoryService(repos.inventory, runtime)`, `createCatalogService(repos.catalog, runtime)` -
  which never open a transaction themselves. Stand-alone use cases (`inventoryUseCases(deps)`, `catalogUseCases(deps)`) wrap
  the same services in their own `uow.run`. Modules never import each other's internals; when one needs data that lives in
  another it declares a port (e.g. the catalog's `CatalogInventoryCollaborator`) and the composition root implements it with
  the other module's public API on the same transaction.
- **Catalog vs inventory**: the catalog owns product master data (categories, suppliers, units, payment methods, movement
  categories). Inventory owns stock levels (`stock_levels`, NOT a column of `products`), recipes, and the stock audit
  trail (`stock_movements`). Quantities are `numeric(18,9)` handled as numbers rounded to 9 decimals like the legacy
  `round(x, 9)`; money is still integer cents.
- **Stock rules kept from the legacy app**: idempotency through `origin_key` (a stock impact can never be applied twice,
  not even after a reversal), insufficient-stock errors list every missing component, a reversal gives the stock back
  without a negative guard, and a recipe product never has stock of its own (recipes may nest; cycles are rejected).
  Sales/purchase/adjustment stock rows carry the ledger movement id (`stock_movements.movement_id`, a real FK to
  `movements`): the ledger row is ALWAYS inserted before the stock audit row that points at it.
- **Ledger (write side)** (`modules/ledger`): `movements` (legacy `movimientos`: sale lines, expenses, purchases and
  "Ajuste Stock" rows; `voided` replaces `anulada`; `number` is the legacy numeric id), `sale_orders` (+ `sale_order_lines`,
  one ledger "Venta" row per line). Use cases (`ledgerUseCases(deps)` / `createLedgerService(repos.ledger, runtime)`):
  `registerSaleTicket`, `voidTicket`, `voidMovement`, `registerExpense`, `registerPurchase`, `registerAdminSale`,
  `createAdminMovement`, `adjustStock`, `recordStockAdjustment` (initial stock). Each one is atomic in ONE `appUnitOfWork()`
  transaction: the ledger declares collaborator ports (stock, cash, catalog) that `app-repositories.ts` implements with the
  other modules' PUBLIC services on the same transaction handle. Voids call `assertCashSessionAllowsVoid` BEFORE any write.
  Ticket lines take their price from the catalog (never from the client); the cash payment method is recognized by its
  code (`EFECTIVO`), not by its display name.
- **Reporting (read side)** (`modules/reporting`, CQRS-lite): read-only use cases that may query across tables directly:
  `getPeriodSummary` (legacy `resumen_periodo`), `getAdminDashboard` (Hoy / Mes actual / Stock tabs + KPI cards),
  `getCashierHome`, `listUserTickets`, `getTicketDetail`, `listMovements`, `findMovementByNumber`,
  `hasAnyOpenCashSession`. Typed DTOs in integer cents; the aggregation rules are pure domain functions. The cash module's
  `SessionLedgerReader` (expected amounts per payment method, sales summary) is now backed by the real ledger.
- **Concurrency**: session rows are locked with `SELECT ... FOR UPDATE` before balance + insert; the
  "one open session per user" rule is also a partial unique index.
- **Closed sessions are immutable.** A closed cash session is final and cannot be edited; to continue, the user opens a new
  session. There is no way back from CLOSED to OPEN.
  - Cash sale, expense and reversal hooks are rejected on a closed session (`CASH_SESSION_CLOSED`).
  - **Voiding a ticket (or a single movement) of a closed session is rejected.** Corrections are made with a manual
    adjustment in the current open session. The ledger's void flows call `assertCashSessionAllowsVoid(sessionId)` from the
    cash public API FIRST, before any ledger/stock/cash write in the same unit of work.
- **Errors**: business rule violations throw `DomainError` subclasses with Spanish user-facing messages
  (`CashSessionError`, `PermissionDeniedError`); actions turn them into form messages.

## Local setup

Local development runs against ONE local stack: the Supabase CLI (`supabase start`: Postgres 17 + Auth/GoTrue + Studio,
Docker required). It replaces the old docker-compose Postgres (removed from the repo; see "Retiring the old compose
Postgres" below). Everything below is local: nothing touches the remote Supabase project.

```bash
pnpm install
pnpm supabase:start                       # Postgres :54322, API/Auth :54321, Studio http://127.0.0.1:54323
cp .env.local.example .env.local          # local URLs + the well-known default keys of `supabase start`
pnpm db:migrate                           # apply drizzle/ migrations to the local database
pnpm db:seed:dev                          # reference data + local accounts (below), created through the LOCAL Auth admin API
pnpm dev                                  # http://localhost:3000  ->  /login
```

`pnpm supabase:status` shows the URLs/keys, `pnpm supabase:stop` stops the stack (data is kept in Docker volumes).

**`.env.local` vs `.env`**: Next (and the scripts/tests) read `.env.local` first, then `.env`. `.env` may hold the REMOTE
project's values; `.env.local` always wins, so local dev uses the local stack. Integration tests and `db:seed:*` refuse to run
unless `DATABASE_URL` (and, for the dev seed, `NEXT_PUBLIC_SUPABASE_URL`) point to localhost. Keep `.env.local` complete: a
missing variable falls back to `.env`.

Local accounts (`db:seed:dev`, local only, public passwords): `admin` / `admin-local-1234` (admin) and `cajero` /
`cajero-local-1234` (cashier). The login screen asks for "Usuario" + "Contraseña" like the legacy app.

Scripts: `dev`, `build`, `lint`, `typecheck`, `test` (unit, no DB), `test:integration` (needs the local stack),
`db:generate` (create a migration after editing `src/shared/infrastructure/db/schema`), `db:migrate` (local only;
`pnpm db:migrate --remote` to migrate a remote database on purpose), `db:seed` (reference
data only), `db:seed:dev` (reference data + local accounts), `db:seed:demo` (demo catalog, tickets, an expense and a
purchase created through the use cases; idempotent, skips when "Pinta IPA" exists; `pnpm db:seed:demo -- --reset` truncates
catalog/stock/ledger/cash data - never users or reference data - and rebuilds it; refuses non-local databases),
`auth:provision-legacy` (see Authentication), `supabase:start|stop|status`.

### Retiring the old compose Postgres

`docker-compose.yml` (Postgres on :54329, volume `pgdata`) is gone. An existing container/volume is untouched; once you no
longer need its data run `docker rm -f chusetts-web-postgres && docker volume rm chusetts-web_pgdata`.

## Authentication

Supabase Auth (`@supabase/ssr` + `@supabase/supabase-js`, exact versions pinned) with the legacy behavior:

- **Username login.** Supabase Auth is e-mail based, so each username maps to a synthetic internal e-mail
  `<username>@users.chusetts.local` (`usernameToAuthEmail`; usernames that are not valid e-mail local parts are hex-encoded).
  The e-mail is never shown and never receives mail; users are created with `email_confirm: true`. Usernames are trimmed and
  lowercased; unknown, inactive and wrong-password all give the same legacy message "Usuario o contraseña incorrectos."
- **Identity link.** `users.auth_user_id` (unique, nullable) links our row to `auth.users.id`. Role, active flag and display
  name stay in `users` (source of truth); the session only proves identity. Inactive or unlinked users are logged out
  (`CurrentUser` returns `null`).
- **Session.** Supabase session cookies (`sb-*`, refreshed by `src/proxy.ts`) + a signed, httpOnly activity cookie
  `chusetts_session` (HMAC with `SUPABASE_SECRET_KEY`). The legacy rule is kept: 12h SLIDING window (`SESSION_TTL_HOURS`;
  `session_auth.restore_session` renews the expiry on every load, so an active cashier is never kicked out mid-shift; after
  12h without activity the session is dead). It is enforced in-app, independent of the Supabase plan's session settings.
- **Protection.** `src/proxy.ts` (Next 16 proxy, the renamed middleware) refreshes the session and redirects anonymous visitors
  to `/login`; it is an optimistic gate with no DB access. Pages and Server Actions re-check: `requireUser()` /
  `guardedPage(permission, ...)` (`src/server/auth.tsx`) enforce the legacy `ROLE_PERMISSIONS`
  (`src/shared/domain/auth/permissions.ts`, `PAGE_PERMISSIONS` = the legacy `ensure_permission` per page); a denied page shows
  "No tenés permisos para acceder a esta función.". `/login` redirects to `/` when you are already logged in.
- **Logout** ("Cerrar sesión", Server Action): revokes this device's session (`signOut({ scope: "local" })`), clears the
  activity cookie, goes to `/login`. `/auth/clear` does the same for leftover sessions.
- **Sign-ups are disabled** (`enable_signup = false` locally; disable them in the dashboard of the real project too).

### Provisioning the legacy users (real migration)

`pnpm auth:provision-legacy --legacy-db <upgraded.sqlite> --target <supabase-host> --env-file <env file> [--commit]`

Reads `users` from the legacy SQLite (read-only) and, for each ACTIVE legacy user that already has a row in `users`
(`pnpm db:import-legacy` first), creates the Supabase Auth user through the admin API with the EXISTING bcrypt hash
(`createUser({ email, password_hash, email_confirm: true })`; `password_hash` supports bcrypt, argon2 and scrypt, `$2b$12$`
hashes verified end-to-end) and links `users.auth_user_id` by username. Dry-run by default (`--commit` writes), `--target` must
equal the host of `NEXT_PUBLIC_SUPABASE_URL`, the database must belong to the same project, idempotent (already linked users
are skipped, a crash between create and link is recovered on re-run), prints usernames and outcomes only. Like
`db:import-legacy` it does not read `.env` files implicitly (`--env-file` or exported variables). Note
`db:import-legacy --replace` truncates `users`: run provisioning (again) after it.

### Seeds

`pnpm db:seed` loads the reference data ported from the legacy `database/seeds.py` + `migrations.py`
(`src/shared/infrastructure/db/seed-reference.ts`). It is idempotent (`ON CONFLICT DO NOTHING`; safe to run on every
deploy; it never overwrites rows an admin edited):

- units: `unidad`, `ml`, `oz`, `l`, `g`, `gr`, `kg` (only `unidad/ml/l/g/kg` are usable in stock and recipes, as in the legacy
  `UNIT_DEFINITIONS`; `oz` and `gr` are seeded like the legacy but rejected by `normalizeUnit`).
- payment methods: Efectivo (10), Transferencia (20), Tarjeta (30), Nave (40, replaces the legacy "Mercado Pago"), Otro (90).
- movement categories (legacy `categorias`): 3 Ingreso, 8 Gasto, 4 Compra.
- the default product category `General`, only while there are no product categories.

Nothing is ported from legacy DATA (products, tickets, ...): the legacy migrations that back-filled old SQLite databases
(SKU/unit/category/ledger/order back-fills, "Promo" recipes) do not apply to a fresh Postgres.

## Testing approach

Domain and application are developed test-first with Vitest and in-memory fakes
(`src/modules/<name>/application/testing`). Infrastructure is covered by `*.integration.test.ts` against real Postgres,
including row-lock concurrency (`inventory`) and a multi-module rollback test
(`src/server/app-unit-of-work.integration.test.ts`: cash + catalog + inventory in one transaction).

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

1. **Cash**: cash sessions, movements, closing, `/mi-turno` page. (done)
2. **Catalog + inventory** (domain, use cases, persistence, seeds; no UI yet): products, categories, suppliers, units,
   payment methods, stock levels, recipes, stock adjustments/reversals. (done)
3. **Movements ledger + "/" screen**: ledger write side + reporting read side (done, no UI yet); the "/" screen is next.
4. **Supabase Auth**: login by username, 12h session, role-gated pages, provisioning of the legacy users. (done)
5. **Sales / POS** UI on top of `ledgerUseCases().registerSaleTicket` (the atomic checkout already exists).
6. **Reporting + Vercel deploy** (Hobby, region `gru1`, Supabase Postgres).

## UI fidelity with the legacy Streamlit app

The Next UI is a visual copy of the Streamlit app. Reference material lives in `docs/ui-reference/`
(`REFERENCE.md` = tokens, component inventory and per-screen spec; `styles.json` / `styles_compact.txt` = computed styles).
Design tokens and the Streamlit base styles are in `src/app/globals.css`; the widget kit is `src/shared/ui`.
Routes use the legacy URL paths (`/`, `/mi-turno`, `/nueva-venta`, `/mis-tickets`, `/productos`, `/movimientos`,
`/cierre-de-caja`, `/reportes`, `/administracion`); unmigrated pages render only the legacy header (`TODO(phase-N)`).

- Approved deviations: sidebar starts collapsed below 760px (overlay via the « / » toggle); disabled buttons look disabled;
  secondary buttons are visually distinct from the primary.
- Log in as `cajero` (see Local setup) to preview the cashier navigation.
- `NEXT_DIST_DIR=.next-compare pnpm dev -p 3001` runs a second dev instance next to your main one (all pages need a login now).
- Screenshots (`docs/ui-reference/shots/`, `compare/`) are git-ignored (26MB). To regenerate the Streamlit shots run the
  Playwright scripts in `docs/ui-reference/scripts/` against the legacy app (`lib.js` holds the helpers; they expect
  `playwright-core`, Chrome and the legacy app on `:8502` with a DB copy containing `testadmin`/`testcajero`).
  To compare the Next "Mi turno" page: `node docs/ui-reference/scripts/compare-turno.js http://localhost:3001 docs/ui-reference/compare admin`
  (then `python3 docs/ui-reference/scripts/pair.py <shot-name>` for a side-by-side image).

### The "/" screens (Caja / Inicio)

- Cashier "/" (`modules/reporting/ui/cashier-home-screen.tsx`) and admin "/" (`admin-home-screen.tsx`, KPIs, quick access
  cards, Hoy / Mes actual / Stock tabs) read `reportingUseCases()` through `src/server/queries/home.ts`.
- The admin dialogs are server-injected slots: `QuickEntryForm` ("Cargar gasto" / "Cargar compra", `modules/ledger/ui`) and
  `ProductForm` ("Cargar producto", `modules/catalog/ui`). Their Server Actions (`src/server/actions/home.ts`, schemas in
  `home-schemas.ts`) call `ledgerUseCases().registerExpense/registerPurchase` and `catalogUseCases().createProduct`
  (product + recipe in ONE transaction). Roles follow the legacy permissions (`src/server/permissions.ts`).
- Charts are lightweight SVG replicas of the legacy Plotly Express charts (no chart library; no hover modebar/zoom).
- `node docs/ui-reference/scripts/compare-home.js <baseUrl> <outDir> <admin|cashier>` takes the comparison screenshots.
