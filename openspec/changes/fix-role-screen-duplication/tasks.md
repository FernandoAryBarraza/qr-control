# Tasks: Fix Role Screen Duplication

## Review Workload Forecast

| Field                   | Value                                                |
| ----------------------- | ---------------------------------------------------- |
| Estimated changed lines | ~230–300 total (~200–260 CODE, excl. comments/blank) |
| 400-line budget risk    | Low                                                  |
| Chained PRs recommended | No                                                   |
| Suggested split         | Single PR                                            |
| Delivery strategy       | ask-always                                           |
| Chain strategy          | pending                                              |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal                                                       | Likely PR | Notes                                                                  |
| ---- | ---------------------------------------------------------- | --------- | ---------------------------------------------------------------------- |
| 1    | RED: parser round-trip spec fails against current markup   | PR 1      | tests included with behavior in Unit 2 commit                          |
| 2    | GREEN: 3-file conversion + `:host` CSS rework, suite green | PR 1      | base = main; rollback `git checkout -- src/app/features/admin/guests/` |
| 3    | Build + browser-harness verification evidence              | PR 1      | no code; checklist output only                                         |

## Phase 1: Safety Net (strict TDD baseline)

- [x] 1.1 Run `ng test --watch=false`; capture baseline `69 tests passing`. If failing, STOP and report as pre-existing failure.

## Phase 2: RED — Parser Round-Trip Tests (test-first, must fail)

- [x] 2.1 Create `src/app/features/admin/guests/guest-table.spec.ts`: TestBed renders GuestTable (pattern from `app.spec.ts`, `whenStable`); serialize `.table-wrap`, reparse via fresh `div.innerHTML`; assert every `tbody` child is `TR`, no element before `<table>`, no `APP-GUEST-ROW`/`APP-GUEST-DETAIL` nodes.
- [x] 2.2 Add same spec: expand a guest → reparse → `tr[app-guest-detail]` inside `tbody`, still all-`TR`; and `thead th[scope="col"]` count == 7.
- [x] 2.3 Run spec file only → confirm RED (current markup emits `<app-guest-row>` hosts). GATE: no production code written yet.

## Phase 3: GREEN — Component Conversion (minimum code to pass)

- [x] 3.1 `guest-row.ts`: selector → `tr[app-guest-row]`; remove `<tr class="grow">` wrapper so 7 `<td>`s root the template; delete `display: contents`; `tr.grow` → `:host`, `tr.grow:hover` → `:host:hover`.
- [x] 3.2 `guest-detail.ts`: selector → `tr[app-guest-detail]`; template roots at single `<td colspan="7">`; delete `display: contents`; `tr.gdetail td` → `td`.
- [x] 3.3 `guest-table.ts`: emit `<tr app-guest-row [guest]…(toggle)…></tr>` and `<tr app-guest-detail …></tr>` with explicit `</tr>` (never self-closing); drop dead `class="grow"`; no style changes.
- [x] 3.4 Run `guest-table.spec.ts` → GREEN (executed). TRIANGULATE: detail-expansion case + empty/edge data path both asserted.
- [x] 3.5 REFACTOR pass (naming, duplication) with spec still green after each step.

## Phase 4: Full Verification

- [x] 4.1 `ng test --watch=false` → all 69 existing + new tests green.
- [x] 4.2 `npx tsc --noEmit -p tsconfig.app.json && ng build`; grep `dist/**/index.html` → zero `<app-guest-row`/`<app-guest-detail` tags; `npx prettier --check .`.

## Phase 5: Browser-Harness Verification Checklist

- [x] 5.1 Serve patched dist (`allowedHosts: ["*"]` copy) on :4000; run `/tmp/opencode/repro-final.mjs` (recreate if absent): assert at load → Proveedor → Administrador, active view count == 1 (`#view-admin` / `#view-provider`), `straysBeforeTable == []`, zero console matches `/NG05\d\d/`.
- [x] 5.2 Visual/AXE pass: row hover/transition, chevron, detail expansion unchanged; semantic `<table>` with `scope="col"` headers intact.
- [x] 5.3 Leave work UNCOMMITTED; record TDD Cycle Evidence table and any deviations for sdd-verify.
