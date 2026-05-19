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

export type HopperChartCategory =
  | "pipeline"
  | "regional"
  | "customer"
  | "engine"
  | "financial"
  | "structural"
  | "ownership"

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

/* ---------- New chart types (sub-project D) ---------- */

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
