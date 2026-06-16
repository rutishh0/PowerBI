# Hopper Chart Drill-down — Design

**Date:** 2026-05-18
**Scope:** Sub-project A of the 4-part Hopper visualization rework (B done; A → C → D)
**Status:** Approved under "full autonomy" delegation

## 1. Context

The six Hopper charts (Pipeline by Status, CRP by Region, Top 15 Customers, EVS Distribution, Annual Profit Forecast, Restructure Type Split) currently render aggregate values only. Clicking a chart segment should slide in a side panel that lists the underlying opportunity rows contributing to that aggregate.

## 2. Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Click**, not hover, for trigger | Hover is reserved for the existing recharts Tooltip. Click is the standard drill-down idiom. |
| 2 | **shadcn `<Sheet>`** slides in from right, ~42 rem wide, dark themed to match the visualizer | The component already exists in `components/ui/sheet.tsx`. Drawer-style fits dashboard tools. |
| 3 | Drill from **`filtered`** (the existing top-bar filter result), not raw `data.opportunities` | Top filters and drill-down are composable; selecting a region above and then clicking a customer bar shows the intersection. |
| 4 | Drawer body: title + subtitle + KPI strip (count / CRP / 2026 / 2027) + the same `DataTable` and column set used by the Opportunities Register | Reuses existing infrastructure. Single source of truth for row presentation. |
| 5 | Charts get `cursor: pointer` on the clickable elements | Discoverability — users need to know the affordance exists. |

## 3. Per-chart predicates

When a segment is clicked, the drill-down filters `filtered` by these predicates:

| Chart | Segment carries | Predicate |
|---|---|---|
| Pipeline by Status | `stage` (PIPELINE_ORDER name) | `o.status === stage` |
| CRP by Region | `name` (region) | `o.region === name` |
| Top 15 Customers | `customer` | `o.customer === customer` |
| EVS Distribution | `name` (engine value stream) | `o.engine_value_stream === name` |
| Annual Profit Forecast | `year` (e.g. "2026") | `o[\`profit_${year}\`] !== 0` |
| Restructure Type Split | `name` (restructure type) | `o.restructure_type === name` |

Pipeline match works because `pipelineData` is built by directly summing `o.crp_term_benefit` keyed by `o.status`, with the chart's `stage` axis using the same canonical strings. So `stage === o.status` is exact-match by construction.

Annual Profit uses `!== 0` (not `> 0`) because negative profit rows still contribute arithmetically to the sum.

## 4. Component & state changes

All in `components/visualizers/global-hopper-visualizer.tsx`:

```ts
type Drilldown = {
  title: string         // "Initial idea — £523.2m"
  subtitle: string      // "Pipeline by Status · 23 opportunities"
  rows: HopperOpp[]
} | null

const [drilldown, setDrilldown] = useState<Drilldown>(null)

function openDrilldown(args: {
  chartTitle: string
  segmentLabel: string
  segmentValue: string                // pre-formatted (e.g. "£523.2m" or "39")
  predicate: (o: HopperOpp) => boolean
}) {
  const rows = filtered.filter(args.predicate)
  if (rows.length === 0) return
  setDrilldown({
    title: `${args.segmentLabel} — ${args.segmentValue}`,
    subtitle: `${args.chartTitle} · ${rows.length} opportunit${rows.length === 1 ? "y" : "ies"}`,
    rows,
  })
}
```

Charts wire `onClick` on the `<Bar>` or `<Pie>` and call `openDrilldown` with the segment data. A single `<Sheet open={!!drilldown} onOpenChange={…}>` at the bottom of the JSX renders the drawer.

## 5. Out of scope

| Item | Reason |
|---|---|
| Drill-down for non-Hopper visualizers (SOA, Opp Tracker, etc.) | Different chart sets, different filters. Follow the same pattern when needed. |
| Multi-level drill (drill from inside the drawer further) | YAGNI; raw rows in the drawer are already the leaf data. |
| Export drill-down rows to CSV | YAGNI; user can open the full register if they need export. |
| Adjusting which columns appear in the drawer DataTable | Use the existing `registerCols` definition as-is. |

## 6. Verification

- `pnpm tsc --noEmit` exit 0
- `pnpm build` exit 0
- Manual after deploy: upload `Global Commercial Optimisation Hopper (v2).xlsx`, click each of the 6 chart segments, confirm the drawer opens with the expected row count and matching values.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Recharts onClick payload shape varies between Bar and Pie | Both pass `(payload, index)`. The payload is the data point. Use TypeScript `any` cast at the boundary. |
| Click on the chart's empty white-space could fire bar onClick | Recharts only fires Bar onClick when the bar shape itself is clicked. Safe. |
| Drawer's DataTable doesn't fit narrow widths | Use `max-w-[90vw]` so the sheet shrinks gracefully on smaller screens. |
| Stage names with apostrophes / special chars in PIPELINE_ORDER | Exact-match equality handles them. |
