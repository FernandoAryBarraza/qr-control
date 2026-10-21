# Tasks: persistence-prisma-sqlite

Phase: `sdd-tasks` (ENGLISH). Ordered, dependency-aware work units following the design's PR
split (design §11). Strict TDD is ACTIVE: every behavior task carries an explicit test-first
(RED → GREEN) note, with the layer chosen by subject (client → `ng test`, server/DB/authz →
`npm run test:int`).

> **Chain context (chained-pr skill):** stacked PRs to main; every slice below is additive and
> independently landable. Each PR section marks its position with 📍.
>
> ```
> PR-1a → PR-1b → PR-1c → PR-1d → PR-2a → PR-2b → PR-3a → PR-3b → PR-4
> ```

---

## Review Workload Forecast

**Budget definition (user override, authoritative): "400 lines = code only, excluding comments
and blank lines."** Every estimate below counts only code lines (source, templates, SQL, config
entries); comments and blank lines are EXCLUDED — this is the number the 400-line risk is
evaluated against.

| PR        | Scope (short)                                          | Est. code lines (excl. comments/blank) | 400-line risk |
| --------- | ------------------------------------------------------ | -------------------------------------- | ------------- |
| 1a        | Prisma scaffold + schema + integration harness + flip  | ~230–320                               | **Medium**    |
| 1b        | Seed from `seed-data.ts` + provider marker             | ~170–250                               | Low           |
| 1c        | Read-only GETs + repositories + CallerContext + authz  | ~260–350                               | **Medium**    |
| 1d        | Client `DataService` + hydration-safe read path        | ~210–300                               | Low           |
| 2a        | Authorization + write endpoints (BR-02–04, 06, 13)     | ~300–400                               | **High**      |
| 2b        | Client mutation wiring (optimistic updates)            | ~170–250                               | Low           |
| 3a        | Second-admin approval workflow (BR-05)                 | ~210–300                               | Low           |
| 3b        | QR issuance/check-in/verify/image (BR-07–11, 17)       | ~300–400                               | **High**      |
| 4         | Retention + provider purge + BR-18 verify + decoupling | ~260–340                               | **Medium**    |
| **Total** |                                                        | **~2110–2960**                         | —             |

- **400-line budget risk per PR:** as in the table — High: `2a`, `3b`; Medium: `1a`, `1c`,
  `4`; Low: `1b`, `1d`, `2b`, `3a`. Risk is evaluated against CODE LINES ONLY (comments and
  blank lines excluded).
- **Chained PRs recommended: Yes.** Suggested split: the 9-PR stack above, stacked to main
  (order fixed by dependencies). PRs likely to need sub-splitting: **PR-2a** (split by route
  group — `2a-i` events+guests+authz vs `2a-ii` photos+members+toggles), **PR-3b** (split
  `3b-i` issuance/check-in writes from `3b-ii` verify/image reads), and watch **PR-1c** (split
  route groups if it balloons past ~400 code lines). The pre-approved `size:exception` is
  **NOT consumed by this plan** (slice 1 is split as design found possible); it remains a
  documented fallback ONLY for `1a` / `2a` / `3b` if sub-splitting proves infeasible
  (e.g. schema+SQL in 1a landing irreducibly over budget — note schema/SQL are review-light).
- **Decision needed before apply: No.** All 7 design questions are resolved (design §1) and the
  `openspec/config.yaml` integration flip is pre-approved (design decision 2). The only
  confirmation expected at PR-creation time is the chain strategy (stacked-to-main vs
  feature-branch chain with tracker), which `delivery_strategy: ask-always` surfaces anyway.
  See also the non-blocking orchestrator note in the ground rules (spec requirement count).

---

## Ground rules (apply to every PR)

1. **Working-tree guard:** this phase touches ONLY this `tasks.md`. During apply, stay on
   additive paths (`prisma/`, `src/server/`, `src/app/core/api/`, `scripts/`, `openspec/`).
   Never stage or commit the unrelated dirty files (`event-hero.ts`, `guest-detail.ts`,
   `metrics-section.ts`, `stat-tile.ts`, `photo-cloud.ts`, `topbar.css`, `qr-ticket-modal.ts`,
   `styles.css`, and the _prior_ `package.json` modifications — `package.json` may receive
   **appended** script/dep entries only; existing uncommitted content stays as-is).
2. **Definition of Done per task:** its RED test exists first (where behavior is involved), the
   implementation turns it green, then the PR-level verification gate passes:
   `npm run test:unit && npm run test:int && npx prettier --check . && npx tsc --noEmit -p tsconfig.app.json && ng build`.
3. **Commands:** unit = `npm run test:unit` (`ng test --watch=false`, jsdom); integration =
   `npm run test:int` (node env, `vitest.integration.config.ts`, per-test-file temp SQLite);
   both = `npm run test:all`.
4. **Git work-unit commits (work-unit-commits skill):** commit by _work unit_, never by file
   type; tests + docs land in the same commit as the behavior they verify; conventional
   commits; **NO `Co-Authored-By` or AI attribution**; each commit message states the outcome,
   not the file list; every commit must leave the repo sensible on its own. Verify the story
   with `git diff --stat` before committing. Per-PR example commit sequences are given below.
5. **Rollback:** each PR is one revert boundary — reverting the PR's commits restores the
   previous PR's behavior without touching unrelated work. `.db` files are gitignored → no
   binary revert noise.
6. **Blocked / decision markers:** ⚠️ = needs orchestrator/user input; 🚧 = blocked until a
   prior task completes.

---

## 📍 PR-1a — Prisma scaffold + schema + integration harness + config flip

**Starts:** no Prisma, no DB, no integration layer, `src/server.ts` placeholder intact.
**Finishes:** schema + initial migration committed, temp-SQLite integration harness proven by a
green `GET /api/health` smoke test, `openspec/config.yaml` integration layer flipped, dev
passthrough verified with curl.
**Out of scope:** seed data (1b), domain GETs (1c), client wiring (1d), any behavior BRs.
**Dependencies:** none (chain root). **Rollback boundary:** remove `prisma/`, `src/server/`,
revert `server.ts` mount + config/scripts additions → today's behavior.

Dependency position: `📍 1a → 1b → 1c → 1d → 2a → 2b → 3a → 3b → 4`

- [x] **1a.1** Flip the integration layer in `openspec/config.yaml` exactly per design §8:
      `testing.layers.integration: false → true`, add
      `integration_test_command: "npm run test:int"`, and update the `context:` Testing line
      from "unit only" to mention the integration layer (`test_command` stays
      `ng test --watch=false`). _(Non-code; pre-approved — design decision 2.)_
- [x] **1a.2** Add `*.db` and `.env` to `.gitignore` so SQLite files and local env never enter
      the index (proposal §What Changes 1; exploration "SQLite file in git" risk).
- [x] **1a.3** Create `.env.example` with `DATABASE_URL="file:./dev.db"` and
      `WEB_BASE_URL="http://localhost:4200"` (the QR verify-URL base, design §6); copy it to a
      local gitignored `.env`. _(Env sample task; design §1 additional questions.)_
- [x] **1a.4** Install dev deps `prisma`, `@prisma/client`, `tsx` and run
      `npx prisma generate`; record generator choice in the PR notes (design §3 comment:
      "verify generator choice at install"). Append-only edits to `package.json`.
- [x] **1a.5** Create `prisma/schema.prisma` per design §3: all 10 models (`User`, `Event`,
      `EventAssignment`, `Guest`, `Companion`, `Photo`, `QrToken`, `CheckIn`, `AdminRequest`,
      `SystemSetting`), **string status columns only — no Prisma enums**, explicit
      `eventId` FKs with `onDelete: Cascade`, `Photo.authorName` + nullable `authorGuestId`,
      `retentionDays @default(365)`, indexes per sketch.
      _Traces: BR-01, BR-14/BR-15 (fields only), BR-16 → spec req 1, req 13, req 14, req 16
      (portability guardrail: no enums)._
- [x] **1a.6** Generate the initial migration `prisma/migrations/*_init/migration.sql` via
      `npx prisma migrate dev --name init`. 🚧 after 1a.5.
- [x] **1a.7** Run `npx tsc --noEmit` immediately after install and fix generator/tsconfig
      friction (`noPropertyAccessFromIndexSignature` interaction — design §12 risk row).
      If a fix requires changing global tsconfig behavior, stop → ⚠️ escalate.
- [x] **1a.8** Append npm scripts to `package.json` (design §8): `test:unit`, `test:int`,
      `test:all`, `db:migrate`, `db:seed`, `db:reset`. **Note:** `db:verify` is deliberately
      deferred to PR-4 (its script file lands there) to avoid a broken npm script — documented
      deviation from the design §8 one-shot list.
- [x] **1a.9** Create `vitest.integration.config.ts` at repo root: include
      `src/server/**/*.int.spec.ts`, `environment: 'node'`, `pool: 'forks'`,
      `testTimeout: 20_000` (design §8).
- [x] **1a.10** Create the integration harness `src/server/testing/integration-harness.ts`:
      `mkdtemp` dir, `process.env['DATABASE_URL'] = 'file:<dir>/test.db'`, `execFileSync('npx',
['prisma','migrate','deploy'])`, build the API on `app.listen(0)`, expose global `fetch`
      helper; `afterAll` `$disconnect` + `rm -rf`; `beforeEach` `resetDatabase()` (FK-safe
      `deleteMany` order). _(Test infrastructure — no RED required; it is first proven by
      1a.11.)_
- [x] **1a.11** **Test-first (RED → GREEN):** write `src/server/api/health.int.spec.ts` first
      (asserts 200 + provider marker through the harness), then implement
      `src/server/api/index.ts` (router), `src/server/data/config.ts` (dotenv + `DATABASE_URL`
      validation), `src/server/data/prisma-client.ts` (lazy singleton, `$connect`/`$disconnect`),
      and mount `app.use('/api', apiRouter)` in `src/server.ts` **before** the SSR handler.
      _(Non-BR smoke route per design §5; proves harness + mount point.)_
- [x] **1a.12** **Dev passthrough smoke (manual) — REMEDIATED (standalone API process,
      approved option a):** First attempt (`ng serve` + `curl http://localhost:4200/api/health`
      expecting the provider marker, design decision 5) FAILED with
      `ReferenceError: __filename is not defined` per request in BOTH `ng serve` dev-SSR and
      the production `server.mjs` bundle — root cause: `better-sqlite3`'s CJS `bindings`
      loader (`node_modules/bindings/bindings.js:156`) inside Angular's esbuild ESM SSR
      pipeline. The documented `proxyConfig` fallback alone would NOT fix it (the
      SSR-hosted API cannot run standalone either). Integration tests stayed GREEN because
      vitest loads CJS correctly — the breakage is specific to Angular's bundling pipeline.
      **APPROVED DECISION (user, option a):** the API runs as a **standalone Node process
      outside Angular's bundler** (dev and prod); Angular proxies `/api/*` to it:

      - `src/server/api/app.ts` → `createApiApp()` — the single `/api` mount, shared by the
        standalone entry and the integration harness (router stays importable standalone;
        tests never need the Angular build);
      - `src/server/api/main.ts` — entry started with `npm run api:start`
        (`tsx src/server/api/main.ts`, run from the repo root), listens on `API_PORT`,
        default **3000** (documented in `.env.example`; avoids the SSR server's default
        port 4000);
      - `proxy.conf.json` + `angular.json` `serve.options.proxyConfig` →
        `/api → http://localhost:3000` (dev);
      - `src/server.ts` — `/api` mount REMOVED: the SSR server no longer imports
        Prisma/better-sqlite3 at all (re-verified by bundle guard);
      - prod: `server.mjs` serves only the Angular app; start the API with
        `npm run api:start` alongside it and route `/api/*` to it at the deployment layer
        (reverse proxy) — documented in design §1 deviation A1.
      **Verification (evidence in `apply-progress.md` §1a.12-remediation):**
      direct `curl localhost:3000/api/health` → 200 `{"status":"ok","provider":"sqlite"}`;
      via `ng serve` proxy `curl localhost:4200/api/health` → same 200; API stopped →
      proxy returns 502 + `vite http proxy error ... ECONNREFUSED` (proves routing),
      restart → 200 (recovery); prod `server.mjs` boots with 0 `__filename` errors;
      bundle guard 0 matches in `dist/qr_control/browser/` AND in
      `dist/qr_control/server/server.mjs` (Angular 22 nests the server bundle one level
      deeper than this task's `dist/qr_control/server.mjs` path).

- [x] **1a.13** Run the PR verification gate (ground rule 2) plus a quick bundle guard:
      grep `dist/browser` for `@prisma`/query-engine artifacts → zero matches.

**Suggested work-unit commits (conventional, no attribution):**

1. `chore(persistence): enable integration test layer and db hygiene files` (1a.1–1a.3, 1a.8)
2. `feat(persistence): add Prisma SQLite schema and initial migration` (1a.4–1a.7)
3. `test(persistence): add node-env integration harness and health smoke` (1a.9–1a.12)

**PR-1a apply verification (sdd-apply, strict TDD):** `npm run test:all` = 73 unit + 1
integration green (1a.11 RED→GREEN captured: missing-router module error → 200 +
`{status:'ok', provider:'sqlite'}`); `npx tsc --noEmit -p tsconfig.app.json` clean;
`ng build` clean (prerender 1 route, no NG05xx); bundle guard
`grep -ril '@prisma|query.engine|query_compiler' dist/qr_control/browser/` → **0 matches**
(Angular 22 output nests under `dist/qr_control/browser`, not `dist/browser`).
Code-line count ≈ 401 excluding comments/blank (schema 119 + SQL 121 are the review-light
bulk per design §11). **Recorded deviations:** Prisma 7 (stable 7.10.1 pair; the `latest`
tag resolved to an 8.0.0-rc CLI — pinned to match the client) — generator
`prisma-client` (init default, output `src/generated/prisma`, gitignored),
`prisma7.config.ts` owns the datasource URL (schema has no `url = env(...)` line),
driver adapter `@prisma/adapter-better-sqlite3` is now REQUIRED (Prisma 7 dropped
no-adapter connections), Node `process.loadEnvFile()` used instead of `dotenv`, and
`angular.json` test builder gained `exclude: ["src/server/**"]` so `ng test` does not
discover `*.int.spec.ts`. 1a.12 first attempt blocked (SSR `__filename` crash), then
REMEDIATED via the user-approved standalone API process — see task note.

---

## 📍 PR-1b — Seed from `seed-data.ts` + provider marker

**Starts:** empty-but-migrated DB. **Finishes:** `npm run db:reset && npm run db:seed`
reproducibly loads all demo records with deterministic IDs and stamps the BR-18 marker.
**Out of scope:** endpoints (1c), client (1d). **Dependencies:** PR-1a.
**Rollback boundary:** delete `prisma/seed.ts` + prisma seed config; DB file is disposable.

Dependency position: `1a → 📍 1b → 1c → 1d → 2a → 2b → 3a → 3b → 4`

- [x] **1b.1** Verify `src/app/core/seed-data.ts` imports nothing Angular-specific (design §9;
      exploration Q8). ⚠️ If it does, stop → decision needed (extract pure data vs thin
      re-export) before proceeding. _(✅ verified: type-only import of `./models`, whose own
      `./shared/icons` import is also type-only and resolves to `lucide` — zero `@angular`
      imports in the whole chain; runtime import graph of seed-data.ts is empty.)_
- [x] **1b.2** **Test-first (RED):** write `src/server/data/seed.int.spec.ts` asserting, on a
      fresh temp DB after seeding: 3 events, 14 guests all on `ev-001`, companion rows from
      `party`, 14 photos with `authorName` (no FK failures), `User` + `EventAssignment` rows
      for each event's admin/security, and `SystemSetting['seed:origin']` present **and equal
      to the provider string in `schema.prisma`**. _Traces: BR-16 → spec req 14; BR-18 →
      spec req 16._ _(✅ RED captured: vitest failed on the unresolved `prisma/seed` import;
      GREEN: 8/8 int — 7 seed tests + the health smoke.)_
- [x] **1b.3** Implement `prisma/seed.ts`: import `GUESTS`, `PHOTOS`, `EVENTS`, `USERS` from
      `src/app/core/seed-data.ts` (import, never duplicate literals); deterministic explicit
      IDs (`ev-001`, `g-001`…, `ph-001`…); mappings per design §9 (guests → `ev-001`;
      `party` → `Companion`; `PaseEvent.admin`/`security` → `User` + `EventAssignment`;
      `photo.author` → `authorName`; drop `dateLabel`; do NOT persist the `guests: 218`
      display counter); stamp `SystemSetting { key: 'seed:origin', value: <active provider> }`
      read from the datasource provider at seed time (BR-18). _(✅ Also: `usr-001`… for the
      13 deduped role holders, `c-001`… for companions; client `done` → server `finished`
      status per spec req 11; `start`/`end` derived from `dateLabel` (UTC) with an 8h demo
      duration — see apply-progress §1b for the recorded decisions.)_
- [x] **1b.4** Wire `package.json`: `"prisma": { "seed": "tsx prisma/seed.ts" }`; verify
      `npm run db:reset && npm run db:seed` is idempotent (run twice) and that `*.db` stays
      untracked (`git status`). _(✅ Deviation per 1a note 5: Prisma 7 reads the seed command
      from `prisma7.config.ts` `migrations.seed`, not the package.json `prisma.seed` key —
      wired there; `db:seed` run twice on dev.db → identical counts 3/14/19/14/13/12,
      marker `sqlite`; `git status` shows no `*.db`.)_
- [x] **1b.5** Run the PR verification gate (ground rule 2). _(✅ unit 73/73; int 8/8;
      `tsc --noEmit -p tsconfig.app.json` + `-p tsconfig.spec.json` exit 0; `ng build` exit 0,
      prerender 1 route; prettier clean on all 1b files; smoke `GET /api/health` → 200.)_

**Suggested work-unit commits:**

1. `test(persistence): add seed replay assertions and provider marker spec` (1b.2)
2. `feat(persistence): seed SQLite from seed-data with provider origin marker` (1b.1, 1b.3–1b.4)

---

## 📍 PR-1c — Read-only GET endpoints + repositories + CallerContext + authz skeleton

**Starts:** seeded DB, no HTTP surface beyond `/api/health`. **Finishes:** role-aware read
endpoints returning domain-shaped JSON; cross-event read rejected server-side.
**Out of scope:** all writes, object-level write enforcement, members endpoints, QR routes
(2a+). **Dependencies:** PR-1b (data to read).
**Rollback boundary:** revert route/repo/authz commits → only `/api/health` remains; client
untouched (1d not started).

Dependency position: `1a → 1b → 📍 1c → 1d → 2a → 2b → 3a → 3b → 4`

- [x] **1c.1** **Test-first (RED):** write `src/server/api/authz.int.spec.ts` covering:
      `CallerContext` resolved from the trusted `x-user-id` header with the **role read from
      the DB, never the client**; unknown user rejected; decision functions live in a
      dedicated module (not route handlers) so the context source can be swapped later.
      _Traces: BR-01 → spec req 1 (both scenarios, "Authorization is separable from caller
      identity")._
- [x] **1c.2** Implement `src/server/api/authz.ts` (pure decision functions over
      `CallerContext = { userId, role }`) + the context-extractor middleware
      (`src/server/api/caller-context.ts`). 🚧 after 1c.1.
- [x] **1c.3** **Test-first (RED):** write per-route GET suites —
      `src/server/api/events.int.spec.ts`, `guests.int.spec.ts`, `photos.int.spec.ts` —
      covering: provider sees all events; admin/security see only assigned events; admin of
      event A requesting event B's list or detail gets a 403-equivalent with **no event B data
      in the payload**. _Traces: BR-03 read-side → spec req 3 (scenarios 1–2); BR-01._
- [x] **1c.4** Implement repositories `src/server/data/repositories/{events,guests,photos}.ts`
      mapping Prisma models → the existing `readonly` domain interfaces from
      `src/app/core/models.ts`; Prisma types must not appear outside `src/server/**`.
- [x] **1c.5** Implement the read routes per design §5: `GET /api/events` (provider: all;
      admin/security: assigned only), `GET /api/events/:id`, `GET /api/events/:id/guests`,
      `GET /api/events/:id/photos` — each passing through the CallerContext + authz checks.
      🚧 after 1c.2–1c.4.
- [x] **1c.6** Note in the PR body (chain context): object-level access-by-ID rejection
      (spec req 3 scenario 3) is completed in PR-2a together with the write paths; 1c covers
      list/detail scoping only. _(Explicit boundary, not an omission.)_
- [x] **1c.7** Run the PR verification gate (ground rule 2).

**PR-1c apply verification (sdd-apply, strict TDD):** `npm test -- --watch=false` 73/73;
`npm run test:int` 30/30 (1 health + 7 seed + 7 authz + 9 events + 3 guests + 3 photos);
both `tsc` projects exit 0; `ng build` exit 0 (prerender 1 route, no NG05xx); prettier clean
on the 13 touched paths (full-tree `prettier --check .` fails on 76 PRE-EXISTING untouched
files — baseline, not this batch); smoke `GET /api/health` → 200, provider list → 200,
cross-event detail → 403, no header → 401. RED captured before implementation: authz spec
failed on `Cannot find module './authz'`; route suites failed 15/16 with every route at 404.
Code-line count **384** excluding comments/blank for the reviewed batch, **405** including the
post-review follow-up (W1 role-spoofing regression + S4 neutral `data/event-scope.ts`) — a
disclosed **5-line overage** of the 400 budget, test/type-only. `md5sum dev.db` identical
before/after the integration suite. Recorded decisions: security cannot read guest/photo
lists (design §5), events ordered by `start`, storage-less display fields synthesized
(→ superseded for `used`/`max`/`br`: the API now omits them and the client resolves them
from a display mock — see the display-state cleanup section in `apply-progress.md`).
Boundary: writes and object-level by-ID rejection remain PR-2a.

**Suggested work-unit commits:**

1. `test(api): add caller-context and event-scoped read rejection specs` (1c.1, 1c.3)
2. `feat(api): add read-only event endpoints with caller-context authorization` (1c.2, 1c.4–1c.5)

---

## 📍 PR-1d — Hydration-safe client read path

**Starts:** API reads live, client still renders seed state. **Finishes:** post-hydration
browser fetch loads persisted data into `PaseStore` signals; prerender never touches the DB;
zero hydration mismatches.
**Out of scope:** mutations (2b), seed-data runtime decoupling (PR-4).
**Dependencies:** PR-1c (endpoints to call).
**Rollback boundary:** revert the 1d commits → store returns to seed-initialized signals;
server API remains (additive).

Dependency position: `1a → 1b → 1c → 📍 1d → 2a → 2b → 3a → 3b → 4`

- [x] **1d.1** **Test-first (RED):** write `src/app/core/api/data-api.service.spec.ts` with
      `provideHttpClientTesting` — typed GETs for events/guests/photos endpoints, mapping
      JSON → domain interfaces, error propagation. _Traces: spec req 15 (client fetch
      surface)._
- [x] **1d.2** Implement `src/app/core/api/data-api.service.ts` (`providedIn: 'root'`,
      HttpClient only — no Prisma import possible from `src/app/**`). 🚧 after 1d.1.
- [x] **1d.3** **Test-first (RED):** write `pase-store.load()` specs — initial state identical
      on server and client (loading state, design §4), `load()` populates
      `guests/photos/events` signals from the API payload, counters stay `computed()`.
      _Traces: BR-03 client side-effect-free read; spec req 15 (scenario 1)._
- [x] **1d.4** Implement `PaseStore.load()` and wire it from the root component with
      `afterNextRender` + `isPlatformBrowser` (the `FeedService` pattern) in
      `src/app/app.ts`; keep `app.routes.server.ts` on `Prerender` untouched.
      Mutations remain in-memory (design §7). 🚧 after 1d.2–1d.3.
- [x] **1d.5** **Hydration acceptance (manual + build):** `ng build` (prerender + SSR), start
      `node dist/.../server.mjs`, load `/` and confirm **zero NG0500/NG0502** and that
      prerender performed no DB access; confirm data appears after hydration.
      _Traces: spec req 15 (scenarios 1–2); proposal success criterion._
- [x] **1d.6** Bundle guard quick check: grep `dist/browser` for `@prisma`/query-engine →
      zero. _Traces: spec req 15 (scenario 3)._
- [x] **1d.7** Run the PR verification gate (ground rule 2).

**Suggested work-unit commits:**

1. `test(client): add DataApiService and PaseStore load specs` (1d.1, 1d.3)
2. `feat(client): load PaseStore from REST API after hydration` (1d.2, 1d.4–1d.6)

---

## 📍 PR-2a — Server-side authorization + write endpoints

**Starts:** read-only API. **Finishes:** all event/guest/photo writes exist with full
object-level enforcement; members endpoints live; admin soft toggles work; admin deletes
impossible.
**Out of scope:** client mutation wiring (2b), approval workflow (3a), QR (3b), retention/
purge (4). **Dependencies:** PR-1c.
**Rollback boundary:** revert 2a commits → read API + client read path keep working.

Dependency position: `1a → 1b → 1c → 1d → 📍 2a → 2b → 3a → 3b → 4`

- [ ] **2a.1** **Sub-split guard:** before writing tests, project the code-line count; if the
      PR is tracking >400 code lines, split into **2a-i** (authz enforcement + events +
      guests routes) and **2a-ii** (photos + members + toggles). ⚠️ If a clean sub-split
      proves infeasible, the pre-approved `size:exception` applies here (fallback only).
- [ ] **2a.2** **Test-first (RED):** write `src/server/api/events-write.int.spec.ts` —
      provider creates event with `start`/`end`/retention + ≥1 admin; `admin`/`security`
      creation attempts rejected 403-equivalent with no record created; provider creating
      without an admin rejected. _Traces: BR-02 → spec req 2 (all 3 scenarios)._
- [ ] **2a.3** Implement `POST /api/events` (provider-only, ≥1 admin validation) in
      `src/server/api/`. 🚧 after 2a.2 + PR-1c authz.
- [ ] **2a.4** **Test-first (RED):** write the object-level suite
      `src/server/api/scope.int.spec.ts` — admin of event A: (a) every write targeting an
      event B entity rejected **by exact ID** with no data disclosed and no record changed;
      (b) reads return only event A data. Cover guests, photos, check-in attempts, and (as
      they land) QR paths via the same helpers. _Traces: BR-03, BR-04 → spec req 3 (scenarios
      3–4)._
- [ ] **2a.5** Implement writes with scope resolution via each row's `eventId`:
      `POST /api/events/:id/guests`, `PATCH /api/guests/:id` (status/active),
      `POST /api/events/:id/photos`, `PATCH /api/photos/:id` (state/active) — all assigned-
      admin only, object-level checks on standalone IDs.
- [ ] **2a.6** **Test-first (RED):** write `src/server/api/members.int.spec.ts` — admin of
      event A creates a `security` user scoped to A (usable as trusted context); provider
      cannot create security/second-admin directly; provider CAN read permission holders for
      any event. _Traces: BR-06 → spec req 5 (all 3 scenarios)._
- [ ] **2a.7** Implement `GET/POST /api/events/:id/members` per the design §5 matrix. 🚧
      after 2a.6.
- [ ] **2a.8** **Test-first (RED):** write toggle scenarios in `src/server/api/toggles.int.spec.ts`
      — admin deactivates a guest of own event → record persists with `active:false`; toggling
      back restores previous state with all other fields unchanged; sibling rows unaffected;
      cross-event toggle rejected; **any admin delete attempt (event or record) rejected with
      records intact** (no admin-reachable DELETE route). _Traces: BR-13 → spec req 12 (all
      3 scenarios) + spec req 11 scenario 3._
- [ ] **2a.9** Verify the toggle/no-delete behavior of the implemented PATCH routes against
      2a.8 (they may already be green from 2a.5 — close the RED/GREEN loop explicitly).
- [ ] **2a.10** Run the PR verification gate (ground rule 2). Note in PR body: every
      event-scoped endpoint now has a server-side rejection test (proposal success criterion 3
      is validated again end-to-end in PR-4's sweep).

**Suggested work-unit commits:**

1. `test(api): add provider-only event creation and object-level scope specs` (2a.2, 2a.4)
2. `feat(api): add event and guest write endpoints with scope enforcement` (2a.3, 2a.5)
3. `feat(api): add event members endpoints for admin-created lower roles` (2a.6–2a.7)
4. `test(api): add admin soft-toggle and no-delete specs` + wire any missing toggle behavior
   (2a.8–2a.9)

---

## 📍 PR-2b — Client mutation wiring (optimistic updates)

**Starts:** writes exist server-side, client still mutates in memory. **Finishes:** store
mutations are API calls with optimistic signal updates; reload preserves mutations.
**Out of scope:** QR/approval/retention flows. **Dependencies:** PR-1d (DataService) +
PR-2a (endpoints).
**Rollback boundary:** revert 2b commits → in-memory mutations return; server stays.

Dependency position: `1a → 1b → 1c → 1d → 2a → 📍 2b → 3a → 3b → 4`

- [ ] **2b.1** **Test-first (RED):** extend/author `pase-store` mutation specs — each mutation
      (`sendInvite`, `confirmGuest`, `setPhotoState`, `toggleDownload`, active toggles) calls
      the API through `DataApiService`, applies the signal update optimistically, and reverts
      on API error. _Traces: proposal §What Changes 5; success criterion 1 (persistence)._
- [ ] **2b.2** Implement the `DataApiService` mutation methods + rewire `PaseStore` mutation
      methods to them (immutable `update()` calls kept). Keep `FeedService` simulated scans
      ephemeral (exploration Q2). 🚧 after 2b.1.
- [ ] **2b.3** Manual acceptance: mutate a guest/photo in the dev app, reload → mutation
      persisted (proposal success criterion 1). Record evidence in the PR description.
- [ ] **2b.4** Run the PR verification gate (ground rule 2).

**Suggested work-unit commits:**

1. `test(client): add optimistic store mutation specs` (2b.1)
2. `feat(client): wire store mutations to API with optimistic updates` (2b.2–2b.3)

---

## 📍 PR-3a — Second-admin approval workflow (BR-05)

**Starts:** admins/security created directly by the event admin only (2a members).
**Finishes:** pending → approved/rejected workflow enforced server-side with no premature
access. **Out of scope:** QR (3b). **Dependencies:** PR-2a (authz + members).
**Rollback boundary:** revert 3a commits; members flow from 2a unaffected.

Dependency position: `1a → 1b → 1c → 1d → 2a → 2b → 📍 3a → 3b → 4`

- [ ] **3a.1** **Test-first (RED):** write `src/server/api/admin-requests.int.spec.ts` —
      (a) `pending` candidate has **no** access to event A via any API path; (b) provider
      sets `approved` → candidate gains exactly event-A scope; (c) `rejected` grants nothing
      and the record remains queryable; (d) the event's admin attempting self-approval is
      rejected and status stays `pending`. _Traces: BR-05 → spec req 4 (all 4 scenarios)._
- [ ] **3a.2** Implement `POST /api/events/:id/admin-requests` (assigned admin, scope + role),
      `PATCH /api/admin-requests/:id` (provider only; admin self-approve rejected by
      caller-role check), `GET /api/events/:id/admin-requests` (provider any / assigned
      admin). States are exactly `pending|approved|rejected` — string, app-layer validated.
      🚧 after 3a.1. _Traces: BR-05, BR-01 → spec req 4, req 1._
- [ ] **3a.3** Run the PR verification gate (ground rule 2).

**Suggested work-unit commits:**

1. `test(api): add second-admin approval workflow specs` (3a.1)
2. `feat(api): add admin request endpoints with provider-only approval` (3a.2)

---

## 📍 PR-3b — QR issuance, check-in, verify/image (BR-07–BR-11, BR-17)

**Starts:** no QR records. **Finishes:** per-attendee QRs issued and hashed, single-use
check-in transaction, expiry at event end, opaque tokens, PNG image + verify endpoints,
emergency QRs. **Out of scope:** retention/purge (4), email transport (non-goal).
**Dependencies:** PR-2a (authz), PR-3a in chain order.
**Rollback boundary:** revert 3b commits + remove `qrcode` dep; check-in endpoints disappear
without affecting guests/photos.

Dependency position: `1a → 1b → 1c → 1d → 2a → 2b → 3a → 📍 3b → 4`

- [ ] **3b.1** **Sub-split guard:** project code lines before tests; if tracking >400, split
      into **3b-i** (issuance + check-in writes) and **3b-ii** (verify + image read path).
      ⚠️ `size:exception` is the fallback if the split proves infeasible.
- [ ] **3b.2** Install server-only `qrcode` dep (pure JS + pngjs, verify MIT license at
      install; do **not** touch the existing client `qrcode-generator` — design §6).
- [ ] **3b.3** **Test-first (RED):** write `src/server/api/qr-issuance.int.spec.ts` — a
      confirmed guest with N companions yields **N+1 distinct QR records**, each companion QR
      carrying `parentQrId` to the parent guest's QR; token = `crypto.randomBytes(32)
.toString('base64url')` stored only as SHA-256 `tokenHash`, raw returned once; scanning
      issued tokens for known PII values finds no PII substring; client-supplied token content
      is ignored/rejected. _Traces: BR-07 → spec req 6 (scenario 1); BR-11/BR-17 → spec req
      10 (scenarios 1, 3)._
- [ ] **3b.4** Implement `POST /api/events/:id/qr` (assigned admin, event scope; `kind`:
      guest|companion|emergency) returning `{ token, verifyUrl }` with absolute
      `<WEB_BASE_URL>/verify/<rawToken>` URL. 🚧 after 3b.3.
- [ ] **3b.5** **Test-first (RED):** write `src/server/api/check-in.int.spec.ts` — first scan
      succeeds and consumes; second scan of the same token rejected "already used" with **no
      second CheckIn record**; scan before `event.end` succeeds; scan at/after `event.end`
      rejected as expired with no record; **emergency QR after end also rejected**; caller not
      assigned to the token's event rejected. _Traces: BR-08 → spec req 7; BR-09 → spec req 8
      (all 3 scenarios); BR-03 scope._
- [ ] **3b.6** Implement `POST /api/check-ins` as one `prisma.$transaction` (conditional
      `consumedAt: null → now()` update + `CheckIn` create with `@unique qrId`; expiry vs
      `event.end` for all kinds; caller event-scope check). 🚧 after 3b.5.
- [ ] **3b.7** **Test-first (RED):** write `src/server/api/qr-verify.int.spec.ts` — verify
      endpoint resolves a companion token to the specific companion **and its parent guest**;
      resolves guest/emergency tokens; issued-raw-token PNG endpoint returns `image/png`
      (`QRCode.toBuffer(url, { type:'png', width:512, margin:2 })`); wrong-event caller
      rejected. _Traces: BR-07 → spec req 6 (scenario 2); BR-10 emergency issuance scoped →
      spec req 9 (both scenarios, emergency issuance test lives here too); BR-11 → spec req 10
      (scenario 2)._
- [ ] **3b.8** Implement `GET /api/qr/verify/:token`, `GET /api/qr/image/:token` (+ emergency
      issuance path if not already covered by 3b.4). 🚧 after 3b.7.
- [ ] **3b.9** Run the PR verification gate (ground rule 2); PR body must cite the proposal
      success criterion "single-use, expiry guest+companion+emergency, companion linkage,
      opaque payload".

**Suggested work-unit commits:**

1. `test(api): add per-attendee QR issuance and opaque token specs` (3b.3)
2. `feat(api): add QR issuance endpoint with hashed opaque tokens` (3b.2, 3b.4)
3. `test(api): add single-use check-in and expiry specs` (3b.5)
4. `feat(api): add transactional check-in endpoint` (3b.6)
5. `test(api): add QR verify and image endpoint specs` (3b.7)
6. `feat(api): add QR verification and PNG image endpoints` (3b.8)

---

## 📍 PR-4 — Retention + provider hard delete + BR-18 verifiability + seed decoupling

**Starts:** everything above works; retention/purge/verify missing; store still coasts on
seed coupling. **Finishes:** retention policy enforced, provider purge proven to cascade,
`db:verify` demonstrates BR-18, runtime seed coupling removed, bundle guard formalized.
**Out of scope:** executing the Postgres switch (non-goal), email transport, physical image
deletion on the storage service. **Dependencies:** PR-2a (authz), PR-3b (QR rows must be
covered by purge cascade).
**Rollback boundary:** revert PR-4 commits → full app still works minus retention/purge/
verify; `seed-data.ts` file itself is never deleted (proposal rollback plan).

Dependency position: `1a → 1b → 1c → 1d → 2a → 2b → 3a → 3b → 📍 4`

- [ ] **4.1** **Test-first (RED):** write `src/server/api/retention.int.spec.ts` — provider
      sets per-event retention and it is persisted + returned by the API; `admin` attempting
      to change retention rejected; QR validity depends **only** on `event.end` even when
      retention is longer; data past `event.end` remains readable per role scope while
      retention is open. _Traces: BR-14/BR-15 → spec req 13 (all 3 scenarios)._
- [ ] **4.2** Implement `PATCH /api/events/:id` (provider only: `retentionDays`, `status`)
      per design §5. 🚧 after 4.1.
- [ ] **4.3** **Test-first (RED):** write `src/server/api/purge.int.spec.ts` — provider
      deletes an `finished` event and **all** scoped rows disappear (guests, companions,
      photos, check-ins, QRs, admin requests, assignments; `User` rows survive); provider
      cannot delete a non-finished event even when `end` passed; admin delete always rejected
      with records intact. If the cascade assertion fails, add the SQLite FK pragma to the
      initial migration (design §12 risk row). _Traces: BR-12 → spec req 11 (scenarios 1–2);
      BR-13 → spec req 11 (scenario 3)._
- [ ] **4.4** Implement `DELETE /api/events/:id` (provider + `status=finished` gate;
      Prisma `onDelete: Cascade` does the purge). 🚧 after 4.3.
- [ ] **4.5** **Test-first (RED):** write the assertion inside `seed.int.spec.ts` (or a new
      `db-verify.int.spec.ts`) that the `seed:origin` marker equals the provider configured in
      `schema.prisma`; then implement `scripts/verify-db-provider.ts` + append the
      `db:verify` npm script (`tsx scripts/verify-db-provider.ts`) so
      `npm run db:verify` fails loudly on mismatch. _Traces: BR-18 → spec req 16 (scenario 1)._
- [ ] **4.6** Write the Postgres dry-run doc (D1): provider literal edit → `DATABASE_URL`
      swap → regenerate initial migration → `db:reset && db:seed` → `npm run db:verify`
      (design §9 steps). _Traces: BR-18 → spec req 16 (scenario 2: no enums — add a grep
      assertion `schema.prisma` contains no `enum` keyword to `db:verify`)._
      Postgres **execution** is explicitly out of scope — mark it 🚧 out-of-change.
- [ ] **4.7** Decouple remaining `seed-data.ts` runtime coupling: remove the store's seed
      initialization remnants now that `PaseStore.load()` owns state; keep
      `src/app/core/seed-data.ts` and `src/app/core/metrics.spec.ts` intact (proposal rollback
      plan + non-goal: catalogs `GATES`/`PUBLIC_WEB_URL` imports in `feed.service.ts`/
      `event-hero.ts` STAY — they are v1 constants, not runtime seed coupling).
      _Traces: proposal PR-4 cleanup; success criterion "seed replays with zero duplicated
      literals"._
- [ ] **4.8** Formalize the bundle guard: scripted grep of `dist/browser` for
      `@prisma`/query-engine artifacts (zero matches) — add it to the PR verification notes.
      _Traces: spec req 15 (scenario 3); proposal success criterion._
- [ ] **4.9** **Final verification sweep (all success criteria):**
      `npm run test:all && npx prettier --check . && npx tsc --noEmit -p tsconfig.app.json && ng build`,
      reload-persistence manual check, cross-event 403 sweep across every event-scoped
      endpoint, zero NG05xx on load, `git status` shows no unrelated dirty files staged.

**Suggested work-unit commits:**

1. `test(api): add retention policy specs` (4.1)
2. `feat(api): add provider-only event patch for retention and status` (4.2)
3. `test(api): add provider purge cascade and admin delete rejection specs` (4.3)
4. `feat(api): add provider hard delete with cascade` (4.4)
5. `test(persistence): assert seed origin marker equals active provider` (4.5)
6. `feat(persistence): add db:verify script and Postgres switch dry-run doc` (4.5–4.6)
7. `refactor(client): remove seed-data runtime coupling from PaseStore` (4.7)
8. `chore(persistence): add browser bundle guard check` (4.8)

---

## Traceability index (BR → task batches)

| BR(s)        | Spec requirement                                    | Batch                                                              |
| ------------ | --------------------------------------------------- | ------------------------------------------------------------------ |
| BR-01        | req 1 — Persisted Role Model Without Authentication | 1c.1–1c.2, 3a.2                                                    |
| BR-02        | req 2 — Provider-Only Event Creation                | 2a.2–2a.3                                                          |
| BR-03, BR-04 | req 3 — Event-Scoped Admin Authorization            | 1c.3–1c.5 (read), 2a.4–2a.5 (object-level/writes), 3b.5 (QR scope) |
| BR-05        | req 4 — Second-Admin Approval Workflow              | 3a.1–3a.2                                                          |
| BR-06        | req 5 — Admin-Created Lower Roles                   | 2a.6–2a.7                                                          |
| BR-07        | req 6 — Per-Attendee QR Issuance                    | 3b.3–3b.4, 3b.7–3b.8                                               |
| BR-08        | req 7 — Single-Use QR Enforcement                   | 3b.5–3b.6                                                          |
| BR-09        | req 8 — QR Expiry at Event End                      | 3b.5–3b.6                                                          |
| BR-10        | req 9 — Emergency QR Issuance by Event Admin        | 3b.7–3b.8                                                          |
| BR-11, BR-17 | req 10 — Opaque Server-Generated QR Tokens          | 3b.3–3b.4, 3b.7–3b.8                                               |
| BR-12, BR-13 | req 11 — Provider-Only Hard Delete with Cascade     | 4.3–4.4                                                            |
| BR-13        | req 12 — Admin Soft Toggles                         | 2a.8–2a.9                                                          |
| BR-14, BR-15 | req 13 — Retention as Provider-Set Policy           | 4.1–4.2                                                            |
| BR-16        | req 14 — Image Storage Contract                     | 1a.5 (schema), 1b.2–1b.3 (seed metadata+URL only)                  |
| —            | req 15 — Hydration-Safe Client Read Path            | 1d.1–1d.6                                                          |
| BR-18        | req 16 — PostgreSQL Provider Verifiability          | 1b.2–1b.3 (marker), 4.5–4.6 (verify)                               |

⚠️ **Non-blocking orchestrator note:** the phase brief and design reference "17 requirements",
but `specs/event-persistence/spec.md` contains **16** `### Requirement:` sections (counted).
All 16 are traced above. Flag if a requirement was expected to be authored but is missing.

## Blocked / decision summary

| #   | Item                                                                    | When                                      | Status                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Chain strategy (stacked-to-main vs feature-branch chain + tracker)      | first PR creation                         | ⚠️ user decision under `ask-always`; plan assumes stacked-to-main                                                                                                                |
| 2   | Dev `/api/*` passthrough failure → standalone API + proxyConfig (1a.12) | PR-1a                                     | ✅ **RESOLVED** — user approved option a (standalone API process + `/api` proxy, port 3000); smoke green direct + via `ng serve` (see 1a.12 + apply-progress §1a.12-remediation) |
| 3   | `seed-data.ts` Angular import found (1b.1)                              | PR-1b                                     | ✅ **CHECKED (1b.1)** — zero Angular imports in the type-only chain; no escalation                                                                                               |
| 4   | `size:exception`                                                        | 1a / 2a / 3b only if sub-split infeasible | pre-approved fallback — NOT consumed by this plan                                                                                                                                |
| 5   | Spec requirement count 16 vs 17 stated                                  | now                                       | ⚠️ non-blocking, see traceability note                                                                                                                                           |
| 6   | Postgres switch execution                                               | after this change                         | 🚧 out of scope (non-goal)                                                                                                                                                       |
