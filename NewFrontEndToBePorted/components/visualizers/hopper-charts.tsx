"use client"

import { useMemo, type ReactElement } from "react"
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
import {
  pickNextBreakdowns,
  sumMetric,
  formatMetric,
  useChartDrilldown,
  type DrilldownFrame,
  type DrilldownMetric,
} from "./hopper-drilldown"

export type HopperChartCategory =
  | "pipeline"
  | "regional"
  | "customer"
  | "engine"
  | "financial"
  | "structural"
  | "ownership"

export interface HopperChartProps {
  filtered: HopperOpp[]
}

export interface HopperChartDef {
  id: string
  title: string
  subtitle: string
  category: HopperChartCategory
  description: string
  defaultPinned: boolean
  Component: (props: HopperChartProps) => ReactElement
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

const TOOLTIP_STYLE = {
  contentStyle: {
    background: "oklch(0.22 0.04 165)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 6,
    fontSize: 12,
  } as const,
  itemStyle: { color: "white" },
  labelStyle: { color: "white" },
}

const LEGEND_FORMATTER = (value: string) => (
  <span style={{ color: "rgba(255,255,255,0.85)" }}>{value}</span>
)

/** Build the initial drill frame from a chart click, with a metric and
 * the dimension the chart was sliced BY (so sub-drills don't offer it
 * again). */
function makeFrame(
  segmentLabel: string,
  rows: HopperOpp[],
  metric: DrilldownMetric,
  sourceDim: string,
): DrilldownFrame | null {
  if (rows.length === 0) return null
  const used = new Set([sourceDim])
  const segmentValue = formatMetric(metric, sumMetric(metric, rows))
  if (rows.length === 1) {
    return { kind: "single-row", segmentLabel, segmentValue, row: rows[0] }
  }
  return {
    kind: "aggregate",
    segmentLabel,
    segmentValue,
    rows,
    metric,
    breakdowns: pickNextBreakdowns(used),
    usedDims: used,
  }
}

/* ============================================================================
 *  Existing 6 charts
 * ========================================================================= */

export function PipelineByStatusChart({ filtered }: HopperChartProps) {
  const { openFrame, drilldownView } = useChartDrilldown("Pipeline by Status")
  const data = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of PIPELINE_ORDER) map.set(s, 0)
    for (const o of filtered) map.set(o.status, (map.get(o.status) ?? 0) + o.crp_term_benefit)
    return PIPELINE_ORDER.map((stage) => ({ stage, value: +Number(map.get(stage) ?? 0).toFixed(1) }))
  }, [filtered])

  if (drilldownView) return drilldownView

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 60 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="stage" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.6)" }} interval={0} angle={-25} height={80} textAnchor="end" />
        <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} tickFormatter={(v) => `£${v}m`} />
        <Tooltip formatter={(v: number) => fmtGBP(v)} {...TOOLTIP_STYLE} />
        <Bar
          dataKey="value"
          fill={palette.accent}
          radius={[3, 3, 0, 0]}
          cursor="pointer"
          onClick={(d: { stage?: string }) => {
            if (!d.stage) return
            const f = makeFrame(d.stage, filtered.filter((o) => o.status === d.stage), { kind: "sum_crp" }, "status")
            if (f) openFrame(f)
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function CrpByRegionChart({ filtered }: HopperChartProps) {
  const { openFrame, drilldownView } = useChartDrilldown("CRP by Region")
  const data = useMemo(() => {
    const map = new Map<string, number>()
    for (const o of filtered) map.set(o.region, (map.get(o.region) ?? 0) + o.crp_term_benefit)
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value: +value.toFixed(1) }))
      .filter((r) => r.value > 0)
  }, [filtered])

  if (drilldownView) return drilldownView

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
          onClick={(d: { name?: string }) => {
            if (!d.name) return
            const f = makeFrame(d.name, filtered.filter((o) => o.region === d.name), { kind: "sum_crp" }, "region")
            if (f) openFrame(f)
          }}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={seriesColorsLight[i % seriesColorsLight.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number) => fmtGBP(v)} {...TOOLTIP_STYLE} />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} formatter={LEGEND_FORMATTER} />
      </PieChart>
    </ResponsiveContainer>
  )
}

export function TopCustomersChart({ filtered }: HopperChartProps) {
  const { openFrame, drilldownView } = useChartDrilldown("Top Customers")
  const data = useMemo(() => {
    const map = new Map<string, number>()
    for (const o of filtered) map.set(o.customer, (map.get(o.customer) ?? 0) + o.crp_term_benefit)
    return Array.from(map.entries())
      .map(([customer, value]) => ({ customer, value: +value.toFixed(1) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15)
  }, [filtered])

  if (drilldownView) return drilldownView

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 6, right: 10, left: 10, bottom: 6 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} tickFormatter={(v) => `£${v}m`} />
        <YAxis dataKey="customer" type="category" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.75)" }} width={100} />
        <Tooltip formatter={(v: number) => fmtGBP(v)} {...TOOLTIP_STYLE} />
        <Bar
          dataKey="value"
          fill={palette.blue}
          radius={[0, 3, 3, 0]}
          cursor="pointer"
          onClick={(d: { customer?: string }) => {
            if (!d.customer) return
            const f = makeFrame(d.customer, filtered.filter((o) => o.customer === d.customer), { kind: "sum_crp" }, "customer")
            if (f) openFrame(f)
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function EvsDistributionChart({ filtered }: HopperChartProps) {
  const { openFrame, drilldownView } = useChartDrilldown("Engine Value Stream Distribution")
  const data = useMemo(() => {
    const map = new Map<string, number>()
    for (const o of filtered) map.set(o.engine_value_stream, (map.get(o.engine_value_stream) ?? 0) + 1)
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [filtered])

  if (drilldownView) return drilldownView

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 40 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} interval={0} angle={-18} height={60} textAnchor="end" />
        <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} />
        <Tooltip {...TOOLTIP_STYLE} />
        <Bar
          dataKey="value"
          fill={palette.copper}
          radius={[3, 3, 0, 0]}
          cursor="pointer"
          onClick={(d: { name?: string }) => {
            if (!d.name) return
            const f = makeFrame(d.name, filtered.filter((o) => o.engine_value_stream === d.name), { kind: "count" }, "evs")
            if (f) openFrame(f)
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function AnnualProfitForecastChart({ filtered }: HopperChartProps) {
  const { openFrame, drilldownView } = useChartDrilldown("Annual Profit Forecast")
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

  if (drilldownView) return drilldownView

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="year" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.75)" }} />
        <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} tickFormatter={(v) => `£${v}m`} />
        <Tooltip formatter={(v: number) => fmtGBP(v)} {...TOOLTIP_STYLE} />
        <Bar
          dataKey="value"
          fill={palette.accent}
          radius={[3, 3, 0, 0]}
          cursor="pointer"
          onClick={(d: { year?: string }) => {
            if (!d.year) return
            const year = Number(d.year) as 2026 | 2027 | 2028 | 2029 | 2030
            const yearKey = `profit_${year}` as keyof HopperOpp
            const rows = filtered.filter((o) => Number(o[yearKey]) !== 0)
            // Year is not in DRILL_DIM_POOL, so we don't claim a sourceDim
            // for it — just use a dummy that's not in the pool.
            const f = makeFrame(d.year, rows, { kind: "sum_profit_year", year }, "__year__")
            if (f) openFrame(f)
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

export function RestructureTypeSplitChart({ filtered }: HopperChartProps) {
  const { openFrame, drilldownView } = useChartDrilldown("Restructure Type Split")
  const data = useMemo(() => {
    const map = new Map<string, number>()
    for (const o of filtered) map.set(o.restructure_type, (map.get(o.restructure_type) ?? 0) + o.crp_term_benefit)
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value: +value.toFixed(1) }))
      .filter((r) => r.value > 0)
  }, [filtered])

  if (drilldownView) return drilldownView

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
          onClick={(d: { name?: string }) => {
            if (!d.name) return
            const f = makeFrame(d.name, filtered.filter((o) => o.restructure_type === d.name), { kind: "sum_crp" }, "restructure_type")
            if (f) openFrame(f)
          }}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={seriesColorsLight[i % seriesColorsLight.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number) => fmtGBP(v)} {...TOOLTIP_STYLE} />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} formatter={LEGEND_FORMATTER} />
      </PieChart>
    </ResponsiveContainer>
  )
}

/* ============================================================================
 *  Sub-project D charts
 * ========================================================================= */

export function PipelineConversionFunnelChart({ filtered }: HopperChartProps) {
  const { openFrame, drilldownView } = useChartDrilldown("Pipeline Conversion Funnel")
  const data = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of PIPELINE_ORDER) map.set(s, 0)
    for (const o of filtered) map.set(o.status, (map.get(o.status) ?? 0) + 1)
    return PIPELINE_ORDER.map((stage) => ({ stage, value: map.get(stage) ?? 0 }))
  }, [filtered])

  if (drilldownView) return drilldownView

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 60 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="stage" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.6)" }} interval={0} angle={-25} height={80} textAnchor="end" />
        <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} />
        <Tooltip {...TOOLTIP_STYLE} />
        <Bar
          dataKey="value"
          fill={palette.blue}
          radius={[3, 3, 0, 0]}
          cursor="pointer"
          onClick={(d: { stage?: string }) => {
            if (!d.stage) return
            const f = makeFrame(d.stage, filtered.filter((o) => o.status === d.stage), { kind: "count" }, "status")
            if (f) openFrame(f)
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function RegionEvsHeatmapChart({ filtered }: HopperChartProps) {
  const { openFrame, drilldownView } = useChartDrilldown("Region × EVS Heatmap")
  const { regions, evss, counts, maxCount } = useMemo(() => {
    const byRegion = new Map<string, number>()
    const byEvs = new Map<string, number>()
    for (const o of filtered) {
      byRegion.set(o.region, (byRegion.get(o.region) ?? 0) + 1)
      byEvs.set(o.engine_value_stream, (byEvs.get(o.engine_value_stream) ?? 0) + 1)
    }
    const topRegions = Array.from(byRegion.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([r]) => r)
    const topEvss = Array.from(byEvs.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([e]) => e)
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

  if (drilldownView) return drilldownView

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
                      const rows = filtered.filter((o) => o.region === r && o.engine_value_stream === e)
                      // Both region AND evs are consumed up front for this chart's source dim.
                      if (rows.length === 0) return
                      const used = new Set(["region", "evs"])
                      const seg = `${r} · ${e}`
                      const val = formatMetric({ kind: "count" }, rows.length)
                      if (rows.length === 1) {
                        openFrame({ kind: "single-row", segmentLabel: seg, segmentValue: val, row: rows[0] })
                      } else {
                        openFrame({
                          kind: "aggregate",
                          segmentLabel: seg,
                          segmentValue: val,
                          rows,
                          metric: { kind: "count" },
                          breakdowns: pickNextBreakdowns(used),
                          usedDims: used,
                        })
                      }
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

export function TopVpOwnersChart({ filtered }: HopperChartProps) {
  const { openFrame, drilldownView } = useChartDrilldown("Top VP / Owners")
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

  if (drilldownView) return drilldownView

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 6, right: 10, left: 10, bottom: 6 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} tickFormatter={(v) => `£${v}m`} />
        <YAxis dataKey="vp_owner" type="category" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.75)" }} width={120} />
        <Tooltip formatter={(v: number) => fmtGBP(v)} {...TOOLTIP_STYLE} />
        <Bar
          dataKey="value"
          fill={palette.success}
          radius={[0, 3, 3, 0]}
          cursor="pointer"
          onClick={(d: { vp_owner?: string }) => {
            if (!d.vp_owner) return
            const f = makeFrame(d.vp_owner, filtered.filter((o) => o.vp_owner === d.vp_owner), { kind: "sum_crp" }, "vp_owner")
            if (f) openFrame(f)
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function TopSingleOpportunitiesChart({ filtered }: HopperChartProps) {
  const { openFrame, drilldownView } = useChartDrilldown("Top Single Opportunities")
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

  if (drilldownView) return drilldownView

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 6, right: 10, left: 10, bottom: 6 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} tickFormatter={(v) => `£${v}m`} />
        <YAxis dataKey="label" type="category" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.75)" }} width={170} />
        <Tooltip formatter={(v: number) => fmtGBP(v)} {...TOOLTIP_STYLE} />
        <Bar
          dataKey="value"
          fill={palette.accent}
          radius={[0, 3, 3, 0]}
          cursor="pointer"
          onClick={(d: { idx?: number }) => {
            if (d.idx === undefined) return
            const row = data[d.idx]
            if (!row) return
            openFrame({
              kind: "single-row",
              segmentLabel: row.label,
              segmentValue: fmtGBP(row.value),
              row: row.opp,
            })
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function MaturityMixChart({ filtered }: HopperChartProps) {
  const { openFrame, drilldownView } = useChartDrilldown("Maturity Mix")
  const data = useMemo(() => {
    const map = new Map<string, number>()
    for (const o of filtered) map.set(o.maturity, (map.get(o.maturity) ?? 0) + o.crp_term_benefit)
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value: +value.toFixed(1) }))
      .filter((r) => r.value > 0)
  }, [filtered])

  if (drilldownView) return drilldownView

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
          onClick={(d: { name?: string }) => {
            if (!d.name) return
            const f = makeFrame(d.name, filtered.filter((o) => o.maturity === d.name), { kind: "sum_crp" }, "maturity")
            if (f) openFrame(f)
          }}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={seriesColorsLight[i % seriesColorsLight.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number) => fmtGBP(v)} {...TOOLTIP_STYLE} />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} formatter={LEGEND_FORMATTER} />
      </PieChart>
    </ResponsiveContainer>
  )
}

export function OnerousMixChart({ filtered }: HopperChartProps) {
  const { openFrame, drilldownView } = useChartDrilldown("Onerous Mix")
  const data = useMemo(() => {
    const map = new Map<string, number>()
    for (const o of filtered) map.set(o.onerous_type, (map.get(o.onerous_type) ?? 0) + o.crp_term_benefit)
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value: +value.toFixed(1) }))
      .filter((r) => r.value > 0)
  }, [filtered])

  if (drilldownView) return drilldownView

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
          onClick={(d: { name?: string }) => {
            if (!d.name) return
            const f = makeFrame(d.name, filtered.filter((o) => o.onerous_type === d.name), { kind: "sum_crp" }, "onerous_type")
            if (f) openFrame(f)
          }}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={seriesColorsLight[i % seriesColorsLight.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number) => fmtGBP(v)} {...TOOLTIP_STYLE} />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} formatter={LEGEND_FORMATTER} />
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
]

export const HOPPER_PINS_KEY = "rr.hopper.pinned"
export const HOPPER_DEFAULT_PINS = CHART_DEFS.filter((d) => d.defaultPinned).map((d) => d.id)
