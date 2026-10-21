# Proposal: Fix Role Screen Duplication

## Intent

Role switches stack stale views: with Administrador active, `#view-admin` appears twice (upper stale, lower live). Root cause (exploration.md): `<tr>`-rooted component hosts (`app-guest-row`, `app-guest-detail`) inside `<tbody>` violate the table content model → browser foster-parents the hosts → hydration NG0502 → the SSR `#view-admin` is never claimed → each `@if` switch inserts instead of replacing.

## Scope

### In Scope

- Attribute-targeted selectors (`tr[app-guest-row]`, `tr[app-guest-detail]`), `<td>`s at component template root (Approach 1).
- Emit `<tr app-…>` from `guest-table`; remove `:host { display: contents }`; rework `tr.grow`/host styles.
- Verification: unit suite, build, real-browser role-switch check (`/tmp/opencode/repro-final.mjs` or recreate: `#view-admin` count across load → Proveedor → Administrador).

### Out of Scope

- Tailwind/styling cleanup, tsconfig strict, coverage tooling, disabling hydration (Approach 2), div/grid table (Approach 3).

## Capabilities

### New Capabilities

- `admin-role-view-integrity`: exactly one role view in the DOM; role switch replaces the view; hydration completes with zero NG05xx; guest table keeps semantic `<table>` markup (WCAG/AXE).

### Modified Capabilities

None — `openspec/specs/` is empty.

## Approach

Approach 1 (exploration recommendation): make server/client markup parse-identical by removing illegal wrapper hosts from `<tbody>`; keeps SSR + hydration + semantic table. Approaches 2–3 rejected in exploration.md (mask the defect / lose accessibility). **Slices**: only the admin/guests (guest-table) ported slice; other 4 slices unaffected.

## Affected Areas

| Area                                                | Impact    | Description                                              |
| --------------------------------------------------- | --------- | -------------------------------------------------------- |
| `…/guests/guest-table.ts`                           | Modified  | Emit `<tr app-…>` instead of host elements               |
| `…/guests/guest-row.ts`                             | Modified  | Selector `tr[app-guest-row]`, root `<td>`s, style rework |
| `…/guests/guest-detail.ts`                          | Modified  | Same conversion (latent trigger on expand)               |
| `app.html`, `app.config.ts`, `app.routes.server.ts` | Unchanged | Shell/hydration config is correct                        |

## Risks

| Risk                                                                      | Likelihood | Mitigation                                                 |
| ------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------- |
| Table styling regression (`display: contents` removal)                    | Med        | Visual check of row/detail styles                          |
| Missed `guest-detail` trigger                                             | Low        | Convert both components together                           |
| Unit tests blind to this class of bug (jsdom builds DOM programmatically) | Med        | Browser harness: `#view-admin` == 1 each step, zero NG05xx |
| Residual mismatch elsewhere                                               | Low        | Post-fix console sweep for NG0500/NG0502                   |

## Rollback Plan

Revert the 3-file diff (uncommitted; `git checkout -- src/app/features/admin/guests/`). No config/schema/data changes.

## Dependencies

- Served app for browser harness (dist `allowedHosts: ["*"]` patch per exploration).
- `ng test --watch=false` (69 tests green), `ng build`.

## Success Criteria

- [ ] Exactly one `#view-admin` at load, after Proveedor, and after Administrador
- [ ] Role switch replaces the view (no stacked sections)
- [ ] Zero NG05xx console errors; SSR section claimed by Angular
- [ ] Semantic `<table>` with `<thead scope="col">` intact; AXE passes
- [ ] 69 tests green; `ng build` succeeds; work uncommitted
