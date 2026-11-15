# feat(api): QR issuance, single-use check-in, verification and PNG image

PR-3b closes the QR half of `persistence-prisma-sqlite` (BR-07–BR-11, BR-17): every attendee
gets an opaque, hashed, single-use QR that expires at `event.end`; door staff scan it once;
admins read the verification record and print the PNG. No persistence or client wiring is
touched here — those belong to earlier and later batches in the chain.

**Review path (start here):**

1. `src/server/api/authz.ts` — the scope matrix. `canActAtDoor` is the ONE door read shared by
   `canCheckIn` (scan) and `canVerifyQr` (verify); `canReadQrImage` is admin-only. The two
   rules differ on purpose; both halves are table-tested.
2. `src/server/data/repositories/check-ins.ts` — the single-use authority: one
   `$transaction` with a conditional `consumedAt: null → now()` claim plus the `CheckIn`
   insert (`@unique qrId`).
3. `src/server/api/index.ts` — the four routes and their guards (`eventWriteScope`,
   `checkInScope`, `qrVerifyScope`, `qrImageScope`).
4. The three integration specs — they are the specification; read them before the handlers.

**Intentionally out of scope:** retention/purge and provider hard delete (PR-4), client
wiring and the attendee-facing `/verify/<token>` page (PR-4), email transport and physical
image deletion on the storage service (proposal non-goals), authentication (BR-01 keeps the
persisted role model without auth).

## Success criterion

Proposal `## Success Criteria`, quoted verbatim:

> QR tests prove: single-use, expiry at event end (guest + companion + emergency), companion
> QR linkage, opaque payload (no PII substring in token).

Every clause and the test that proves it:

| Clause                          | Proving test                                                                                                                                                                                                                         | Where                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| single-use                      | `records the check-in and consumes the QR on the first scan` · `rejects a second scan as already used and creates no second record` · `keeps single-use under two concurrent scans` · `rejects reuse regardless of the scanner role` | `src/server/api/check-in.int.spec.ts`                                            |
| expiry at event end — guest     | `rejects a scan at or after event end as expired and leaves the QR unconsumed` · `rejects a scan exactly at event end as expired` (frozen clock)                                                                                     | `src/server/api/check-in.int.spec.ts`                                            |
| expiry at event end — companion | `rejects a companion QR after event end as expired` · `checks in a companion QR as its own single-use record`                                                                                                                        | `src/server/api/check-in.int.spec.ts`                                            |
| expiry at event end — emergency | `rejects an emergency QR after event end as expired` · `issues an emergency QR for the own event only`                                                                                                                               | `src/server/api/check-in.int.spec.ts`, `src/server/api/qr-issuance.int.spec.ts`  |
| companion QR linkage            | `issues a distinct QR for a confirmed guest and each companion, linked to the parent guest QR` · `resolves a companion token to the specific companion and its parent guest`                                                         | `src/server/api/qr-issuance.int.spec.ts`, `src/server/api/qr-verify.int.spec.ts` |
| opaque payload                  | `stores only the SHA-256 of the token and never re-exposes the raw value` · `keeps PII out of the token and ignores client-supplied token content`                                                                                   | `src/server/api/qr-issuance.int.spec.ts`                                         |

Companion linkage is asserted against the **stored** `parentQrId` row, not against the
response's own claim, so a reader cannot be satisfied by a self-consistent lie.

## Commits in this PR

| Commit    | Slice             | Content                                                                             |
| --------- | ----------------- | ----------------------------------------------------------------------------------- |
| `8c24ede` | S1 — issuance     | `POST /api/events/:id/qr`, hashed opaque tokens, parent linkage, emergency issuance |
| `227cb80` | S2 — check-in     | `POST /api/check-ins`, transactional single-use claim, expiry at `event.end`        |
| `ac4b2fa` | S3 — verify/image | `GET /api/qr/verify/:token`, `GET /api/qr/image/:token`, server-rendered PNG        |
| `3cc974c` | S3 — docs         | Judgment Day verdict recorded in `apply-progress.md`                                |

Diff basis: `b64dbf2` (PR-3a, the previous batch in the stack). 16 files, +2546/−17.

## Changes

| Area                                        | Change                                                                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `src/server/data/repositories/qr.ts`        | issuance: `N+1` QR records per party, SHA-256-only storage, `qrVerifyUrl` (single definition for issuance and image) |
| `src/server/data/repositories/check-ins.ts` | `checkInByToken`: one `$transaction`, conditional consume + `CheckIn` insert                                         |
| `src/server/data/repositories/qr-verify.ts` | `verifyQrByToken`: token → attendee + validity state, `null` for an unknown row                                      |
| `src/server/api/qr-image.ts`                | `renderQrPng`: server-side PNG of the verify URL (512×512)                                                           |
| `src/server/api/authz.ts`                   | `canActAtDoor`, `canCheckIn`, `canVerifyQr`, `canReadQrImage`                                                        |
| `src/server/api/index.ts`                   | four routes + their token/event/assignment guards                                                                    |
| `src/server/api/write-validation.ts`        | discriminated-union issuance input (`emergency` cannot carry attendee ids)                                           |
| `src/server/data/config.ts`                 | `WEB_BASE_URL` with a documented default                                                                             |
| `package.json` / `package-lock.json`        | `qrcode@1.5.4` + `@types/qrcode` (server only, MIT); client `qrcode-generator` untouched                             |

## Verification

Gate run on `3cc974c`, after the last correction batch:

| Gate                                    | Result                                                      |
| --------------------------------------- | ----------------------------------------------------------- |
| `npm run test:unit`                     | 159 passed (159), 11 files                                  |
| `npm run test:int`                      | 179 passed (179), 16 files (hermetic: per-file temp SQLite) |
| `npx prettier --check .`                | clean                                                       |
| `npx tsc --noEmit -p tsconfig.app.json` | exit 0                                                      |
| `ng build`                              | exit 0, 1 prerendered route                                 |

Independent checks, run outside this branch:

- **Mutation campaign, fresh context, scratch copy:** round 1 → 17/19 killed; round 2 → **19/19
  killed** with no mutant regressing. Two surviving probes were real gaps and are now closed:
  a one-directional cross-event test could not see a guard that stops resolving the token's own
  event (M21 verify, M22 the committed slice-2 `checkInScope`).
- **Judgment Day, two blind judges, fresh context:** both returned zero findings → APPROVED,
  no correction batch.

## Risk

Native assess on `ac4b2fa`: **medium** — the diff changes who may read a QR and the attendee
names behind it (authz), and the validity state is a time-bound read against `event.end`.
Constraints 1–5 of the high-risk list are not touched (no migrations, no stored-data change, no
public contract removal, no concurrency primitive beyond the existing transaction, no
installer/release surface).

## Checklist

- [x] Every clause of the proposal's QR success criterion is proven by a named test
- [x] Cross-event rejection tested for the scan, verify and image paths (both directions)
- [x] No PII and no `tokenHash` in any response body; `no-store` on both QR reads
- [x] Conventional commits, no `Co-Authored-By` or AI attribution
- [x] Gate green and every docs commit `prettier --check` clean
- [ ] PR opened — **blocked: this repository has no git remote configured** (see "Publication
      blocker" below)

## Publication blocker

`git remote -v` is empty and the `gh` CLI is not installed, so this body cannot be attached to a
PR yet. Two decisions gate publication, and both are the owner's:

1. **Remote + host** — which GitHub URL/repository the chain pushes to.
2. **Chain strategy** — `stacked-to-main` (one branch per batch, this one cut from `b64dbf2`)
   versus a feature-branch chain with a tracker. The plan assumed `stacked-to-main`; the
   decision was deferred to first PR creation and is now due.

Next batch after this one: **PR-4** (retention, provider hard delete with cascade, `db:verify`
for BR-18, seed decoupling, bundle guard).
