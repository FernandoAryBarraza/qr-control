# Proposal: Prototype Styling with Tailwind CSS

## Intent

The prototype (`QR_Z_Open/`) is the visual source of truth, but the port drifted and Tailwind is absent. Restore fidelity and add Tailwind v4 (directive 2026-10-06): stay in the prototype, use Tailwind classes, keep responsive global, per-component only where global breaks.

## Scope

**In Scope**
- Tailwind v4 for Angular 22 + SSR: deps `tailwindcss`/`@tailwindcss/postcss`, `.postcssrc.json` plugin, `@import "tailwindcss";`.
- Prototype parity: revert metrics stat row to the "ruled row"; align diverging tokens to prototype values.
- Global-first responsive rules reconciled to prototype's 1180/920 blocks.

**Out of Scope**
- Per-component Tailwind migration (later slices).
- tsconfig strict, coverage/E2E tooling, `feed.service.ts` NG0203.

## Capabilities

**New**: `prototype-visual-parity` — tokens, ruled stat row, and global responsive behavior match `QR_Z_Open/style.css`; Tailwind v4 SSR-safe.

**Modified**: None — `openspec/specs/` is empty.

## Approach

Hybrid: fidelity FIRST via tokens + global CSS, Tailwind as mechanism. Chained slices under the 400-line budget (`ask-always`). Slice sketch (est. changed code lines): **S1** Tailwind install/config ~15; **S2** tokens + stat row ~120; **S3** global responsive ~200; **S4** (deferred) per-component utilities. STRICT TDD (`ng test --watch=false`): parity is not unit-testable — use existing tests as guards, `ng build`, and the browser harness (`/tmp/opencode/repro-final.mjs`) for rendered-DOM/CSS checks.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `package.json`, `.postcssrc.json` | Modified | Tailwind v4 deps + PostCSS plugin |
| `src/styles.css` | Modified | `@import`, tokens, 1180/920 rules |
| `.../admin/metrics/{metrics-section,stat-tile}.ts` | Modified | Ruled-row revert |
| `.../admin/photos/photo-cloud.ts` | Modified | `.pending-flag` accent, `.panel` parity |

Slices affected: admin (metrics, photos); guests/provider untouched (responsive rules are global).

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Tailwind misses dynamic classes | Low | Audit template literals |
| SSR/hydration drift | Low | Static CSS only, no runtime injection |
| Token reverts hurt WCAG AA contrast | Med | Open question; verify AXE |
| Responsive revert breaks `fix-role-screen` | Low | `tr` hosts untouched |

## Rollback Plan

Revert the uncommitted diff per slice (`git checkout -- <paths>`); drop Tailwind deps and `@import`. No schema/data changes.

## Dependencies

`npm install -D tailwindcss @tailwindcss/postcss`; `ng test --watch=false`; `ng build`.

## Open Questions

1. `--cream-line` was raised to `.36` for contrast; prototype is `.18`. Fidelity vs WCAG AA — revert, or keep `.36` as a documented deviation? `--accent`/`--amber` values also need AA checks.

## Success Criteria

- [ ] Tailwind v4 configured; build + SSR pass
- [ ] Stat row matches prototype ruled row (borders, dividers, no radius)
- [ ] Tokens match prototype (or documented AA exception)
- [ ] 1180/920 blocks match prototype
- [ ] 73 tests green; `fix-role-screen` intact; AXE AA passes; nothing committed
