# Hopper New Chart Types — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** Add 6 new chart types to the Hopper visualizer, plugged into the registry from sub-project C. All default-unpinned — users add them via the Customize button.

**Architecture:** Extend `hopper-charts.tsx` with six new chart components + six new `CHART_DEFS` entries. Add `"ownership"` to `HopperChartCategory`. Update `hopper-customize-sheet.tsx` `CATEGORY_LABELS` to include `ownership: "Ownership"`. No new files; no new dependencies.

**Tech Stack:** recharts (existing), plus a plain HTML grid for the heatmap (recharts has no native heatmap).

**Decisions (delegated under "full autonomy"):**

| Chart | Category | What it shows | Drill-down |
|---|---|---|---|
| Pipeline Conversion Funnel | pipeline | Bar: opportunity **count** at each canonical stage (vs. existing chart which shows CRP £m). Useful for spotting drop-off. | Click stage → opps with that status |
| Region × EVS Heatmap | regional | HTML grid: top 5 regions × top 8 EVSs, cells = opportunity count, color intensity = density | Click cell → opps matching region + EVS |
| Top 10 VP/Owners | ownership | Horizontal bar: top 10 vp_owners by total CRP term benefit | Click bar → opps owned by that VP |
| Top 10 Single Opportunities | financial | Horizontal bar: 10 highest-CRP individual opportunity rows (label = customer · EVS) | Click bar → that single row in the drawer |
| Maturity Mix | structural | Donut: CRP split by Mature vs Immature | Click slice → opps with that maturity |
| Onerous Mix | structural | Donut: CRP split by Onerous Contract vs Not Onerous | Click slice → opps with that onerous_type |

All six have `defaultPinned: false` — they appear in the Customize sheet but don't clutter the dashboard until user opts in.

**Out of scope:** Status × Restructure Type stacked-bar matrix (would need stacked bar configuration in recharts, doable but adds visual complexity), and various time-series charts (the underlying data is by-year totals not month-by-month, so a time-series isn't a fit). Can be added in a future PR.

---

## Task 1: Add `"ownership"` category to `HopperChartCategory` and `CATEGORY_LABELS`

**Files:**
- Modify: `V8/NewFrontEndToBePorted/components/visualizers/hopper-charts.tsx`
- Modify: `V8/NewFrontEndToBePorted/components/visualizers/hopper-customize-sheet.tsx`

- [ ] **Step 1: Extend `HopperChartCategory`**

In `hopper-charts.tsx`, change:
```ts
export type HopperChartCategory =
  | "pipeline"
  | "regional"
  | "customer"
  | "engine"
  | "financial"
  | "structural"
```
to:
```ts
export type HopperChartCategory =
  | "pipeline"
  | "regional"
  | "customer"
  | "engine"
  | "financial"
  | "structural"
  | "ownership"
```

- [ ] **Step 2: Extend `CATEGORY_LABELS` in `hopper-customize-sheet.tsx`**

Add `ownership: "Ownership"` to the `CATEGORY_LABELS` record.

---

## Task 2: Add six new chart components to `hopper-charts.tsx`

**Files:**
- Modify: `V8/NewFrontEndToBePorted/components/visualizers/hopper-charts.tsx`

All six new component exports go after the existing chart components and before the `CHART_DEFS` registry.

- [ ] **Step 1: `PipelineConversionFunnelChart`**

```tsx
export function PipelineConversionFunnelChart({ filtered, onDrilldown }: HopperChartProps) {
  const data = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of PIPELINE_ORDER) map.set(s, 0)
    for (const o of filtered) map.set(o.status, (map.get(o.status) ?? 0) + 1)
    return PIPELINE_ORDER.map((stage) => ({ stage, value: map.get(stage) ?? 0 }))
  }, [filtered])

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 60 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="stage" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.6)" }} interval={0} angle={-25} height={80} textAnchor="end" />
        <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} />
        <Tooltip
          contentStyle={{ background: "oklch(0.22 0.04 165)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, fontSize: 12 }}
          itemStyle={{ color: "white" }}
          labelStyle={{ color: "white" }}
        />
        <Bar
          dataKey="value"
          fill={palette.blue}
          radius={[3, 3, 0, 0]}
          cursor="pointer"
          onClick={(d: { stage?: string; value?: number }) => {
            if (!d.stage) return
            onDrilldown({
              chartTitle: "Pipeline Conversion Funnel",
              segmentLabel: d.stage,
              segmentValue: fmtCount(d.value ?? 0),
              predicate: (o) => o.status === d.stage,
            })
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 2: `RegionEvsHeatmapChart`**

This one is a plain HTML grid, not recharts.

```tsx
export function RegionEvsHeatmapChart({ filtered, onDrilldown }: HopperChartProps) {
  const { regions, evss, counts, maxCount } = useMemo(() => {
    const byRegion = new Map<string, number>()
    const byEvs = new Map<string, number>()
    for (const o of filtered) {
      byRegion.set(o.region, (byRegion.get(o.region) ?? 0) + 1)
      byEvs.set(o.engine_value_stream, (byEvs.get(o.engine_value_stream) ?? 0) + 1)
    }
    const topRegions = Array.from(byRegion.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([r]) => r)
    const topEvss = Array.from(byEvs.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([e]) => e)
    const cellCounts = new Map<string, number>()
    for (const o of filtered) {
      if (!topRegions.includes(o.region) || !topEvss.includes(o.engine_value_stream)) continue
      const key = `${o.region}|${o.engine_value_stream}`
      cellCounts.set(key, (cellCounts.get(key) ?? 0) + 1)
    }
    let max = 0
    for (const v of cellCounts.values()) if (v > max) max = v
    return { regions: topRegions, evss: topEvss, counts: cellCounts, maxCount: max }
  }, [filtered])

  if (regions.length === 0 || evss.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-white/55">
        Not enough data for heatmap.
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-[10px] border-collapse">
        <thead>
          <tr>
            <th className="text-left text-white/55 font-medium px-1.5 py-1"></th>
            {evss.map((e) => (
              <th key={e} className="text-white/55 font-medium px-1.5 py-1 text-center min-w-[3rem]">
                {e}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {regions.map((r) => (
            <tr key={r}>
              <th className="text-left text-white/75 font-medium px-1.5 py-1 whitespace-nowrap">{r}</th>
              {evss.map((e) => {
                const count = counts.get(`${r}|${e}`) ?? 0
                const intensity = maxCount === 0 ? 0 : count / maxCount
                return (
                  <td
                    key={e}
                    onClick={() => {
                      if (count === 0) return
                      onDrilldown({
                        chartTitle: "Region × EVS Heatmap",
                        segmentLabel: `${r} · ${e}`,
                        segmentValue: fmtCount(count),
                        predicate: (o) => o.region === r && o.engine_value_stream === e,
                      })
                    }}
                    className="px-1.5 py-1 text-center tnum"
                    style={{
                      cursor: count > 0 ? "pointer" : "default",
                      background: count === 0
                        ? "rgba(255,255,255,0.02)"
                        : `oklch(0.55 0.16 60 / ${0.15 + 0.7 * intensity})`,
                      color: intensity > 0.4 ? "white" : "rgba(255,255,255,0.85)",
                    }}
                  >
                    {count > 0 ? count : ""}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: `TopVpOwnersChart`**

```tsx
export function TopVpOwnersChart({ filtered, onDrilldown }: HopperChartProps) {
  const data = useMemo(() => {
    const map = new Map<string, number>()
    for (const o of filtered) {
      if (!o.vp_owner) continue
      map.set(o.vp_owner, (map.get(o.vp_owner) ?? 0) + o.crp_term_benefit)
    }
    return Array.from(map.entries())
      .map(([vp_owner, value]) => ({ vp_owner, value: +value.toFixed(1) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
  }, [filtered])

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 6, right: 10, left: 10, bottom: 6 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} tickFormatter={(v) => `£${v}m`} />
        <YAxis dataKey="vp_owner" type="category" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.75)" }} width={120} />
        <Tooltip
          formatter={(v: number) => fmtGBP(v)}
          contentStyle={{ background: "oklch(0.22 0.04 165)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, fontSize: 12 }}
          itemStyle={{ color: "white" }}
          labelStyle={{ color: "white" }}
        />
        <Bar
          dataKey="value"
          fill={palette.success}
          radius={[0, 3, 3, 0]}
          cursor="pointer"
          onClick={(d: { vp_owner?: string; value?: number }) => {
            if (!d.vp_owner) return
            onDrilldown({
              chartTitle: "Top VP / Owners",
              segmentLabel: d.vp_owner,
              segmentValue: fmtGBP(d.value ?? 0),
              predicate: (o) => o.vp_owner === d.vp_owner,
            })
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 4: `TopSingleOpportunitiesChart`**

```tsx
export function TopSingleOpportunitiesChart({ filtered, onDrilldown }: HopperChartProps) {
  const data = useMemo(() => {
    return filtered
      .map((o, idx) => ({
        idx,
        label: `${o.customer} · ${o.engine_value_stream}`,
        value: +o.crp_term_benefit.toFixed(1),
        opp: o,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
  }, [filtered])

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 6, right: 10, left: 10, bottom: 6 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} tickFormatter={(v) => `£${v}m`} />
        <YAxis dataKey="label" type="category" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.75)" }} width={170} />
        <Tooltip
          formatter={(v: number) => fmtGBP(v)}
          contentStyle={{ background: "oklch(0.22 0.04 165)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, fontSize: 12 }}
          itemStyle={{ color: "white" }}
          labelStyle={{ color: "white" }}
        />
        <Bar
          dataKey="value"
          fill={palette.accent}
          radius={[0, 3, 3, 0]}
          cursor="pointer"
          onClick={(d: { label?: string; idx?: number; value?: number }) => {
            if (d.idx === undefined) return
            const row = data[d.idx]
            if (!row) return
            onDrilldown({
              chartTitle: "Top Single Opportunities",
              segmentLabel: row.label,
              segmentValue: fmtGBP(row.value),
              predicate: (o) =>
                o.customer === row.opp.customer &&
                o.engine_value_stream === row.opp.engine_value_stream &&
                o.crp_term_benefit === row.opp.crp_term_benefit,
            })
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 5: `MaturityMixChart`**

```tsx
export function MaturityMixChart({ filtered, onDrilldown }: HopperChartProps) {
  const data = useMemo(() => {
    const map = new Map<string, number>()
    for (const o of filtered) map.set(o.maturity, (map.get(o.maturity) ?? 0) + o.crp_term_benefit)
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value: +value.toFixed(1) }))
      .filter((r) => r.value > 0)
  }, [filtered])

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="55%"
          outerRadius="85%"
          paddingAngle={2}
          strokeWidth={0}
          cursor="pointer"
          onClick={(d: { name?: string; value?: number }) => {
            if (!d.name) return
            onDrilldown({
              chartTitle: "Maturity Mix",
              segmentLabel: d.name,
              segmentValue: fmtGBP(d.value ?? 0),
              predicate: (o) => o.maturity === d.name,
            })
          }}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={seriesColorsLight[i % seriesColorsLight.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v: number) => fmtGBP(v)}
          contentStyle={{ background: "oklch(0.22 0.04 165)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, fontSize: 12 }}
          itemStyle={{ color: "white" }}
          labelStyle={{ color: "white" }}
        />
        <Legend
          iconSize={8}
          wrapperStyle={{ fontSize: 11 }}
          formatter={(value: string) => (
            <span style={{ color: "rgba(255,255,255,0.85)" }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 6: `OnerousMixChart`**

```tsx
export function OnerousMixChart({ filtered, onDrilldown }: HopperChartProps) {
  const data = useMemo(() => {
    const map = new Map<string, number>()
    for (const o of filtered) map.set(o.onerous_type, (map.get(o.onerous_type) ?? 0) + o.crp_term_benefit)
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value: +value.toFixed(1) }))
      .filter((r) => r.value > 0)
  }, [filtered])

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="55%"
          outerRadius="85%"
          paddingAngle={2}
          strokeWidth={0}
          cursor="pointer"
          onClick={(d: { name?: string; value?: number }) => {
            if (!d.name) return
            onDrilldown({
              chartTitle: "Onerous Mix",
              segmentLabel: d.name,
              segmentValue: fmtGBP(d.value ?? 0),
              predicate: (o) => o.onerous_type === d.name,
            })
          }}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={seriesColorsLight[i % seriesColorsLight.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v: number) => fmtGBP(v)}
          contentStyle={{ background: "oklch(0.22 0.04 165)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, fontSize: 12 }}
          itemStyle={{ color: "white" }}
          labelStyle={{ color: "white" }}
        />
        <Legend
          iconSize={8}
          wrapperStyle={{ fontSize: 11 }}
          formatter={(value: string) => (
            <span style={{ color: "rgba(255,255,255,0.85)" }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
```

---

## Task 3: Register the six new components in `CHART_DEFS`

**Files:**
- Modify: `V8/NewFrontEndToBePorted/components/visualizers/hopper-charts.tsx`

- [ ] **Step 1: Append to the `CHART_DEFS` array**

After the existing 6 entries (and before `export const HOPPER_PINS_KEY`), append:

```ts
  {
    id: "pipeline-conversion-funnel",
    title: "Pipeline Conversion Funnel",
    subtitle: "Count of opportunities at each canonical stage",
    category: "pipeline",
    description: "How many opportunities sit at each pipeline stage. Shows drop-off through the funnel.",
    defaultPinned: false,
    Component: PipelineConversionFunnelChart,
  },
  {
    id: "region-evs-heatmap",
    title: "Region × EVS Heatmap",
    subtitle: "Opportunity count by region and engine value stream",
    category: "regional",
    description: "Top regions × top EVSs, cell intensity reflects opportunity density.",
    defaultPinned: false,
    Component: RegionEvsHeatmapChart,
  },
  {
    id: "top-vp-owners",
    title: "Top VP / Owners",
    subtitle: "By CRP term benefit (£m)",
    category: "ownership",
    description: "Top 10 VPs and owners ranked by total CRP they own.",
    defaultPinned: false,
    Component: TopVpOwnersChart,
  },
  {
    id: "top-single-opportunities",
    title: "Top Single Opportunities",
    subtitle: "Largest individual opportunity rows",
    category: "financial",
    description: "Top 10 individual opportunity rows by CRP. Customer + EVS labelled.",
    defaultPinned: false,
    Component: TopSingleOpportunitiesChart,
  },
  {
    id: "maturity-mix",
    title: "Maturity Mix",
    subtitle: "CRP split by Mature vs Immature",
    category: "structural",
    description: "Donut of total CRP value split by maturity tag.",
    defaultPinned: false,
    Component: MaturityMixChart,
  },
  {
    id: "onerous-mix",
    title: "Onerous Mix",
    subtitle: "CRP split by Onerous vs Not Onerous",
    category: "structural",
    description: "Donut of total CRP value split by onerous contract status.",
    defaultPinned: false,
    Component: OnerousMixChart,
  },
```

---

## Task 4: Type check + build

- [ ] **Step 1: tsc**

```
cd "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/NewFrontEndToBePorted" && pnpm tsc --noEmit
```

- [ ] **Step 2: build**

```
cd "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/NewFrontEndToBePorted" && pnpm build
```
