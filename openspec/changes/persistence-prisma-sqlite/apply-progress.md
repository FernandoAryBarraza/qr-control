# Apply progress: persistence-prisma-sqlite — PR-1a + PR-1b + PR-1c + PR-1d + display-state cleanup

Phase: `sdd-apply`. Scope: PR-1a (tasks 1a.1–1a.13, DONE through commit `76779ed`), the
PR-1b continuation batch (tasks 1b.1–1b.5, DONE through commit `e5e08f4`), the PR-1c
continuation batch (tasks 1c.1–1c.7, DONE through commits `8186f1d` + `dc05380`), the PR-1d
continuation batch (tasks 1d.1–1d.7, DONE through commits `87a1937` + `1e95227`), and the
display-state cleanup batch that closed PR-1d's two deferred decisions (DONE through commits
`aea3969` + `be37243` + `568f640`). Strict TDD active throughout.
Chain position: `1a ✅ → 1b ✅ → 1c ✅ → 1d ✅ → 📍 2a → 2b → 3a → 3b → 4`.

## Status

| Task                                              | Status                                     | Verification                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1a.1 config.yaml integration flip                 | ✅                                         | `integration: true`, `integration_test_command: "npm run test:int"`, context Testing line updated; `test_command` unchanged                                                                                                                                                                                                                                                     |
| 1a.2 `.gitignore` `*.db` + `.env`                 | ✅                                         | `git check-ignore` confirms `.env`, `dev.db`, `prisma/dev.db`; also ignored `*.db-journal/-shm/-wal` (SQLite sidecars) and `/src/generated/` (Prisma 7 client output)                                                                                                                                                                                                           |
| 1a.3 `.env.example` + local `.env`                | ✅                                         | `DATABASE_URL="file:./dev.db"`, `WEB_BASE_URL="http://localhost:4200"`; copied to gitignored `.env`                                                                                                                                                                                                                                                                             |
| 1a.4 install prisma/@prisma/client/tsx + generate | ✅                                         | **Deviation:** `npm i -D prisma` resolved `latest` → **8.0.0-rc.23** (pre-release!) vs client 7.10.1 — pinned `prisma@^7` → stable **7.10.1 + @prisma/client 7.10.1**, 0 vulns. Added `@prisma/adapter-better-sqlite3@7.10.1` (Prisma 7 requires a driver adapter — see "learned"). Generator choice recorded below                                                             |
| 1a.5 `prisma/schema.prisma` (10 models)           | ✅                                         | All 10 models; string statuses only (no enums — grep-verified); explicit `onDelete: Cascade` FKs; `Photo.authorName` + nullable `authorGuestId`; `retentionDays @default(365)`; indexes per sketch. Prisma required one addition vs sketch: `Guest.photos Photo[]` back-relation for `Photo.authorGuest`                                                                        |
| 1a.6 initial migration                            | ✅                                         | `prisma/migrations/20261016154952_init/migration.sql` (140 SQL lines incl. FKs/indexes), applied to `prisma/dev.db` (gitignored)                                                                                                                                                                                                                                                |
| 1a.7 `tsc --noEmit` after install                 | ✅                                         | `npx tsc --noEmit -p tsconfig.app.json` → exit 0, zero friction (env access uses bracket notation per `noPropertyAccessFromIndexSignature`)                                                                                                                                                                                                                                     |
| 1a.8 npm scripts appended                         | ✅                                         | `test:unit`, `test:int`, `test:all`, `db:migrate`, `db:seed`, `db:reset` appended; existing `"test": "ng test"` untouched; `db:verify` deferred to PR-4 per task note                                                                                                                                                                                                           |
| 1a.9 `vitest.integration.config.ts`               | ✅                                         | Exact design §8 snippet; note: vitest warns the `.ts` config loads as CJS (no `"type":"module"`) — cosmetic today, rename to `.mts` when Vite requires it                                                                                                                                                                                                                       |
| 1a.10 integration harness                         | ✅                                         | Per-test-FILE temp SQLite (`mkdtemp`), `DATABASE_URL` set in `beforeAll` before any lazy client use, `execFileSync('npx',['prisma','migrate','deploy'])` (proves real migrations), API on `app.listen(0,'127.0.0.1')`, `apiFetch` helper, `afterAll` `$disconnect` + close + `rm -rf`, `beforeEach` FK-safe `resetDatabase()` (10 tables, children first)                       |
| 1a.11 health smoke **RED→GREEN**                  | ✅                                         | **RED:** `npm run test:int` → exit 1, `Cannot find module '../api/index'` (router absent). **GREEN:** implemented router/config/lazy-client + `app.use('/api', apiRouter)` before SSR handler → exit 0, `Tests 1 passed` asserting `200` + `{status:'ok', provider:'sqlite'}`. One iteration: my import path in `prisma-client.ts` was one `..` short — fixed, no design change |
| 1a.12 dev `/api/health` passthrough               | ✅ **REMEDIATED** (standalone API + proxy) | First attempt BLOCKED (evidence below, kept for history); user approved option a → see **§1a.12-remediation**: smoke green direct (`:3000`) AND via `ng serve` proxy (`:4200`)                                                                                                                                                                                                  |
| 1a.13 PR verification gate + bundle guard         | ✅                                         | See gate outputs below                                                                                                                                                                                                                                                                                                                                                          |

## 1a.12 evidence — first attempt (BLOCKED, superseded by §1a.12-remediation below)

- `ng serve` (port 4200): server boots, `/` → 200, but `curl /api/health` **hangs**
  (timeout, 0 bytes) and the log prints `uncaughtException [ReferenceError: __filename is not defined]`
  per request.
- Production `node dist/qr_control/server/server.mjs`: SAME failure — `/api/health` hangs,
  same `__filename` exception (reproduced with `--unhandled-rejections=strict --trace-uncaught`).
- **Root cause:** `better-sqlite3`'s CJS `bindings` loader (`node_modules/bindings/bindings.js:156`
  references `__filename`) breaks inside Angular's ESM SSR pipeline — both the Vite dev-SSR
  transform and the esbuild production server bundle. NOT the documented
  "reqHandler passthrough missing" scenario: the **documented `proxyConfig` fallback would NOT
  fix this** (it assumes the SSR-hosted API works standalone; it doesn't).
- Integration tests stay GREEN because vitest's CJS interop loads `bindings` correctly —
  the breakage is specific to the Angular SSR bundling pipeline.
- Candidate fixes (NOT applied — decision needed):
  - (a) **Standalone API process** outside the Angular bundler (`tsx src/server/...` or a small
    Node entry serving `apiRouter` on :4000) + `proxyConfig` `/api → http://localhost:4000`
    (the documented fallback, generalized — works dev AND prod).
  - (b) Swap to a pure-JS/WASM SQLite adapter (e.g. `@prisma/adapter-libsql`) — keeps the
    in-process design, adds a dep swap.
- Secondary pre-existing observation (out of scope, noted only): prod server rejects local
  curl with `400 Header "host" ... is not allowed` (`angular.json` `security.allowedHosts: []`).

## §1a.12-remediation — standalone API process (user-approved option a) + dev proxy

**Decision (authoritative):** the API runs as a **standalone Node process outside Angular's
bundler**, in dev AND prod; Angular proxies `/api/*` to it. Option b (WASM/libsql adapter
swap) NOT taken. Recorded as design **deviation A1** (design.md §1).

### Strict TDD evidence (RED → GREEN)

| Step                            | Action                                                                                                                                                                                                                                                                                                                                | Result                                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Baseline                     | `npm run test:unit` + `npm run test:int`                                                                                                                                                                                                                                                                                              | **73/73 + 1/1 green**                                                                                                                                                                         |
| 2. **RED (failing test FIRST)** | integration harness pointed at the NEW standalone app-composition module `src/server/api/app.ts` (did not exist yet): `src/server/testing/integration-harness.ts` → `import { createApiApp } from '../api/app'` + `const app = createApiApp()`                                                                                        | `npm run test:int` → **FAILED (1/1)** — unresolved import at `src/server/api/health.int.spec.ts:2` (the `health.int.spec.ts` integration test is the RED carrier; no production code touched) |
| 3. **GREEN (minimal code)**     | added `src/server/api/app.ts` — `createApiApp()`: the single `app.use('/api', apiRouter)` mount, express + router imports only, zero Angular imports                                                                                                                                                                                  | `npm run test:int` → **1 passed (1)**; `npx tsc --noEmit -p tsconfig.app.json` → exit 0                                                                                                       |
| 4. Hosting wiring               | `src/server/api/main.ts` (standalone entry; `API_PORT` default 3000; `process.loadEnvFile()` at start), `/api` mount + `apiRouter` import REMOVED from `src/server.ts` (guard comment left behind), `proxy.conf.json` + `angular.json serve.options.proxyConfig`, `package.json` `api:start` script, `.env.example` `API_PORT="3000"` | unit **73/73** unchanged, int **1/1** green, build clean (below)                                                                                                                              |

### Verification gates (post-remediation, actual output)

| Command                                 | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ng test --watch=false`                 | **73 passed (73)**, 4 files — identical to baseline                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `npm run test:int`                      | **1 passed (1)** (RED→GREEN captured above)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `npx tsc --noEmit -p tsconfig.app.json` | exit 0, no output                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `ng build`                              | exit 0 — prerender 1 route, no NG05xx; `server.mjs` 920.52 kB; dev `ng serve` server bundle only 1.86 kB                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Bundle guard (browser)                  | `grep -ril '@prisma\|query.engine\|query_compiler\|better-sqlite3' dist/qr_control/browser/` → **0 matches**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Bundle guard (SSR)                      | same grep on `dist/qr_control/server/server.mjs` → **0 matches**; `grep -c 'apiRouter\|/api/health'` → **0** (Angular 22 nests the server bundle at `dist/qr_control/server/server.mjs`, one level deeper than the task text's path)                                                                                                                                                                                                                                                                                                                                                                          |
| Prettier (files touched)                | all code/config files added or edited by this remediation are clean (`app.ts`, `main.ts`, `proxy.conf.json`, `health.int.spec.ts`, harness, `package.json`; `src/server.ts` + `angular.json` fail only on diffs verified identical at `HEAD`). The three `openspec/changes/persistence-prisma-sqlite/*.md` docs fail `prettier --check` on markdown table padding + bold-intro list style **used throughout the files since creation** (pre-existing hunks exist in regions this remediation never touched); remediation content follows the same surrounding style — NOT wholesale-reformatted (scope guard) |
| **Smoke A — direct**                    | `npm run api:start` → `curl -i http://localhost:3000/api/health` → `HTTP/1.1 200 OK`, `{"status":"ok","provider":"sqlite"}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Smoke B — `ng serve` proxy**          | `npx ng serve` → `curl -i http://localhost:4200/api/health` → `HTTP/1.1 200 OK`, same JSON body (proxy headers: `Vary: Origin`, lowercased header names)                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Smoke B1 — routing proof**            | stop the API process → same curl → **`HTTP/1.1 502 Bad Gateway`** + ng serve log `vite http proxy error: /api/health ... ECONNREFUSED`; restart API → **200** (recovery). Proves `4200/api/*` routes to `:3000`, not to Angular SSR                                                                                                                                                                                                                                                                                                                                                                           |
| **Smoke C — prod `server.mjs`**         | `PORT=4000 node dist/qr_control/server/server.mjs` boots and listens with **0 `__filename` errors** (previously crashed per request). Requests still answer `400 Header "host" ... is not allowed` — the PRE-EXISTING `security.allowedHosts: []` guard (out of scope, recorded above); prod `/api` is routed at the deployment layer → API process                                                                                                                                                                                                                                                           |
| ng serve log after remediation          | `grep -c '__filename\|uncaughtException'` → **0** (was: one per request)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

### Files touched by the remediation (additive vs modified)

**New (additive):** `src/server/api/app.ts`, `src/server/api/main.ts`, `proxy.conf.json`
**Modified:** `src/server.ts` (import + `/api` mount removed, guard comment added),
`src/server/testing/integration-harness.ts` (builds `createApiApp()` instead of a private
express app), `src/server/api/health.int.spec.ts` (comment only), `angular.json`
(`serve.options.proxyConfig` appended), `package.json` (`api:start` appended —
append-only per ground rule 1), `.env.example` (+ local gitignored `.env`:
`API_PORT="3000"`), `tasks.md`, `design.md` (deviation A1), this file.
**Untouched:** every ground-rule-1 dirty file, `prisma/`, `src/app/**`, PR-1b+ tasks.
Code added ≈ **30 lines** excluding comments/blank (app ≈7, main ≈12, proxy.conf.json 6,
angular.json 3, package.json 1, .env.example 1; net −2 in harness).

### Operational notes

- **Dev:** terminal 1 `npm run api:start`, terminal 2 `ng serve` → app + proxied API on 4200.
- **Prod:** `node dist/qr_control/server/server.mjs` (Angular only) **+** `npm run api:start`
  (API); route `/api/*` → API port at the reverse-proxy layer.
- Port **3000** chosen because `src/server.ts` defaults `PORT` to **4000** (documented in
  `.env.example`).

## Verification command outputs (summary)

| Command                                 | Result                                                                                                                                                                                                                                       |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ng test --watch=false`                 | **73 passed (73)**, 4 files — identical to pre-change baseline; `exclude: ["src/server/**"]` in the unit-test builder prevents `*.int.spec.ts` discovery                                                                                     |
| `npm run test:int`                      | **1 passed (1)** — `GET /api/health` 200 + provider marker (RED→GREEN captured above)                                                                                                                                                        |
| `npm run test:all`                      | 73 unit + 1 integration, exit 0                                                                                                                                                                                                              |
| `npx tsc --noEmit -p tsconfig.app.json` | exit 0, no output                                                                                                                                                                                                                            |
| `ng build`                              | exit 0, prerender 1 static route, no NG05xx; server bundle carries Prisma's lazy WASM query-compiler chunks (expected, server-only)                                                                                                          |
| Bundle guard                            | `grep -ril '@prisma\|query.engine\|query_compiler' dist/qr_control/browser/` → **0 matches** (Angular 22 nests output under `dist/qr_control/browser`, not `dist/browser`)                                                                   |
| `npx prettier --check .`                | **Fails on ~140 PRE-EXISTING files** (verified via `git show HEAD:<file>` — `angular.json` and `src/server.ts` were already unclean at HEAD, in lines I did not touch). All files ADDED by this PR are prettier-clean (checked individually) |
| `ng serve` + curl `/api/health`         | ✅ REMEDIATED — first attempt blocked (above); after the standalone-API remediation: 200 via proxy + 200 direct, see §1a.12-remediation                                                                                                      |

## Recorded deviations from design (with rationale)

1. **Prisma 7 platform reality vs design sketch (§3):**
   - Generator: `prisma-client` (init default; `output = "../src/generated/prisma"`, gitignored,
     regenerated by `npx prisma generate`) instead of legacy `prisma-client-js`. Design's
     "verify generator choice at install" resolved here.
   - `prisma7.config.ts` (auto-generated name) owns `datasource.url = env('DATABASE_URL')`;
     `schema.prisma` datasource carries provider ONLY (no `url = env(...)` line).
   - **Driver adapter is mandatory**: `PrismaClient` no longer connects without one →
     `@prisma/adapter-better-sqlite3` in `src/server/data/prisma-client.ts`. Postgres switch
     swaps this ONE import for `@prisma/adapter-pg` — portability story intact.
   - Prisma 7 CLI does not auto-load `.env` → `prisma7.config.ts` uses Node's built-in
     `process.loadEnvFile()` (no `dotenv` dependency added); server runtime mirrors this in
     `src/server/data/config.ts`.
2. **`angular.json` unit-test builder:** added `options.exclude: ["src/server/**"]` — the
   builder's default `include: ["**/*.spec.ts"]` would otherwise run `*.int.spec.ts` under
   jsdom and break the unit suite. Verified: still exactly 73 unit tests.
3. **Prisma CLI path resolution:** Prisma 7 resolves `file:./dev.db` against **cwd** (repo
   root → `./dev.db`), not the schema directory. Integration harness uses absolute temp
   paths, unaffected. Runtime relative URLs resolve against process cwd — run the server
   from the repo root or use an absolute path.
4. **`prisma init` side-effects:** it dropped `.agents/`, `.claude/`, `.windsurf/`,
   `skills-lock.json` into the repo root (agent-skill docs, unformatted, not part of the
   change) — **removed** to keep the diff scoped. Reinstallable any time via `prisma init`.
5. **`db:seed` script** (`prisma db seed`) is wired in package.json per task 1a.8 but has no
   seed command until PR-1b adds `"seed": "tsx prisma/seed.ts"` to `prisma7.config.ts`
   `migrations.seed` (Prisma 7 config file, NOT the package.json `prisma.seed` key the task
   text assumes — 1b note).

## Files touched (additive vs modified)

**New (additive, PR-1a scope):**

- `prisma/schema.prisma` — 10 models, string statuses, cascade FKs
- `prisma/migrations/20261016154952_init/migration.sql` + `migration_lock.toml`
- `prisma7.config.ts` — Prisma 7 CLI config (env loading + datasource URL)
- `vitest.integration.config.ts` — node-env integration runner
- `src/server/testing/integration-harness.ts` — per-file temp-SQLite harness
- `src/server/api/index.ts` — API router + `GET /api/health`
- `src/server/api/health.int.spec.ts` — first integration test (RED→GREEN)
- `src/server/data/config.ts` — runtime env validation + provider marker
- `src/server/data/prisma-client.ts` — lazy PrismaClient singleton + SQLite adapter
- `.env.example`
- `openspec/changes/persistence-prisma-sqlite/apply-progress.md` (this file)

**Modified (this PR's footprint only; prior dirty content left intact):**

- `.gitignore` — `.env`, `*.db*`, `/src/generated/`
- `package.json` — 6 scripts + 4 devDeps appended (existing edits untouched)
- `package-lock.json` — lockfile updates for the new devDeps
- `angular.json` — test builder `exclude` only
- `src/server.ts` — `apiRouter` import + `app.use('/api', apiRouter)` before SSR handler
- `openspec/config.yaml` — integration layer flip + context Testing line
- `openspec/changes/persistence-prisma-sqlite/tasks.md` — 1a checkboxes + notes

**Intentionally NOT touched:** all files listed in ground rule 1 (Tailwind/prototype work),
`src/app/**` (client untouched until 1d), `seed-data.ts`.

## Code-line count vs 400 budget (code only, excl. comments/blank)

| Unit                         | Lines     |
| ---------------------------- | --------- |
| schema.prisma                | 119       |
| migration.sql                | 121       |
| harness                      | 63        |
| data/config.ts               | 18        |
| prisma7.config.ts            | 14        |
| data/prisma-client.ts        | 11        |
| vitest.integration.config.ts | 9         |
| health.int.spec.ts           | 9         |
| api/index.ts                 | 8         |
| .env.example                 | 2         |
| package.json delta           | ~11       |
| .gitignore delta             | 7         |
| angular.json delta           | 4         |
| src/server.ts delta          | ~2        |
| openspec/config.yaml delta   | ~3        |
| **Total**                    | **≈ 401** |

At/just over the 400 boundary — but schema (119) + SQL (121) = **240 review-light declarative
lines** are the bulk, exactly the case design §11 pre-approves `size:exception` for.
Excluding schema+SQL: **≈ 161 code lines** — comfortably inside budget. Orchestrator decides
at PR-creation time.

## Blockers / decisions for orchestrator

1. ~~**1a.12 (BLOCKED):** dev/prod SSR-hosted `/api/*` crashes on the native CJS SQLite
   adapter (`__filename`).~~ → **RESOLVED** (user approved option a — standalone API
   process + `/api` proxy): see §1a.12-remediation; smoke green. `size:exception` and the
   non-blocking spec-count note below remain open for the orchestrator.
2. **Budget:** confirm `size:exception` (schema+SQL review-light) or demand a sub-split —
   numbers above.
3. Non-blocking (pre-existing, from tasks.md): spec requirement count 16 vs 17 stated.

## Next steps (after 1a lands)

- ~~PR-1b: seed from `src/app/core/seed-data.ts` (1b.1 gate: verify no Angular imports).~~
  → **DONE, see §PR-1b below** (uncommitted, orchestrator owns the commit).
- PR-1c: read-only GETs + `CallerContext` + authz skeleton on top of the proven harness.
  See the 1c/3a handoff notes at the end of §PR-1b (status mapping + sizeKb/1000 conventions).

---

# PR-1b — Seed from `seed-data.ts` + provider marker (tasks 1b.1–1b.5)

Continuation batch executed under strict TDD. Working tree carries ONLY the 1b footprint
(6 paths: 3 new + 3 modified), nothing staged/committed (HEAD `76779ed`).

## Status

| Task                                     | Status                         | Verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1b.1 seed-data purity gate               | ✅                             | Type-only import of `./models`; `models.ts` type-only imports `./shared/icons`, which resolves to `lucide` — `grep -c '@angular'` → **0** across the whole chain; runtime import graph of `seed-data.ts` is EMPTY (esbuild erases `import type`)                                                                                                                                                                                                                              |
| 1b.2 seed integration spec **RED→GREEN** | ✅                             | **RED (observed in-session, not replayable post-GREEN):** `npm run test:int` failed with unresolved import of `../../../prisma/seed` (1 file failed; health smoke stayed green). **GREEN after 1b.3:** **8 passed (8)** — 7 seed tests + health smoke. The spec is hermetic: it side-effect-imports `src/server/testing/integration-harness.ts` (per-file temp SQLite + `prisma migrate deploy` + FK-safe reset), so it never reads or writes the local `dev.db` (design §8). |
| 1b.3 `prisma/seed.ts`                    | ✅                             | Imports `GUESTS`/`PHOTOS`/`EVENTS`/`USERS` (never literals); deterministic IDs `ev-/g-/ph-/usr-/c-001…`; all mappings per design §9; provider marker read from `schema.prisma` at seed time inside one idempotent `$transaction`                                                                                                                                                                                                                                              |
| 1b.4 seed command wiring                 | ✅ **with recorded deviation** | `prisma7.config.ts` `migrations.seed: 'tsx prisma/seed.ts'` (Prisma 7 — NOT the package.json `prisma.seed` key; see deviation 7.4). `npm run db:seed` run **twice** on `dev.db` → identical counts `3/14/19/14/13/12` (events/guests/companions/photos/users/assignments), marker `sqlite`; `git status` shows no `*.db`                                                                                                                                                      |
| 1b.5 PR verification gate                | ✅                             | See gate table below                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## Strict TDD evidence

| Step                    | Action                                                                                     | Result                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Baseline                | `npm run test:int`                                                                         | 1/1 green (health smoke)                                    |
| **RED**                 | added `src/server/data/seed.int.spec.ts` (asserts the full seed contract, imports seed fn) | 1 file failed — `Cannot find module '../../../prisma/seed'` |
| **GREEN**               | added `prisma/seed.ts` + `prisma7.config.ts` seed wiring                                   | 8/8 int green; both `tsc` projects exit 0                   |
| CLI verification (1b.4) | `npm run db:seed` × 2 on real `dev.db`                                                     | both runs exit 0; row counts identical → idempotent         |

**RED reproducibility caveat:** the RED state was observed _before_ `prisma/seed.ts` existed,
so it cannot be replayed once GREEN makes the import resolvable. The evidence above is the
in-session failing module-resolution run; no post-hoc RED demo is claimed.

## Verification gates (actual output)

| Gate                                                                                                 | Result                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx ng test --watch=false`                                                                          | **73 passed (73)**, 4 files — unchanged baseline                                                                                                                                                               |
| `npm run test:int`                                                                                   | **8 passed (8)** (1 pre-existing + 7 new seed tests)                                                                                                                                                           |
| `npm run db:seed` (wired) ×2                                                                         | both exit 0, "Seed complete" both times; `dev.db` counts after two runs: 3 events, 14 guests, 19 companions, 14 photos, 13 users, 12 assignments, `seed:origin='sqlite'`                                       |
| `npx tsc --noEmit -p tsconfig.app.json`                                                              | exit 0                                                                                                                                                                                                         |
| `npx tsc --noEmit -p tsconfig.spec.json` (extra)                                                     | exit 0 — this is the project that actually type-checks `seed.int.spec.ts` + `prisma/seed.ts`                                                                                                                   |
| `npx ng build`                                                                                       | exit 0, prerender 1 static route, no NG05xx                                                                                                                                                                    |
| `npx prettier --check` on 1b files                                                                   | all clean (`prisma/seed.ts`, `prisma/package.json`, `seed.int.spec.ts`, `prisma7.config.ts`, `tasks.md`, `apply-progress.md`)                                                                                  |
| **Hermeticity:** `md5sum dev.db` before/after `npm run test:int`                                     | **identical** (`6c2d5f404b23fe6a79427ed9727180ff` both times) — the suite no longer mutates the developer DB                                                                                                   |
| **Fresh-clone-like int run:** `DATABASE_URL=file:/tmp/opencode/fresh-seed-check.db npm run test:int` | **8 passed (8)**, 2 files — no pre-existing tables; the harness provisions its own migrated temp DB (the supplied path is never created)                                                                       |
| Smoke: `npm run api:start` + `curl /api/health`                                                      | **200** `{"status":"ok","provider":"sqlite"}` (seeded DB); process killed, port 3000 closed, no strays                                                                                                         |
| `git status`                                                                                         | **6 paths** (3 new + 3 modified): `prisma/seed.ts`, `prisma/package.json`, `src/server/data/seed.int.spec.ts` (new); `prisma7.config.ts`, `tasks.md`, `apply-progress.md` (modified); nothing staged/committed |

## Recorded decisions & deviations (PR-1b)

1. **Event `status`: client `done` → server `finished`.** Spec req 11 / BR-12 gate on
   `status=finished` and the schema comment says `upcoming | active | finished`, but the
   client domain union (`models.ts EventStatus`) says `done`. The DB stores the SERVER
   vocabulary (`done` mapped to `finished`; `active`/`upcoming` pass through). PR-1c's
   repository MUST map `finished → done` at the Prisma→domain boundary (documented in
   "1c/3a handoff notes" below).
2. **Event `start`/`end` are DERIVED from `dateLabel`** (`'14 JUN 2025 · 20:00'` parsed as
   UTC; month table covers EN/ES abbreviations). `end = start + 8h` via an explicit
   `DEMO_EVENT_DURATION_MS` constant — the prototype has no duration concept; `end` only
   drives the QR validity window (BR-09) at demo scale. `dateLabel` itself is dropped per
   design §9 (client reformats from start/end later).
3. **`Photo.sizeKb` is DECIMAL KB.** Domain `size` is MB (UI renders `${size} MB`), so the
   seed stores `Math.round(size * 1000)` (3.2 MB → 3200 KB) — lossless round-trip.
   **PR-1c repositories MUST divide by 1000** (not 1024) to recover `size`.
4. **Seed wiring lives in `prisma7.config.ts` `migrations.seed`** — confirmed against the
   installed `@prisma/config` types: Prisma 7 reads the seed command from the config file,
   not the package.json `prisma.seed` key assumed by task 1b.4 (this was already flagged as
   1a deviation 5; `npm run db:seed` proves it end to end).
5. **`prisma/package.json` (`{"type":"module"}`) ESM marker.** The repo root has no
   `"type": "module"`, so `tsx` compiled `seed.ts` to CJS → `Top-level await is currently
not supported` + empty `import.meta` (first CLI attempt FAILED, captured). The marker
   scopes ESM to `prisma/` without renaming the task-specified `seed.ts`; the Prisma CLI
   ignores it.
6. **Idempotency = delete-then-insert in one `$transaction`, scoped to the deterministic
   seed IDs.** Re-running the seed replays the exact snapshot: rows under seeded event IDs
   are replaced (cascade wipes their guests/companions/photos/assignments) and only the 13
   seeded users are deleted/recreated (never non-seed users). Consequence (accepted,
   matches seed-data's "replays this exact snapshot" semantics): manual edits to SEEDED
   rows are lost on re-seed; `systemSetting['seed:origin']` is upserted.
7. **User mapping:** 13 users = 1 provider (`USERS.provider`) + 3 admins + 9 security,
   deduplicated BY NAME (`USERS.admin` ≡ ev1 admin Mariana Solórzano → one row); 12
   `EventAssignment` rows (provider is unassigned — sees everything in 1c). Guard
   `post/app/last` and `ini` are display fields with no schema columns — dropped.
   Deterministic IDs: `usr-001…`; companions `c-001…` (flat sequence, guest order).
8. **`Photo.authorGuestId` stays NULL** (design §3/§9): author names don't reliably match
   guest records — no FK failures by construction; `authorName` carries the display name.

## 1c / 3a handoff notes (conventions fixed by this batch — keep consistent)

- Repository status map: DB `finished` → domain `done`; `active`/`upcoming` unchanged.
- Repository `sizeKb → size`: divide by **1000**.
- Repository `Photo.time` → display `HH:mm` (stored as UTC datetime on the event day).
- Repository `Event.dateLabel`: synthesize from `start` (client expects the field; it is
  not stored).
- Seeded provider user exists (role `provider`) — usable as trusted `x-user-id` context in
  1c authz tests.
- **Re-seed FK footgun (owner: PR-3a):** `prisma/seed.ts` deletes only the 13 deterministic
  seed user IDs, which is safe only while the seed is the sole writer. `schema.prisma` states
  "User rows are NEVER deleted", and PR-3a's `AdminRequest.requestedBy` (`onDelete: Restrict`)
  can reference users. Once non-seed rows exist, re-running the seed will fail on that FK.
  PR-3a must pick and document a resolution: guard/refuse re-seeding, switch to upserts, or
  transactionally delete dependent rows first. Do not silently weaken `onDelete: Restrict`.

## Known limitation (PR-1b, documented — not fixed here)

`seedDatabase()` uses `user.deleteMany({ where: { id: { in: <seed ids> } } })` (see the code
comment in `prisma/seed.ts`). Re-seeding is safe today because the seed is the only data
source and nothing references those users. It will stop being safe when PR-3a+ persists rows
that reference users with a restrictive FK (e.g. `AdminRequest.requestedBy`). Resolution is
deliberately deferred to that slice — see the 1c/3a handoff note above.

## Files touched (PR-1b, uncommitted)

- **New:** `prisma/seed.ts` (~144 code lines), `src/server/data/seed.int.spec.ts`
  (~124), `prisma/package.json` (4)
- **Modified:** `prisma7.config.ts` (+2: `migrations.seed`), `tasks.md` (1b checkboxes),
  this file
- **Total:** 6 paths (3 new + 3 modified), matching `git status` exactly.
- **Untouched:** `src/app/**` (incl. `seed-data.ts` — shape preserved per ground rule),
  all 1a artifacts, all pre-existing dirty files
- **Code-line count vs 400 budget:** ≈ **270** code lines excl. comments/blank — inside
  budget (estimate band was 170–250; the month map + deterministic-ID plumbing explain the
  overshoot). Low risk, as forecast.

---

# PR-1c — Read-only GET endpoints + repositories + CallerContext + authz skeleton (tasks 1c.1–1c.7)

Continuation batch executed under strict TDD. Working tree carries ONLY the 1c footprint
(13 paths: 10 new + 3 modified), nothing staged/committed (HEAD `e5e08f4`).

## Status

| Task                                    | Status | Verification                                                                                                                                                                                                                                        |
| --------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1c.1 authz integration spec (RED→GREEN) | ✅     | **RED:** `Cannot find module './authz'` (0 tests). **GREEN:** final spec = 7 tests (6 + W1 spoofed-role regression); caller context reads the DB role, rejects unknown/missing, decision matrix covers provider/admin/security + content narrowing. |
| 1c.2 `authz.ts` + `caller-context.ts`   | ✅     | Pure decision functions over `CallerContext`; `x-user-id` only, role from `User` row; unknown/invalid role → 401 with a fixed payload (no echo).                                                                                                    |
| 1c.3 per-route GET suites (RED→GREEN)   | ✅     | **RED observed:** `Tests 15 failed \| 1 passed (16)` — every new route returned 404. **GREEN:** 29/29 int after the final consolidation (6 files); 30/30 after the W1 regression.                                                                   |
| 1c.4 repositories                       | ✅     | `events.ts` / `guests.ts` / `photos.ts` map Prisma → `PaseEvent` / `Guest` / `EventPhoto`; no Prisma import outside `src/server/**` (grep over `src/app`, `src/server.ts`, `src/main.ts` = 0).                                                      |
| 1c.5 read routes                        | ✅     | `GET /api/events`, `/events/:id`, `/events/:id/guests`, `/events/:id/photos` through `callerContext` + `canReadEvent`; cross-event reads rejected before payload composition.                                                                       |
| 1c.6 scope-boundary note                | ✅     | Recorded in this section (see “Scope boundary” below).                                                                                                                                                                                              |
| 1c.7 PR verification gate               | ✅     | See gate table below.                                                                                                                                                                                                                               |

## Strict TDD evidence (RED → GREEN)

| Task | Test file                          | Layer       | RED evidence                                                                  | GREEN                                       | TRIANGULATE                                                       | REFACTOR                                                     |
| ---- | ---------------------------------- | ----------- | ----------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------ |
| 1c.1 | `src/server/api/authz.int.spec.ts` | Integration | `Cannot find module './authz'` before any authz module existed                | 8 passed (initial), 6 passed after refactor | 6 cases: DB roles ×3, unknown/missing, scope, canReadEvent matrix | Trimmed helpers; kept every assertion behavior-driven        |
| 1c.2 | same                               | Integration | Covered by 1c.1 RED (module absent)                                           | Green with 1c.1                             | Provider/admin/security + spoofed-role impossible by API shape    | `res.locals` handoff; single `canReadEvent` predicate        |
| 1c.3 | `events                            | guests      | photos.int.spec.ts`                                                           | Integration                                 | 15 failed / 1 passed (16) — routes absent, all reads 404          | 32 passed (final pre-consolidation 29)                       | List/detail/404/403/401 + mapping fields + empty own-list cases | Table-driven cases; strict-equality no-leak assertions |
| 1c.4 | covered by route suites            | Integration | Assertions on mapped `dateLabel`, `done`, party, `sizeKb/1000`, `HH:mm`, URLs | Green with 1c.5                             | Provider + assigned admin + other admin paths                     | Single-pass assignment mapping; synthesized display defaults |
| 1c.5 | covered by route suites            | Integration | 404 on every route before implementation                                      | Green                                       | All four routes plus cross-event detail/guests/photos             | Guard middleware resolves assignments once per request       |

## Verification gates (actual output)

| Gate                                                             | Result                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test -- --watch=false`                                      | **73 passed (73)**, 4 files — unchanged baseline                                                                                                                                                                                                                                      |
| `npm run test:int`                                               | **30 passed (30)**, 6 files (1 health + 7 seed + 7 authz + 9 events + 3 guests + 3 photos); includes the W1 spoofed-role regression                                                                                                                                                   |
| `npx tsc --noEmit -p tsconfig.app.json`                          | exit 0                                                                                                                                                                                                                                                                                |
| `npx tsc --noEmit -p tsconfig.spec.json`                         | exit 0                                                                                                                                                                                                                                                                                |
| `npx ng build`                                                   | exit 0, prerender 1 static route, no NG05xx                                                                                                                                                                                                                                           |
| `npx prettier --check` (PR-1c touched paths)                     | **clean** — each touched code/doc path passes individually. **Scoping caveat:** full-tree `npx prettier --check .` exits 1 on **76 PRE-EXISTING untouched files** (baseline issue, not introduced by this batch); the gate claim above is therefore scoped to the touched paths only. |
| Smoke `GET /api/health` (standalone API :3000)                   | **200** `{"status":"ok","provider":"sqlite"}`                                                                                                                                                                                                                                         |
| Smoke `GET /api/events` (`x-user-id: usr-001`)                   | 200, domain-shaped event list (chronological)                                                                                                                                                                                                                                         |
| Smoke cross-event (`usr-002` → `ev-002`)                         | **403**; no header → **401**                                                                                                                                                                                                                                                          |
| `md5sum dev.db` before/after `test:all`                          | **identical** (`6c2d5f404b23fe6a79427ed9727180ff`) — integration suite is hermetic                                                                                                                                                                                                    |
| Prisma boundary grep (`src/app`, `src/server.ts`, `src/main.ts`) | **0 matches** for `@prisma` / `generated/prisma`                                                                                                                                                                                                                                      |

## Code-line count vs 400 budget (code only, excl. comments/blank)

| Unit                          | Lines   |
| ----------------------------- | ------- |
| `api/authz.ts`                | 22      |
| `api/caller-context.ts`       | 26      |
| `api/index.ts` (diff delta)   | 36      |
| `api/authz.int.spec.ts`       | 72      |
| `api/events.int.spec.ts`      | 48      |
| `api/guests.int.spec.ts`      | 41      |
| `api/photos.int.spec.ts`      | 40      |
| `data/repositories/events.ts` | 56      |
| `data/repositories/guests.ts` | 22      |
| `data/repositories/photos.ts` | 21      |
| **Total**                     | **384** |

**Counting method:** new files count every code line (comments/blank excluded); MODIFIED
files count the diff delta only. `api/index.ts` had 8 code lines at `HEAD`, so its 44-line
total contributes **36**, not 44 — the earlier 392 figure mistakenly counted the whole file.

**Full PR-1c total, including the post-review follow-up:** the table above covers the batch
as reviewed (= **384**, 16 lines of headroom). The follow-up applied so the review could
pass added **21** code lines: W1 role-spoofing regression test (**+19** in
`api/authz.int.spec.ts`), the re-export line in `api/authz.ts` (**+1**), and the neutral
S4 module `data/event-scope.ts` (**+1**). Delta-inclusive total = **405**, i.e. **5 code
lines over the 400-line review budget** — all of it test/type plumbing, no runtime behavior
change. Disclosed rather than hidden: this is a 5-line overage, not a 5-line headroom.

The first drafts landed at 583; the
reduction came from a single scope predicate (`canReadEvent(kind)`), one-pass assignment
mapping, repository defaults, and table-driven route cases — NOT from dropping scenarios.

## Recorded decisions & deviations (PR-1c)

1. **Guest/photo reads are provider + assigned admin only** (design §5 content column).
   Assigned `security` staff get 403 on those two routes; they still see their assigned
   events via `GET /api/events` and `GET /api/events/:id`. This is design-consistent, not an
   omission — PR-3b gives security its scanning/verify surface.
2. **`GET /api/events` is ordered by `start` ascending** (chronological). The seeded events
   therefore return as `ev-003` (May), `ev-001` (June), `ev-002` (July).
3. **Domain fields with no storage column are synthesized**, per design §3/§9: `cd` = null,
   admin `email/phone/since` = empty strings, `EventPhoto.seed` = row id, `EventPhoto.big`
   falls back to `url`. Counters that the design redefines as client `computed()` values
   (`guests`/`photos`) are returned as row counts so the client can render immediately.
   **Superseded for `used`/`max`/`br`:** the storage counters are no longer synthesized — the
   API omits them and the client resolves them from the display mock (see the display-state
   cleanup section below).
4. **`dateLabel` is synthesized from `start` in UTC** (`02 MAY 2025 · 09:00`), matching the
   prototype's label shape; the DB never stores it (1b handoff).
5. **Unknown event semantics:** provider → 404; admin/security get the scope rejection
   (403) without an existence probe, so event IDs are not enumerable across scopes.
6. **Caller header only:** `x-user-role` (and any client-supplied role) is ignored; the
   role always comes from the `User` row. An unknown stored role is treated as no context.

## Scope boundary (task 1c.6)

Object-level access-by-ID rejection for writes (spec req 3 scenario 3) and every write path
is PR-2a, together with the mutation endpoints. PR-1c covers **list/detail scoping only**:
`/api/events`, `/api/events/:id`, `/api/events/:id/guests`, `/api/events/:id/photos`. The
cross-event assertions use strict payload equality, so a 403 response is exactly
`{ statusCode: 403, message: 'Forbidden' }` and cannot carry event-scoped data.

## PR-2a handoff notes (from PR-1c review)

- **Status validation is deferred (S3).** The read repositories currently cast persisted
  strings without checking them: `events.ts` (`event.status as PaseEvent['status']`),
  `guests.ts` (`guest.status as GuestStatus`), and `photos.ts` (`photo.state as PhotoState`).
  That is safe for today's seed-only data but trusts the DB. Spec req 16 scenario 3 requires
  value validation at the application layer. PR-2a must add parsers/guards (single shared
  helper or per-repository predicates) that reject unknown status values **before** widening
  write paths, instead of extending the casts to mutations.
- **`active` is missing from reads (S5).** Guest and photo read shapes do not expose the
  persisted `active` flag today (`repositories/guests.ts` and `photos.ts`); the domain
  `Guest`/`EventPhoto` interfaces have no such field. Spec req 13 (Admin Soft Toggles) needs
  it as soon as write toggles land, including the "guest still exists with `active` false"
  and sibling-isolation scenarios. That is a domain interface change (add the field to the
  read shape and mapping) and must land with PR-2a, not as an ad-hoc route field.

## Files touched (PR-1c, uncommitted)

- **New:** `src/server/api/authz.ts`, `src/server/api/caller-context.ts`,
  `src/server/api/authz.int.spec.ts` (incl. W1 spoofed-role regression), `src/server/api/events.int.spec.ts`,
  `src/server/api/guests.int.spec.ts`, `src/server/api/photos.int.spec.ts`,
  `src/server/data/repositories/{events,guests,photos}.ts`, `src/server/data/event-scope.ts`
  (S4 neutral `EventScope` type, re-exported by `authz.ts`)
- **Modified:** `src/server/api/index.ts` (health kept, four read routes added),
  `tasks.md` (1c checkboxes), this file
- **Total:** 13 paths (10 new + 3 modified), matching `git status --porcelain`.
- **Untouched:** `src/app/**`, `prisma/**`, `.env`, `dev.db`, all pre-existing dirty paths

---

# PR-1d — Hydration-safe client read path (tasks 1d.1–1d.7)

Continuation batch executed under strict TDD. Working tree carries the 1d footprint plus
pre-existing dirt (1a–1c artifacts already committed at `dc05380`; parallel-session files
untouched — see Files touched). Nothing staged/committed; orchestrator owns commits.

## Status

| Task                                  | Status | Verification                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1d.1 RED `data-api.service.spec.ts`   | ✅     | 4 cases written first (typed GETs for events/guests/photos, `x-user-id` trusted header, error propagation). RED: `ng test --include='**/data-api.service.spec.ts'` → **EXIT 1**, `Could not resolve "./data-api.service"` + `TS2307`                                                                                                                             |
| 1d.2 `data-api.service.ts`            | ✅     | `providedIn: 'root'`, HttpClient only (`firstValueFrom`), relative `/api/*` URLs, `encodeURIComponent` on `:id`, header from `TRUSTED_USER_ID = 'usr-001'` constant. GREEN: filtered run **4 passed (4)**, `tsc -p tsconfig.app.json` exit 0                                                                                                                     |
| 1d.3 RED `pase-store.spec.ts`         | ✅     | 4 cases written first (seed loading initial state + zero requests at construction; `load()` populates 3 signals + rebuilds `passPool` from persisted guest IDs; counters stay `computed()`; API rejection → seed fallback + toast). RED: **EXIT 1**, `TS2339: Property 'load'/'loading' does not exist on type 'PaseStore'`                                      |
| 1d.4 `PaseStore.load()` + root wiring | ✅     | `loading = signal(true)` + `async load()` in `pase-store.ts`; `App` wires `afterNextRender` + `isPlatformBrowser` (FeedService/clock pattern); `provideHttpClient` in `app.config.ts`; `provideHttpClientTesting` added to `app.spec.ts`. GREEN: filtered **4 passed (4)**; full `test:unit` → **81 passed (81)** (73 baseline + 8 new); `tsc` app + spec exit 0 |
| 1d.5 Hydration acceptance             | ✅     | `ng build` with `DATABASE_URL=file:/tmp/…nonexistent.db` → exit 0, "Prerendered 1 static route", **no DB file ever created**; served HTML carries `ng-server-context="ssg"`; phased headless-Chromium run → **HYDRATION ACCEPTANCE: PASSED** (evidence below)                                                                                                    |
| 1d.6 Bundle guard                     | ✅     | `grep -ril '@prisma\|query.engine\|query_compiler\|better-sqlite3\|PrismaClient' dist/qr_control/browser/` → **0 matches** (checked after both builds)                                                                                                                                                                                                           |
| 1d.7 PR verification gate             | ✅     | All gates green — see table below                                                                                                                                                                                                                                                                                                                                |

## Strict TDD evidence (RED → GREEN)

| Step              | Action (test first)                                                                                                                                                                             | Result                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1. Baseline       | `npm run test:unit` before any change                                                                                                                                                           | **73 passed (73)**, 4 files                                                                         |
| 2. **1d.1 RED**   | `src/app/core/api/data-api.service.spec.ts` (4 cases; module does not exist yet)                                                                                                                | `ng test --include=…` → **EXIT 1**: `Could not resolve "./data-api.service"` / `TS2307`             |
| 3. **1d.2 GREEN** | minimal `data-api.service.ts` (typed GETs + trusted header, no Prisma import path from `src/app/**`)                                                                                            | filtered run → **4 passed (4)**; `tsc --noEmit -p tsconfig.app.json` → exit 0                       |
| 4. **1d.3 RED**   | `src/app/core/pase-store.spec.ts` (4 cases; `load()`/`loading` do not exist yet)                                                                                                                | **EXIT 1**: `TS2339: Property 'load' does not exist on type 'PaseStore'` (same for `loading`)       |
| 5. **1d.4 GREEN** | `PaseStore.load()` + `loading` signal + `DataApiService` injection; `App` `afterNextRender`/`isPlatformBrowser` wiring; `provideHttpClient` in config; `provideHttpClientTesting` in `app.spec` | filtered **4 passed (4)** → full `test:unit` **81 passed (81)**, 6 files; `tsc` app + spec → exit 0 |

## 1d.5 hydration acceptance — actual evidence

Serving (zero source/config changes): the prod bundle constructs its request handler **without**
passing `angular.json` security config (`new hn` with no argument → `allowedHosts ?? NG_ALLOWED_HOSTS`
env fallback), so `security.allowedHosts: []` (pre-existing, recorded out-of-scope since 1a) is
bypassed with `NG_ALLOWED_HOSTS=localhost,127.0.0.1`. An edge proxy (Node, `/tmp/opencode/edge.mjs`)
simulates the deployment layer (deviation A1): `/api/* → 127.0.0.1:3000` (standalone API), everything
else → SSR `:4100`.

Phased headless-Chromium run (`/tmp/opencode/hydration-check.mjs`, API gated via `page.route`):

| Phase                                                 | Result                                                                                                                                                                              |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: prerendered load → hydration → fetch fired (gated) | **zero NG0500/NG0502 — zero console errors of any kind**                                                                                                                            |
| B: role switch to provider while gated                | provider KPI row shows the **seeded** snapshot (`DE 130 GB CONTRATADOS · 40% EN USO`); 1 console error attributed to the probe window — see decision 5 below                        |
| C: API released → store flip                          | KPI row flips to the **persisted** payload (`DE 0 GB CONTRATADOS`), **zero new console errors**; `GET /api/events` with `x-user-id: usr-001` + 3 guests + 3 photos = **7 requests** |

Additional no-DB-at-prerender proof: build ran with `DATABASE_URL` pointed at a nonexistent path —
success + no DB file created (prerender touches no database by construction; store renders the
bundled seed snapshot).

## Verification gates (actual output, 1d.7)

| Command                                            | Result                                                                                        |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `npm run test:unit`                                | **81 passed (81)**, 6 files (73 baseline + 8 new: 4 service + 4 store)                        |
| `npm run test:int`                                 | **30 passed (30)**, 6 files (1c suite untouched and green)                                    |
| `npx tsc --noEmit -p tsconfig.app.json`            | exit 0                                                                                        |
| `npx tsc --noEmit -p tsconfig.spec.json`           | exit 0                                                                                        |
| `npx prettier --check` on all 7 touched code paths | clean (3 files reformatted with `--write in-cycle; `openspec/*.md` excluded per 1a precedent) |
| `npx ng build`                                     | exit 0 — "Prerendered 1 static route", final rebuild after formatting                         |
| Bundle guard (`dist/qr_control/browser`)           | **0 matches** for `@prisma`/query-engine/`query_compiler`/`better-sqlite3`/`PrismaClient`     |
| Hydration acceptance (headless Chromium, phased)   | **PASSED** (table above)                                                                      |

## Recorded decisions & deviations (PR-1d)

1. **Initial store state = bundled seed snapshot + `loading = true` flag** (not empty arrays).
   This reconciles design §4 ("the store starts in a `loading` state on both server and client")
   with the PR-1d header's explicit out-of-scope "seed-data runtime decoupling (PR-4)" and task
   4.7 ("remove the store's seed initialization remnants **now that `PaseStore.load()` owns
   state**" — i.e., remnants survive 1d). Hydration identity comes from the bundled constants:
   server and client construct byte-identical state and issue zero requests at construction
   (asserted). `load()` then overwrites `guests/photos/events/passPool`; PR-4 removes the seed
   init, at which point the fallback becomes an empty store. Rollback boundary in tasks.md
   ("store returns to seed-initialized signals") confirms this reading.
2. **Trusted caller: `x-user-id: usr-001`** — a `TRUSTED_USER_ID` constant inside
   `DataApiService` (seeded provider user, per the 1c handoff; `prisma/seed.ts` assigns
   `usr-001` to the first `ensureUser` = provider). Role is read from the `User` row server-side;
   the extractor stays swappable by a future auth layer (design §2, "no auth in this change").
3. **`load()` request shape: 1 + 2×N** (`GET /api/events` then per-event guests/photos — those
   are the only read routes 1c exposes). At seed scale (3 events) = 7 requests; acceptable per
   design's "data volume is trivial". Failure → seed fallback + warn toast, `loading` ends either
   way so no UI guard can spin forever.
4. **Storage KPI reads `NaN% EN USO` after load — known display-state gap, NOT fixed in 1d.**
   The API synthesizes `used: 0/max: 0` (never persisted — `repositories/events.ts` comment),
   `metrics.spec.ts` locks `NaN% EN USO` as "preserved prototype behaviour", and `seed.ts` states
   display counters are "recomputed client-side later". Changing `kpis()` would violate the 4.7
   "keep `metrics.spec.ts` intact" constraint and prototype parity. Owner: the later display-state
   slice (with PR-2/4 work). Documented here so the manual acceptance is not re-litigated.
   **→ RESOLVED in the display-state cleanup batch (commit `be37243`).** The rationale above
   held that the gap was a display-state matter for a later slice; it was closed early because
   the API was actively serving fake zeros, which made every storage bar render 100% wide and
   red. The "preserved prototype behaviour" claim was false: `QR_Z_Open/app.js:14` has no NaN
   guard and the prototype always had three static events, so it never had an empty-list path.
   The counters now resolve client-side from a display mock and the API omits them.
5. **NG0203 discovered on role switch — pre-existing, deliberately NOT fixed in 1d.**
   `src/app/core/feed.service.ts:48` calls `inject(DestroyRef)` **inside** the `afterNextRender`
   callback; Angular v22 runs those callbacks outside the injection context (`@throws NG0203 when
called outside an injection context`, `@angular/core` core.d.ts) → one `ERROR … NG0203` the
   first time the provider view constructs FeedService. Attribution: phase A (App's own
   `afterNextRender` + boot) and phase C are error-free; only the role-switch window emits it,
   and feed.service.ts is the **only** callback in `src/app/**` calling `inject()` mid-callback
   (clock/metrics-section/stat-tile/modals all capture fields — the correct pattern). Fix =
   hoist to a field like `clock.ts:38`. Not done here: `feed.service.ts` carries a parallel
   session's prettier reflow (pre-existing dirty), and FeedService cleanup is outside 1d scope.
   **Req 15 acceptance is unaffected: zero NG0500/NG0502, zero errors on the load path.**
   **→ RESOLVED in the display-state cleanup batch (commit `aea3969`).** The blocker recorded
   above ("`feed.service.ts` carries a parallel session's prettier reflow") was removed first by
   committing that reflow as its own work unit; the fix is the predicted field injection, and
   it now has a spec that fails with NG0203 against the old code.
6. **Serving acceptance needed no file changes** — `NG_ALLOWED_HOSTS` env (see 1d.5 section) +
   a throwaway edge proxy mimicking the deployment layer. `angular.json` remains untouched
   (its only current diff is a foreign prettier reflow). Note for deployment recipes: with the
   scaffold's `allowedHosts: []` the SSR process must be started with `NG_ALLOWED_HOSTS` set,
   or the key must be given a real value at the deployment layer.

## PR-2a handoff notes (from PR-1d)

- **Browser specs need HTTP test providers.** `PaseStore` now injects `DataApiService` → any
  TestBed that constructs it (today only `app.spec.ts`) needs `provideHttpClient()` +
  `provideHttpClientTesting()`.
- **NG0203 fix candidate** (decision 5): `feed.service.ts` line 48 → field-injected `destroyRef`.
  Small, but belongs to whoever owns that file's pending prettier diff — recommend bundling it
  into the next client-facing batch rather than 1d. **→ DONE in commit `aea3969`.**
- **Storage/`used`/`max` display state** (decision 4): when a slice starts persisting or
  recomputing these, `kpis()` NaN behavior and `metrics.spec.ts:460` must change together.
  **→ DONE in commit `be37243`: `kpis()` now resolves through the display mock and
  `metrics.spec.ts` pins the real contract (`51.4` / `40% EN USO` / `—` for no contract).**
- **After PR-4 removes seed init:** `load()`'s error fallback becomes an empty store — revisit
  whether an empty-state UI (loading/empty guards) is required then; `loading` signal already
  exists for it.
- **Client role stays demo-only:** `store.role()` never reaches the API (always `usr-001`); a
  real auth layer is out of this change's scope by design §2.

## Code-line count vs 400 budget (code only, excl. comments/blank)

- New: `data-api.service.ts` **29**, `data-api.service.spec.ts` **84**, `pase-store.spec.ts` **133**
- Modified (added lines): **38** across `pase-store.ts` / `app.ts` / `app.config.ts` / `app.spec.ts`
- **Total: 284 — inside the 400 review budget** (estimate band 210–300; fixtures in the two specs
  explain landing at the top of the band). Risk: Low, as forecast.

## Files touched (PR-1d, uncommitted)

- **New:** `src/app/core/api/data-api.service.ts` (29 code), `src/app/core/api/data-api.service.spec.ts`
  (84), `src/app/core/pase-store.spec.ts` (133)
- **Modified:** `src/app/core/pase-store.ts` (+`loading`, +`load()`), `src/app/app.ts`
  (`afterNextRender` wiring), `src/app/app.config.ts` (`provideHttpClient`), `src/app/app.spec.ts`
  (HTTP test providers), `tasks.md` (1d.1–1d.7 ticks), this file
- **Total:** 9 paths (3 new + 6 modified)
- **Untouched:** `seed-data.ts`, `metrics.ts` + `metrics.spec.ts` (NaN parity preserved),
  `app.routes.server.ts` (`Prerender` intact), `src/server/**`, `prisma/**`, `angular.json`,
  and every pre-existing dirty path (incl. the parallel session's files: `event-hero.ts`,
  `guest-detail.ts`, `metrics-section.ts`, `stat-tile.ts`, `photo-cloud.ts`, `topbar.css`,
  `qr-ticket-modal.ts`, `styles.css`, the prettier-reflow set, `package.json` prior content)

---

# Display-state cleanup — PR-1d's two deferred decisions (DONE)

Two defects that PR-1d deliberately left open were closed in a dedicated batch, together with
the repo-wide formatting backlog that had been blocking safe staging for the whole chain.

## Status

| Item                                         | Status | Verification                                                                                                                                             |
| -------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decision 5 — NG0203 in `feed.service.ts`     | ✅     | commit `aea3969`; new `feed.service.spec.ts` (RED: `expected [ -203 ] to deeply equal []` → GREEN 3/3)                                                   |
| Decision 4 — storage KPI `NaN% EN USO`       | ✅     | commit `be37243`; display mock `src/app/core/event-display.ts`; the API omits `used`/`max`/`br`; KPI reads `51.4GB / DE 130 GB CONTRATADOS · 40% EN USO` |
| NG0600 — the storage plan modal never opened | ✅     | commit `be37243`, spec `568f640`; the modal wrote a signal during render, so Angular aborted the render (the overlay was empty)                          |
| Repo-wide prettier backlog (72 dirty paths)  | ✅     | commits `0098e7e`, `dabb360`, `73c272f`, `8361a80`; the tree is clean for the first time in the chain                                                    |

## Decisions 4 and 5 — resolved

**Decision 5 (NG0203) — RESOLVED.** `inject(DestroyRef)` is hoisted to a field initializer in
`src/app/core/feed.service.ts`, the pattern `clock.ts` already used. The new spec asserts that
no NG0203 is raised and that the scan interval is torn down on destroy.

**Decision 4 (storage KPI) — RESOLVED, and the original gap description was wrong.** The
actual rendered symptom at HEAD was `0.0GB / DE 0 GB CONTRATADOS · NaN% EN USO` — only the
_percentage_ was `NaN` (`gb(0) === '0.0'`); `"NaN GB"` only appears when the counters are
absent. The gap was real: the API synthesized `used: 0/max: 0` and `metrics.spec.ts:460` locked
`NaN% EN USO` under the comment "preserved prototype behaviour", which was **false** —
`QR_Z_Open/app.js:14` has no NaN guard and the prototype always had three static events, so it
never had an empty-list path.

Resolution (user decision): the storage counters are a **client-side display mock**, because
the storage service does not exist yet (BR-16 keeps image bytes on an external vendor) and
design §3 already decided counters are not stored. The API now omits `used`/`max`/`br`
entirely; `src/app/core/event-display.ts` holds the prototype's per-event figures and
resolves them client-side; an event without a fixture renders an honest `—` instead of NaN.
No schema change and no migration — PR-2a's scope is untouched.

### Deviation from design §3 / §9 (recorded)

The API no longer synthesizes `used`/`max`/`br`. §3's "counters are not stored → client
`computed()`" is now literally true for the storage counters and implemented client-side.
`cd`, the admin contact block and the security-guard details are **still** synthesized as
empty/null — same root cause, different fields, not yet addressed.

### Known limitation (documented, not fixed here)

The mock is keyed by event id, and the client prototype ids (`ev1`) differ from the seeded row
ids (`ev-001`, derived from the event order by `prisma/seed.ts` per design §3's "deterministic
explicit IDs"). A `PERSISTED_IDS` alias binds them by position. If the seed's event **order**
changes the alias silently mis-binds; if the id **scheme** changes the KPI goes blank. Both are
now caught by tests (`event-display.spec.ts` + `seed.int.spec.ts`). The systemic fix — one
id space for the same records — is deferred.

## Strict TDD evidence

| Behaviour                                    | RED                                                                                                  | GREEN                       |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------- |
| No NG0203 in the render callback             | `npm run test:unit` → `expected [ -203 ] to deeply equal []`                                         | `npm run test:unit` → 3/3   |
| The API stops emitting fake counters         | `npm run test:int` → `expected { id: 'ev-003', … } to not have property "used"`                      | `npm run test:int` → green  |
| The KPI resolves through the mock, never NaN | `npm run test:unit` → `expected '0.0' to be '51.4'` · `expected '0.0' to be '—'`                     | `npm run test:unit` → green |
| The modal opens (NG0600 regression)          | `npm run test:unit` → `NG0600: Writing to signals is not allowed while Angular renders the template` | `npm run test:unit` → green |

## Verification gates (actual output, after the batch)

| Gate                                                           | Result                                                                                                                                                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:unit`                                            | 9 files / 105 tests passed                                                                                                                                                                  |
| `npm run test:int`                                             | 6 files / 32 tests passed                                                                                                                                                                   |
| `npx tsc --noEmit`                                             | exit 0                                                                                                                                                                                      |
| `npm run build`                                                | success, 1 route prerendered                                                                                                                                                                |
| `node scripts/verify-parity.mjs --slice all`                   | 57/57                                                                                                                                                                                       |
| Browser (Chrome DevTools MCP, headless Chrome for Testing 156) | KPI `51.4GB / DE 130 GB CONTRATADOS · 40% EN USO`; rows `38.2 / 50 GB`, `12.4 / 50 GB`, `0.8 / 30 GB`; bars `76.4%`, `24.8%`, `2.66667%`; **0 occurrences of `NaN`**; **0 NG0203 / NG0600** |

## Code-line count vs 400 budget (code only, excl. comments/blank)

- `aea3969` (NG0203 + its spec): **52**
- `be37243` (storage mock + types + mapper + 4 surfaces + spec updates): **196**
- `568f640` (new specs: mock, modal, alias): **158**

All three are inside the 400 review budget on the chain's own metric. The raw diff for
`be37243` is 416 changed lines, inflated by 123 comment lines; it could not be split into two
independently-green commits — the server-first order leaves the client reading undefined
counters while CI stays green (the unit suite mocks the API), and the client-first order
keeps the API's fake zeros.

## Files touched (display-state cleanup)

- **New:** `src/app/core/event-display.ts`, `src/app/core/event-display.spec.ts`,
  `src/app/core/feed.service.spec.ts`, `src/app/shared/modal/storage-plan-modal.spec.ts`
- **Modified:** `src/app/core/models.ts`, `src/app/core/metrics.ts` + spec,
  `src/app/core/seed-data.ts`, `src/app/core/pase-store.spec.ts`,
  `src/app/core/api/data-api.service.spec.ts`, `src/app/features/provider/event-row.ts`,
  `src/app/shared/modal/storage-plan-modal.ts`, `src/app/core/feed.service.ts`,
  `src/server/data/repositories/events.ts`, `src/server/api/events.int.spec.ts`,
  `src/server/data/seed.int.spec.ts`
- **Untouched:** `prisma/**` (no migration), `QR_Z_Open/` (frozen corpus)

## PR-2a handoff notes (from the display-state cleanup)

- **`POST /api/events` must return the same event shape**: no `used`/`max`/`br`. An event
  created through the API has no fixture, so the client renders `—` for its storage — that is
  the intended honest fallback, not a defect to fix in 2a.
- **`cd`, the admin contact block and the security-guard details are still synthesized** as
  empty/null by the mapper. Same root cause as the storage counters, different fields. If 2a's
  event-creation contract is to display real admin contact data, those fields need the same
  client-side treatment — decide before writing 2a.3.
  **→ RESOLVED in the third display-state batch (commits `5dc3f18` + `9da3749`).** The mapper
  now omits all three, and the client resolves them from the display module. An event created
  through `POST /api/events` therefore has no fixture: its contact lines, its guard details and
  its badge render the honest em dash, which is the intended behaviour, not a gap to close in
  2a.
- **`storageOf()` requires both `used` and `max`.** Applying a storage plan to an event with no
  fixture sets `max` but the UI keeps showing `—` (a fixture-less event is skipped by the
  totals). Latent today: "Alta de evento" is still a stub toast.

---

# Display-state cleanup, third batch — the last three display families (DONE)

The first batch closed the storage counters; this one closes the admin contact, the security-guard
details and the countdown — the remaining prototype display fields the API used to fake.

## Status

| Item                                    | Status | Verification                                                                                                                     |
| --------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Admin contact (`email`/`phone`/`since`) | ✅     | commit `5dc3f18`; the mapper returns `admin: { name }`; the contact modal no longer claims a message was sent to a blank address |
| Guard details (`post`/`app`/`last`)     | ✅     | commit `5dc3f18`; the scanner KPI reads **3 of 9** (the prototype's value) instead of 0 of 9                                     |
| Countdown (`cd`)                        | ✅     | commit `5dc3f18`; the `EN 42 DÍAS` badge renders on the upcoming event only                                                      |
| Blank-string fallback hole              | ✅     | commit `5dc3f18`; a payload carrying `email: ''` no longer resurrects the empty address                                          |
| DOM-level specs for the three families  | ✅     | commit `9da3749`                                                                                                                 |

## The module

`src/app/core/event-display.ts` **supersedes** `storage-display.ts` and is now the single owner of
every prototype display fixture: the storage counters, the admin contact, the guard details and the
countdown. (Git records this as a delete plus an add, not a rename: the similarity falls below
git's default 50% rename threshold, so `git log --follow` will not connect the two.)

**Resolution rule — per field:** the payload's own value wins, the fixture answers for the rest,
and the result is `undefined` only when **neither** knows anything. `storageOf`, `adminContactOf`
and `resolvedGuards` all implement it identically.

**A blank string counts as unknown**, so a payload that carries `email: ''` or `post: '   '` falls
back to the fixture instead of rendering an empty line. Two carve-outs keep their own meaning:
`app: 'none'` is a real prototype state (`QR_Z_Open/app.js:172`) and an explicit `last: null`
means "never synced".

**What the API now omits:** `cd`, `admin.email/phone/since`, `security[].post/app/last` — plus the
storage counters from the first batch. **What it keeps:** `admin.name`, `security[].name`,
`guests`, `photos`, `dateLabel`, `note`. The names are domain data: `prisma/seed.ts` derives the
event start from `dateLabel` and creates the `User` rows from `admin.name` / `security[].name`.

## Strict TDD evidence

| Behaviour                                           | RED                                                                                                    | GREEN   |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------- |
| The scanner KPI counts the resolved app states      | `expected '0' to be '3'`                                                                               | 144/144 |
| The event row resolves the contact and the badge    | `expected '' to be 'EN 42 DÍAS'` · `expected ['',''] to equal ['mariana.solorzana@valdemar.mx', …]`    | 144/144 |
| The contact modal does not claim a message was sent | `expected ['Mensaje enviado a undefined']`                                                             | 144/144 |
| A blank field lets the mock answer                  | `expected { email: '', phone: '   ' } to strictly equal { email: 'mariana.solorzana@valdemar.mx', … }` | 144/144 |
| A blank badge is not rendered as an empty pill      | `expected '   ' to be 'ESCÁNER — PUERTA A'` · countdown variant                                        | 144/144 |

A fresh-context adversarial review reproduced **9 of 9** of these failures by reverting each hunk
individually in a throwaway copy.

## Verification gates (actual output)

| Gate                                         | Result                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:unit`                          | 11 files / 144 tests passed                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `npm run test:int`                           | 6 files / 33 tests passed                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `npx tsc --noEmit -p tsconfig.app.json`      | exit 0                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `npx tsc --noEmit -p tsconfig.spec.json`     | exit 0                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `npm run build`                              | success, 1 route prerendered                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `./node_modules/.bin/prettier --check .`     | zero flagged files                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `node scripts/verify-parity.mjs --slice all` | 57/57                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Browser (Chrome DevTools MCP)                | admin lines populated (`mariana.solorzana@valdemar.mx`, `+52 646 118 44 20`, `Cliente desde 2023`); scanner KPI `3/ 9`; badge `EN 42 DÍAS` on the upcoming event only; guard posts and app labels render; contact modal header `PARA · mariana.solorzano@valdemar.mx · GALA ANIVERSARIO VALDEMAR` and toast `Mensaje enviado a mariana.solorzana@valdemar.mx`; body text with **no `NaN`** and **no `undefined`**; **no NG0xxx** in the console |

## Code-line count vs 400 budget (code only, excl. comments/blank)

- `5dc3f18` (module + types + mapper + seed + consumers + the module's spec + the modified specs): **541** — **over the 400 budget, size:exception recorded**. The module lands with its own spec deliberately: without it this commit deletes `storage-display.spec.ts` (14 tests) with no replacement and the unit count drops from 105 to 92.
- `9da3749` (the DOM-level specs of the three families): **171**

## Files touched (third display-state batch)

- **New:** `src/app/core/event-display.ts`, `src/app/core/event-display.spec.ts`,
  `src/app/features/provider/event-row.spec.ts`, `src/app/shared/modal/contact-modal.spec.ts`
- **Superseded:** `src/app/core/storage-display.ts`, `src/app/core/storage-display.spec.ts`
- **Modified:** `src/app/core/models.ts`, `src/app/core/metrics.ts` + spec, `src/app/core/seed-data.ts`,
  `src/app/core/pase-store.spec.ts`, `src/app/core/api/data-api.service.spec.ts`,
  `src/app/features/provider/event-row.ts`, `src/app/shared/modal/contact-modal.ts`,
  `src/app/shared/modal/storage-plan-modal.ts`, `src/server/data/repositories/events.ts`,
  `src/server/api/events.int.spec.ts`, `src/server/data/seed.int.spec.ts`, `prisma/seed.ts`
- **Untouched:** `prisma/schema.prisma` (no migration), `QR_Z_Open/`

## PR-2a handoff notes (from the third display-state batch)

- **`POST /api/events` must return the same event shape**: no `cd`, no `admin.email/phone/since`,
  no `security[].post/app/last` and no `used`/`max`/`br`. An event created through the API has no
  fixture, so its display fields render the honest em dash. That is the intended behaviour.
- **The display module is now the single owner** of the prototype's display fixtures. If 2a needs
  a new display field (a provider contact, a QR label), it belongs in `event-display.ts` — not in
  the mapper — or the API starts faking values again.
- **The `PERSISTED_IDS` alias binds by seed position.** If `prisma/seed.ts` ever changes the
  event **order** the alias silently mis-binds; if the id **scheme** changes the display falls back
  to the em dash. Both are covered by tests. The systemic fix — one id space for the same records
  — is still deferred.

---

# PR-2a-i — authz writes core: events + guests (tasks 2a.2, 2a.3, 2a.4/2a.5 guests half, 2a.10)

Continuation batch. Nothing staged or committed (orchestrator owns git). Working tree carries
only the 2a-i footprint; `prisma/**`, the schema and the Angular feature/client code are
untouched.

**TDD account (corrected after the 2026-10-23 adversarial review — the previous "executed
under strict TDD" claim for this batch was FALSE):** the 2a.2 suite (`events-write`) WAS
written first against the absent `POST /api/events` (RED 11/11 on 404, genuinely captured),
but the 2a.4/2a.5 guest work was implemented BEFORE its spec, producing a spurious green; the
batch then reverted the guest write path and the `active` read mapping and re-captured the
RED (9 failures reproduced — verified non-tautological via faithful revert). The cycle cannot
be replayed honestly once the implementation exists.
**TDD exception approved by maintainer (user decision, 2026-10-23): cycle cannot be replayed
honestly once implementation exists; RED captures verified non-tautological via faithful
revert (9 failures reproduced).**

## Status

| Task                                            | Status    | Verification                                                                                                                                                                                                          |
| ----------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2a.2 `events-write.int.spec.ts` (RED→GREEN)     | ✅        | RED **11/11 failed** (`expected 404 to be 201/403/400/401` — route absent). GREEN **11/11**.                                                                                                                          |
| 2a.3 `POST /api/events`                         | ✅        | Provider-only creation; ≥1 admin validated against `User` rows (`role` from the DB); event + assignments created in one Prisma `create`. Reuses the read mapper, so the response has no display-only fields.          |
| 2a.4 object-level scope suite — **guests half** | 🚧 half   | `scope.int.spec.ts` **9/9 green** (exact-ID rejection, unknown-vs-foreign parity, no record change, own-event reads). **Photos half stays open for 2a-ii**; task checkbox intentionally unchecked.                    |
| 2a.5 guest writes — **guests half**             | 🚧 half   | `POST /api/events/:id/guests` (201) and `PATCH /api/guests/:id` (status/active) are assigned-admin only; object scope resolves from the row's own `eventId`. Photo endpoints stay open for 2a-ii; checkbox unchecked. |
| 2a.10 PR verification gate                      | 🚧 (2a-i) | All gates green for 2a-i (table below + the review-fix batch section). The checkbox stays OPEN: 2a.10 also covers 2a.4/2a.5, which close only at the end of 2a-ii.                                                    |

## Strict TDD evidence (RED → GREEN)

| Task        | Test file                                 | Layer       | RED evidence                                                                                                                                                                                                                                                                                                                               | Why it failed                                                                                                                              | GREEN evidence         |
| ----------- | ----------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| 2a.2        | `src/server/api/events-write.int.spec.ts` | Integration | `Tests 11 failed (11)` — every case `404`                                                                                                                                                                                                                                                                                                  | `POST /api/events` did not exist                                                                                                           | `Tests 11 passed (11)` |
| 2a.4 guests | `src/server/api/scope.int.spec.ts`        | Integration | First attempt passed spuriously: the guest write path had been implemented in the 2a.3 step, before this spec. The batch **reverted the guest write path and the `active` read mapping** and re-ran: `Tests 9 failed (9)` — `expected 404 to be 200/403/201/400` and, for reads, `expected false to be true` (no `active` in the payload). | Guest routes absent; reads did not expose `active`. **The earlier order was a TDD violation and was discarded, not reported as evidence.** | `Tests 9 passed (9)`   |
| 2a.5 guests | same                                      | Integration | Covered by the 2a.4 RED (all nine cases failed for the right reason)                                                                                                                                                                                                                                                                       | Routes and mapper absent                                                                                                                   | `Tests 9 passed (9)`   |
| 2a.3        | same                                      | Integration | Covered by the 2a.2 RED (all eleven cases failed on `404`)                                                                                                                                                                                                                                                                                 | Route absent                                                                                                                               | `Tests 11 passed (11)` |

**Triangulation.** Event creation: explicit retention + explicit schedule; defaults
(`retentionDays` 365, `status: 'upcoming'`, `note: null`) with two admin assignments; admin and
security rejections; no-admin rejection; five invalid-payload variants (blank name, unparseable
start, end ≤ start, unknown admin user, non-admin assignment); unauthenticated rejection. Guest
scope: partial PATCH merge (`status`+`active`, then `active` only), foreign-by-exact-ID rejection
with full-row equality before/after, foreign-vs-nonexistent response parity, own-event creation
with a companion, cross-event creation rejection, security/provider write rejection, invalid
status rejection, and own-vs-foreign reads with a DB-derived id set.

## Verification gates (actual output)

| Gate                                         | Result                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| `npm test -- --watch=false`                  | **11 files / 144 tests passed** (unchanged baseline)                    |
| `npm run test:int`                           | **8 files / 53 tests passed** (33 baseline + 11 events-write + 9 scope) |
| `npx tsc -p tsconfig.app.json --noEmit`      | exit **0**                                                              |
| `npx tsc -p tsconfig.spec.json --noEmit`     | exit **0**                                                              |
| `npm run build`                              | exit **0** — "Prerendered 1 static route", no NG05xx                    |
| `./node_modules/.bin/prettier --check .`     | **All matched files use Prettier code style** (0 unformatted)           |
| `node scripts/verify-parity.mjs --slice all` | **57/57 checks passed — all green**                                     |

## Code-line count vs 400 budget (code only, excl. comments/blank)

| Unit                                   | Lines   |
| -------------------------------------- | ------- |
| `api/events-write.int.spec.ts` (new)   | 115     |
| `api/scope.int.spec.ts` (new)          | 133     |
| `api/write-validation.ts` (new)        | 103     |
| `api/index.ts` (diff, added code)      | 69      |
| `api/app.ts` (diff)                    | 8       |
| `api/authz.ts` (diff)                  | 10      |
| `data/repositories/events.ts` (diff)   | 33      |
| `data/repositories/guests.ts` (diff)   | 68      |
| `app/core/models.ts` (diff, `active?`) | 1       |
| **Total**                              | **540** |

**⚠️ Over the 400 budget by 140 code lines.** The forecast for 2a-i was ≤350; the suites alone are
248 lines because the two required scenario sets became 20 integration tests. Coverage was not
trimmed to hit the number. The split boundary is already proven by the RED run: the guest write
path was reverted and `events-write` stayed green while `scope` failed with 404s, so the batch is
two independently-green work units:

- **2a-i-A events** (events-write spec + event validation + `EventWriteInput`/`createEvent`/
  `existingAdminIds` + `POST /api/events` + `canCreateEvent` + JSON parser): **≈246** code lines.
- **2a-i-B guests** (scope spec + guest validation + guest write functions + `active` mapping +
  `POST /api/events/:id/guests` + `PATCH /api/guests/:id` + `canWriteEvent`): **≈294** code lines,
  on top of A.

Recommendation to the orchestrator: land 2a-i as **two stacked work-unit PRs** (A → B) instead of
one 540-line PR. Do **not** consume `size:exception`; no further splitting of the work itself is
needed, only of the PR boundary.

## Decisions (2a-i)

1. **Event creation body:** `{ name, start, end, retentionDays?, note?, status?, admins: [{ userId,
role: 'admin' }] }`. `status` accepts the persisted vocabulary (`upcoming|active|finished`) and
   defaults to `upcoming`; `retentionDays` defaults to 365. The API returns the **read** shape via
   the existing mapper: no `cd`, `used`, `max`, `br`, admin contact or guard details.
2. **Admin assignments are validated twice:** the payload must declare `role: 'admin'`, and each
   `userId` must exist with the stored `admin` role (`existingAdminIds`). The client never decides
   the role. A provider therefore cannot smuggle a security assignment into event creation.
3. **IDs are generated server-side** (`ev-<uuid>`, `g-<uuid>`, `c-<uuid>`). The deterministic seed
   ids are unchanged; no client-supplied id is accepted.
4. **Guest write contract:** `name` required; `email`/`phone`/`note` default to `''`; `table` to 0;
   `status` to `planned`; `party` to `[]` (companions are created in the same transaction).
   `PATCH /api/guests/:id` accepts only `status` and/or `active` — no delete, no event move.
5. **`active` is now part of the read shape as an optional field** (`Guest.active?`), closing the
   S5 handoff from PR-1c without rewriting the bundled fixtures. The API always sends the persisted
   value; the client does not consume it yet. This is a type-only addition, no client behavior.
6. **Object-level writes never trust a client event id.** `PATCH /api/guests/:id` loads the row's
   own `eventId` and then checks `canWriteEvent`. A foreign row and a nonexistent row return the
   same `{ statusCode: 403, message: 'Forbidden' }`; the suite asserts response parity.
7. **Write roles follow design §5:** guests are assignable-admin writes. `provider` and `security`
   get 403 on guest writes, even though the provider can read them. Event creation is the
   provider-only exception (BR-02).
8. **App-layer validation** lives in `api/write-validation.ts` as pure `ParseResult` parsers (no
   thrown errors, no status enums in Prisma). `express.json()` is mounted once in
   `createApiApp()`, and the terminal error handler maps body-parser 400s to the generic
   `Bad Request` payload so parser details never leak.
9. **2a.4/2a.5 stay unchecked** because the photos half is pending; the guests half is recorded
   here. **2a.10 stays open** for this batch and must be re-run at the end of 2a-ii.

## Handoff to PR-2a-ii

**What is left:** `POST /api/events/:id/photos`, `PATCH /api/photos/:id` (state/active), the
members endpoints (2a.6–2a.7), and the toggle/no-delete suite (2a.8–2a.9). 2a.4 and 2a.5 close
only when the photos half lands.

**What to extend in `scope.int.spec.ts`:** the marked block at the bottom is the insertion point.
Add the same assertions for photos: own-photo `PATCH` succeeds; an admin of event A patching a
photo of event B by exact id gets the byte-identical 403 and the row is unchanged; an unknown
photo id is indistinguishable from a foreign one; `POST /api/events/:id/photos` is rejected for a
foreign event, for security and for the provider, with no row created; reads stay own-event only.
Reuse `canWriteEvent` and the `writeAccess()` guard — do not add a second scope mechanism.

**Status parsers:** `write-validation.ts` already owns `isGuestStatus`; add the photo predicate
(`pending|approved|rejected`) there rather than casting in the new route (S3 from PR-1c). Note
`active` is already on the `Guest` read shape; add the equivalent to `EventPhoto` when the photo
toggle lands.

**2a-ii forecast:** photos half ≈180 code lines (scope extension ~70 + validation/repo/routes
~110); members + toggles ≈255 (members spec ~90 + route/repo ~75 + toggle specs ~90). Combined
≈435, i.e. **again over 400** → split as **2a-ii-a photos** and **2a-ii-b members+toggles**, as
tasks.md already permits. Check-in/QR writes stay in PR-3b and join through `canWriteEvent`/the
scope helper.

## Files touched (2a-i, uncommitted)

- **New:** `src/server/api/events-write.int.spec.ts`, `src/server/api/scope.int.spec.ts`,
  `src/server/api/write-validation.ts`
- **Modified:** `src/server/api/index.ts`, `src/server/api/app.ts`, `src/server/api/authz.ts`,
  `src/server/data/repositories/events.ts`, `src/server/data/repositories/guests.ts`,
  `src/app/core/models.ts` (`active?` only), `openspec/.../tasks.md` (2a.2, 2a.3, 2a.10), this file
- **Untouched:** `prisma/**` (no schema change, no migration), `src/app/**` feature/client code,
  `seed-data.ts`, `event-display.ts`, `src/server.ts`, the Angular SSR bundle

---

# PR-2a-i — adversarial-review fix batch (required fixes 1–8 + S2/S7)

A fresh-context adversarial review of the 2a-i batch returned **BLOCK** (3 criticals, 6
warnings, 8 suggestions). This section records the fixes applied before commit; the A/B
re-split map at the bottom is the orchestrator's commit-split deliverable. Git state
unchanged: nothing staged or committed; the working tree carries the enlarged 2a-i footprint.

## Status

| Review item             | Fix applied                                                                                                                                                                                                                                       | Verification                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| C1 stored-role coverage | New test: payload `role:'admin'` on an existing security user → 400; new mixed-payload test for the known-id half                                                                                                                                 | mutation M1/M2 below — each half of `existingAdminIds` guarded alone       |
| W5 + W4 pure tables     | `canCreateEvent` + `canWriteEvent` `it.each` tables in `authz.int.spec.ts` (pure; the unit builder excludes `src/server/**`, so the int runner owns them)                                                                                         | mutation M3/M4 below — role half and assignment half guarded independently |
| C2 false TDD claim      | §PR-2a-i header corrected: batch was NOT strict TDD; TDD exception recorded (maintainer decision, 2026-10-23)                                                                                                                                     | this section                                                               |
| C3 tasks.md honesty     | 2a.1 + 2a.10 unchecked with corrected notes; A/B re-split note added                                                                                                                                                                              | `openspec/.../tasks.md`                                                    |
| W1 + S4 negative tests  | malformed JSON → generic 400 (events + guests), body >102400 B → 413, unauthenticated guest writes → 401, unknown-field mass assignment ignored                                                                                                   | mutation M5/M6/M11/M12 below                                               |
| W2 int4 bounds          | `MAX_RETENTION_DAYS = 3650`, `MAX_TABLE = 999`; exact review overflow values (`999999999999`, `2147483648`) tested                                                                                                                                | mutation M7/M8 below                                                       |
| W3 strict date parsing  | explicit UTC offset required; calendar round-trip (`2026-02-30T10:00:00Z` → 400)                                                                                                                                                                  | mutation M9/M10 below                                                      |
| W6 error-log truncation | `console.error` logs `{ status, type, message }` only — never the error object (`err.body` carries the raw request body; the parse message embeds a snippet); 4xx logs the same generic message as the response, 5xx logs the server-side cause   | genuine RED→GREEN below (canary test)                                      |
| S2 `"done"` alias       | `parseEventInput` maps `done → finished` BEFORE validating the persisted vocabulary (the previous check rejected `done` outright)                                                                                                                 | genuine RED→GREEN below                                                    |
| S7 `optionalText` trims | whitespace-only optional guest fields collapse to `''`; padded values are trimmed                                                                                                                                                                 | genuine RED→GREEN below                                                    |
| S1                      | documented here: duplicate `userId` entries in `admins` are **intentionally deduplicated** (`parseAdmins` push guard) — repeats neither fail the ≥1-admin check nor create duplicate assignment rows                                              | no code change                                                             |
| S3                      | documented here: optionality asymmetry is **intentional** — absent/null optional TEXT (email/phone/note) → `''`, but a present-but-null/non-array `party` → 400: text absence is data, party absence would silently change the guest's companions | no code change                                                             |
| S5, S6                  | out of scope for 2a-i                                                                                                                                                                                                                             | —                                                                          |
| S8                      | object-scope helper unification — **executed 2026-10-27 as 2a-ii pre-work** (before photos land) — see §S8 below                                                                                                                                  | §S8 below (helper + 8-row table + 6 mutations)                             |

## TDD evidence (this batch)

| Behaviour               | RED                                                                                                                                      | GREEN               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| S2 `"done"` input alias | observed pre-implementation: `Tests 2 failed \| 64 passed (66)` — `expected 201 to be 400` (parser rejected `done`)                      | 66/66 after the fix |
| S7 `optionalText` trims | same run: `expected '  recortada@example.com  ' to be 'recortada@example.com'` (untrimmed/whitespace-only values persisted)              | 66/66 after the fix |
| W6 sanitized error log  | `expected '[api] Unhandled error:\n{"expose":true…{"body":"{\"name\": \"canary-leak@example.com\"…"}` — the full request body in the log | 81/81 after the fix |

S2/S7 and W6 are genuine behavioural changes: the RED was captured before the implementation
existed (S2/S7 were left red by the previous session; W6's canary test failed on the logging
branch). Everything else in this batch is coverage/guarding of already-green behaviour and was
verified by **mutation testing** instead:

## Mutation-verification (coverage-only specs, 12/12 mutants killed)

Each mutant: precise literal replacement → targeted `vitest run` → the named test must go RED
→ restore (byte-identical restore verified with `cmp` for all 5 files).

| #   | Mutant (guard weakened)                               | Expected RED test killed                                                                       |
| --- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| M1  | `existingAdminIds` drops `role: 'admin'`              | `rejects an assignment whose stored role is not admin` (1 failed)                              |
| M2  | `existingAdminIds` drops `id: { in: … }`              | `rejects an unknown id mixed into otherwise-valid admin assignments` (5 failed incl. that one) |
| M3  | `canWriteEvent` drops the role half                   | W4 table — `provider/security assigned to the event → false` rows (2 failed)                   |
| M4  | `canCreateEvent` accepts admins (`!== 'security'`)    | W5 table — `admin → false` row (1 failed)                                                      |
| M5  | the 400 branch leaks the parser message               | both `answers a malformed JSON body with a generic 400` tests (events + guests) (2 failed)     |
| M6  | `express.json()` limit lifted to 10 MB                | `rejects a body over the JSON parser limit with 413` (1 failed)                                |
| M7  | `retentionDays` upper bound removed                   | `rejects an int-unsafe retentionDays (999999999999)` (3 failed)                                |
| M8  | `table` upper bound removed                           | `rejects an int-unsafe table value (2147483648)` (3 failed)                                    |
| M9  | UTC offset made optional in the ISO regex             | `rejects a naive datetime without offset` (1 failed)                                           |
| M10 | calendar round-trip check disabled                    | `rejects an impossible calendar date` (`2026-02-30T10:00:00Z` → 201) (2 failed)                |
| M11 | `PATCH /api/guests/:id` loses `callerContext`         | `rejects unauthenticated a guest patch with 401` (6 failed)                                    |
| M12 | guest-create route trusts a client-supplied `eventId` | `ignores mass-assignment attempts (id/eventId/active) on creation` (1 failed)                  |

Campaign script: `/tmp/opencode/mutation-campaign.sh` (backups in `/tmp/opencode/mut-backups/`).
The malformed-JSON log test also documents WHY the W6 fix is needed: `JSON.stringify` of a
body-parser error exposes `body` (the raw payload) and `String(err)` exposes the parse message.

## Verification gates (actual output, after the fix batch)

| Gate                                         | Result                                                                                       |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `npm run test:unit`                          | **11 files / 144 tests passed** (unchanged — no unit file touched)                           |
| `npm run test:int`                           | **8 files / 82 tests passed** (53 baseline + 11→25 events-write + 9→17 scope + authz tables) |
| `npx tsc -p tsconfig.app.json --noEmit`      | exit **0**                                                                                   |
| `npx tsc -p tsconfig.spec.json --noEmit`     | exit **0**                                                                                   |
| `npm run build`                              | exit **0** — "Prerendered 1 static route", no NG05xx                                         |
| `./node_modules/.bin/prettier --check .`     | 0 unformatted files                                                                          |
| `node scripts/verify-parity.mjs --slice all` | **57/57 checks passed — all green**                                                          |

## Code-line count vs 400 budget (code only, excl. comments/blank — chain metric)

| Unit                                   | 2a-i baseline | after fixes | Δ    |
| -------------------------------------- | ------------- | ----------- | ---- |
| `api/events-write.int.spec.ts` (new)   | 115           | 223         | +108 |
| `api/scope.int.spec.ts` (new)          | 133           | 200         | +67  |
| `api/write-validation.ts` (new)        | 103           | 129         | +26  |
| `api/index.ts` (diff)                  | 69            | 69          | 0    |
| `api/app.ts` (diff)                    | 8             | 26          | +18  |
| `api/authz.ts` (diff)                  | 10            | 10          | 0    |
| `api/authz.int.spec.ts` (diff)         | 0             | 17          | +17  |
| `data/repositories/events.ts` (diff)   | 33            | 33          | 0    |
| `data/repositories/guests.ts` (diff)   | 68            | 68          | 0    |
| `app/core/models.ts` (diff, `active?`) | 1             | 1           | 0    |
| **Total**                              | **540**       | **776**     | +236 |

## A/B split map (stacked-to-main, no `size:exception`, both ≤400)

**A — events ≈ 396 code lines** and **B — guests ≈ 376 code lines**, stacked A → B.
The split boundary is proven twice: by the recorded 2a.4 revert-RED (events-write stayed
green while scope failed 404) and by mutations M1/M2 (events repo) vs M11/M12 (guest routes).

### A — events (land first; independently green)

- `src/server/api/events-write.int.spec.ts` — whole file (**223**)
- `src/server/api/write-validation.ts` — A region only: `ParseResult`/`FAIL`, `isRecord`,
  `text`, `ISO_DATETIME`/`date` (W3), `EVENT_STATUSES`, `DEFAULT_EVENT_STATUS`,
  `DEFAULT_RETENTION_DAYS`, `MAX_RETENTION_DAYS`, `parseAdmins`, `parseEventInput` (S2) (**74**)
- `src/server/api/index.ts` — A hunks: `createEvent`/`existingAdminIds` + `parseEventInput` +
  `canCreateEvent` import extensions, `forbidden`/`badRequest` helpers, the `eventAccess`
  refactor to `forbidden(res)`, the whole `POST /api/events` route (**≈31**)
- `src/server/api/app.ts` — whole file: `express.json()` mount, generic-400 message branch,
  W6 sanitized error log (**26**)
- `src/server/api/authz.ts` — `canCreateEvent` only (**3**)
- `src/server/api/authz.int.spec.ts` — the W5 `canCreateEvent` table + the `canCreateEvent`
  import extension (**≈6**)
- `src/server/data/repositories/events.ts` — `EventWriteInput`, `existingAdminIds`,
  `createEvent`, `randomUUID` import (**33**)
- `src/app/core/models.ts` — **NOT in A** (the only models change is `Guest.active?` → B)

### B — guests (stacked on A)

- `src/server/api/scope.int.spec.ts` — whole file (**200**)
- `src/server/api/write-validation.ts` — B region: `MAX_TABLE`, `DEFAULT_GUEST_STATUS`,
  `GUEST_STATUSES`, `optionalText` (S7), `isGuestStatus`, `parseParty`, `parseGuestInput`,
  `parseGuestPatch`, the `GuestWriteInput`/`GuestPatchInput` type import (**55**)
- `src/server/api/index.ts` — B hunks: `createGuest`/`guestEventId`/`updateGuest` +
  `parseGuestInput`/`parseGuestPatch` + `canWriteEvent` import extensions, `writeAccess()`,
  `POST /api/events/:id/guests`, `PATCH /api/guests/:id` (**≈34**)
- `src/server/api/authz.ts` — `canWriteEvent` (**7**)
- `src/server/api/authz.int.spec.ts` — the W4 `canWriteEvent` table + import extension (**≈11**)
- `src/server/data/repositories/guests.ts` — whole diff (`Guest.active` mapping,
  `GuestWriteInput`/`GuestPatchInput`, `createGuest`/`guestEventId`/`updateGuest`) (**68**)
- `src/app/core/models.ts` — `Guest.active?` (**1**)

### Shared-file hunk ownership + A-green hazards (verify A in a scratch worktree)

1. **`index.ts` three shared import lines** (events repo, authz, write-validation): A lands the
   line with the A symbols (`createEvent, existingAdminIds`, `canCreateEvent`, `parseEventInput`);
   B extends the SAME line with the guest symbols. Stacked diffs, normal conflicts.
2. **A must NOT carry `import type { GuestPatchInput, GuestWriteInput }`** in
   `write-validation.ts` (those types are B-only) — with B's files absent this import breaks
   `tsc -p tsconfig.spec.json`.
3. **A must not mount the guest routes or `writeAccess()`** in `index.ts`; with B absent, the
   A tree contains no reference to `createGuest`/`guestEventId`/`updateGuest`/`canWriteEvent`.
4. **`models.ts` and `guests.ts` stay untouched in A**: no A test or route reads `Guest.active`
   (the pre-1c `listGuests` read path is sufficient).
5. **`app.ts` is wholly A** (parser + generic-400 + W6 log): the malformed-JSON/413/W6 tests
   live in the A suite (`events-write`); the scope spec's malformed-JSON test is B and passes
   against A's `app.ts` unchanged.
6. Scratch-worktree verification for A: apply A only → `npm run test:unit` (144),
   `npm run test:int` (events-write 25 + all pre-existing files; scope spec absent),
   `npx tsc -p tsconfig.app.json`, `npx tsc -p tsconfig.spec.json`, `npm run build`.

## S8 — object-scope helper unification (executed 2026-10-27 as 2a-ii pre-work)

The one deferred 2a-i review item, executed on the clean tree at `128f778` BEFORE photos
(PR-2a-ii) could add a third object-scope decision site. Strict TDD, **zero existing spec
edits** (events-write 25, scope 17, authz 7 pass unmodified).

### What changed (3 paths, ≈37 code lines added / ≈17 removed)

| File                                      | Change                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/server/api/authz.ts`                 | **+** pure decision `canWriteObject(caller, eventId: string \| null, ids)` = `eventId !== null && canWriteEvent(...)`: the ONE object-scope decision; a `null` owning event (nonexistent object) is denied for every caller, keeping nonexistent ≡ foreign byte-identical (spec req 3, scenario 3)                                                                                                                                           |
| `src/server/api/index.ts`                 | **±** middleware factory `requireObjectScope(resolveEventId)` replaces BOTH mechanisms (the `writeAccess()` factory and the inline `PATCH /guests/:id` scope block). Two instances: `eventWriteScope` (URL event id) / `guestRowWriteScope` (the row's `eventId` via `guestEventId`). Check order preserved: caller → resolve object → assignments → decision → same `forbidden(res)` 403; the PATCH handler now starts at `parseGuestPatch` |
| `src/server/api/object-scope.int.spec.ts` | **NEW** — pure decision table (8 rows, W4/W5 style): 4 EXISTENCE rows (null × role × assignment), 2 ROLE, 1 ASSIGNMENT, 1 baseline. Pins the entire scope decision the 2a-ii photo route must reuse                                                                                                                                                                                                                                          |

### TDD + mutation evidence (6/6 restores cmp-verified byte-identical)

- **RED first:** the new table before the helper existed — `8 failed | 82 passed (90)`,
  `canWriteObject is not a function` (every pre-existing suite green). **GREEN:** after the
  `authz.ts` addition → 90/90; the call-site refactor then stayed green with no spec changes
  (pure behaviour-preserving move).

| #    | Mutant (one guard half dropped)                        | Observed                                                                                                                                                                                                                                                                                     |
| ---- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S8-1 | `canWriteObject` drops `eventId !== null &&` (literal) | **killed by BOTH tsc gates** (`TS2345`: `string \| null` not assignable to `string`); int alone survives (esbuild skips types) → see S8-2                                                                                                                                                    |
| S8-2 | S8-1 + `as string` cast (forced compile)               | **survives 25/25 — runtime-equivalent mutant**: `assignedEventIds` is string-only by construction, so `ids.includes(null)` is always false, and both halves funnel to the same byte-identical 403. Recorded as equivalent (the type gate IS the existence guard), NOT claimed as a test kill |
| S8-3 | authority half dropped (`&& true`)                     | **RED: 8 failed** — 3 new-table rows + 5 scope HTTP tests                                                                                                                                                                                                                                    |
| S8-4 | `canWriteEvent` role half dropped                      | **RED: 2 failed** — assigned provider/security rows of the new table (kills independently of W4's M3)                                                                                                                                                                                        |
| S8-5 | `canWriteEvent` assignment half dropped                | **RED: 4 failed** — 1 new-table row + 3 scope HTTP tests                                                                                                                                                                                                                                     |
| S8-6 | `requireObjectScope` guard removed (wiring)            | **RED: 5 failed** in `scope.int.spec.ts` — that suite pins BOTH guest-write routes; `events-write` staying green under this mutant is by design (it covers `POST /events` only)                                                                                                              |

Campaign script: `/tmp/opencode/s8-mutation-campaign.sh` (backups `/tmp/opencode/s8-mut-backups/`).
Mutation counts above are **per filtered file set** (the campaign's file filters), not full-suite totals — full-suite re-runs by the fresh reviewer found MORE failures for the same mutants (e.g. S8-4: 2 filtered vs 5 full; S8-5: 4 filtered vs 5 full). Understating kills is the safe direction; the script records the exact filters.
S8-1/S8-2 are the honest account of the EXISTENCE half: no runtime test can distinguish it, so
it is enforced by `tsc` — recorded rather than fake-claimed as a test kill.

### Gates (actual output, after S8)

| Gate                                         | Result                                                             |
| -------------------------------------------- | ------------------------------------------------------------------ |
| `npm run test:unit`                          | **11 files / 144 tests passed** (unchanged — no unit file touched) |
| `npm run test:int`                           | **9 files / 90 tests passed** (82 baseline + 8 new decision rows)  |
| `npx tsc -p tsconfig.app.json --noEmit`      | exit **0**                                                         |
| `npx tsc -p tsconfig.spec.json --noEmit`     | exit **0**                                                         |
| `npm run build`                              | exit **0** — "Prerendered 1 static route", no NG05xx               |
| `./node_modules/.bin/prettier --check .`     | 0 unformatted files                                                |
| `node scripts/verify-parity.mjs --slice all` | **57/57 checks passed — all green**                                |

`tasks.md` untouched: 2a.4/2a.5/2a.10 stay open until 2a-ii completes. Contract for 2a-ii:
photo write routes MUST mount `requireObjectScope(...)` — a bare handler-level scope check is
now a review deviation from S8.
