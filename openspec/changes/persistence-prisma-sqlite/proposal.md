# Proposal: persistence-prisma-sqlite

## Intent

Replace the in-memory demo store (`PaseStore` seeded from `src/app/core/seed-data.ts`) with real
persistence: **Prisma + SQLite behind Express REST endpoints**, structured so a later switch to
PostgreSQL is a configuration event, not a rewrite (exploration.md Approach D/D1).

Honest framing: the original intent — "swap the test data for SQLite with Prisma" — understates
this change. The 10 product decisions resolved below (roles, event-scoped authorization, QR
lifecycle, deletion/retention policy) turn this into a **domain-persistence + server-side
authorization change**, not a data-source swap. This proposal encodes those decisions as testable
business rules; schema design, sequences, and task breakdown belong to the design/tasks phases.

## Why Now

- Stage is "preparing for real operation" (decision 1): the current phase is testing, but data must
  survive reloads. In-memory demo reset is no longer acceptable.
- Every later feature (QR issuance, check-in, multi-admin workflows) needs stable identities and
  FKs that only a DB provides. Bolting persistence on after those features would mean reworking
  them twice.
- The PostgreSQL target is known upfront (decision 10), so portability guardrails must be baked into
  the schema **now** (no Prisma enums, literal provider switch, reset-and-reseed migration path).

## What Changes

1. **Prisma + SQLite**: `prisma/schema.prisma` (SQLite datasource), migrations, `prisma/seed.ts`
   reusing existing `seed-data.ts` records (import, don't duplicate). `.db` file gitignored,
   recreated via `npm run db:seed`.
2. **Express REST API**: real endpoints in `src/server.ts` (the existing placeholder), backed by a
   server-only repository/service layer. Prisma Client never reaches the browser bundle.
3. **Domain model extensions** required by the business rules: `Event` gets `start`/`end` DateTime +
   `retention` setting; guests/companions/photos/check-ins get `eventId` + `active` flags; new
   entities for `User` (role records, no auth), admin-approval workflow (pending/approved/rejected),
   QR tokens (single-use, opaque), explicit FKs replacing display-name references.
4. **Server-side authorization layer**: event-scoped access checks on every admin-scoped endpoint
   (decision 3 — enforcement in the server, not UI hiding).
5. **Angular data layer**: a `DataService` (HTTP) loading into `PaseStore` signals **after
   hydration** (browser-only, `afterNextRender` pattern as in `FeedService`); store mutation methods
   become API calls with optimistic signal updates.
6. **Portability guardrails** (exploration D): string status fields (no Prisma enums), Prisma types
   mapped to existing `readonly` domain interfaces at the repository boundary, single-line provider
   switch with reset-and-reseed (D1).

## Business Rules

All rules are server-enforced and MUST have failing-test-first coverage (strict TDD).

### Roles & identity (decisions 1–2)

- **BR-01**: The system has exactly three roles: `provider`, `admin`, `security`. Users are
  persisted records with a role; there is **no authentication/login** in this change (Non-Goal), so
  role enforcement assumes a trusted caller context for now and MUST be structured so an auth layer
  can be inserted later without rewriting authorization logic.

### Event creation & admin scoping (decision 3)

- **BR-02**: Only a `provider` MAY create an event; each event MUST have at least one `admin`.
- **BR-03**: An `admin` MUST only read/write data belonging to events they are assigned to.
  Access to another event's data MUST be rejected **server-side** (403-equivalent), regardless of
  what the UI shows.
- **BR-04**: "Own event" means: event-scoped entities (guests, companions, photos, check-ins, QRs)
  are unreachable for an admin of a different event via any API path (including ID guessing —
  object-level authorization, not just list filtering).

### Second-admin approval workflow (decision 4)

- **BR-05**: An `admin` MAY request creation of a second `admin` for the same event; the request
  starts as `pending` and MUST NOT grant any scoped access until the event's `provider` sets it to
  `approved`. `rejected` requests grant nothing and are retained as records.
- **BR-06**: The `admin` of an event creates all lower roles (e.g. `security` staff who scan guest
  QRs). The `provider` MAY see who holds permissions in an event but MUST NOT create or approve
  lower roles — only that event's `admin` decides those, and only that event's `admin` (or
  provider) can grant a second admin (via BR-05 approval by provider).

### QR lifecycle (decision 5)

- **BR-07**: Every guest has their own QR; every companion has their **own** QR, linked to the
  parent guest's QR record.
- **BR-08**: A QR is single-use: the first successful check-in consumes it; subsequent scans MUST
  be rejected.
- **BR-09**: A QR is valid only before the owning event's `end` datetime. This applies to guest,
  companion, **and** emergency QRs — all expire at event end.
- **BR-10**: An `admin` MAY issue emergency QRs for their own event (BR-03 scope applies).
- **BR-11**: QR payload generation is server-side and MUST be an opaque token containing no
  personal data; it MUST be verifiable by a server endpoint and emailable as-is. The concrete
  image format is a DESIGN decision (open question below).

### Deletion & active toggles (decision 6)

- **BR-12**: Only the `provider` MAY hard-delete an event's data, only when the event's status is
  `finished`, regardless of dates. Deletion cascades across all event-scoped entities.
- **BR-13**: An `admin` MUST NEVER delete any record. Admins toggle a per-row `active` flag on
  guest, companion, photo, and check-in (soft toggle, reversible, per individual row).

### Retention (decision 7)

- **BR-14**: Event `start`/`end` datetimes define QR validity only (BR-09), not data lifetime.
- **BR-15**: The `provider` sets a per-event retention value controlling how long the event's data
  is kept; data MAY outlive the event end. Deletion remains gated solely by BR-12 (finished +
  provider); retention is policy metadata enforced by the API, not an implicit TTL in this change.

### Images (decision 8)

- **BR-16**: Images live on a separate storage service; the DB stores only metadata + URL. No
  image bytes in SQLite.

### QR format & email (decisions 9)

- **BR-17**: QR payloads are opaque tokens (no personal data) generated server-side and safe to
  handle/emailed by the server layer.

### PostgreSQL verifiability (decision 10)

- **BR-18**: After the provider switch, the migrated system MUST be verifiable with data
  distinguishable from SQLite data (seed markers / known fixtures that make the active provider
  observable in tests or a verification script).

## Non-Goals

- **Authentication / login / sessions / tokens** — users are role records only (BR-01).
- **Provider/admin UI separation** — flagged as an open architecture question, not resolved here.
- **Real email sending** — QRs are "emailable" (opaque, stable identifier + URL), but no mail
  transport is built.
- **QR image format specifics** — rendering format/size/library is a design decision.
- **PostgreSQL migration execution** — only verifiability (BR-18) and portability guardrails are in
  scope; the actual switch is a later change.
- **Catalogs into DB** — `GATES`, `STORAGE_PLANS`, `APP_STATES`, `USERS` remain constants in v1
  (exploration recommendation, confirm in design).
- Touching any of the unrelated dirty working-tree files (`event-hero.ts`, `guest-detail.ts`,
  `metrics-section.ts`, `stat-tile.ts`, `photo-cloud.ts`, `topbar.css`, `qr-ticket-modal.ts`,
  `styles.css`, `package.json` prior modifications) or committing anything.

## Scope Boundaries — First Slice

**Slice 1 (this change's first reviewable unit): Prisma schema + SQLite + seed + read-only REST.**

- `prisma/schema.prisma` covering events, users/roles, guests, companions, photos, check-ins, QR
  records, admin-approval workflow, retention — with all guardrails (string statuses, explicit
  FKs/`eventId`, `authorName` or Attendee decision deferred to design but schema-shaped here).
- Migrations + `prisma/seed.ts` replaying `seed-data.ts`; `.gitignore` for `*.db`; `.env.example`.
- `GET`-only REST endpoints in `src/server.ts` behind a repository layer + Prisma singleton.
- Client hydration-safe read path (browser-only fetch after hydration) — proving the biggest
  exploration risk (prerender vs DB) early.
- Server-side authorization harness skeleton (so later slices add rules, not plumbing).

Later slices (created in tasks phase): write endpoints + BR-02..BR-15 enforcement, approval
workflow, QR issuance/check-in, retention/deletion, client mutation wiring, Postgres-verifiability
check.

**Affected ported slices**: all 5 slices are data consumers, but impact concentrates in `core`
(`seed-data.ts`, `pase-store.ts`, new `DataService`, `models.ts`) and the server module; the 4
feature/layout slices are touched only where store mutation methods change signature (expected:
thin, behavior-preserving edits).

## Success Criteria

- [ ] Reload preserves all mutations (guest status, photo state, check-ins) — no demo reset.
- [ ] `ng test --watch=false` green; every BR has failing-test-first coverage; `ng build` succeeds;
      `npx prettier --check .` passes.
- [ ] Cross-event admin access returns server-side rejection in tests for every event-scoped
      endpoint (BR-03/BR-04).
- [ ] QR tests prove: single-use, expiry at event end (guest + companion + emergency), companion
      QR linkage, opaque payload (no PII substring in token).
- [ ] Deletion tests prove: only provider + finished status can hard-delete; admin delete attempts
      rejected; admin `active` toggles reversible per row.
- [ ] Seed replays from `seed-data.ts` with zero duplicated literals; `*.db` untracked.
- [ ] No Prisma import reachable from the browser bundle (grep/build check); no hydration
      mismatch (zero NG05xx on load).
- [ ] A verification step demonstrates BR-18 (distinguishable data after Postgres switch) —
      script or documented manual check.
- [ ] No unrelated dirty files staged or committed; work stays uncommitted per session preflight.

## Rollback Plan

- Slice 1 is additive (new `prisma/`, new server module, new DataService): rollback = remove those
  paths, revert `server.ts` to the placeholder comment, restore `pase-store.ts` seed seeding.
- Nothing in the schema is destructive to existing code until the client stops reading
  `seed-data.ts`; keep `seed-data.ts` + `metrics.spec.ts` intact until the final slice, so reverting
  the data layer restores today's behavior.
- DB files are gitignored → no binary revert noise.

## Review Workload Forecast (400-line budget)

This change **will** exceed 400 lines; the question is only how it is split.

- **Slice 1 alone** (schema ≈150–250 lines, seed ≈100–150, REST reads + repository ≈150–250,
  DataService ≈100–150, tests ≥2× the production code under strict TDD) lands at roughly
  **700–1200 changed lines**. The Prisma schema itself plus migrations SQL can consume half the
  budget before any logic exists.
- Write endpoints + authorization (BR-02..BR-15) are the second-largest block: another
  **600–1000 lines** with tests.
- QR workflow + deletion/retention: **400–700 lines**.
- **Chained PRs are recommended: YES** (well beyond the 400-line review budget; this qualifies
  under the chained-pr trigger for PRs >400 lines). Suggested split:
  1. **PR-1**: Prisma setup + schema + migration + seed + gitignore/env + read-only GET endpoints
     - repository/authorization skeleton + hydration-safe read path.
  2. **PR-2**: Server-side authorization layer + event/guest/photo write endpoints (BR-02–BR-04,
     BR-06, BR-12 admin-side `active` toggles) + client mutation wiring.
  3. **PR-3**: Second-admin approval workflow (BR-05) + QR issuance/check-in (BR-07–BR-11) +
     emergency QRs.
  4. **PR-4**: Retention + provider hard-delete (BR-12, BR-14, BR-15) + Postgres verifiability
     check (BR-18) + cleanup of remaining `seed-data.ts` runtime coupling.
  - Each PR stays reviewable (target ≤400 changed lines incl. tests — may need to split PR-2 if
    authorization tests balloon).

## Open Questions / Design Handoff

1. **QR image format** (decision 9): candidate is PNG + opaque token + verification endpoint.
   Needs: server-side generation library, size/quality, how it reaches the guest (email is a
   Non-Goal now — by what channel?). → design phase.
2. **Provider UI vs admin UI separation** (decision 8): open architecture question. Proposal
   deliberately does NOT resolve it — flag for design; affects routing and the DataService query
   surface. → design phase.
3. **Integration-test layer**: `openspec/config.yaml` has `testing.layers.integration: false`; DB
   tests need a Node-env vitest project + temp SQLite file. Requires orchestrator approval to flip
   the config flag (exploration risk). Decide before tasks phase — strict TDD cannot cover BRs
   with jsdom unit tests alone.
4. **Postgres switch mechanics**: confirm D1 (single migrations folder, `migrate reset` +
   re-seed) vs D2 (parallel schema/migration folders). D1 recommended unless production data
   exists pre-switch; BR-18 forces the verifiability answer either way. → design phase.
5. **Dev-server Express passthrough**: `ng serve` must forward `/api/*` to `server.ts` routes
   (`reqHandler`) — expected yes, unverified (exploration risk). Verify in slice 1; fallback is a
   dev proxy config.
6. **Render mode**: keep `Prerender` + post-hydration client fetch (current recommendation), or
   move `/` to `RenderMode.Server` for per-request freshness. Slice 1 proves the chosen path
   against hydration mismatch (repo has expensive NG05xx scars). → design phase.
7. **Photo → guest FK**: `author` is a display name with no clean FK; `Attendee` table vs
   plain-string `authorName` must be decided in schema design (seed will fail on a naive FK).
8. **Env handling**: introduce `.env` + `.env.example` (Prisma reads `.env` natively) — confirm.
