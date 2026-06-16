# Hopper Chart Pinning — Design

**Date:** 2026-05-18
**Scope:** Sub-project C (B done, A done; C → D)
**Status:** Approved under "full autonomy" delegation

## 1. Context

The Hopper visualizer currently renders all 6 charts unconditionally. Users want to choose which charts appear in their Standard View, and the choice should survive reloads (per-browser).

## 2. Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Per-chart components extracted** into one sibling file `hopper-charts.tsx` exporting `CHART_DEFS` registry | Drops the visualizer below ~400 lines and gives sub-project D a clean home for new charts. |
| 2 | **localStorage** keyed `rr.hopper.pinned` storing JSON array of chart IDs | Per-browser persistence as user requested. Cookies would round-trip on every request — unnecessary. |
| 3 | **Default**: when localStorage missing/empty, every chart is pinned | Mirrors current behavior so existing users see no regression. |
| 4 | **No drag-to-reorder** in this PR | Charts render in `CHART_DEFS` registry order. dnd-kit would be a new dep. Future work. |
| 5 | **Customize sheet** opens from a button in the filter row, lists all charts grouped by category with checkboxes | shadcn `<Sheet>` reused — already in the project from sub-project A. |
| 6 | **Empty state**: if all charts are unpinned, show a Empty card with a "Customize charts" CTA | Prevents a "nothing's here?!" moment. |

## 3. New files

- `V8/NewFrontEndToBePorted/lib/chart-pins.ts` — pure localStorage util:
  - `loadPins(key: string, fallback: string[]): Set<string>`
  - `savePins(key: string, ids: Set<string>): void`
- `V8/NewFrontEndToBePorted/components/visualizers/hopper-charts.tsx` — exports:
  - One small component per chart (`PipelineByStatusChart`, `CrpByRegionChart`, `TopCustomersChart`, `EvsDistributionChart`, `AnnualProfitForecastChart`, `RestructureTypeSplitChart`), each accepting `{ filtered, onDrilldown }`.
  - `CHART_DEFS: HopperChartDef[]` — registry of `{ id, title, category, defaultPinned, Component }`.
  - Type `HopperChartCategory = "pipeline" | "regional" | "customer" | "engine" | "financial" | "structural"`.
- `V8/NewFrontEndToBePorted/components/visualizers/hopper-customize-sheet.tsx` — the customize UI (button + sheet with grouped checkboxes).

## 4. Modified files

- `V8/NewFrontEndToBePorted/components/visualizers/global-hopper-visualizer.tsx`:
  - Reduce in size by deleting the 6 chart blocks; import them from `hopper-charts.tsx`.
  - Add `usePins` (inlined; or use `loadPins`/`savePins` directly with a `useState` + `useEffect` pair).
  - Add `<HopperCustomizeSheet>` import + render in the filter row.
  - Add empty state when no charts pinned.
- `V8/NewFrontEndToBePorted/components/visualizers/hopper-helpers.tsx` — NOT created. Helpers (`HopperChartCard`, `HopperKpi`, `HopperChip`, `HopperSelect`, `HopperCollapsible`, `DrilldownStat`) stay co-located in the main visualizer for now. The per-chart components import them from there. (Avoids a third file in this PR.)

## 5. Storage shape

```ts
// localStorage key
"rr.hopper.pinned"

// Value (stringified)
'["pipeline-by-status","crp-by-region","top-customers"]'
```

On read: parse JSON; if it's malformed or missing, fall back to "all defaults pinned".
On write: stringify the Set as a sorted array (sort keeps the value diff-stable across saves).

## 6. Layout

After filtering by pinned IDs, charts render in `CHART_DEFS` registry order, two per row (`grid gap-4 lg:grid-cols-2`). If the count is odd, the last row has one chart. The wrapper computes the rendered chart list and chunks it visually (or just lets the grid handle it).

## 7. Customize Sheet UX

Button in the filter row labeled "Customize" with a gear icon. Opens shadcn `<Sheet side="right">` showing:
- Title: "Customize Standard View"
- Description: "Pick which charts appear on the Hopper dashboard. Your choice is saved in this browser."
- Grouped checklist by category, each row: checkbox + chart title + small description
- "Reset to defaults" link at the bottom

The sheet writes through to localStorage every time a checkbox toggles (no Save button — immediate apply).

## 8. Out of scope

| Item | Reason |
|---|---|
| Apply pinning to other visualizers (SOA, Opp Tracker, etc.) | Hopper-only first. Each visualizer needs its own registry. |
| Drag-to-reorder | New dep (dnd-kit). Future PR. |
| Per-user (not per-browser) persistence | Backend doesn't have a per-user prefs API. Would be its own feature. |
| Sharing a pinned config via URL | Future. |
| Pinning new chart TYPES (sub-project D) | D adds new chart components and registers them in `CHART_DEFS`. Same mechanism. |

## 9. Verification

- `pnpm tsc --noEmit` exit 0
- `pnpm build` exit 0
- Manual: load `/`, upload the Hopper workbook, confirm Standard View renders identical to before (since default = all pinned). Open Customize sheet, untick a chart → it disappears. Reload page → choice persists. Hit "Reset to defaults" → everything pinned again.

## 10. Risks

| Risk | Mitigation |
|---|---|
| SSR access to `localStorage` blows up | Wrap `loadPins` reads in `typeof window !== "undefined"` guard. Initialize state with a default that doesn't hit localStorage on first render; refine in `useEffect`. |
| Chart IDs drift between sessions (refactor renames an ID) | Keep IDs in a single TS string-literal-union type so renames are caught at compile time. Unknown IDs from old localStorage are silently ignored on read. |
| User unpins everything by accident | Empty state CTA pushes them back to Customize sheet. |
| Per-chart component extraction breaks behavior | Each extracted component receives `filtered` + `onDrilldown` props — same data and the same drill-down semantics. The chart JSX is copied verbatim from the existing visualizer. |
