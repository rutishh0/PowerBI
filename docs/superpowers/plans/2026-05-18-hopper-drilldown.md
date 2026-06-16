# Hopper Chart Drill-down Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** Click any Hopper chart segment → side drawer opens with the underlying opportunity rows.

**Architecture:** Add `useState<Drilldown>` + `openDrilldown` helper to the Hopper visualizer. Each of 6 charts gets a click handler. One `<Sheet>` at the bottom of the JSX renders the drawer.

**Tech Stack:** React 19, TypeScript, recharts 2.15.0, shadcn `<Sheet>`. No new deps.

**Spec:** `V8/docs/superpowers/specs/2026-05-18-hopper-drilldown-design.md`

---

## Task 1: Wire drill-down state, helper, and drawer JSX

**Files:**
- Modify: `V8/NewFrontEndToBePorted/components/visualizers/global-hopper-visualizer.tsx`

- [ ] **Step 1: Update imports**

Add Sheet imports and ensure `HopperOpp` type is in scope (it already is from the existing `import type { GlobalHopperData, HopperOpp }`):

```ts
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
```

- [ ] **Step 2: Add drill-down state and helper**

Inside the `GlobalHopperVisualizer` function, immediately after the existing `useState` filter declarations (i.e. after `const [rtype, setRtype] = useState("__all__")`):

```ts
type Drilldown = {
  title: string
  subtitle: string
  rows: HopperOpp[]
} | null
const [drilldown, setDrilldown] = useState<Drilldown>(null)
```

After `registerCols` declaration (anywhere before the `return`), define the helper:

```ts
function openDrilldown(args: {
  chartTitle: string
  segmentLabel: string
  segmentValue: string
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

- [ ] **Step 3: Wire Pipeline by Status onClick + cursor**

Find the existing `<Bar dataKey="value" fill={palette.accent} radius={[3, 3, 0, 0]} />` inside the Pipeline by Status `BarChart`. Replace with:

```tsx
<Bar
  dataKey="value"
  fill={palette.accent}
  radius={[3, 3, 0, 0]}
  cursor="pointer"
  onClick={(d: { stage?: string; value?: number }) => {
    if (!d.stage) return
    openDrilldown({
      chartTitle: "Pipeline by Status",
      segmentLabel: d.stage,
      segmentValue: fmtGBP(d.value ?? 0),
      predicate: (o) => o.status === d.stage,
    })
  }}
/>
```

- [ ] **Step 4: Wire CRP by Region onClick + cursor**

Find the `<Pie data={regionDonut} ...>` and add onClick + cursor to the Pie itself (Recharts fires onClick on the Pie when any cell is clicked, with the cell's data):

```tsx
<Pie
  data={regionDonut}
  dataKey="value"
  nameKey="name"
  innerRadius="55%"
  outerRadius="85%"
  paddingAngle={2}
  strokeWidth={0}
  cursor="pointer"
  onClick={(d: { name?: string; value?: number }) => {
    if (!d.name) return
    openDrilldown({
      chartTitle: "CRP by Region",
      segmentLabel: d.name,
      segmentValue: fmtGBP(d.value ?? 0),
      predicate: (o) => o.region === d.name,
    })
  }}
>
  {regionDonut.map((_, i) => (
    <Cell key={i} fill={seriesColorsLight[i % seriesColorsLight.length]} />
  ))}
</Pie>
```

- [ ] **Step 5: Wire Top 15 Customers onClick + cursor**

Find the `<Bar>` inside the Top 15 Customers `BarChart` (horizontal layout). Add `cursor` + `onClick`:

```tsx
<Bar
  dataKey="value"
  fill={palette.blue}
  radius={[0, 3, 3, 0]}
  cursor="pointer"
  onClick={(d: { customer?: string; value?: number }) => {
    if (!d.customer) return
    openDrilldown({
      chartTitle: "Top 15 Customers",
      segmentLabel: d.customer,
      segmentValue: fmtGBP(d.value ?? 0),
      predicate: (o) => o.customer === d.customer,
    })
  }}
/>
```

(If the existing Bar uses `fill={palette.primary}` or a different color, keep the existing color and only add the click/cursor props.)

- [ ] **Step 6: Wire EVS Distribution onClick + cursor**

Find the `<Bar>` inside the EVS Distribution `BarChart`. Add:

```tsx
<Bar
  dataKey="value"
  fill={palette.copper}
  radius={[3, 3, 0, 0]}
  cursor="pointer"
  onClick={(d: { name?: string; value?: number }) => {
    if (!d.name) return
    openDrilldown({
      chartTitle: "Engine Value Stream Distribution",
      segmentLabel: d.name,
      segmentValue: fmtCount(d.value ?? 0),
      predicate: (o) => o.engine_value_stream === d.name,
    })
  }}
/>
```

(Note: this chart uses counts, not £m. Hence `fmtCount` not `fmtGBP`.)

- [ ] **Step 7: Wire Annual Profit Forecast onClick + cursor**

Find the `<Bar>` inside the Annual Profit Forecast `BarChart` (the one with year-coloured Cells). Add cursor and onClick:

```tsx
<Bar
  dataKey="value"
  radius={[3, 3, 0, 0]}
  cursor="pointer"
  onClick={(d: { year?: string; value?: number }) => {
    if (!d.year) return
    const yearKey = `profit_${d.year}` as keyof HopperOpp
    openDrilldown({
      chartTitle: "Annual Profit Forecast",
      segmentLabel: d.year,
      segmentValue: fmtGBP(d.value ?? 0),
      predicate: (o) => Number(o[yearKey]) !== 0,
    })
  }}
>
  {annualForecast.map((_, i) => (
    <Cell key={i} fill={i < 2 ? palette.accent : i === 2 ? palette.blue : palette.copper} />
  ))}
</Bar>
```

Keep the existing Cell coloring scheme inside the Bar.

- [ ] **Step 8: Wire Restructure Type Split onClick + cursor**

Find the `<Pie data={restructureSplit} ...>` and add onClick + cursor (parallel to CRP by Region):

```tsx
<Pie
  data={restructureSplit}
  dataKey="value"
  nameKey="name"
  innerRadius="55%"
  outerRadius="85%"
  paddingAngle={2}
  strokeWidth={0}
  cursor="pointer"
  onClick={(d: { name?: string; value?: number }) => {
    if (!d.name) return
    openDrilldown({
      chartTitle: "Restructure Type Split",
      segmentLabel: d.name,
      segmentValue: fmtGBP(d.value ?? 0),
      predicate: (o) => o.restructure_type === d.name,
    })
  }}
>
  {restructureSplit.map((_, i) => (
    <Cell key={i} fill={seriesColorsLight[i % seriesColorsLight.length]} />
  ))}
</Pie>
```

- [ ] **Step 9: Add the Sheet drawer at the bottom of the JSX**

Just before the visualizer's final closing `</div>` and `</div>` (after the `<HopperCollapsible title="Opportunities Register" ...>` block), insert:

```tsx
<Sheet open={!!drilldown} onOpenChange={(open) => { if (!open) setDrilldown(null) }}>
  <SheetContent
    side="right"
    className="w-[42rem] max-w-[90vw] bg-[oklch(0.17_0.03_165)] text-white border-l border-white/10 overflow-y-auto"
  >
    <SheetHeader className="text-left">
      <SheetTitle className="text-white">{drilldown?.title ?? ""}</SheetTitle>
      <SheetDescription className="text-white/60">
        {drilldown?.subtitle ?? ""}
      </SheetDescription>
    </SheetHeader>
    {drilldown ? (
      <div className="mt-6 space-y-4">
        <div className="grid grid-cols-4 gap-2">
          <DrilldownStat label="Count" value={fmtCount(drilldown.rows.length)} />
          <DrilldownStat
            label="CRP Term"
            value={fmtGBP(drilldown.rows.reduce((a, b) => a + b.crp_term_benefit, 0))}
          />
          <DrilldownStat
            label="2026"
            value={fmtGBP(drilldown.rows.reduce((a, b) => a + b.profit_2026, 0))}
          />
          <DrilldownStat
            label="2027"
            value={fmtGBP(drilldown.rows.reduce((a, b) => a + b.profit_2027, 0))}
          />
        </div>
        <DataTable
          columns={registerCols}
          rows={drilldown.rows}
          maxRows={500}
          getRowId={(r, i) => `${r.region}-${r.customer}-${i}`}
        />
      </div>
    ) : null}
  </SheetContent>
</Sheet>
```

- [ ] **Step 10: Add the tiny `DrilldownStat` helper component**

At the bottom of the file (sibling to the existing `HopperKpi`, `HopperChip`, etc. helper components), add:

```tsx
function DrilldownStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="text-[9px] uppercase tracking-[0.12em] text-white/55">{label}</div>
      <div className="mt-1 font-display text-base font-semibold tnum">{value}</div>
    </div>
  )
}
```

- [ ] **Step 11: Type check + build**

```
cd "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/NewFrontEndToBePorted" && pnpm tsc --noEmit && pnpm build 2>&1 | tail -10
```

Expected: exit 0 on both. Build output should still list `/`, `/_not-found`, `/login`.

---

## Spec coverage

| Spec section | Task / Step |
|---|---|
| §2.1 Click trigger | Steps 3-8 (onClick on each chart) |
| §2.2 shadcn Sheet | Steps 1, 9 |
| §2.3 Drill from filtered | Step 2 (openDrilldown uses `filtered.filter`) |
| §2.4 Drawer body content | Step 9 |
| §2.5 Cursor: pointer | Steps 3-8 (each handler) |
| §3 Per-chart predicates | Steps 3-8 (each predicate matches the table) |
| §4 State + helper | Step 2 |
| §6 Verification | Step 11 |
| §7 Risk: recharts payload shape | Each onClick uses `any`-typed inline interface with optional fields |
