# Design: persistence-prisma-sqlite

Technical approach for replacing the in-memory `PaseStore` seed with Prisma + SQLite behind an
Express REST API, structured so the PostgreSQL switch is a configuration event (exploration
Approach D/D1). All 7 proposal open questions are resolved below with rationale.

## 1. Resolved decisions (proposal §Open Questions)

| #   | Question                     | Decision                                                                                                                                                                                                                                                                                         |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | QR image format              | **PNG, server-side via the `qrcode` npm lib**; payload = absolute verify URL containing an opaque 256-bit token (see §6)                                                                                                                                                                         |
| 2   | Integration test layer       | **Approved**: flip `testing.layers.integration: true`; Node-env vitest project + per-test-file temp SQLite file (§8)                                                                                                                                                                             |
| 3   | Migration strategy           | **D1** — single `prisma/migrations`; Postgres switch = provider literal edit + fresh initial migration + reset-and-reseed                                                                                                                                                                        |
| 4   | Render mode                  | **Keep `Prerender` + post-hydration client fetch**; reject `RenderMode.Server` (§5)                                                                                                                                                                                                              |
| 5   | Dev `/api/*` passthrough     | **Standalone API process + dev proxy (approved deviation A1)** — `reqHandler` passthrough FAILED (CJS `__filename` crash in Angular's ESM SSR bundle, both dev and prod); `ng serve` now proxies `/api/*` to the API on `API_PORT` (default 3000) via `proxy.conf.json` (see deviation A1 below) |
| 6   | Postgres switch + BR-18 data | **Literal provider switch + reset-and-reseed**; distinguishable data via a `SystemSetting` seed-origin marker verified by `npm run db:verify` (§9)                                                                                                                                               |
| 7   | Provider UI vs admin UI      | **Defer the UI split**; scope API routes by role now so the future split is routing-only (§10)                                                                                                                                                                                                   |

Additional proposal questions (beyond the 7): env handling = `.env` (gitignored) + committed
`.env.example`, loaded by Prisma CLI natively and by `dotenv/config` at server runtime; catalogs
(`GATES`, `STORAGE_PLANS`, `APP_STATES`) stay constants in v1; `USERS` becomes real `User` records
only for role holders. Photo → guest: `authorName` plain string + **nullable** `authorGuestId` FK
(§3) — a naive FK would fail to seed (author names don't match guests; see exploration quirk).

### Deviation A1 (approved) — API hosting: standalone Node process, not the SSR server

**Original design (§2/§5):** mount `apiRouter` in `src/server.ts` before the Angular SSR
handler so `reqHandler` serves `/api/*` in dev and prod.

**Why it changed:** `better-sqlite3` is a CJS native module; Angular's esbuild SSR pipeline
converts it to ESM and its `bindings` loader throws `ReferenceError: __filename is not
defined` on every `/api/*` request in BOTH `ng serve` dev-SSR and the production
`server.mjs`. Integration tests stayed green because vitest loads CJS correctly — the
breakage is unique to the Angular bundling pipeline. The original documented fallback
(`proxyConfig` alone) assumed the SSR-hosted API worked standalone; it does not.

**Approved decision (user, option a):** the API runs as its own Node process, outside
Angular's bundler, in dev AND prod:

- **App composition:** `src/server/api/app.ts` → `createApiApp()` is the single
  `app.use('/api', apiRouter)` mount — shared by the standalone entry and the integration
  harness, so tests never need the Angular build.
- **Start command (dev = prod):** `npm run api:start` (`tsx src/server/api/main.ts`, run
  from the repo root so relative `DATABASE_URL` paths resolve — §12).
- **Port:** `API_PORT` env, default **3000**, documented in `.env.example` (3000 avoids
  the Angular SSR server's default port 4000 in `src/server.ts`).
- **Dev:** `angular.json` `serve.options.proxyConfig` → `proxy.conf.json` proxies
  `/api/* → http://localhost:3000`.
- **Prod:** `server.mjs` serves ONLY the Angular app; start the API process alongside it
  and route `/api/*` to it at the deployment layer (reverse proxy). The SSR bundle must
  not contain Prisma/better-sqlite3 — enforced by the bundle guard grep.

Tradeoff accepted: one extra process to run (operational simplicity: no bundler/native-module
fight, same command dev and prod) vs. option b (swap to a pure-JS/WASM adapter such as
`@prisma/adapter-libsql`), which would have changed the data layer mid-change and added a dep.
`src/server.ts` now carries a guard comment so the mount is not re-added.

## 2. Technical approach

Approach A + D guardrails, per exploration:

- **Prisma + SQLite**, `prisma/schema.prisma` + migrations + `prisma/seed.ts` importing the
  existing `src/app/core/seed-data.ts` records (no duplicated literals).
- **Express REST API** in a new `src/server/api/` module, hosted by a **standalone Node
  process** (`src/server/api/main.ts`, `npm run api:start`) — NOT the Angular SSR server
  (approved deviation A1, §1): Angular proxies `/api/*` to it in dev, deployments route
  `/api/*` to it in prod. Prisma Client lives **only** in that API process.
- **Angular `DataService`** (HttpClient) feeding `PaseStore` signals **after hydration**
  (`afterNextRender` + `isPlatformBrowser`, the `FeedService` pattern). Store mutation methods
  become API calls with optimistic signal updates (later slices).
- **Portability guardrails**: string status columns (no DB enums, validation at the app layer),
  Prisma types mapped to the existing `readonly` domain interfaces at the repository boundary,
  single-line provider switch + reset-and-reseed.
- **Authorization layer** is a dedicated module (`src/server/api/authz.ts`) with pure decision
  functions consuming a `CallerContext`; the context extractor (today: trusted header) is
  swappable later by an auth layer without touching decision logic (spec: "Authorization is
  separable from caller identity").

### Caller context (no auth in this change)

`CallerContext = { userId: string; role: 'provider' | 'admin' | 'security' }`. Today it is
resolved from a trusted `x-user-id` header: the server looks up the `User` row and takes the role
**from the DB, never from the client**. Replacing the extractor (JWT/session) later changes one
function; every `authz.*` call site stays untouched.

## 3. Prisma schema sketch (not final code)

```prisma
datasource db { provider = "sqlite" url = env("DATABASE_URL") }
generator client { provider = "prisma-client-js" } // verify generator choice at install

model User {
  id        String  @id                    // cuid
  name      String
  role      String                         // provider|admin|security — app-layer validated
  events    EventAssignment[]
  requested AdminRequest[] @relation("requestedBy")
}

model Event {
  id            String  @id
  name          String
  status        String                     // upcoming|active|finished
  start         DateTime                   // QR validity window only (BR-09/BR-14)
  end           DateTime
  retentionDays Int      @default(365)     // BR-15 policy metadata, provider-set
  note          String?
  assignments   EventAssignment[]
  guests        Guest[]
  photos        Photo[]
  checkIns      CheckIn[]
  qrs           QrToken[]
  adminRequests AdminRequest[]
}

model EventAssignment {                    // explicit join: users ↔ events, ≥1 admin per event
  eventId String
  userId  String
  event   Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
  user    User  @relation(fields: [userId], references: [id], onDelete: Restrict)
  @@id([eventId, userId])
  @@index([userId])
}

model Guest {
  id         String  @id
  eventId    String
  event      Event   @relation(..., onDelete: Cascade)
  name       String
  email      String
  phone      String
  table      Int
  note       String
  status     String                        // planned|sent|confirmed|declined
  active     Boolean @default(true)        // BR-13 admin soft toggle
  companions Companion[]
  qrs        QrToken[]
  @@index([eventId])
}

model Companion {
  id      String @id
  guestId String
  guest   Guest  @relation(..., onDelete: Cascade)
  name    String
  rel     String
  active  Boolean @default(true)
  qrs     QrToken[]
  @@index([guestId])
}

model Photo {                              // BR-16: metadata + external URL, no bytes
  id             String  @id
  eventId        String
  event          Event   @relation(..., onDelete: Cascade)
  url            String                    // opaque external reference (vendor-swappable)
  bigUrl         String?
  state          String                    // pending|approved|rejected
  downloaded     Boolean                   // legacy `dl`
  sizeKb         Int?
  height         Int?
  time           DateTime
  authorName     String                    // display name — matches current behavior + seed
  authorGuestId  String?                   // nullable FK, future upload-flow linking (deferred)
  authorGuest    Guest?  @relation(fields: [authorGuestId], references: [id], onDelete: SetNull)
  active         Boolean @default(true)
  @@index([eventId])
}

model QrToken {                            // BR-07..BR-11, BR-17
  id         String    @id
  tokenHash  String    @unique             // SHA-256 of raw token; raw returned once at issuance
  eventId    String
  event      Event     @relation(..., onDelete: Cascade)
  kind       String                        // guest|companion|emergency
  guestId    String?
  guest      Guest?    @relation(..., onDelete: Cascade)
  companionId String?
  companion  Companion? @relation(..., onDelete: Cascade)
  parentQrId String?                       // companion QR → owning guest QR (BR-07)
  issuedAt   DateTime  @default(now())
  consumedAt DateTime?                     // single-use marker (BR-08)
  @@index([eventId])
}

model CheckIn {
  id        String   @id
  eventId   String
  event     Event    @relation(..., onDelete: Cascade)
  qrId      String   @unique               // 1 check-in per consumed QR
  createdAt DateTime @default(now())
  active    Boolean  @default(true)        // BR-13
  @@index([eventId])
}

model AdminRequest {                       // BR-05 workflow, exactly pending|approved|rejected
  id              String   @id
  eventId         String
  event           Event    @relation(..., onDelete: Cascade)
  candidateUserId String
  requestedById   String
  status          String   @default("pending")
  decidedAt       DateTime?
  @@index([eventId, status])
}

model SystemSetting {                      // BR-18 provider/seed marker (§9)
  key   String @id
  value String
}
```

Key rules:

- **No Prisma enums anywhere** — all statuses are `String` with app-layer validation against the
  existing TS literal unions in `models.ts` (Postgres portability guardrail, spec scenario).
- **Cascade = "purge"** (BR-12): deleting an `Event` cascades to guests, companions (via guest),
  photos, check-ins, QRs, admin requests, and event assignments. `User` rows are **never**
  deleted (only their assignments cascade). Image **bytes on the external storage service are
  NOT purged** — only the URL references disappear; physical image deletion is the storage
  service's concern and is explicitly deferred.
- Companion scope for authorization resolves through `guest.eventId` (no denormalized
  `eventId` on Companion — data volume is trivial; avoid write-time invariants).
- Counters (`PaseEvent.guests/max/used`) are **not stored** — they become client `computed()`
  over fetched data (exploration: redefined as queries). **Resolved as:** `guests`/`photos` are
  returned by the API as real row counts (`_count`); the storage counters (`used`/`max`/`br`)
  have no server-side source at all, because the storage service does not exist yet (BR-16
  keeps image bytes on an external vendor), so they resolve **client-side from a display
  mock** holding the prototype's per-event figures — the API omits them and an event with no
  fixture renders an honest `—`. See the display-state cleanup section in `apply-progress.md`.

## 4. Data-access boundary + SSR/hydration strategy

```
Browser:   components → PaseStore (signals) → DataApiService (HttpClient) → HTTP /api/*  ✗ no Prisma
API proc:  main.ts → createApiApp() → apiRouter → authz.ts → repositories/* (Prisma↔domain mapping) → PrismaClient → SQLite
SSR (Angular): server.ts → static + AngularNodeAppEngine only  ✗ no Prisma, no /api mount (deviation A1)
```

- `src/server/data/prisma-client.ts`: lazy singleton (`$connect` on first query, `$disconnect`
  on shutdown). Imported only from `src/server/**`; `src/app/**` imports the HTTP service only.
- Repositories map Prisma models → the existing `readonly` domain interfaces from
  `models.ts`; Prisma types never leak past the repository boundary.
- **Bundle guard**: a verification task greps `dist/browser` for `@prisma` / query-engine
  artifacts after `ng build` (proposal success criterion).
- **Render mode: keep `Prerender`** (`app.routes.server.ts` unchanged). Rationale: (a) prerender
  must never touch the DB — a build-time DB dependency breaks CI and bakes stale data
  (exploration Approach C rejection); (b) `RenderMode.Server` would couple every request to
  Prisma in the SSR bundle and still need TransferState/HTTP-cache plumbing to keep hydration
  consistent — more moving parts for a non-SEO admin dashboard; (c) this repo has expensive
  NG0502 hydration scars. Hydration safety comes from **identical initial state**: the store
  starts in a `loading` state on both server and client; only `afterNextRender` (browser-only)
  fires the fetch and flips the signals. Acceptance: zero NG0500/NG0502 on load.

```mermaid
sequenceDiagram
  participant Build as Prerender (build time)
  participant Browser
  participant API as Express /api
  Build->>Browser: static HTML, store = loading (no DB access)
  Browser->>Browser: hydration completes (states match)
  Browser->>API: afterNextRender → GET /api/...
  API->>API: authz (CallerContext) → repository → Prisma
  API-->>Browser: JSON
  Browser->>Browser: store signals updated (no hydration involvement)
```

## 5. API surface outline (authz per route group)

`src/server/api/` composed once in `src/server/api/app.ts` (`createApiApp()`) and served by
the standalone API process (`npm run api:start`, port `API_PORT`=3000); `ng serve` proxies
`/api/*` to it and prod routes `/api/*` to it at the deployment layer (§1 deviation A1).
`CallerContext` middleware resolves the user from `x-user-id`; every route declares
its role + scope check:

| Route                                                      | Roles                                                      | Scope check                                             |
| ---------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------- |
| `GET /api/health`                                          | any                                                        | none (smoke/passthrough check, returns provider marker) |
| `GET /api/events`                                          | provider: all; admin/security: assigned only               | list filter by assignments                              |
| `POST /api/events`                                         | provider only (BR-02)                                      | role + ≥1 admin required                                |
| `GET /api/events/:id`                                      | provider any; admin/security assigned                      | event scope (BR-03)                                     |
| `PATCH /api/events/:id`                                    | provider only (retention, status)                          | role                                                    |
| `DELETE /api/events/:id` (purge)                           | provider + `status=finished` (BR-12)                       | role + state check                                      |
| `GET/POST /api/events/:id/guests`                          | read: provider any / assigned admin; write: assigned admin | object-level on `:id` (BR-04)                           |
| `PATCH /api/guests/:id` (status/active)                    | assigned admin (BR-13: toggle, never delete)               | resolve `guest.eventId`, compare                        |
| `GET/POST /api/events/:id/photos`, `PATCH /api/photos/:id` | read: provider/assigned admin; write: assigned admin       | object-level via `photo.eventId`                        |
| `POST /api/check-ins`                                      | assigned security/admin                                    | token → event; caller must be assigned to that event    |
| `POST /api/events/:id/qr` (incl. `kind=emergency`, BR-10)  | assigned admin                                             | event scope                                             |
| `GET /api/qr/verify/:token`                                | assigned security/admin                                    | token resolves event; caller assigned to it             |
| `GET /api/qr/image/:token`                                 | assigned admin                                             | scope                                                   |
| `POST /api/events/:id/admin-requests`                      | assigned admin (BR-05)                                     | scope + role                                            |
| `PATCH /api/admin-requests/:id`                            | provider only (approve/reject)                             | role; admin self-approve rejected                       |
| `GET /api/events/:id/members`                              | provider any; assigned admin (BR-06)                       | scope                                                   |
| `POST /api/events/:id/members`                             | assigned admin (create security)                           | scope + role; provider forbidden                        |

Role grouping in the URL space (events vs standalone object IDs) is deliberate: it keeps the
future provider/admin UI split a routing-only change (§10).

## 6. QR design (open question 1)

- **Token**: `crypto.randomBytes(32).toString('base64url')` — 256-bit, URL-safe, opaque, no PII
  by construction (BR-11/BR-17). **Stored as SHA-256 hash** under `QrToken.tokenHash`
  (`@unique`); the raw token is returned exactly once at issuance. No JWT/auth — tokens are
  stored records resolved by lookup.
- **Payload content**: the absolute URL `<WEB_BASE_URL>/verify/<rawToken>` — stable, emailable
  as-is (email transport itself is a Non-Goal).
- **Image**: server-side PNG via the `qrcode` npm package (pure JS + pngjs, no native deps;
  note `qrcode-generator` is already a _client_ dep and stays untouched — it cannot render PNG
  buffers in Node). `QRCode.toBuffer(verifyUrl, { type: 'png', width: 512, margin: 2 })`.
- **Endpoints**: issuance returns `{ token, verifyUrl }`; `GET /api/qr/image/:token` streams
  `image/png` so clients or email templates embed the image URL.
- **Single-use** (BR-08): check-in runs in one `prisma.$transaction` — conditional update
  (`consumedAt: null → now()`) + `CheckIn` create with `@unique qrId`; a second scan affects
  zero rows → rejected "already used", no second record.
- **Expiry** (BR-09): checked against `event.end` at scan time for guest, companion, and
  emergency QRs alike.

## 7. Client wiring (slice scope)

- `src/app/core/api/data-api.service.ts`: typed HttpClient calls, `providedIn: 'root'`.
- `PaseStore` gains `load()` called from `afterNextRender` in the root component (browser-only);
  signals keep their current shape so `metrics.ts`/`computed()` consumers don't change.
- Mutations stay in-memory until PR-2 wires them as optimistic API calls (keeps slice 1 honest
  and small). `seed-data.ts` + `metrics.spec.ts` remain intact until PR-4 cleanup.

## 8. Testing strategy (open question 2) — strict TDD

**Layer split**:

- **Unit (jsdom, `ng test --watch=false`)** — unchanged scope: components, `computed()` logic,
  plus new `DataService`/`PaseStore.load()` tests with `provideHttpClientTesting` (mock backend).
- **Integration (node env, new)** — everything DB- or authz-facing: repositories, all BR
  server-enforcement scenarios (they exercise Prisma + Express together), QR transaction
  semantics, cascade/purge behavior.

**Exact `openspec/config.yaml` diff** (documented here; executed in the apply/tasks stage, NOT by
this design):

```diff
 testing:
   layers:
     unit: true
-    integration: false
+    integration: true
     e2e: false
+  integration_test_command: "npm run test:int"
```

(and the `context:` Testing line updated from "unit only" to mention the integration layer;
`test_command` stays `ng test --watch=false`).

**Node-env project**: `vitest.integration.config.ts` at repo root:

```ts
export default defineConfig({
  test: {
    include: ['src/server/**/*.int.spec.ts'],
    environment: 'node',
    pool: 'forks', // vitest isolates test files in separate workers
    testTimeout: 20_000,
  },
});
```

**DB isolation**: per **test file**, not per test —
`src/server/testing/integration-harness.ts` in `beforeAll`:

1. `dir = await mkdtemp(join(tmpdirdir(), 'qr-int-'))`
2. `process.env['DATABASE_URL'] = 'file:' + join(dir, 'test.db')` (temp **file**, not
   in-memory — Prisma SQLite `file::memory:?cache=shared` support is unreliable; a temp file is
   the portable, verifiable choice)
3. `execFileSync('npx', ['prisma', 'migrate', 'deploy'], { cwd: repoRoot, env: process.env })` —
   this simultaneously isolates the DB **and** verifies the real migrations apply cleanly
4. Build the API on an ephemeral port (`app.listen(0)`) and exercise it with global `fetch`
   (Node 20 — no supertest dependency)
   `afterAll`: `$disconnect` + `rm -rf dir`. `beforeEach`: a `resetDatabase()` helper
   (`deleteMany` in FK-safe order) — cheap at this data scale. Each worker file having its own temp
   DB makes cross-file parallelism safe.

**npm scripts** (added in PR-1a; existing `"test": "ng watch"` left untouched):

```json
"test:unit": "ng test --watch=false",
"test:int":  "vitest run --config vitest.integration.config.ts",
"test:all":  "npm run test:unit && npm run test:int",
"db:migrate": "prisma migrate dev",
"db:seed": "prisma db seed",
"db:reset": "prisma migrate reset --force",
"db:verify": "tsx scripts/verify-db-provider.ts"
```

**Strict TDD coexistence**: the RED/GREEN loop picks the layer by subject — client behavior
fails in `ng test`, server/BR behavior fails in `test:int`; a task is done only when
`test:all` + prettier + `ng build` are green. Add `tsx` devDep (Node 20 can't strip types).

## 9. Seed & fixtures + Postgres path (open question 6)

**Seed** (`prisma/seed.ts`, wired via `package.json` `"prisma": { "seed": "tsx prisma/seed.ts" }`):

- **Imports** `GUESTS`, `PHOTOS`, `EVENTS`, `USERS` from `src/app/core/seed-data.ts` — pure
  data, no Angular imports, so a server→app/core import is acceptable (exploration Q8 confirmed
  by intent; verify at implementation that `seed-data.ts` imports nothing Angular-specific).
- **Deterministic explicit IDs** (`ev-001`, `g-001`… `ph-001`…) instead of cuids → reproducible
  fixtures, stable integration-test references, and `db:reset && db:seed` is idempotent.
- **Mappings**: all 14 guests → `eventId: 'ev-001'` (they implicitly belonged to demo event
  `ev1`); `party: [{name, rel}]` → `Companion` rows; `PaseEvent.admin`/`security` →
  `User` + `EventAssignment`; `photo.author` → `authorName` (no FK — see §3); `dateLabel` is
  **dropped** (client formats from `start`/`end` DateTime); the display counter `guests: 218`
  is **not** persisted.
- Seed writes `SystemSetting { key: 'seed:origin', value: <active provider> }` (BR-18).

**Postgres switch mechanics** (executed later, verified now):

> Dry-run runbook with exact commands, the `db:verify` contract and the rollback path:
> `prisma/POSTGRES-SWITCH.md` (🚧 out-of-change — no step has been executed).

1. `schema.prisma`: `provider = "sqlite"` → `"postgresql"` (one literal).
2. `.env`: `DATABASE_URL` `file:./dev.db` → `postgresql://user:pass@host:5432/qr_control`.
3. D1 migration story: archive/delete `prisma/migrations`, run `prisma migrate dev --name init`
   against Postgres (SQLite-generated SQL will not apply there — accepted, demo-scale data),
   then `db:reset && db:seed`.
4. Runtime config: `src/server/data/config.ts` (Node-only) validates `DATABASE_URL` presence and
   shape; `dotenv/config` imported at the top of the server data module (Prisma Client does not
   auto-load `.env` at runtime; the Prisma CLI does).

**BR-18 distinguishable data**: the seed stamps `seed:origin = 'sqlite' | 'postgresql'` **from
the datasource provider string at seed time**. `npm run db:verify` asserts the marker equals the
provider currently configured in `schema.prisma`; integration tests assert the marker exists in
every seeded test DB. This makes the active provider observable _in the data itself_, exactly as
the spec scenario demands, with one tiny table and zero vendor lock-in.

## 10. Provider UI vs admin UI (open question 7)

**Defer the UI split.** Rationale: there is no authentication (Non-Goal) — "who the caller is"
today is a dev-console header, so separate provider/admin route trees would be cosmetic
choreography duplicated across two view hierarchies and would double the `DataService` surface
before the server authorization layer (PR-2) even exists. What we do _now_ is the part that
actually matters: the API is role-scoped (§5), so when auth lands, the UI split is pure routing

- component reuse. The current `provider-view`/`admin-view` components keep working against the
  same store.

## 11. PR/slice split (400-line budget; chained-pr rules apply)

Slice 1 **can** be split — the pre-approved `size:exception` is therefore **not consumed**:

| PR     | Contents                                                                                                                                                                                 | Est. lines (incl. tests) | Sub-split risk                                                                                                |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| **1a** | Prisma deps + schema + initial migration + `.gitignore`(`.db`) + `.env.example` + dotenv wiring + config.yaml flip + `vitest.integration.config.ts` + harness + 1 smoke integration test | ~250–350                 | Schema+SQL are declarative; **if >400, the exception applies here** (schema ≈150 + SQL ≈100 are review-light) |
| **1b** | `prisma/seed.ts` + `db:seed`/`db:reset` scripts + `SystemSetting` marker + seed integration tests                                                                                        | ~200–300                 | low                                                                                                           |
| **1c** | Read-only GET endpoints + repositories + `CallerContext` + authz skeleton + integration tests (fetch on ephemeral port)                                                                  | ~300–400                 | borderline; split routes/tests if it balloons                                                                 |
| **1d** | Client `DataService` + `PaseStore.load()` + hydration-safe `afterNextRender` wiring + unit tests (mock HTTP)                                                                             | ~250–350                 | low                                                                                                           |
| **2a** | Write endpoints + full authz enforcement (BR-02–04, BR-06, BR-13 toggles) + integration tests                                                                                            | ~350–450                 | **likely needs sub-split** (authz tests balloon — split by route group)                                       |
| **2b** | Client mutation wiring (optimistic signal updates)                                                                                                                                       | ~200–300                 | low                                                                                                           |
| **3a** | Second-admin approval workflow (BR-05)                                                                                                                                                   | ~250–350                 | low                                                                                                           |
| **3b** | QR issuance + check-in + verify/image endpoints + emergency QRs (BR-07–11, BR-17)                                                                                                        | ~350–450                 | **borderline**; if >400, split verify/image read path from issuance/write                                     |
| **4**  | Retention + provider purge (BR-12, BR-14, BR-15) + BR-18 `db:verify` + Postgres-switch dry-run doc + `seed-data.ts` runtime decoupling + bundle-grep check                               | ~300–400                 | low                                                                                                           |

## 12. Risks & mitigations

| Risk                                                                         | Mitigation                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hydration mismatch (NG0500/0502 scars)                                       | Identical `loading` initial state server+client; fetch only in `afterNextRender`; acceptance = zero NG05xx on load                                                                                                                                                                                              |
| SSR-hosted `/api/*` crashes (native CJS `better-sqlite3` vs Angular ESM SSR) | **Resolved — deviation A1 (§1):** API runs as a standalone process (`npm run api:start`, port 3000); `ng serve` proxies `/api/*` via `proxy.conf.json`; `server.mjs` no longer imports Prisma (bundle-guard grep = 0 in browser + server bundle). Smoke: direct 200, proxy 200, 502 on API stop, 200 on restart |
| SQLite FK cascade off → purge doesn't cascade                                | Prisma enables `PRAGMA foreign_keys=ON` by default; an integration test _proves_ purge deletes all scoped rows — if it fails, add the pragma to the initial migration                                                                                                                                           |
| Prisma types leak / browser bundle breaks                                    | Import boundary `src/server/**` only; `ng build` + grep `dist/browser` for `@prisma`/query-engine (task in PR-4, checked per PR)                                                                                                                                                                                |
| `tsconfig` not fully strict + Prisma generated types                         | `npx tsc --noEmit` after install (PR-1a); fix generator settings if `noPropertyAccessFromIndexSignature` conflicts                                                                                                                                                                                              |
| Integration harness slow (migrate deploy per file)                           | Accept ~2–5 s/file at demo scale; fallback: pre-built template DB copied per worker (only if measured slow)                                                                                                                                                                                                     |
| Dirty working tree                                                           | Additive paths only (`prisma/`, `src/server/`, `src/app/core/api/`); never stage/commit; `seed-data.ts` untouched until PR-4                                                                                                                                                                                    |
| `qrcode` lib adds a dep                                                      | Server-only, pure JS (pngjs), no native build; verify license (MIT) at install                                                                                                                                                                                                                                  |

## 13. Explicitly deferred

- Authentication/login/sessions (separate stage; authz seam designed for it).
- Provider vs admin **UI** split (API role-scoped now; §10).
- Real email transport; physical image deletion on the storage service (BR-16 boundary).
- DB tables for `GATES`/`STORAGE_PLANS`/`APP_STATES` catalogs (stay constants in v1).
- Executing the Postgres switch (this change only guarantees it is verifiable — BR-18).
- Photo `authorGuestId` population (column exists, nullable, until a real upload flow defines it).
- HTTP transfer cache / SSR-fresh data optimization (rejected Render mode, revisit if the app
  ever becomes public-facing).
