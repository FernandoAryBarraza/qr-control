# Apply progress: persistence-prisma-sqlite — PR-1a

Phase: `sdd-apply`. Scope: PR-1a ONLY (tasks 1a.1–1a.13). Strict TDD active.
Chain position: `📍 1a → 1b → 1c → 1d → 2a → 2b → 3a → 3b → 4` (stacked-to-main, 9 PRs).

## Status

| Task | Status | Verification |
|---|---|---|
| 1a.1 config.yaml integration flip | ✅ | `integration: true`, `integration_test_command: "npm run test:int"`, context Testing line updated; `test_command` unchanged |
| 1a.2 `.gitignore` `*.db` + `.env` | ✅ | `git check-ignore` confirms `.env`, `dev.db`, `prisma/dev.db`; also ignored `*.db-journal/-shm/-wal` (SQLite sidecars) and `/src/generated/` (Prisma 7 client output) |
| 1a.3 `.env.example` + local `.env` | ✅ | `DATABASE_URL="file:./dev.db"`, `WEB_BASE_URL="http://localhost:4200"`; copied to gitignored `.env` |
| 1a.4 install prisma/@prisma/client/tsx + generate | ✅ | **Deviation:** `npm i -D prisma` resolved `latest` → **8.0.0-rc.23** (pre-release!) vs client 7.10.1 — pinned `prisma@^7` → stable **7.10.1 + @prisma/client 7.10.1**, 0 vulns. Added `@prisma/adapter-better-sqlite3@7.10.1` (Prisma 7 requires a driver adapter — see "learned"). Generator choice recorded below |
| 1a.5 `prisma/schema.prisma` (10 models) | ✅ | All 10 models; string statuses only (no enums — grep-verified); explicit `onDelete: Cascade` FKs; `Photo.authorName` + nullable `authorGuestId`; `retentionDays @default(365)`; indexes per sketch. Prisma required one addition vs sketch: `Guest.photos Photo[]` back-relation for `Photo.authorGuest` |
| 1a.6 initial migration | ✅ | `prisma/migrations/20261016154952_init/migration.sql` (140 SQL lines incl. FKs/indexes), applied to `prisma/dev.db` (gitignored) |
| 1a.7 `tsc --noEmit` after install | ✅ | `npx tsc --noEmit -p tsconfig.app.json` → exit 0, zero friction (env access uses bracket notation per `noPropertyAccessFromIndexSignature`) |
| 1a.8 npm scripts appended | ✅ | `test:unit`, `test:int`, `test:all`, `db:migrate`, `db:seed`, `db:reset` appended; existing `"test": "ng test"` untouched; `db:verify` deferred to PR-4 per task note |
| 1a.9 `vitest.integration.config.ts` | ✅ | Exact design §8 snippet; note: vitest warns the `.ts` config loads as CJS (no `"type":"module"`) — cosmetic today, rename to `.mts` when Vite requires it |
| 1a.10 integration harness | ✅ | Per-test-FILE temp SQLite (`mkdtemp`), `DATABASE_URL` set in `beforeAll` before any lazy client use, `execFileSync('npx',['prisma','migrate','deploy'])` (proves real migrations), API on `app.listen(0,'127.0.0.1')`, `apiFetch` helper, `afterAll` `$disconnect` + close + `rm -rf`, `beforeEach` FK-safe `resetDatabase()` (10 tables, children first) |
| 1a.11 health smoke **RED→GREEN** | ✅ | **RED:** `npm run test:int` → exit 1, `Cannot find module '../api/index'` (router absent). **GREEN:** implemented router/config/lazy-client + `app.use('/api', apiRouter)` before SSR handler → exit 0, `Tests 1 passed` asserting `200` + `{status:'ok', provider:'sqlite'}`. One iteration: my import path in `prisma-client.ts` was one `..` short — fixed, no design change |
| 1a.12 dev `/api/health` passthrough | ✅ **REMEDIATED** (standalone API + proxy) | First attempt BLOCKED (evidence below, kept for history); user approved option a → see **§1a.12-remediation**: smoke green direct (`:3000`) AND via `ng serve` proxy (`:4200`) |
| 1a.13 PR verification gate + bundle guard | ✅ | See gate outputs below |

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

| Step | Action | Result |
|---|---|---|
| 1. Baseline | `npm run test:unit` + `npm run test:int` | **73/73 + 1/1 green** |
| 2. **RED (failing test FIRST)** | integration harness pointed at the NEW standalone app-composition module `src/server/api/app.ts` (did not exist yet): `src/server/testing/integration-harness.ts` → `import { createApiApp } from '../api/app'` + `const app = createApiApp()` | `npm run test:int` → **FAILED (1/1)** — unresolved import at `src/server/api/health.int.spec.ts:2` (the `health.int.spec.ts` integration test is the RED carrier; no production code touched) |
| 3. **GREEN (minimal code)** | added `src/server/api/app.ts` — `createApiApp()`: the single `app.use('/api', apiRouter)` mount, express + router imports only, zero Angular imports | `npm run test:int` → **1 passed (1)**; `npx tsc --noEmit -p tsconfig.app.json` → exit 0 |
| 4. Hosting wiring | `src/server/api/main.ts` (standalone entry; `API_PORT` default 3000; `process.loadEnvFile()` at start), `/api` mount + `apiRouter` import REMOVED from `src/server.ts` (guard comment left behind), `proxy.conf.json` + `angular.json serve.options.proxyConfig`, `package.json` `api:start` script, `.env.example` `API_PORT="3000"` | unit **73/73** unchanged, int **1/1** green, build clean (below) |

### Verification gates (post-remediation, actual output)

| Command | Result |
|---|---|
| `ng test --watch=false` | **73 passed (73)**, 4 files — identical to baseline |
| `npm run test:int` | **1 passed (1)** (RED→GREEN captured above) |
| `npx tsc --noEmit -p tsconfig.app.json` | exit 0, no output |
| `ng build` | exit 0 — prerender 1 route, no NG05xx; `server.mjs` 920.52 kB; dev `ng serve` server bundle only 1.86 kB |
| Bundle guard (browser) | `grep -ril '@prisma\|query.engine\|query_compiler\|better-sqlite3' dist/qr_control/browser/` → **0 matches** |
| Bundle guard (SSR) | same grep on `dist/qr_control/server/server.mjs` → **0 matches**; `grep -c 'apiRouter\|/api/health'` → **0** (Angular 22 nests the server bundle at `dist/qr_control/server/server.mjs`, one level deeper than the task text's path) |
| Prettier (files touched) | all code/config files added or edited by this remediation are clean (`app.ts`, `main.ts`, `proxy.conf.json`, `health.int.spec.ts`, harness, `package.json`; `src/server.ts` + `angular.json` fail only on diffs verified identical at `HEAD`). The three `openspec/changes/persistence-prisma-sqlite/*.md` docs fail `prettier --check` on markdown table padding + bold-intro list style **used throughout the files since creation** (pre-existing hunks exist in regions this remediation never touched); remediation content follows the same surrounding style — NOT wholesale-reformatted (scope guard) |
| **Smoke A — direct** | `npm run api:start` → `curl -i http://localhost:3000/api/health` → `HTTP/1.1 200 OK`, `{"status":"ok","provider":"sqlite"}` |
| **Smoke B — `ng serve` proxy** | `npx ng serve` → `curl -i http://localhost:4200/api/health` → `HTTP/1.1 200 OK`, same JSON body (proxy headers: `Vary: Origin`, lowercased header names) |
| **Smoke B1 — routing proof** | stop the API process → same curl → **`HTTP/1.1 502 Bad Gateway`** + ng serve log `vite http proxy error: /api/health ... ECONNREFUSED`; restart API → **200** (recovery). Proves `4200/api/*` routes to `:3000`, not to Angular SSR |
| **Smoke C — prod `server.mjs`** | `PORT=4000 node dist/qr_control/server/server.mjs` boots and listens with **0 `__filename` errors** (previously crashed per request). Requests still answer `400 Header "host" ... is not allowed` — the PRE-EXISTING `security.allowedHosts: []` guard (out of scope, recorded above); prod `/api` is routed at the deployment layer → API process |
| ng serve log after remediation | `grep -c '__filename\|uncaughtException'` → **0** (was: one per request) |

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

| Command | Result |
|---|---|
| `ng test --watch=false` | **73 passed (73)**, 4 files — identical to pre-change baseline; `exclude: ["src/server/**"]` in the unit-test builder prevents `*.int.spec.ts` discovery |
| `npm run test:int` | **1 passed (1)** — `GET /api/health` 200 + provider marker (RED→GREEN captured above) |
| `npm run test:all` | 73 unit + 1 integration, exit 0 |
| `npx tsc --noEmit -p tsconfig.app.json` | exit 0, no output |
| `ng build` | exit 0, prerender 1 static route, no NG05xx; server bundle carries Prisma's lazy WASM query-compiler chunks (expected, server-only) |
| Bundle guard | `grep -ril '@prisma\|query.engine\|query_compiler' dist/qr_control/browser/` → **0 matches** (Angular 22 nests output under `dist/qr_control/browser`, not `dist/browser`) |
| `npx prettier --check .` | **Fails on ~140 PRE-EXISTING files** (verified via `git show HEAD:<file>` — `angular.json` and `src/server.ts` were already unclean at HEAD, in lines I did not touch). All files ADDED by this PR are prettier-clean (checked individually) |
| `ng serve` + curl `/api/health` | ✅ REMEDIATED — first attempt blocked (above); after the standalone-API remediation: 200 via proxy + 200 direct, see §1a.12-remediation |

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

| Unit | Lines |
|---|---|
| schema.prisma | 119 |
| migration.sql | 121 |
| harness | 63 |
| data/config.ts | 18 |
| prisma7.config.ts | 14 |
| data/prisma-client.ts | 11 |
| vitest.integration.config.ts | 9 |
| health.int.spec.ts | 9 |
| api/index.ts | 8 |
| .env.example | 2 |
| package.json delta | ~11 |
| .gitignore delta | 7 |
| angular.json delta | 4 |
| src/server.ts delta | ~2 |
| openspec/config.yaml delta | ~3 |
| **Total** | **≈ 401** |

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

- PR-1b: seed from `src/app/core/seed-data.ts` (1b.1 gate: verify no Angular imports).
  Remember: Prisma 7 seeds via `migrations.seed` in `prisma7.config.ts`, not package.json.
- PR-1c: read-only GETs + `CallerContext` + authz skeleton on top of the proven harness.
