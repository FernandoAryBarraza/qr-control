# Exploration: prototype-styling-tailwind

## Problem statement recap

The prototype (QR_Z_Open/index.html + style.css) is the visual source of truth. The user directive (2026-10-06): "En general hay que mantenerse en el prototipo. Hay que usar las clases TailwindCSS. Las reglas responsive que sean globales, habrá que hacer alguna por componente cuando se rompa lo global."
Divergences known: (1) metrics stat row was redesigned as "card"-ish row instead of prototype "ruled row"; (2) `--line2` CSS variable value was changed from prototype. Angular 22 + SSR; Tailwind is NOT installed; repo clean (commit e5895cc). Tests exist (73 passing).

## Current state

- Angular 22.2.0 + @angular/build 22.2.0, SSR/prerender/hydration, standalone + signals, Express 5.
- Tailwind v4 not installed. `.postcssrc.json` is `{}`. No `tailwind.config.*`. No `@import "tailwindcss"` in `src/styles.css`.
- Global CSS: `src/styles.css` (1057 lines) contains tokens, base, keyframes, primitives, modals/toasts, provider styles, shell, responsive media queries. Per-component: 4 components use external `.css` (topbar, role-switch, user-chip, view-placeholder). 22 components use inline `styles: \`...\`` in TS (includes metrics, guests, photos, modals, shared).
- Prototype: `QR_Z_Open/style.css` (2191 lines), structure mirrors many rules. Many selectors/properties differ (tokens: `--accent` #C6431D vs #C23F19, `--amber` #A9750C vs #956100, `--cream-line` .18 vs .36, `--line2` same value .32 in both roots but used differently; note src had comment about cream-line contrast).
- Responsive: prototype has `@media (max-width:1180px)` and `@media (max-width:920px)` in style.css; app also has these in `src/styles.css` but some blocks missing relative to prototype (e.g. event-title/hero/gd/ticket in app's 920px block are less complete; also `.role-switch[data-role="provider"]` in prototype vs `:host([data-role="provider"])` in app).
- Stat row: prototype renders `.stat-row` with `.stat` siblings (ruled row, top/bottom borders on row, no rounded card borders, flex-grow varies). App renders `<app-stat-tile>` cards with borders and `border-top-left-radius/border-bottom-left-radius` etc; `.stat-row` in app has `margin-top:20px; flex-wrap: wrap` with no top/bottom row borders. Known divergence #1.
- `--line2`: value same .32 in tokens but usage differs; directive says revert to prototype values where changed.

## Detailed comparisons (key)

- Tokens:
  - `--accent`: proto #C6431D; app #C23F19 (diff)
  - `--amber`: proto #A9750C; app #956100 (diff)
  - `--cream-line`: proto .18; app .36 (diff; app has contrast comment)
  - `--line2`: .32 in both (app defines same). Known directive: revert `--line2` value if changed — per instruction it was changed; in app token it's .32 which matches proto token. Need to ensure usage matches prototype (some borders).
- Metrics stat row: proto `.stat-row { display:flex; border-top:1px solid var(--ink); border-bottom:1px solid var(--ink) }` and `.stat { border-left:1px solid var(--line); ... }` (no per-tile outer border/radius except dark variant). App metrics-section `.stat-row` has no top/bottom borders; stat-tile gives each `.stat` a full border + left/right radius on first/last. This is divergence #1 — revert to prototype "ruled row" (row borders, inter-cell dividers, no card borders).
- Pending flag: proto `.pending-flag { color:var(--accent); ... }`; app uses `color: var(--amber)` in inline styles via photo-cloud? photo-cloud has `.pending-flag { color: var(--amber) }` (src/app/features/admin/photos/photo-cloud.ts). Prototype shows accent.
- .panel: proto has minimal `.panel` (margin-top:56px); app adds background/border/radius/padding to `.panel` in photo-cloud and guest-registry (inline). Prototype panel structure differs.
- .role-switch: proto uses `.role-switch[data-role="provider"] .role-thumb` and `.role-switch button.active`; app uses `:host([data-role="provider"]) .role-thumb` and `button[aria-checked="true"]`. Functionally similar but selectors differ (component encapsulation).
- Responsive: prototype 920px includes event-title, event-hero stack, stat-row wrap, stat sizing, gd, ticket, er-detail, dcolb, kpi, topbar wrap, role-switch full width. App's 920px block in styles.css is shorter (misses event-hero, event-title, stat dark full, gd, ticket, topbar/role-switch). Global responsive rules should match prototype; per-component exceptions only when global breaks.

## Tailwind v4 adoption path (Angular 22 + @angular/build)

- Supported: `@angular/build` peer allows `tailwindcss` ^2|^3|^4; Angular 22 uses application builder.
- Recommended v4 approach (CSS-first):
  1. Install: `npm install -D tailwindcss @tailwindcss/postcss postcss` (per Tailwind docs; Angular CLI `ng add tailwindcss` also available).
  2. Create/update `.postcssrc.json` in project root to use `@tailwindcss/postcss` plugin: `{"plugins": {"@tailwindcss/postcss": {}}}` (current file is empty).
  3. Add `@import "tailwindcss";` to `src/styles.css` at top (before existing tokens). v4 uses CSS-first config (`@theme`, `@source`) instead of JS config.
  4. Angular build (@angular/build, esbuild-based stylesheet pipeline) will process CSS. The builder reads PostCSS config.
- Compatibility/notes:
  - SSR/prerender: no special Tailwind runtime; static CSS generation is fine. Avoid dynamic class construction that can't be statically analyzed? Tailwind scans files by default; in monorepo/Angular context, scanning from workspace root is safe if sources are included. We can use `@source` if needed.
  - AOT/class-scanning: Tailwind v4 scans content files (html/ts/templates) to generate CSS; Angular templates in TS (inline) and external HTML are all readable as files on disk during build — class names present in source will be detected. Avoid `class="${expr}"` with many computed strings unless using safelist or explicit classes. Current codebase uses mostly static strings in templates.
  - Existing global CSS: keep `src/styles.css` as foundation (tokens/base) but prefer Tailwind utilities going forward; global responsive rules can remain (or be converted gradually).
- Caution: `.postcssrc.json` currently empty — must configure plugin. Also postcss is in devDeps.

## Responsive story

- Prototype breakpoints: 1180px, 920px (and small utilities). Global structure is clear: topbar wraps at 920px; role-switch becomes full width; stat-row wraps; stats become 46% then dark full; provider grid collapses; guest/detail grids stack.
- Plan: keep global responsive rules that affect layout primitives (grid/flex, wrapping) in `src/styles.css`. Per-component exceptions only when global rule breaks specific component (as per directive). Current app misses some prototype rules in 920px — need to reconcile to match prototype first.

## Migration strategy comparison

| Approach                                                                                                                                                             | Pros                                                                                                                        | Cons                                                                                                         | Effort |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------ |
| Big-bang global restyle (replace app CSS to match proto, add Tailwind layer, migrate incrementally)                                                                  | Fastest path to prototype fidelity; single source of truth for tokens/responsive; easier to verify against proto.           | High blast radius; touches many files; review burden larger; risk of breaking tests/accessibility in one go. | High   |
| Incremental per-view migration (migrate one view/component set at a time, keep global CSS in sync)                                                                   | Safer, testable, smaller PRs; easier to spot regressions; respects review budget (400 lines).                               | Slower to reach full fidelity; risk of style drift between views; need to keep two sources in sync.          | Medium |
| Hybrid (adopt Tailwind now, fix known divergences first: stat row + tokens/line2; reconcile global CSS to prototype, then migrate components to utilities gradually) | Prototype fidelity FIRST as requested; Tailwind as mechanism; minimizes review size initially; reduces risk; can chain PRs. | Requires discipline to avoid mixing approaches; need clear guardrails on what goes global vs per-component.  | Medium |

**Recommendation**: Hybrid.

- Phase 0 (this change scope setup): add Tailwind v4 (install deps, configure `.postcssrc.json`, add `@import "tailwindcss"` to `src/styles.css`), fix known divergences (metrics stat row to match proto "ruled row", verify `--line2` token/usage, align tokens like `--accent`/`--amber`/`--cream-line` to prototype where they cause visual mismatch), reconcile global responsive rules to prototype minimums.
- Phase 1+: migrate components to Tailwind utilities incrementally (per view/component) with small PRs to respect 400-line budget. Keep global responsive rules first; per-component only when global breaks.

Rationale: matches "mantenerse en el prototipo" first, introduces Tailwind as requested, minimizes risk and review burden.

## Risks

- Review budget (400 lines): any migration touching many files could exceed budget — use chained PRs/slices.
- Hydration/SSR: global CSS via `src/styles.css` is fine; avoid injecting dynamic styles at runtime in a way that differs server/client. Also ensure no inline styles depend on browser globals during SSR.
- Tailwind content scanning: with PostCSS plugin scanning from workspace root (default), we may include all files; Angular templates in TS are covered if present as source. Use `@source` in CSS to scope if build size grows, but not immediately necessary.
- Class name construction: codebase mostly static class strings; dynamic concatenation could miss classes (e.g. `${base} ${extra}`) — audit for this. Found mostly static in templates.
- Existing strictness: tsconfig strict not enabled (pre-existing); Prettier failures pre-existing; NG0203 in feed.service.ts out of scope (per instructions).
- Tests: 73 passing; must not break them. Styling changes are visual; tests don't assert CSS.
- Accessibility: AXE/WCAG AA must pass in later phases; global focus styles exist (`*:focus-visible`) — keep consistent.

## Concrete action items (for apply phase)

1. Tailwind setup: add deps (`tailwindcss`, `@tailwindcss/postcss`, `postcss`), set `.postcssrc.json` to `{"plugins":{"@tailwindcss/postcss":{}}}`, add `@import "tailwindcss";` to `src/styles.css` (top).
2. Revert stat row to prototype: modify `metrics-section.ts` styles (remove card borders/radius on row, add top/bottom borders to `.stat-row`, restore inter-cell dividers) and/or `stat-tile.ts` to match proto `.stat` (no full tile border except dark variant if needed, padding consistent).
3. Token alignment: review `--accent`/`--amber`/`--cream-line` vs prototype; adjust if they cause visible mismatch (note app intentionally changed cream-line for contrast but directive says revert to proto values where changed — treat as required). Also confirm `--line2` usage.
4. Global responsive: add missing blocks from prototype (event-hero, event-title sizing, gd/ticket, topbar/role-switch rules) into `src/styles.css` 920px/1180px to match proto.
5. Audit dynamic classes: search for template literals constructing classes.
6. Verify build + tests after each slice.

## Skill resolution

- Skills to load: `sdd-explore/SKILL.md`, `_shared/SKILL.md` — loaded successfully.
