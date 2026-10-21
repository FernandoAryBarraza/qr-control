# Prototype Visual Parity Specification

## Purpose

Define the source-of-truth behavior for prototype visual parity in `qr_control`:
Tailwind v4 SSR-safe integration, prototype token fidelity with documented WCAG AA
exceptions, metrics ruled-row and photos panel parity, global-first responsive
rules reconciled to the `QR_Z_Open/` prototype (1180px/920px blocks), and
non-regression guards for the admin role-view integrity.

## Requirements

### Requirement: Tailwind v4 SSR-Safe Integration

The app SHALL use Tailwind v4 with CSS-first `@import "tailwindcss";` and `@tailwindcss/postcss` in the Angular 22 build. Tailwind MUST be static build-time CSS only (no server/client-divergent runtime injection). Content scanning MUST NOT drop dynamically composed template classes.

#### Scenario: Tailwind build succeeds under SSR

- GIVEN Tailwind deps and the PostCSS plugin are configured
- WHEN `ng build` runs (prerender + SSR)
- THEN it completes with no Tailwind/PostCSS errors
- AND `ng test --watch=false` still passes

#### Scenario: Dynamic classes survive scanning

- GIVEN a template composes a class dynamically
- WHEN the production CSS is generated
- THEN every dynamically-used utility is present in the emitted CSS
- AND gaps are closed by a safelist/`@source`, asserted by the harness

### Requirement: Prototype Token Fidelity with Documented AA Exceptions

Tokens SHALL default to prototype values (`QR_Z_Open/style.css:8-20`). Where a prototype value fails WCAG AA contrast (≥4.5:1 text, ≥3:1 UI), the accessible value MUST be kept and the deviation named. `--accent`/`--amber` adopt prototype values when AA passes; `--cream-line` prototype `.18` fails UI contrast, so `.36` MUST be kept and documented; `--line2` stays `.32`.

#### Scenario: Token values reconciled with AA

- GIVEN token reconciliation is applied
- WHEN `--accent`, `--amber`, `--line2` are read from rendered CSS
- THEN each equals the prototype value when AA passes, with text contrast ≥4.5:1
- AND `--cream-line` remains `.36` (prototype `.18` fails ≥3:1 UI contrast) and the deviation is documented

### Requirement: Metrics Ruled-Row Parity

The metrics stat row SHALL match the prototype ruled row: `.stat-row` with top/bottom `1px solid var(--ink)`, `.stat` cells separated by `border-left: 1px solid var(--line)`, first cell without a left border, and no per-cell border or radius except the dark variant's `3px`.

#### Scenario: Row, dividers, and dark tile match prototype

- GIVEN the admin metrics section renders
- WHEN `getComputedStyle` inspects `.stat-row` and `.stat`
- THEN `.stat-row` has ink top/bottom borders and adjacent `.stat` cells have left dividers, not full card borders or radius
- AND the dark tile keeps `background: var(--ink)`, `border-radius: 3px`, and the accent fill

### Requirement: Photos Panel and Pending-Flag Parity

The photos panel and pending flag SHALL match the prototype: `.pending-flag` uses `var(--accent)` not `--amber`, and `.panel` SHALL use the prototype minimal treatment instead of an ink border, radius, and heavy padding.

#### Scenario: Pending flag and panel match prototype

- GIVEN the photos panel renders pending count > 0
- WHEN `.pending-flag` color and `.panel` styles are inspected
- THEN `.pending-flag` equals `var(--accent)` and meets AA
- AND `.panel` matches the prototype minimal treatment

### Requirement: Global-First Responsive Parity

Global responsive rules SHALL match the prototype's `@media (max-width:1180px)` and `(max-width:920px)` blocks (`QR_Z_Open/style.css:2084-2191`). Per-component exceptions are permitted ONLY where a global rule breaks a component, each justified and verified.

#### Scenario: Breakpoint blocks match prototype

- GIVEN the viewport is ≤1180px then ≤920px
- WHEN the rendered layout is compared to the prototype
- THEN `pv-body`, `scan-col`, `er-head`, `er-facts` match at 1180px
- AND `event-hero`, `event-title`, `stat-row`, `.stat`, `.stat.dark`, `.gd`, `.ticket`, `.er-detail`, `.topbar`, `.role-switch` match at 920px
- AND the harness reports no divergence

#### Scenario: Component exception is bounded

- GIVEN a global rule breaks a component
- WHEN a per-component rule is added
- THEN it is scoped and documented
- AND the harness confirms the global rule holds elsewhere

### Requirement: Non-Regression Guards

The change SHALL NOT regress `fix-role-screen-duplication`, MUST keep all 73 unit tests green, and MUST keep SSR/prerender hydration free of NG05xx errors.

#### Scenario: Unit suite stays green

- GIVEN the styling changes apply
- WHEN `ng test --watch=false` runs
- THEN all 73 tests pass

#### Scenario: Hydration stays error-free

- GIVEN the prerendered app is built with `ng build`
- WHEN hydration completes
- THEN exactly one role view exists and no NG0500/NG0502 errors are logged
