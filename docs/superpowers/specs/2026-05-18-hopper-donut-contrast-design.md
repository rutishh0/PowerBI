# Hopper Donut Contrast Fix — Design

**Date:** 2026-05-18
**Scope:** `V8/NewFrontEndToBePorted/lib/chart-palette.ts` and the two donut charts in `global-hopper-visualizer.tsx`.
**Status:** Approved (sub-project B of the 4-sub-project Hopper visualization rework — B → A → C → D)

## 1. Context

Two donut charts in the Global Hopper visualizer render their dominant category in `var(--chart-1)` (navy), which is effectively the same color as the dashboard panel background:

- **Restructure Type Split** — "Full Contract Restructure" slice ≈ £2.39bn, invisible against the panel.
- **CRP by Region** — "Americas" slice (smaller value, near-zero) also invisible.

Recharts' `<Legend>` paints each label text in the corresponding series color, so the legend entries for those two categories are also unreadable (see screenshots: the "Full Contract Restructure" text on the Restructure Type Split legend appears dark-navy on dark-navy until selected).

## 2. Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Introduce a new ordered palette `seriesColorsLight` in `chart-palette.ts` with the same colors as `seriesColors` but the near-background navy moved to **last** position. | Keeps `seriesColors` available for any other callers that have grown to depend on its order. Lead-off colors become readable on dark panels. |
| 2 | Use `seriesColorsLight` in both Hopper donut charts (Restructure Type Split, CRP by Region). | The two known sites of the bug. Other charts can opt in later if/when needed. |
| 3 | Wrap each `<Legend>` label in a `formatter` that forces `color: rgba(255,255,255,0.85)`. | Recharts colors legend text with the series color by default. A formatter is the standard recharts override. |

## 3. Changes

### `V8/NewFrontEndToBePorted/lib/chart-palette.ts`

Append after the existing `seriesColors` definition:

```ts
/** Series colors safe on dark panels: same set as seriesColors but with the
 * near-background navy (chart-1) demoted to last position so it never lands
 * on a chart's dominant first segment. */
export const seriesColorsLight = [
  "var(--chart-2)",   // gold
  "var(--chart-5)",   // mid blue
  "var(--chart-4)",   // green
  "var(--chart-3)",   // red
  "var(--chart-6)",   // copper
  "var(--chart-1)",   // navy (last — still in rotation for 6+ series)
]
```

### `V8/NewFrontEndToBePorted/components/visualizers/global-hopper-visualizer.tsx`

**Import update:**
```ts
import { palette, seriesColors, seriesColorsLight } from "@/lib/chart-palette"
```

**CRP by Region donut (≈line 306-319):** swap `seriesColors[i % …]` → `seriesColorsLight[i % …]`, and add a `formatter` to its `<Legend>` that returns `<span style={{ color: 'rgba(255,255,255,0.85)' }}>{value}</span>`.

**Restructure Type Split donut (≈line 383-400):** identical change — `seriesColorsLight` in `<Cell>`, formatter on `<Legend>`.

## 4. Out of scope

- Bar charts in the Hopper visualizer — they use `palette.accent`/`palette.copper`/etc., not `seriesColors`, and don't have the bug.
- Other visualizers (SOA, Opportunity Tracker, Shop Visit, SVRG, Commercial Plan, Employee Whereabouts) — if they exhibit similar bugs, fix in a follow-up.
- KPI card colors, table cell colors, sidebar — unaffected.
- The `seriesColors` array itself — left untouched for backwards-compatibility with any caller relying on its specific ordering.

## 5. Verification

| Step | How |
|---|---|
| Type check | `pnpm tsc --noEmit` exit 0 |
| Production build | `pnpm build` exit 0 |
| Visual after deploy | Upload `Global Commercial Optimisation Hopper (v2).xlsx` → Standard View → confirm "Full Contract Restructure" slice and legend label are clearly visible, and "Americas" legend on CRP by Region is also visible. |

## 6. Risks

| Risk | Mitigation |
|---|---|
| The unused `seriesColors` import lingers in the visualizer | Keep the import only if some other chart in the file still uses it; otherwise drop it. Confirm during implementation. |
| Other visualizers have the same bug | Out of scope here, but visible if user uploads SOA / Opp Tracker etc. and notices. Track separately. |
| Recharts version differences in Legend formatter signature | Project pins recharts `2.15.0`; formatter receives `(value, entry, index)`. Standard signature, no surprises. |
