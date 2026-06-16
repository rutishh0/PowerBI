# Hopper Chart Pinning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** User can choose which Hopper charts appear in Standard View; choice persists in browser localStorage.

**Architecture:** Extract chart components to `hopper-charts.tsx` with a `CHART_DEFS` registry. Pinning state in `global-hopper-visualizer.tsx` reads from / writes to localStorage via `lib/chart-pins.ts`. A `<HopperCustomizeSheet>` button in the filter row opens a checklist drawer.

**Tech Stack:** React 19, TypeScript, recharts, shadcn `<Sheet>` (already used in sub-project A). No new deps.

**Spec:** `V8/docs/superpowers/specs/2026-05-18-hopper-chart-pinning-design.md`

---

## Task 1: Create `lib/chart-pins.ts`

**Files:**
- Create: `V8/NewFrontEndToBePorted/lib/chart-pins.ts`

- [ ] **Step 1: Write the file**

```ts
/**
 * Per-browser pinning for which charts a user wants to see on a dashboard.
 * Backed by localStorage. SSR-safe.
 */

export function loadPins(key: string, fallback: readonly string[]): Set<string> {
  if (typeof window === "undefined") return new Set(fallback)
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return new Set(fallback)
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set(fallback)
    const out = parsed.filter((v): v is string => typeof v === "string")
    return new Set(out)
  } catch {
    return new Set(fallback)
  }
}

export function savePins(key: string, ids: Set<string>): void {
  if (typeof window === "undefined") return
  try {
    const sorted = Array.from(ids).sort()
    window.localStorage.setItem(key, JSON.stringify(sorted))
  } catch {
    // Quota exceeded or storage disabled — degrade silently.
  }
}

export function clearPins(key: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}
```

- [ ] **Step 2: tsc**

```
cd "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/NewFrontEndToBePorted" && pnpm tsc --noEmit
```

---

## Task 2: Extract chart components and registry into `hopper-charts.tsx`

**Files:**
- Create: `V8/NewFrontEndToBePorted/components/visualizers/hopper-charts.tsx`

The file exports 6 chart components plus a `CHART_DEFS` registry. Each chart takes `{ filtered, onDrilldown }` props. Chart JSX is copied verbatim from the existing `global-hopper-visualizer.tsx` (lines 285-413) with two changes:
1. `data` props (`pipelineData`, `regionDonut`, etc.) computed locally per-component via `useMemo`
2. `onClick` handlers call the injected `onDrilldown` instead of a local function

- [ ] **Step 1: Create the file**

```tsx
"use client"

import { useMemo } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { HopperOpp } from "@/lib/types"
import { fmtGBP, fmtCount } from "@/lib/format"
import { palette, seriesColorsLight } from "@/lib/chart-palette"

export type HopperChartCategory =
  | "pipeline"
  | "regional"
  | "customer"
  | "engine"
  | "financial"
  | "structural"

export interface OpenDrilldownArgs {
  chartTitle: string
  segmentLabel: string
  segmentValue: string
  predicate: (o: HopperOpp) => boolean
}

export interface HopperChartProps {
  filtered: HopperOpp[]
  onDrilldown: (args: OpenDrilldownArgs) => void
}

export interface HopperChartDef {
  id: string
  title: string
  subtitle: string
  category: HopperChartCategory
  description: string
  defaultPinned: boolean
  Component: (props: HopperChartProps) => JSX.Element
}

/* ---------- Canonical pipeline order (V6 SPEC §6.6.2) ---------- */
const PIPELINE_ORDER = [
  "Initial idea",
  "ICT formed",
  "Strategy Approved",
  "Financial Modelling Started",
  "Financial Modelling Complete",
  "Financials Approved",
  "Negotiations Started",
  "Negotiations Concluded",
  "Contracting Started",
  "Contracting Concluded",
]

/* ---------- Individual chart components ---------- */

export function PipelineByStatusChart({ filtered, onDrilldown }: HopperChartProps) {
  const data = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of PIPELINE_ORDER) map.set(s, 0)
    for (const o of filtered) map.set(o.status, (map.get(o.status) ?? 0) + o.crp_term_benefit)
    return PIPELINE_ORDER.map((stage) => ({ stage, value: +Number(map.get(stage) ?? 0).toFixed(1) }))
  }, [filtered])

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 60 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="stage" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.6)" }} interval={0} angle={-25} height={80} textAnchor="end" />
        <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} tickFormatter={(v) => `£${v}m`} />
        <Tooltip
          formatter={(v: number) => fmtGBP(v)}
          contentStyle={{ background: "oklch(0.22 0.04 165)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, fontSize: 12 }}
          itemStyle={{ color: "white" }}
          labelStyle={{ color: "white" }}
        />
        <Bar
          dataKey="value"
          fill={palette.accent}
          radius={[3, 3, 0, 0]}
          cursor="pointer"
          onClick={(d: { stage?: string; value?: number }) => {
            if (!d.stage) return
            onDrilldown({
              chartTitle: "Pipeline by Status",
              segmentLabel: d.stage,
              segmentValue: fmtGBP(d.value ?? 0),
              predicate: (o) => o.status === d.stage,
            })
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function CrpByRegionChart({ filtered, onDrilldown }: HopperChartProps) {
  const data = useMemo(() => {
    const map = new Map<string, number>()
    for (const o of filtered) map.set(o.region, (map.get(o.region) ?? 0) + o.crp_term_benefit)
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
              chartTitle: "CRP by Region",
              segmentLabel: d.name,
              segmentValue: fmtGBP(d.value ?? 0),
              predicate: (o) => o.region === d.name,
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

export function TopCustomersChart({ filtered, onDrilldown }: HopperChartProps) {
  const data = useMemo(() => {
    const map = new Map<string, number>()
    for (const o of filtered) map.set(o.customer, (map.get(o.customer) ?? 0) + o.crp_term_benefit)
    return Array.from(map.entries())
      .map(([customer, value]) => ({ customer, value: +value.toFixed(1) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15)
  }, [filtered])

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 6, right: 10, left: 10, bottom: 6 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} tickFormatter={(v) => `£${v}m`} />
        <YAxis dataKey="customer" type="category" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.75)" }} width={100} />
        <Tooltip
          formatter={(v: number) => fmtGBP(v)}
          contentStyle={{ background: "oklch(0.22 0.04 165)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, fontSize: 12 }}
          itemStyle={{ color: "white" }}
          labelStyle={{ color: "white" }}
        />
        <Bar
          dataKey="value"
          fill={palette.blue}
          radius={[0, 3, 3, 0]}
          cursor="pointer"
          onClick={(d: { customer?: string; value?: number }) => {
            if (!d.customer) return
            onDrilldown({
              chartTitle: "Top Customers",
              segmentLabel: d.customer,
              segmentValue: fmtGBP(d.value ?? 0),
              predicate: (o) => o.customer === d.customer,
            })
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function EvsDistributionChart({ filtered, onDrilldown }: HopperChartProps) {
  const data = useMemo(() => {
    const map = new Map<string, number>()
    for (const o of filtered) map.set(o.engine_value_stream, (map.get(o.engine_value_stream) ?? 0) + 1)
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [filtered])

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 40 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} interval={0} angle={-18} height={60} textAnchor="end" />
        <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} />
        <Tooltip
          contentStyle={{ background: "oklch(0.22 0.04 165)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, fontSize: 12 }}
          itemStyle={{ color: "white" }}
          labelStyle={{ color: "white" }}
        />
        <Bar
          dataKey="value"
          fill={palette.copper}
          radius={[3, 3, 0, 0]}
          cursor="pointer"
          onClick={(d: { name?: string; value?: number }) => {
            if (!d.name) return
            onDrilldown({
              chartTitle: "Engine Value Stream Distribution",
              segmentLabel: d.name,
              segmentValue: fmtCount(d.value ?? 0),
              predicate: (o) => o.engine_value_stream === d.name,
            })
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function AnnualProfitForecastChart({ filtered, onDrilldown }: HopperChartProps) {
  const data = useMemo(
    () => [
      { year: "2026", value: +filtered.reduce((a, b) => a + b.profit_2026, 0).toFixed(1) },
      { year: "2027", value: +filtered.reduce((a, b) => a + b.profit_2027, 0).toFixed(1) },
      { year: "2028", value: +filtered.reduce((a, b) => a + b.profit_2028, 0).toFixed(1) },
      { year: "2029", value: +filtered.reduce((a, b) => a + b.profit_2029, 0).toFixed(1) },
      { year: "2030", value: +filtered.reduce((a, b) => a + b.profit_2030, 0).toFixed(1) },
    ],
    [filtered],
  )

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="year" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.75)" }} />
        <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} tickFormatter={(v) => `£${v}m`} />
        <Tooltip
          formatter={(v: number) => fmtGBP(v)}
          contentStyle={{ background: "oklch(0.22 0.04 165)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, fontSize: 12 }}
          itemStyle={{ color: "white" }}
          labelStyle={{ color: "white" }}
        />
        <Bar
          dataKey="value"
          fill={palette.accent}
          radius={[3, 3, 0, 0]}
          cursor="pointer"
          onClick={(d: { year?: string; value?: number }) => {
            if (!d.year) return
            const yearKey = `profit_${d.year}` as keyof HopperOpp
            onDrilldown({
              chartTitle: "Annual Profit Forecast",
              segmentLabel: d.year,
              segmentValue: fmtGBP(d.value ?? 0),
              predicate: (o) => Number(o[yearKey]) !== 0,
            })
          }}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={i < 2 ? palette.accent : i === 2 ? palette.blue : palette.copper} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function RestructureTypeSplitChart({ filtered, onDrilldown }: HopperChartProps) {
  const data = useMemo(() => {
    const map = new Map<string, number>()
    for (const o of filtered) map.set(o.restructure_type, (map.get(o.restructure_type) ?? 0) + o.crp_term_benefit)
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
              chartTitle: "Restructure Type Split",
              segmentLabel: d.name,
              segmentValue: fmtGBP(d.value ?? 0),
              predicate: (o) => o.restructure_type === d.name,
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
          wrapperStyle={{ fontSize: 10 }}
          formatter={(value: string) => (
            <span style={{ color: "rgba(255,255,255,0.85)" }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

/* ---------- Registry ---------- */

export const CHART_DEFS: HopperChartDef[] = [
  {
    id: "pipeline-by-status",
    title: "Pipeline by Status",
    subtitle: "CRP term benefit (£m) by canonical pipeline stage",
    category: "pipeline",
    description: "Bar chart of CRP value at each pipeline stage.",
    defaultPinned: true,
    Component: PipelineByStatusChart,
  },
  {
    id: "crp-by-region",
    title: "CRP by Region",
    subtitle: "Share of CRP term benefit",
    category: "regional",
    description: "Donut split of CRP across regions.",
    defaultPinned: true,
    Component: CrpByRegionChart,
  },
  {
    id: "top-customers",
    title: "Top Customers",
    subtitle: "By CRP term benefit (£m)",
    category: "customer",
    description: "Top 15 customers by total CRP benefit.",
    defaultPinned: true,
    Component: TopCustomersChart,
  },
  {
    id: "evs-distribution",
    title: "Engine Value Stream Distribution",
    subtitle: "Count of opportunities per EVS",
    category: "engine",
    description: "Bar chart of opportunity counts per engine value stream.",
    defaultPinned: true,
    Component: EvsDistributionChart,
  },
  {
    id: "annual-profit-forecast",
    title: "Annual Profit Forecast",
    subtitle: "Sum of annual profit (£m)",
    category: "financial",
    description: "Yearly profit roll-up 2026-2030.",
    defaultPinned: true,
    Component: AnnualProfitForecastChart,
  },
  {
    id: "restructure-type-split",
    title: "Restructure Type Split",
    subtitle: "CRP term benefit (£m)",
    category: "structural",
    description: "Donut split of CRP by restructure type.",
    defaultPinned: true,
    Component: RestructureTypeSplitChart,
  },
]

export const HOPPER_PINS_KEY = "rr.hopper.pinned"
export const HOPPER_DEFAULT_PINS = CHART_DEFS.filter((d) => d.defaultPinned).map((d) => d.id)
```

- [ ] **Step 2: tsc**

```
cd "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/NewFrontEndToBePorted" && pnpm tsc --noEmit
```

---

## Task 3: Customize Sheet UI

**Files:**
- Create: `V8/NewFrontEndToBePorted/components/visualizers/hopper-customize-sheet.tsx`

- [ ] **Step 1: Write the file**

```tsx
"use client"

import { useState } from "react"
import { Settings, RotateCcw } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Checkbox } from "@/components/ui/checkbox"
import { CHART_DEFS, type HopperChartCategory } from "./hopper-charts"

const CATEGORY_LABELS: Record<HopperChartCategory, string> = {
  pipeline: "Pipeline",
  regional: "Regional",
  customer: "Customer",
  engine: "Engine",
  financial: "Financial",
  structural: "Structural",
}

interface HopperCustomizeSheetProps {
  pinned: Set<string>
  onChange: (next: Set<string>) => void
  onReset: () => void
}

export function HopperCustomizeSheet({ pinned, onChange, onReset }: HopperCustomizeSheetProps) {
  const [open, setOpen] = useState(false)

  function toggle(id: string) {
    const next = new Set(pinned)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  // Group by category preserving registry order
  const groups = new Map<HopperChartCategory, typeof CHART_DEFS>()
  for (const def of CHART_DEFS) {
    const arr = groups.get(def.category) ?? []
    arr.push(def)
    groups.set(def.category, arr)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="h-8 self-end rounded border border-white/20 bg-white/5 px-3 text-xs font-medium hover:bg-white/10 transition-colors inline-flex items-center gap-1.5"
        >
          <Settings className="h-3.5 w-3.5" />
          Customize
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-[24rem] max-w-[90vw] bg-[oklch(0.17_0.03_165)] text-white border-l border-white/10 overflow-y-auto p-6"
      >
        <SheetHeader className="text-left p-0">
          <SheetTitle className="text-white font-display">Customize Standard View</SheetTitle>
          <SheetDescription className="text-white/60">
            Pick which charts appear on the Hopper dashboard. Your choice is saved in this browser.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {Array.from(groups.entries()).map(([category, defs]) => (
            <div key={category}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2">
                {CATEGORY_LABELS[category]}
              </div>
              <div className="space-y-2">
                {defs.map((def) => {
                  const checked = pinned.has(def.id)
                  return (
                    <label
                      key={def.id}
                      className="flex items-start gap-3 rounded border border-white/10 bg-white/[0.03] p-3 cursor-pointer hover:border-white/30 transition-colors"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggle(def.id)}
                        className="mt-0.5 border-white/40 data-[state=checked]:bg-[var(--chart-2)] data-[state=checked]:border-[var(--chart-2)]"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white">{def.title}</div>
                        <div className="text-xs text-white/55 mt-0.5">{def.description}</div>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onReset}
          className="mt-6 inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white"
        >
          <RotateCcw className="h-3 w-3" />
          Reset to defaults
        </button>
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 2: tsc**

```
cd "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/NewFrontEndToBePorted" && pnpm tsc --noEmit
```

---

## Task 4: Refactor `global-hopper-visualizer.tsx` to use the registry

**Files:**
- Modify: `V8/NewFrontEndToBePorted/components/visualizers/global-hopper-visualizer.tsx`

The plan: delete the chart-specific imports and the 3 chart-row JSX blocks, replace with a registry-driven render loop, add `pinned` state, integrate the Customize button.

- [ ] **Step 1: Replace the recharts imports + chart imports**

Find the existing recharts import block and Replace with the simpler imports needed by the wrapper (no recharts needed in wrapper; charts are imported components):

```ts
"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Globe2,
  TrendingUp,
  Activity,
  AlertCircle,
  Users,
  Filter,
  Gauge,
  ShieldCheck,
  ShieldAlert,
  ChevronDown,
  Database,
  LayoutDashboard,
} from "lucide-react"
import type { GlobalHopperData, HopperOpp } from "@/lib/types"
import { DataTable, type DataTableColumn } from "@/components/shared/data-table"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { fmtGBP, fmtCount } from "@/lib/format"
import { loadPins, savePins } from "@/lib/chart-pins"
import {
  CHART_DEFS,
  HOPPER_PINS_KEY,
  HOPPER_DEFAULT_PINS,
  type OpenDrilldownArgs,
} from "./hopper-charts"
import { HopperCustomizeSheet } from "./hopper-customize-sheet"
```

Drop the `PIPELINE_ORDER` constant and the `useMemo` blocks for `pipelineData`, `regionDonut`, `topCustomers`, `evsData`, `annualForecast`, `restructureSplit` — they're now in `hopper-charts.tsx`.

- [ ] **Step 2: Add `pinned` state via localStorage hydration**

Below the existing filter `useState`s and the `Drilldown` state, add:

```ts
const [pinned, setPinned] = useState<Set<string>>(new Set(HOPPER_DEFAULT_PINS))

// Hydrate from localStorage on the client (SSR-safe — server renders with defaults)
useEffect(() => {
  setPinned(loadPins(HOPPER_PINS_KEY, HOPPER_DEFAULT_PINS))
}, [])

function updatePinned(next: Set<string>) {
  setPinned(next)
  savePins(HOPPER_PINS_KEY, next)
}

function resetPinned() {
  const fresh = new Set<string>(HOPPER_DEFAULT_PINS)
  setPinned(fresh)
  savePins(HOPPER_PINS_KEY, fresh)
}
```

- [ ] **Step 3: Add Customize button to filter row**

Find the existing filter row's Reset button block (the conditional rendering after the last `<HopperSelect />`). Add the customize button just before the existing Reset button:

```tsx
<HopperCustomizeSheet pinned={pinned} onChange={updatePinned} onReset={resetPinned} />
{[region, customer, evs, status, maturity, rtype].some((v) => v !== "__all__") ? (
  <button …>Reset</button>
) : null}
```

- [ ] **Step 4: Replace the three "Charts row N" blocks with a single registry-driven render**

Delete all three `{/* Charts row 1 */}` … `{/* Charts row 3 */}` blocks (the `<div className="grid gap-4 lg:grid-cols-2">…</div>` sections containing the 6 `<HopperChartCard>` instances).

Replace with:

```tsx
{/* Charts (pinned only) */}
{(() => {
  const visible = CHART_DEFS.filter((d) => pinned.has(d.id))
  if (visible.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.02] p-10 text-center">
        <LayoutDashboard className="h-6 w-6 mx-auto text-white/40" />
        <div className="mt-3 text-sm font-medium text-white/80">No charts pinned</div>
        <div className="mt-1 text-xs text-white/55 max-w-sm mx-auto">
          Use the Customize button in the filter bar to pick which charts appear here. Your choice
          is saved in this browser.
        </div>
      </div>
    )
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {visible.map((def) => (
        <HopperChartCard key={def.id} title={def.title} subtitle={def.subtitle}>
          <def.Component filtered={filtered} onDrilldown={openDrilldown} />
        </HopperChartCard>
      ))}
    </div>
  )
})()}
```

- [ ] **Step 5: Remove the unused recharts-related code in the file**

Confirm there are no more references to `BarChart`, `PieChart`, `Bar`, `Pie`, `Cell`, `Legend`, `CartesianGrid`, `XAxis`, `YAxis`, `Tooltip`, `ResponsiveContainer`, `seriesColorsLight`, `palette`, `PIPELINE_ORDER` inside `global-hopper-visualizer.tsx`:

```
grep -nE "BarChart|PieChart|\\bBar\\b|\\bPie\\b|\\bCell\\b|\\bLegend\\b|CartesianGrid|XAxis|YAxis|Tooltip|ResponsiveContainer|seriesColorsLight|palette|PIPELINE_ORDER" "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/NewFrontEndToBePorted/components/visualizers/global-hopper-visualizer.tsx"
```

Expected: matches only inside the imports block — if found there, they're unused and need to be removed. Drop any of those that no longer have a usage in the file (since the charts are now imported from `hopper-charts.tsx`).

- [ ] **Step 6: Type check + build**

```
cd "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/NewFrontEndToBePorted" && pnpm tsc --noEmit && pnpm build 2>&1 | tail -10
```

Expected: tsc exit 0, build exit 0. Route listing still `/`, `/_not-found`, `/login`.

---

## Spec coverage

| Spec section | Task / Step |
|---|---|
| §2.1 Per-chart components in hopper-charts.tsx | Task 2 |
| §2.2 localStorage `rr.hopper.pinned` | Task 1 + Task 4 Step 2 |
| §2.3 Default = all pinned | Task 2 (`defaultPinned: true` for all 6), Task 4 Step 2 |
| §2.4 No drag-to-reorder | Implicit — render iterates `CHART_DEFS` order |
| §2.5 Customize sheet | Task 3 |
| §2.6 Empty state | Task 4 Step 4 |
| §6 Layout (2-column grid) | Task 4 Step 4 |
| §9 Verification | Task 4 Step 6 |
| §10 Risk: SSR localStorage access | Task 1 (`typeof window` guards) + Task 4 Step 2 (`useEffect` hydration) |
