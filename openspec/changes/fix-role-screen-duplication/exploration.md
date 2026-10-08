# Exploration: fix-role-screen-duplication

## Current State

The shell renders exactly ONE role view: `src/app/app.html:10-18` switches
`<section id="view-admin">` / `<section id="view-provider">` with `@if` on
`store.role()`. There is no router (`app.routes.ts` deleted), no second
`<app-root>`, and the server output (`ng build` → prerendered
`dist/qr_control/browser/index.html`) contains a single `#view-admin`, a single
`<header>`, and proper `ng-state`/`ngh` hydration data
(`ng-server-context="ssg"`).

SSR is active and hydration is enabled:

- `src/app/app.config.ts:10` — `provideClientHydration()`
- `src/app/app.routes.server.ts:6` — `RenderMode.Prerender`
- `src/server.ts` — `AngularNodeAppEngine` serves the prerendered document

The duplication is therefore **not** duplicated markup in templates — it is a
client-side DOM divergence that starts when hydration fails.

## Root Cause

**Confirmed mechanism: HTML5 table parsing relocates component hosts →
hydration node mismatch (NG0502) → the SSR `<section id="view-admin">` is never
claimed by the Angular view → every role switch inserts the new view BELOW the
stale one instead of replacing it.**

Chain, with evidence:

1. **Server DOM (programmatic, no HTML parser).**
   `guest-table.ts:24-43` renders `<tbody>` containing `<app-guest-row>`
   host elements whose template root is `<tr>` (`guest-row.ts:9-10`) and
   `<app-guest-detail>` whose root is also `<tr>` (`guest-detail.ts:9-10`).
   Serialized server HTML (`/` response) contains:
   `<tbody><app-guest-row …><tr class="grow">…</tr></app-guest-row>…</tbody>` —
   verified byte-level in the served document.

2. **Client DOM (browser HTML5 tree construction).**
   When the browser reparses that string, `<app-guest-row>` inside `<tbody>`
   containing `<tr>` violates the table content model; the parser
   foster-parents every host OUT of the table. Verified with the real
   serialization parsed by a spec-compliant parser (parse5/jsdom — same
   algorithm as Chrome/Firefox/Safari):

   - `div.table-wrap` children = **14 empty `app-guest-row`** followed by `table`
   - `tbody` children = **14 bare `<tr>`** (hosts gone)

   Confirmed live in real Chromium on the served page:
   `straysBeforeTable: ["app-guest-row" × 14]`.

3. **Hydration fails.** Console (real Chromium, loaded
   `http://localhost:4000/`): `ERROR NG0502: <thead>` thrown during `template`
   hydration (~293 ms after load), plus a cascading `NG0203`. NG0502 is
   Angular's hydration node-mismatch runtime error
   (`_debug_node-chunk.mjs`: `RuntimeError(-502, …)` — "During hydration Angular
   expected a `<…>` element at this location…"). Angular core sources:
   `node_modules/@angular/core/fesm2022/_debug_node-chunk.mjs`.

4. **The `@if` view never claims the SSR section.** After the failure the DOM is
   still `main = [section#view-admin, <!---->, <!---->]` and stays identical for
   6 s — but Angular's `@if/@else` container ends up owning no nodes.

5. **Role switch stacks instead of replacing.** Measured in real Chromium:

   | Step | `#view-admin` tops | `#view-provider` tops | body scrollHeight |
   |------|--------------------|-----------------------|-------------------|
   | load | `[107]` | `[]` | 2091 |
   | → Proveedor | `[107]` (untouched) | `[1953]` | 2874 |
   | → Administrador | `[107, 1953]` **(two stacked)** | `[]` | 4035 |

   This is exactly the reported symptom: upper copy stale, lower copy live,
   "Proveedor changes only the second", and with Administrador active the SAME
   admin screen appears TWICE. Full-page screenshot:
   `/tmp/opencode/final-double-admin.png`.

**Prior lead verdict: CONFIRMED and refined.** "SSR + hydration active with
prerendered content" is correct as the failure domain — prerendered HTML +
`provideClientHydration()` are engaged and hydration is what breaks — but the
prerender step itself is innocent. The trigger is the invalid HTML content
model (`<tr>`-rooted component hosts inside `<tbody>`) that only diverges
because the browser (re)parses the serialized document while the server never
parses it.

**Why the prototype (`QR_Z_Open/`) never had this:** it writes raw
`<tr class="grow">` directly into `#guestRows` (`app.js:334-336`) — valid table
markup — and switches roles by toggling the `hidden` attribute on two
permanently-present sections (`app.js:207-208`), so nothing is ever
added/removed and duplication is structurally impossible.

**Distinguishing the two hypotheses:** the DOM is literally rendered twice
(two `section#view-admin` elements in one document, measured by
`querySelectorAll`), not two mounted components of the same branch — the upper
copy is the unclaimed SSR subtree, the lower copy is Angular's live render.

## Affected Areas

- `src/app/features/admin/guests/guest-table.ts` — `<tbody>` emits
  `<app-guest-row>` / `<app-guest-detail>` host elements (lines 25-37).
- `src/app/features/admin/guests/guest-row.ts` — selector `app-guest-row`,
  template root `<tr>` (line 10), `:host { display: contents }` (line 70).
- `src/app/features/admin/guests/guest-detail.ts` — selector `app-guest-detail`,
  template root `<tr class="gdetail">` (line 10); dormant (no expanded guests in
  seed) but same defect; would re-trigger on expand.
- `src/app/app.html` — not defective, but the `@if` block whose view goes
  unclaimed; no change expected.
- `src/app/app.config.ts` / `src/app/app.routes.server.ts` — hydration/SSR
  config; only touched if the "disable hydration" alternative is chosen.
- Tests: `grep` shows **no spec references** `GuestRow`/`GuestTable`;
  `src/app/app.spec.ts` renders the app programmatically (no HTML reparse), so
  it cannot catch this class of bug and is unlikely to break.

## Approaches

1. **Valid table content model (attribute-targeted row components)** — make the
   row components target a real `<tr>` in the parent template
   (`selector: 'tr[app-guest-row]'`), move the `<td>`s to the component
   template root, remove `:host { display: contents }`, and emit
   `<tr app-guest-row …>` / `<tr app-guest-detail …>` from `guest-table`.
   - Pros: fixes the root cause; keeps SSR + prerender + hydration benefits;
     produces spec-valid HTML (also correct for crawlers); no config changes.
   - Cons: touches 3 files + style adjustments (host is now the `tr`, so
     `tr.grow`/`:host` selectors need rework); visual check of the table
     required.
   - Effort: Low/Medium.

2. **Skip or disable hydration** — remove `provideClientHydration()` or add
   `ngSkipHydration` on `app-guest-table`.
   - Pros: smallest diff; immediately silences NG0502.
   - Cons: masks an invalid content model (browsers still foster-parent the
     hosts — markup stays wrong); unverified whether the CSR render clears the
     SSR nodes (risk of a worse, always-on duplication); forfeits hydration
     benefits for the whole app.
   - Effort: Low, but highest behavioral risk.

3. **Restructure the guest table as a div/CSS-grid** — drop `<table>` semantics.
   - Pros: no parsing constraints anywhere; matches the grid-based patterns
     used elsewhere (`.event-row`).
   - Cons: loses semantic table + `scope="col"` accessibility (AXE/WCAG are
     non-negotiable per project rules); largest visual/template churn.
   - Effort: Medium/High.

## Recommendation

**Approach 1.** The bug is a content-model violation, not a framework quirk:
the server composes DOM the browser's parser is not allowed to reproduce.
Approach 1 makes the markup parseable-identical on both sides, which is the
only fix that keeps hydration trustworthy. Approach 2 trades a visible bug for
a silent one; Approach 3 pays an accessibility cost for a parsing problem that
only exists because of the wrapper elements.

Verification after the fix (not possible in this read-only phase): unit suite
(`ng test --watch=false`), `ng build`, and a real-browser pass confirming zero
`NG05xx` console errors plus the load → Proveedor → Administrador cycle showing
`#view-admin` count of exactly 1 at every step. Repro harness left at
`/tmp/opencode/repro-final.mjs` (needs the served app; note the built server
rejects `Host: localhost:4000` because `security.allowedHosts` is `[]` — the
harness used a dist copy patched with `allowedHosts: ["*"]`).

## Risks

- **Styling regression in the guest table**: `:host { display: contents }`
  removal changes how the row host participates in table layout; `tr.grow`,
  `gcode`, chevron styles must be re-checked visually.
- **Latent second trigger**: `guest-detail` must be converted in the same
  change, or the mismatch merely moves to the first expanded guest.
- **Undetected siblings**: only guest-table nests custom elements in a
  `<table>`; other content models (`<li>`, `<option>`) were checked and are
  clean, but a post-fix browser console sweep is cheap insurance.
- **False confidence from unit tests**: jsdom tests build DOM programmatically,
  so they pass with the broken markup — they can neither catch nor guard this
  regression; guard via the browser checklist above.
- **Hydration state after fix**: first client run must show no `NG0500`/`NG0502`,
  otherwise an additional mismatch remains.

## Ready for Proposal

Yes — root cause is proven with file/line + runtime evidence, the minimal fix
surface is three files under `src/app/features/admin/guests/`, and the
verification path (unit + build + scripted browser pass) is defined.
