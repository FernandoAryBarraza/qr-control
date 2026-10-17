# Design: Prototype Styling with Tailwind

## Technical Approach

The change adopts **Tailwind v4 (CSS-first)** as the build mechanism while maintaining prototype fidelity as the source of truth. We will:
- Configure Tailwind v4 with `@angular/build` + `@tailwindcss/postcss` (CSS-first: `@import "tailwindcss";` in `src/styles.css`).
- Prioritize **global-first** CSS: reconcile tokens, the metrics "ruled row" (prototype), and the two responsive blocks (`@media (max-width:1180px)` and `(max-width:920px)`) to match `QR_Z_Open/style.css`. Per-component Tailwind utilities may be introduced only where a global rule breaks a component and is bounded + documented.
- Enforce the resolved product rule: adopt prototype token values by default; if a prototype value fails WCAG AA, keep the accessible value and record a **named exception** (see Token Reconciliation below).
- Respect review budget: 400 CODE lines per slice (`ask-always`), chained slices S1–S3.

Architecture decisions are recorded with rationale below.

## Architecture Decisions

### Decision: Tailwind v4 + Angular 22 build integration (static CSS only)

- **Choice**: `@tailwindcss/postcss` plugin, `.postcssrc.json` → `{"plugins":{"@tailwindcss/postcss":{}}}`, `@import "tailwindcss";` at top of `src/styles.css`. No runtime injection. Use `@source` only if content scanning misses classes (safelist not preferred).
- **Alternatives**: (a) keep global CSS only (rejects directive to use Tailwind classes), (b) use Tailwind CLI (separate from Angular build) — creates SSR divergence risk.
- **Rationale**: Matches Angular 22 + `@angular/build` guidance for v4, SSR/prerender safe (static), keeps existing global foundation (tokens/base/responsive) that already escapes per-component budget.

### Decision: Global-first fidelity before per-component Tailwind migration

- **Choice**: Modify `src/styles.css` to match prototype tokens, stat-row, and responsive blocks. Keep existing component-scoped overrides minimal (attribute-targeted `tr[app-guest-row]`/`tr[app-guest-detail]` must remain untouched — verified from fix-role-screen-duplication).
- **Alternatives**: (a) migrate components first (high blast radius, likely exceeds 400-line budget), (b) rewrite all views (not scoped).
- **Rationale**: Directly addresses divergences (stat row, tokens, missing responsive rules) with smallest, reviewable slices.

### Decision: Visual parity verified by rendered-DOM/CSS, not jsdom

- **Choice**: Parity is not unit-testable; extend/adapt the Chromium harness pattern (from prior fix) to assert computed styles and breakpoint behavior against prototype expectations. Keep 73 unit tests green as guards (no behavioral changes).
- **Alternatives**: (a) write jsdom style assertions (unreliable for computed styles), (b) add full Playwright suite now (scope creep, tooling availability varies).
- **Rationale**: Mirrors proven defect-guard (real browser parse/layout). The repo already validated this approach.

### Decision: Token reconciliation with explicit AA exceptions

- **Choice**: Default to prototype values. For each token, compute WCAG AA verdict: `--accent` (#C6431D) vs current (#C23F19), `--amber` (#A9750C) vs (#956100), `--cream-line` (.18 vs .36), `--line2` (.32). Document named exception if prototype value fails AA and we keep accessible value.
- **Rationale**: Product rule B is explicit; transparency over silent fidelity loss.

## Data Flow

```
QR_Z_Open/style.css (source of truth)
                │
                ▼
        Token reconciliation table
                │
                ▼
src/styles.css  ──(Tailwind v4 @import)──▶ Angular @angular/build (PostCSS)
                │                              │
                └────────── SSR/prerender ────┘
                         │
                    Rendered DOM
                         │
                    Chromium harness ──▶ Parity assertions (computed styles + breakpoints)
```

## Token Reconciliation

Prototype tokens (from `QR_Z_Open/style.css:8-20`): `--accent:#C6431D`, `--amber:#A9750C`, `--cream-line:rgba(243,239,230,.18)`, `--line2:rgba(27,22,17,.32)`. Current app (`src/styles.css:18-35`): `--accent:#C23F19`, `--amber:#956100`, `--cream-line:.36`, `--line2:.32`.

We MUST adopt prototype values by default. Based on contrast direction implied by the comment (app raised `--cream-line` to .36 for contrast), the prototype `.18` is likely insufficient for UI contrast on ink background in the contexts used. We will:
- Set `--accent` = `#C6431D` (prototype)
- Set `--amber` = `#A9750C` (prototype)
- Set `--line2` = `rgba(27,22,17,.32)` (prototype — matches current; ensure usage consistent)
- **Named exception**: `--cream-line` remains `rgba(243,239,230,.36)` (do NOT revert to `.18`) because `.18` fails WCAG AA UI contrast in the dark stat-tile context (declaration comment already documents this). Record as `EXC_CREAM_LINE_ALPHA_36`.

Verification: in harness, read computed CSS variables for these tokens and assert AA where applicable (text ≥4.5:1, UI ≥3:1). For `--accent`/#C6431D and `--amber`/#A9750C used as text/UI on `--paper`/`--cream`, we will include contrast checks; if any fail unexpectedly, we keep the accessible value and add a named exception.

## File Changes

| File | Action | Description |
|---|---|---|
| `package.json` | Modify | Add dev deps: `tailwindcss`, `@tailwindcss/postcss`, `postcss` (if missing). Verify versions compatible with Angular 22. |
| `.postcssrc.json` | Modify | Replace empty `{}` with `{"plugins":{"@tailwindcss/postcss":{}}}` |
| `src/styles.css` | Modify | Add `@import "tailwindcss";` at top. Update tokens per reconciliation (set `--accent:#C6431D`, `--amber:#A9750C`, keep `--cream-line:.36` with named exception in comment, keep `--line2:.32`). Reconcile stat-row to prototype "ruled row" (row borders, inter-cell dividers, no card borders/radius on row except dark variant). Reconcile 920/1180 blocks to match prototype (add missing `.event-hero`, `.event-title`, `.gd`, `.ticket`, `.topbar`, `.role-switch`, `.stat.dark` full-width rules etc. as needed). Preserve attribute-targeted guest selectors, focus styles, SSR-safe rules. |
| `src/app/features/admin/metrics/metrics-section.ts` | Modify | Adjust `.stat-row` styles to match prototype: `border-top:1px solid var(--ink); border-bottom:1px solid var(--ink)`, no wrap margin excess that conflicts; keep existing structure. |
| `src/app/features/admin/metrics/stat-tile.ts` | Modify | Adjust `.stat` to prototype ruled-row shape: remove per-tile full border+outer radius in a way that becomes inter-cell divider (prototype uses `border-left:1px solid var(--line)` on siblings, first has no left border). Keep dark variant: `background:var(--ink)`, `border-radius:3px`, accent fill. Keep bar styles compatible. |
| `src/app/features/admin/photos/photo-cloud.ts` | Modify | `.pending-flag` color → `var(--accent)` (prototype). `.panel` → prototype minimal treatment (remove ink border, radius, heavy padding as per prototype `.panel { margin-top:56px }` baseline; adjust to match prototype panel rules). |
| `scripts/verify-parity.mjs` (new) | Create | Chromium harness to assert: token values + AA, stat-row computed styles (borders/dividers), pending-flag color, panel styles, breakpoint behavior at ≤1180/≤920. Discover Chromium via `CHROME_BIN` or Playwright cache (`~/.cache/ms-playwright`). |

Notes: guests/provider table styles untouched (must not break fix-role-screen-duplication). Dynamic class bindings (`[class.*]`, template literals checked earlier) are mostly static; Tailwind scanning will see literal classes in templates. If any dynamically composed utility is missing at build time, we’ll add `@source`/safelist entries in `src/styles.css` and assert in harness.

## Slices (400 CODE lines max, ask-always)

S1: **Tailwind install + config** (~15–25 CODE lines changed: `package.json` deps, `.postcssrc.json`, add `@import "tailwindcss";` to `src/styles.css` top). Also add harness stub if creating new file.
- Files: `package.json`, `.postcssrc.json`, `src/styles.css` (minimal)
- Verification: `npm install` (if needed), `ng build`, `ng test --watch=false`

S2: **Tokens + stat row + photos parity** (~110–160 CODE lines). Focus: token reconciliation, metrics-section/stat-tile to ruled row, photo-cloud (pending-flag accent, panel minimal). 
- Files: `src/styles.css`, `metrics-section.ts`, `stat-tile.ts`, `photo-cloud.ts`
- Verification: unit tests still green; harness checks tokens, stat-row, pending-flag, panel

S3: **Global responsive parity** (~150–200 CODE lines). Reconcile 1180/920 blocks to prototype (event-hero, event-title, stat-row wrap behavior, `.stat.dark` full-width at 920, `.gd`, `.ticket`, `.er-detail`, `.dcolb`, `.topbar`, `.role-switch`, `.kpi-row` etc.). Only add per-component exceptions if global breaks a component — each scoped + documented in code comment + harness asserts global holds elsewhere.
- Files: `src/styles.css` (dominant), minimal component CSS if exception needed
- Verification: harness breakpoint checks; build + tests green; AXE smoke if possible

Estimates exclude comments/blanks per instruction. Total well under 400 per slice; chained if needed. Each slice is independently verifiable.

## Verification Strategy (per slice)

| Slice | Unit | Build | Harness (Chromium) | Contrast/AXE |
|---|---|---|---|---|
| S1 | `ng test --watch=false` (73 green) | `ng build` (prerender+SSR) | Smoke: Tailwind import doesn’t break CSS parsing; no console errors | Basic render check |
| S2 | `ng test --watch=false` (73 green) | `ng build` | Token values read; `.stat-row` has ink top/bottom borders; adjacent `.stat` have left divider (no full card borders except dark); `.pending-flag` color == `var(--accent)`; `.panel` matches prototype minimal treatment | Contrast checks for `--accent`/#C6431D, `--amber`/#A9750C on paper; verify `--cream-line` exception documented; AA text/UI as applicable |
| S3 | `ng test --watch=false` (73 green) | `ng build` | 1180px: `pv-body`, `scan-col`, `er-head`, `er-facts` match; 920px: `event-hero`, `event-title`, `stat-row`, `.stat`, `.stat.dark`, `.gd`, `.ticket`, `.er-detail`, `.topbar`, `.role-switch` match. Component exceptions bounded (documented). | AXE AA smoke on critical views (focus visible preserved, color contrast on key text) |

Non-regression guards (must hold across all slices): `fix-role-screen-duplication` intact (attribute-targeted `tr[app-guest-row]`/`tr[app-guest-detail]` unchanged), 73 tests green, SSR/prerender hydration free of NG05xx, WCAG AA not regressed.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Tailwind misses dynamically composed classes (template literals) | Low | Audit templates (done: mostly static `[class.*]` bindings). Add `@source "./src/**/*.{html,ts}"` implicitly via v4 content scanning; if missed, add targeted `@source inline("...")` or safelist in `src/styles.css`. Harness asserts critical utilities present. |
| SSR/hydration drift from CSS changes | Low | Static CSS only, no runtime style injection. Keep global CSS order; preserve existing focus/selection styles. |
| Token reverts hurt readability/contrast | Med | Use explicit named exception for `--cream-line` (.36). For `--accent`/`--amber`, run contrast checks in harness; if AA fails, keep accessible value and document named exception. |
| Responsive reconciliation breaks fix-role-screen | Low | Guests responsive rules untouched; table markup/hosts unchanged. Harness checks role view integrity still holds (or reuse prior harness logic). |
| Review budget exceeded in one slice | Low | Chained slices S1–S3 (each < 400). If any approaches 380+, split further. `ask-always` enforced. |

## Rollback

Per slice: `git checkout -- <touched paths>`. For S1 deps: `npm uninstall tailwindcss @tailwindcss/postcss postcss` (if added) and restore `.postcssrc.json` to `{}` and remove `@import "tailwindcss";`. No schema/data changes. All changes are styling/build config only.

## Open Questions

1. **Contrast verification details**: We need concrete contrast values for `--accent` (#C6431D) and `--amber` (#A9750C) against backgrounds they appear on (paper `#F3EFE6`, cream variants). If either fails AA in actual usage, define named exceptions (e.g. `EXC_ACCENT_COLOR`, `EXC_AMBER_COLOR`) and keep accessible values. Decision required before finalizing S2 token write.
2. **Harness location**: Create `scripts/verify-parity.mjs` (repo-local) vs extend existing harness? Existing was in `/tmp/opencode/repro-final.mjs` (not committed). Better to commit a minimal parity harness under `scripts/` so apply/verify phases can run it deterministically. Also need to ensure Chromium path is discovered (env `CHROME_BIN` or auto-detect Playwright cache).
3. **Per-component exceptions in S3**: Identify if any global 920px rule actually breaks a specific component in practice. If none found, S3 stays purely global in `src/styles.css`. We’ll confirm during implementation; if exception needed, scope tightly and document.