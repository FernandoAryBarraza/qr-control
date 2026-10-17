# Tasks: Prototype Styling with Tailwind

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~275–385 CODE (S1 ~20, S2 ~120, S3 ~180) |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 |
| Delivery strategy | ask-always |
| Chain strategy | pending |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: Medium
```

### Suggested Work Units

| Unit | Goal | PR | Base boundary |
|------|------|----|---------------|
| 1 (S1) | Tailwind v4 install + SSR config + harness stub | PR 1 | feature/tracker |
| 2 (S2) | Tokens + ruled stat row + photos parity | PR 2 | PR 1 |
| 3 (S3) | Global responsive parity + bounded exceptions | PR 3 | PR 2 |

All work stays **uncommitted** and revertible.

## Slice S1 — Tailwind Install + Config
- [x] 1.1 Create `scripts/verify-parity.mjs` skeleton (Chromium via `CHROME_BIN` or `~/.cache/ms-playwright`); failing Tailwind smoke assertion (RED).
- [x] 1.2 Add dev deps `tailwindcss`, `@tailwindcss/postcss` to `package.json`; `npm install`.
- [x] 1.3 Set `.postcssrc.json` → `{"plugins":{"@tailwindcss/postcss":{}}}`.
- [x] 1.4 Add `@import "tailwindcss";` top of `src/styles.css`.
- [x] 1.5 Verify: `ng build` (prerender+SSR), `ng test --watch=false` (73 green), harness smoke; no NG05xx (GREEN).
- [x] 1.6 Rollback: uncommitted; `git checkout` touched files + `npm uninstall tailwindcss @tailwindcss/postcss`.

## Slice S2 — Tokens + Stat Row + Photos
- [x] 2.1 Harness assertions for tokens, `.stat-row`, `.stat`, `.pending-flag`, `.panel` (RED).
- [x] 2.2 `src/styles.css`: `--accent:#C6431D`, `--amber:#A9750C`, `--line2:rgba(27,22,17,.32)`; keep `--cream-line:.36` with `EXC_CREAM_LINE_ALPHA_36`.
- [x] 2.3 `metrics-section.ts`: `.stat-row` ruled row (`border-top/bottom:1px solid var(--ink)`).
- [x] 2.4 `stat-tile.ts`: drop per-cell border/radius; sibling `border-left:1px solid var(--line)`, first none; keep dark `var(--ink)` + `radius:3px` + accent fill.
- [x] 2.5 `photo-cloud.ts`: `.pending-flag` → `var(--accent)`; `.panel` prototype minimal.
- [x] 2.6 Contrast: assert AA for `--accent`/#C6431D and `--amber`/#A9750C on paper/cream (text ≥4.5:1, UI ≥3:1); on fail keep the accessible value.
- [x] 2.7 Verify: `ng test --watch=false` green, `ng build`, harness S2 pass; `fix-role-screen` intact; uncommitted.

## Slice S3 — Global Responsive
- [x] 3.1 Harness ≤1180/≤920 assertions (`pv-body`, `scan-col`, `er-head`, `er-facts`; `event-hero`, `event-title`, `stat-row`, `.stat`, `.stat.dark`, `.gd`, `.ticket`, `.er-detail`, `.topbar`, `.role-switch`) (RED).
- [x] 3.2 Reconcile `@media (max-width:1180px)` in `src/styles.css` to prototype (`QR_Z_Open/style.css:2084-2191`).
- [x] 3.3 Reconcile `@media (max-width:920px)` in `src/styles.css` to prototype.
- [x] 3.4 Add per-component exception ONLY if a global rule breaks a component; scope + comment; harness asserts global holds elsewhere.
- [x] 3.5 AXE AA smoke on critical views (focus visible, key contrast).
- [x] 3.6 Verify: `ng test --watch=false` green, `ng build`, harness breakpoint pass; uncommitted.

## Guard + Boundaries
- [x] 4.1 Every behavior task has its test task (1.1/2.1/3.1); RED→GREEN→REFACTOR per slice.
- [x] 4.2 Cross-slice: `tr[app-guest-row]`/`tr[app-guest-detail]` unchanged; 73 tests green; SSR error-free.
- [x] 4.3 S2 depends on S1, S3 on S2; each slice has start/finish/verify/rollback; split further if a slice nears 380 CODE lines.
