# Exploration: persistence-prisma-sqlite

> Intent (verbatim): "Vamos a usar los datos de prueba que tiene el proyecto pero lo
> vamos a cambiar a SQLite con Prisma para después migrar a PostgreSQL"

## Context

- Angular 22 + SSR (`@angular/ssr`), Express 5, TypeScript ~6.0, standalone
  components + signals. Strict TDD active (`ng test --watch=false`, vitest 4.1.11 +
  jsdom).
- `app.routes.server.ts` renders **everything** with `RenderMode.Prerender`; only `/`
  exists (no router yet — `app.config.ts` has no `provideRouter`).
- Working tree is intentionally uncommitted with unrelated modifications
  (`event-hero.ts`, `guest-detail.ts`, `metrics-section.ts`, `stat-tile.ts`,
  `photo-cloud.ts`, `topbar.css`, `qr-ticket-modal.ts`, `styles.css`, `package.json`).
  This change must not touch them.
- No `.env`, no dotenv, no Prisma/DB packages installed (`npm ls prisma` → empty).
- `tsconfig.json` does **not** enable `strict: true` (only
  `strictInjectionParameters` / `strictInputAccessModifiers`); `noPropertyAccessFromIndexSignature`
  and `noImplicitReturns` are on.

## Current State — file-by-file data map

### 1. Where the test data lives

| File | Contents | Shape |
|---|---|---|
| `src/app/core/seed-data.ts` (176 lines) | **The single source of test data.** `GUESTS` (14), `PHOTOS` (14, derived from `PHOTO_DEFS`), `EVENTS` (3), `APP_STATES`, `GATES`, `STORAGE_PLANS`, `PUBLIC_WEB_URL`, `USERS` | Verbatim transcription of the prototype `QR_Z_Open/app.js:38-154,169-180,717,809`. All `readonly`, string-literal unions, Spanish content |
| `src/app/core/models.ts` (197 lines) | Domain types: `Guest`, `PartyMember`, `Pass`, `EventPhoto`, `PaseEvent`, `SecurityGuard`, `EventAdmin`, `StorageBreakdown`, `PaseUser`, `Metrics`, `FeedItem`, … | Pure type layer, no runtime data. All fields `readonly`; status fields are string-literal unions (`GuestStatus`, `PhotoState`, `EventStatus`, `ScanAppState`) |
| `QR_Z_Open/app.js:38-180` | Original prototype dataset (`GUESTS`, `APP_STATES`, `passPool` build, `GATES`) | Vanilla JS, no storage at all — every reload replays the snapshot. Reference only; not imported by the app |
| `src/app/features/admin/guests/guest-table.spec.ts:14` | Local 3-row `GUESTS` fixture | Test-only, independent of seed-data |
| `src/app/core/metrics.spec.ts:1` | Imports `GUESTS`, `EVENTS`, `PHOTOS` from seed-data | Seed data is load-bearing for tests (immutability assertions, metric snapshots) |
| `scripts/verify-parity.mjs` | Static file server + HTML comparator for prototype parity | Holds no data |
| No `*.json` data fixtures, no `scripts/seed*`, no backend data files exist | — | — |

### Entity/relationship inventory (as-is, all in-memory)

- **Guest** `id: 'P-001'…'P-014'` (human-readable string PK), `name`, `email`,
  `phone`, `status: confirmed|sent|planned|declined`, `table: number`,
  `party: [{name, rel}]` (**embedded 1-to-many, no IDs**), `note: string`.
- **EventPhoto** `id: 'f1'…'f14'`, `seed`, `author` (**plain NAME, not a FK**),
  `state: approved|pending|rejected`, `dl: boolean`, `size`, `h`, `time`,
  `url`/`big` (external `picsum.photos` URLs — only metadata would be stored).
- **PaseEvent** `id: 'ev1'..'ev3'`, `status: active|upcoming|done`, `dateLabel`
  (preformatted string, not a date), `cd`, aggregate counters (`guests`, `photos`,
  `used`, `max`), `br: StorageBreakdown`, `admin: EventAdmin` (**embedded 1-1**),
  `security: SecurityGuard[]` (**embedded 1-to-many, no IDs**), optional `note`.
- **Pass** (derived, not stored): `code = guest.id` or `` `${guest.id}·A${i+1}` `` for
  each party member of confirmed guests (`metrics.ts:135-149`).
- **USERS / GATES / STORAGE_PLANS / APP_STATES**: small catalogs, DB-worthy or
  keep-as-constants (decision point).

**Notable data quirks (schema-relevant):**

- `photo.author` does **not** reliably match `guest.name` (`'Regina Ortiz'` vs
  `'Regina Ortiz Mena'`; authors include party members like `'Martín Ferreyra'`).
  **No clean FK exists today** — an `Attendee` concept or a plain-string author is
  required.
- Guests carry **no `eventId`** — they implicitly belong to the demo event `ev1`;
  `PaseEvent.guests: 218` is a display counter unrelated to the 14 seeded guests.
- `dateLabel` is preformatted display text (`'14 JUN 2025 · 20:00'`), not a
  temporal value — a real schema wants `DateTime` + formatting at the edge.

### 2. How the data is consumed

- **`src/app/core/pase-store.ts`** — the ONLY runtime consumer of seed data.
  `providedIn: 'root'`, seeds signals directly:
  `guests = signal(GUESTS)`, `photos = signal(PHOTOS)`, `events = signal(EVENTS)`,
  `passPool = signal(passPoolOf(GUESTS))`. All mutations (`sendInvite`,
  `confirmGuest`, `setPhotoState`, `toggleDownload`, `applyPlan`) are immutable
  `update()` calls on these signals — **in-memory only, lost on reload**.
  Documented explicitly: *"There is no persistence."*
- **Consumers of `PaseStore`**: `admin-view.ts`, `provider-view.ts`,
  `contact-modal.ts`, `photo-lightbox.ts`, `feed.service.ts`, `app.ts` (root).
  Derived data flows through `computed()` (`metrics`, `funnel`, `visibleGuests`,
  `kpis`, …) — pure functions of the signals (`metrics.ts`).
- **Direct seed-data imports outside the store**:
  `feed.service.ts` → `GATES`; `event-hero.ts` → `PUBLIC_WEB_URL`;
  `metrics.spec.ts` → `GUESTS/EVENTS/PHOTOS`.
- **No HTTP, no localStorage, no IndexedDB anywhere in `src/`** (grep-verified:
  zero `fetch(`/`localStorage` matches).
- **SSR/prerender implications**: the page is baked at **build time** with the seed
  snapshot; hydration (`provideClientHydration()`) compares server HTML vs client
  re-render. Any data fetched from a DB must therefore arrive **client-side after
  hydration** (or the render mode must change), otherwise you get hydration
  mismatch (NG0500/NG0502 — this repo already has scars from that class of bug, see
  archived `fix-role-screen-duplication`). `FeedService` already demonstrates the
  correct pattern: browser-only work inside `afterNextRender` guarded by
  `isPlatformBrowser`.

### 3. Backend/persistence today

- **`src/server.ts`**: stock Angular SSR Express 5 bootstrap — static files +
  `AngularNodeAppEngine.handle()`. The REST-API section is an **empty comment
  placeholder** (`Example Express Rest API endpoints can be defined here`). No
  routes, no controllers, no DB.
- No database, no ORM, no migration folder, no seed script, no env config.
- `npm start` = `ng serve` (dev server wraps the same `reqHandler`); production =
  `node dist/qr_control/server/server.mjs` (port `PORT || 4000`).

## Approaches compared

### Approach A — Prisma + SQLite behind an Express REST API (full runtime persistence)

Add `prisma/schema.prisma` (SQLite), a `prisma/seed.ts` that replays the current
`seed-data.ts` content, REST endpoints in `src/server.ts` (the placeholder is
inviting exactly this), and an Angular `DataService` that loads into `PaseStore`
signals after hydration. Prisma Client lives **server-side only** (Node process).

- **+** True persistence; mutations survive reload; the store's mutation methods
  become API calls with optimistic signal updates — matches the eventual Postgres
  target 1:1.
- **+** Express 5 is already wired; adding `app.get('/api/...')` before the SSR
  handler is a 1-line-per-endpoint change.
- **−** Requires deciding the render-mode story: keep `Prerender` (static shell +
  client fetch → risk of flash/hydration-mismatch class bugs) or move `/` to
  `RenderMode.Server` (loses static SSG, gains fresh data per request).
- **−** Largest task count; strict TDD means an integration-test layer that does
  not exist yet (openspec config currently has `layers.integration: false`).

### Approach B — Prisma + SQLite as the *seed generator* only (build-time data pipeline)

Prisma/SQLite manages schema + seed, but a script (`prisma/seed.ts` →
`scripts/generate-seed.ts`) emits the typed TS/JSON fixture the app imports today.
The app runtime stays exactly as-is (signals, no fetch).

- **+** Minimal app-side change; zero hydration/SSR risk; seed data stays
  deterministic and test-friendly (`metrics.spec.ts` keeps working unmodified).
- **+** Prisma schema becomes the *design* artifact for the future Postgres move;
  migrations folder starts life immediately.
- **−** No runtime persistence — arguably not what "cambiar a SQLite con Prisma"
  means if the user expects reads/writes to hit a DB.
- **−** Data duplication (DB + generated fixture) can drift if not scripted.

### Approach C — Prisma inside SSR (Prisma Client called during Angular server render)

Load data during SSR/`APP_INITIALIZER` on the server, serialize via TransferState.

- **+** SEO/fresh HTML if data ever becomes public.
- **−** **Prerender runs at build time**, where no DB exists → build breaks or
  bakes stale data; Prisma's query engine binary must be bundled into
  `dist/.../server.mjs` (Angular's build does not know about it); browser side
  still can't write. Connection lifecycle across build/dev-restart is messy.
- Verdict: wrong fit for a fully prerendered, single-route, hydration-driven app.

### Approach D (hybrid, recommended) — A now, structured for provider-switch

Approach A, plus explicit portability guardrails:

1. **Provider switch strategy**: Prisma's `datasource provider` is a **literal
   string**, not `env()`-driven — switching to Postgres means editing one line in
   `schema.prisma` + regenerating migrations. Two viable folder strategies:
   - **(D1) Single `prisma/migrations` regenerated on switch** — SQLite data is
     demo-scale (14 guests / 14 photos / 3 events); on Postgres you
     `migrate reset` + re-seed instead of porting SQLite-specific SQL. Cheapest,
     honest about demo data volume.
   - **(D2) Parallel folders** (`prisma/migrations/sqlite/`, `.../postgresql/`,
     selected via `--schema` variants or env-specific schema files
     `schema.sqlite.prisma` / `schema.postgresql.prisma`). More ceremony; only
     worth it if real production data will exist before the switch.
   **Recommendation: D1** unless proposal reveals production data before migration.
2. **No Prisma enums** (SQLite doesn't support them) → keep status fields as
   `String` + existing TS string-literal unions in `models.ts`. This already
   matches the codebase style, and `@prisma/client` types get mapped to the
   existing `readonly` domain interfaces at the repository boundary (never leak
   Prisma types into components).
3. **Where Prisma Client runs**: only inside the Node server process
   (`src/server.ts` / a `server/` API module). It must never be imported from any
   file reachable from `main.ts` — the browser bundle would break on native/query
   engine deps. Angular talks to it over HTTP.
4. **Connection lifecycle**: one `PrismaClient` singleton in the server module,
   lazy `$connect` on first query, `$disconnect` on shutdown. SQLite (`file:./dev.db`)
   needs no pooling; when Postgres arrives, the same singleton is correct for this
   traffic level (add a pool env var later).
5. **Render mode**: keep `Prerender` for the static shell and fetch in
   `afterNextRender` (browser-only), OR switch `/` to `RenderMode.Server` for
   per-request freshness. See open questions — this is the main product decision.
6. **Seed**: `prisma/seed.ts` reuses the exact records from
   `src/app/core/seed-data.ts` (import them, don't duplicate literals) wired via
   `prisma.seed` config / `npm run db:seed`.

## Recommended approach

**Approach D (A + portability guardrails), with D1 migration strategy.**

Rationale: the user's intent says "use the project's test data, move it to SQLite
with Prisma, *afterwards* migrate to PostgreSQL" — that is a runtime persistence
goal with a future provider switch, i.e. Approach A. D's guardrails (no enums, no
Prisma types outside the server, single-line provider switch, seed re-play
instead of migration porting) make the Postgres move a configuration event rather
than a rewrite. Approach C is rejected outright (prerender-vs-DB conflict);
Approach B is the fallback if the proposal phase decides runtime persistence is
out of scope for this change.

## Risks & unknowns

- **Prerender vs DB (biggest)**: `/` is baked at build time. Data fetched from
  SQLite will not be in the prerendered HTML → first paint shows seed/fallback or
  waits on fetch; wrong approach → hydration mismatch (this repo's archived
  `fix-role-screen-duplication` shows hydration bugs are expensive here).
- **`datasource provider` is a literal** → Postgres switch = schema edit +
  migration regen; SQLite-generated SQL will not apply to Postgres (mitigated by
  D1 reset+reseed; a real production dataset would break this assumption).
- **No FK from photo → guest** (author is a display name, sometimes a party
  member, sometimes mismatched). Schema must model this deliberately (`authorName`
  string vs `Attendee` table) — a naive FK will fail to seed.
- **No `eventId` on guests**; `PaseEvent.guests: 218` vs 14 seeded guests →
  schema needs an explicit `eventId` (seed all 14 to `ev1`) and counters must be
  redefined as queries or kept as denormalized fields.
- **SQLite file in git**: `dev.db` should be gitignored + recreated via
  `db:seed`; committing it would create constant binary churn (and the working
  tree is already dirty by design).
- **Test layer gap**: strict TDD requires tests per behavior, but there is no
  integration-test setup (jsdom + `@angular/build:unit-test` only;
  `openspec/config.yaml` has `layers.integration: false`). DB tests need a
  Node-environment vitest project and a temp/in-memory SQLite file — requires an
  openspec config change the orchestrator must approve.
- **`prisma generate` output location** must be excluded from the browser build
  (and committed or generated pre-build in CI — unknown until we pick generator
  settings; Prisma's newer `prisma-client` generator emits importable TS).
- **`tsconfig` is not fully strict** — Prisma's generated types +
  `noPropertyAccessFromIndexSignature` interaction should be verified after
  install.
- **Dev-server API routes**: Express routes added in `server.ts` are served in
  production; verify they also pass through `ng serve`'s dev-server handler
  (`@angular/build:dev-server` uses `reqHandler`) — expected yes, unverified.
- **Data volume** is trivial (14/14/3) — no performance risk now; counters and
  metrics must stay `computed()` on the client regardless.
- **Unrelated dirty files** must not be staged/committed by this change.

## Open questions for proposal

1. **Render mode**: keep build-time `Prerender` + client-side fetch after
   hydration, or move `/` to `RenderMode.Server` for per-request data? (Freshness
   vs static SSG; hydration-mismatch exposure.)
2. **Write semantics**: which mutations must persist (guest status, photo state,
   storage plan, pass pool), and should the simulated `FeedService` scans stay
   ephemeral?
3. **Migration folder strategy**: confirm D1 (regenerate + reset/reseed on
   Postgres switch) vs D2 (parallel sqlite/postgres schema + migrations) —
   depends on whether real data will exist before the switch.
4. **SQLite file policy**: gitignore + seed-on-setup (recommended) vs commit the
   `.db` for out-of-box reproducibility?
5. **Integration tests**: may `openspec/config.yaml` `testing.layers.integration`
   be flipped to `true` with a Node-env vitest project for repository tests?
6. **Catalogs**: do `GATES`, `STORAGE_PLANS`, `APP_STATES`, `USERS` move into DB
   tables, or stay constants (recommendation: stay constants in v1)?
7. **Env handling**: introduce `.env` + dotenv/`prisma` env loading (Prisma reads
   `.env` natively) and a `.env.example`?
8. **Seed source of truth**: `prisma/seed.ts` importing from
   `src/app/core/seed-data.ts` (recommended, zero duplication) — confirm that
   cross-boundary import direction is acceptable (server → app/core types only).
