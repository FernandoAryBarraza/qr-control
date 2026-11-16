# Design: Fix Role Screen Duplication

## Technical Approach

Approach 1 (exploration): make SSR markup and browser-parsed markup parse-identical by eliminating illegal wrapper hosts inside `<tbody>`. Row components get attribute selectors on a real `<tr>` (`tr[app-guest-row]`, `tr[app-guest-detail]`); their templates root at `<td>`s; `guest-table` emits `<tr app-…>`; `:host { display: contents }` is removed. This satisfies spec requirements _Exactly-One Role View_, _Semantic Table_, _Zero Hydration Errors_, and _No Foster-Parented Hosts_. Shell, store, hydration config untouched.

## Architecture Decisions

| Decision                   | Options                                                                                                              | Tradeoff                                                                                                                                                                   | Choice |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Host strategy              | (a) attribute selector on real `<tr>`; (b) `ngSkipHydration`; (c) div/grid table                                     | (b) masks invalid markup; (c) loses AXE/WCAG table semantics; (a) fixes root cause, 3-file diff                                                                            | (a)    |
| Element ownership          | (a) parent template declares `<tr app-…>`, component roots at `<td>`; (b) component keeps `<tr>` in its own template | (b) impossible with a `<tr>` selector match inside `<tbody>` without a wrapper — that IS the defect                                                                        | (a)    |
| Row styles after unhosting | (a) rewrite `tr.grow` → `:host`/`:host:hover` in GuestRow; (b) move row styles to GuestTable                         | Encapsulation: `tr.grow[_ngcontent]` can never match the host (it carries `_nghost` from GuestRow, `_ngcontent` from GuestTable). (b) splits row styling across components | (a)    |
| `class="grow"`             | keep on emitted `<tr>`; drop                                                                                         | No selector references `.grow` anywhere (grep: only `tr.grow` rules being rewritten) — class becomes dead                                                                  | drop   |

Component style rework (emulated encapsulation keeps matching template `<td>`s; only host-level rules change):

```ts
// guest-row.ts — selector: 'tr[app-guest-row]', template roots: the 7 <td>s (no <tr>)
:host { transition: background 0.2s; }
:host:hover { background: rgba(27, 22, 17, 0.035); }
// guest-detail.ts — selector: 'tr[app-guest-detail]', root: <td colspan="7">
// was: tr.gdetail td { … }  →  td { … }   (td is template-owned, still encapsulated)
```

## Data Flow

```
guest-table template ──emits──▶ <tr app-guest-row> ──▶ SSR serialize
                                     │                        │
                        browser HTML5 parser          identical bytes
                         tbody keeps <tr>              tbody keeps <tr>
                                     └──── parse-identical ────┘
                                             │
                            hydration claims SSR #view-admin
                                             │
                          role @if replaces view — never stacks
```

## File Changes

| File                                                       | Action    | Description                                                                                                                                                                                                   |
| ---------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/features/admin/guests/guest-row.ts`               | Modify    | `selector: 'tr[app-guest-row]'`; remove `<tr class="grow">` wrapper (roots become `<td>`s); delete `display: contents`; `tr.grow(:hover)` → `:host`/`:host:hover`                                             |
| `src/app/features/admin/guests/guest-detail.ts`            | Modify    | `selector: 'tr[app-guest-detail]'`; root becomes `<td colspan="7">`; delete `display: contents`; `tr.gdetail td` → `td`                                                                                       |
| `src/app/features/admin/guests/guest-table.ts`             | Modify    | Emit `<tr app-guest-row [guest]…(toggle)…></tr>` / `<tr app-guest-detail …></tr>` with explicit `</tr>` (never self-closing `<tr/>`); no style changes (`.gtable th`, `.empty-row td` are own-template rules) |
| `src/app/features/admin/guests/guest-table.spec.ts`        | Create    | Parser round-trip + header-scope tests                                                                                                                                                                        |
| `app.html`, `app.config.ts`, `app.routes.server.ts`, store | Unchanged | Shell/hydration config is correct                                                                                                                                                                             |

Other `display: contents` hosts (`role-switch`, `stat-tile`, `photo-lightbox`) sit outside tables — legal, untouched.

## Interfaces / Contracts

```html
<!-- guest-table owns the element; guest-row/guest-detail own inputs/outputs + <td> content -->
<tr
  app-guest-row
  [guest]="guest"
  [expanded]="expandedGuests().has(guest.id)"
  (toggle)="toggleGuest.emit(guest.id)"
  (sendInvite)="…"
  (confirm)="…"
  (showQr)="…"
></tr>
@if (expandedGuests().has(guest.id)) {
<tr
  app-guest-detail
  [guest]="guest"
  (showQrPass)="showQrPass.emit({ guestId: guest.id, index: $event })"
></tr>
}
```

## Testing Strategy

| Layer                                               | What to Test                                                                                                                                                                                                                                                                                                                                        | Approach                                                      |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Unit (new `guest-table.spec.ts`, vitest/jsdom-safe) | (1) Serialize rendered `.table-wrap`, reparse via fresh `div.innerHTML` (jsdom = parse5, spec parser): every `tbody` child is `TR`, no element before `<table>`, no `APP-GUEST-ROW`/`APP-GUEST-DETAIL` nodes anywhere; (2) expand a guest → reparse → `tr[app-guest-detail]` inside `tbody`, still all-`TR`; (3) `thead th[scope="col"]` count == 7 | TestBed, pattern from `app.spec.ts` (`whenStable`, query DOM) |
| Unit (existing)                                     | 69 tests stay green — no spec references GuestRow/GuestTable                                                                                                                                                                                                                                                                                        | `ng test --watch=false`                                       |
| Build                                               | `npx tsc --noEmit -p tsconfig.app.json && ng build`; then grep `dist/**/index.html`: zero `<app-guest-row`/`<app-guest-detail` tags; `npx prettier --check .`                                                                                                                                                                                       | config `quality` rules                                        |
| Browser harness (only guard for this defect class)  | Serve patched dist (`allowedHosts: ["*"]` copy) on :4000; run `/tmp/opencode/repro-final.mjs`: at load → Proveedor → Administrador assert `#view-admin` length == 1 exactly when admin active, `#view-provider` == 1 when provider active, `straysBeforeTable == []`, zero console matches `/NG05\d\d/`                                             | Real Chromium                                                 |
| Visual / AXE                                        | Row hover/transition, chevron, detail expansion unchanged; semantic `<table>` passes AXE (manual semantics inspection if no AXE harness)                                                                                                                                                                                                            | Visual pass                                                   |

## Migration / Rollout

No migration, no feature flag. Uncommitted work; rollback = `git checkout -- src/app/features/admin/guests/`.

## Open Questions

None.
