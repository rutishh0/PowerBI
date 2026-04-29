"use client"

import { useMemo, useState } from "react"
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
} from "lucide-react"
import type { GlobalHopperData, HopperOpp } from "@/lib/types"
import { DataTable, type DataTableColumn } from "@/components/shared/data-table"
import { fmtGBP, fmtCount } from "@/lib/format"
import { palette, seriesColors } from "@/lib/chart-palette"

// Canonical pipeline order (V6 SPEC §6.6.2)
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

interface GlobalHopperVisualizerProps {
  data: GlobalHopperData
  filename: string
}

export function GlobalHopperVisualizer({ data, filename }: GlobalHopperVisualizerProps) {
  const [region, setRegion] = useState("__all__")
  const [customer, setCustomer] = useState("__all__")
  const [evs, setEvs] = useState("__all__")
  const [status, setStatus] = useState("__all__")
  const [maturity, setMaturity] = useState("__all__")
  const [rtype, setRtype] = useState("__all__")

  const filtered = useMemo(() => {
    return data.opportunities.filter((o) => {
      if (region !== "__all__" && o.region !== region) return false
      if (customer !== "__all__" && o.customer !== customer) return false
      if (evs !== "__all__" && o.engine_value_stream !== evs) return false
      if (status !== "__all__" && o.status !== status) return false
      if (maturity !== "__all__" && o.maturity !== maturity) return false
      if (rtype !== "__all__" && o.restructure_type !== rtype) return false
      return true
    })
  }, [data.opportunities, region, customer, evs, status, maturity, rtype])

  // Hero KPIs
  const totalCRP = filtered.reduce((a, b) => a + b.crp_term_benefit, 0)
  const p2026 = filtered.reduce((a, b) => a + b.profit_2026, 0)
  const p2027 = filtered.reduce((a, b) => a + b.profit_2027, 0)
  const p2830 = filtered.reduce((a, b) => a + b.profit_2028 + b.profit_2029 + b.profit_2030, 0)

  // Secondary
  const mature = filtered.filter((o) => o.maturity === "Mature").length
  const immature = filtered.filter((o) => o.maturity === "Immature").length
  const onerous = filtered.filter((o) => o.onerous_type === "Onerous Contract").length
  const notOnerous = filtered.filter((o) => o.onerous_type === "Not Onerous").length
  const regionsInView = Array.from(new Set(filtered.map((o) => o.region)))

  // Pipeline by status (bar, canonical order)
  const pipelineData = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of PIPELINE_ORDER) map.set(s, 0)
    for (const o of filtered) map.set(o.status, (map.get(o.status) ?? 0) + o.crp_term_benefit)
    return PIPELINE_ORDER.map((stage) => ({ stage, value: +Number(map.get(stage) ?? 0).toFixed(1) }))
  }, [filtered])

  // CRP by region (donut)
  const regionDonut = useMemo(() => {
    const map = new Map<string, number>()
    for (const o of filtered) map.set(o.region, (map.get(o.region) ?? 0) + o.crp_term_benefit)
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value: +value.toFixed(1) }))
      .filter((r) => r.value > 0)
  }, [filtered])

  // Top 15 customers
  const topCustomers = useMemo(() => {
    const map = new Map<string, number>()
    for (const o of filtered) map.set(o.customer, (map.get(o.customer) ?? 0) + o.crp_term_benefit)
    return Array.from(map.entries())
      .map(([customer, value]) => ({ customer, value: +value.toFixed(1) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15)
  }, [filtered])

  // EVS distribution (counts)
  const evsData = useMemo(() => {
    const map = new Map<string, number>()
    for (const o of filtered) map.set(o.engine_value_stream, (map.get(o.engine_value_stream) ?? 0) + 1)
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [filtered])

  // Annual profit forecast
  const annualForecast = useMemo(
    () => [
      { year: "2026", value: +filtered.reduce((a, b) => a + b.profit_2026, 0).toFixed(1) },
      { year: "2027", value: +filtered.reduce((a, b) => a + b.profit_2027, 0).toFixed(1) },
      { year: "2028", value: +filtered.reduce((a, b) => a + b.profit_2028, 0).toFixed(1) },
      { year: "2029", value: +filtered.reduce((a, b) => a + b.profit_2029, 0).toFixed(1) },
      { year: "2030", value: +filtered.reduce((a, b) => a + b.profit_2030, 0).toFixed(1) },
    ],
    [filtered],
  )

  // Restructure type split
  const restructureSplit = useMemo(() => {
    const map = new Map<string, number>()
    for (const o of filtered) map.set(o.restructure_type, (map.get(o.restructure_type) ?? 0) + o.crp_term_benefit)
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value: +value.toFixed(1) }))
      .filter((r) => r.value > 0)
  }, [filtered])

  const registerCols: DataTableColumn<HopperOpp>[] = [
    { key: "region", header: "Region", accessor: (r) => r.region, sortable: true, fastFilter: true, widthClass: "w-[5.5rem]" },
    { key: "customer", header: "Customer", accessor: (r) => r.customer, sortable: true, fastFilter: true, widthClass: "w-[9rem]" },
    { key: "evs", header: "EVS", accessor: (r) => r.engine_value_stream, sortable: true, fastFilter: true, widthClass: "w-[9rem]" },
    { key: "rtype", header: "Restructure Type", accessor: (r) => r.restructure_type, sortable: true, fastFilter: true, widthClass: "w-[10rem]" },
    {
      key: "maturity",
      header: "Maturity",
      accessor: (r) => r.maturity,
      sortable: true,
      fastFilter: true,
      widthClass: "w-[6rem]",
      render: (r) => (
        <span
          className={
            r.maturity === "Mature"
              ? "inline-flex rounded bg-[var(--chart-4)]/20 text-[var(--chart-4)] px-1.5 py-0.5 text-[10px] font-semibold"
              : "inline-flex rounded bg-white/10 text-white/70 px-1.5 py-0.5 text-[10px] font-semibold"
          }
        >
          {r.maturity}
        </span>
      ),
    },
    { key: "status", header: "Status", accessor: (r) => r.status, sortable: true, widthClass: "w-[12rem]" },
    {
      key: "crp",
      header: "CRP Term (£m)",
      accessor: (r) => r.crp_term_benefit,
      sortable: true,
      align: "right",
      render: (r) => <span className="tnum font-semibold">{fmtGBP(r.crp_term_benefit)}</span>,
      widthClass: "w-[7rem]",
    },
    {
      key: "p26",
      header: "2026 (£m)",
      accessor: (r) => r.profit_2026,
      sortable: true,
      align: "right",
      render: (r) => <span className="tnum">{fmtGBP(r.profit_2026)}</span>,
      widthClass: "w-[6rem]",
    },
    {
      key: "p27",
      header: "2027 (£m)",
      accessor: (r) => r.profit_2027,
      sortable: true,
      align: "right",
      render: (r) => <span className="tnum">{fmtGBP(r.profit_2027)}</span>,
      widthClass: "w-[6rem]",
    },
    { key: "vp", header: "VP/Owner", accessor: (r) => r.vp_owner, sortable: true, widthClass: "w-[8rem]" },
  ]

  return (
    <div className="bg-[oklch(0.17_0.03_165)] text-white min-h-full">
      <div className="px-6 py-6 flex flex-col gap-6 max-w-[125rem] mx-auto w-full">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-start gap-3 min-w-0">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--chart-4)]/15 text-[var(--chart-4)]">
              <Globe2 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-balance">{data.metadata.title}</h2>
              <p className="text-sm text-white/60 mt-1">
                {filename} · {data.metadata.regions.join(" · ")}
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <span className="inline-flex items-center rounded bg-[var(--chart-4)]/20 px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] text-[var(--chart-4)]">
              GLOBAL HOPPER
            </span>
            <span className="inline-flex items-center rounded bg-white/10 px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] text-white/80">
              ROLLS‑ROYCE
            </span>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center gap-2 text-xs text-white/60">
            <Filter className="h-3.5 w-3.5" />
            <span className="font-medium uppercase tracking-[0.1em]">Filters</span>
          </div>
          <HopperSelect label="Region" value={region} onChange={setRegion} options={data.summary.unique_regions} />
          <HopperSelect label="Customer" value={customer} onChange={setCustomer} options={data.summary.unique_customers} width="10rem" />
          <HopperSelect label="EVS" value={evs} onChange={setEvs} options={data.summary.unique_evs} width="9rem" />
          <HopperSelect label="Status" value={status} onChange={setStatus} options={data.summary.unique_statuses} width="10rem" />
          <HopperSelect label="Maturity" value={maturity} onChange={setMaturity} options={data.summary.unique_maturities} />
          <HopperSelect label="Restructure" value={rtype} onChange={setRtype} options={data.summary.unique_restructure_types} width="9rem" />
          {[region, customer, evs, status, maturity, rtype].some((v) => v !== "__all__") ? (
            <button
              onClick={() => {
                setRegion("__all__")
                setCustomer("__all__")
                setEvs("__all__")
                setStatus("__all__")
                setMaturity("__all__")
                setRtype("__all__")
              }}
              className="h-8 self-end rounded border border-white/20 bg-white/5 px-3 text-xs font-medium hover:bg-white/10 transition-colors"
            >
              Reset
            </button>
          ) : null}
        </div>

        {/* Hero KPIs */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HopperKpi label="CRP Term Benefit" value={fmtGBP(totalCRP)} icon={<TrendingUp className="h-4 w-4" />} accent="primary" />
          <HopperKpi label="Profit 2026" value={fmtGBP(p2026)} icon={<Activity className="h-4 w-4" />} />
          <HopperKpi label="Profit 2027" value={fmtGBP(p2027)} icon={<Activity className="h-4 w-4" />} accent="gold" />
          <HopperKpi label="Profit 2028–30" value={fmtGBP(p2830)} icon={<Gauge className="h-4 w-4" />} accent="primary" />
        </div>

        {/* Meta chips */}
        <div className="flex flex-wrap gap-2">
          <HopperChip label="Currency" value="GBP (£m)" />
          <HopperChip label="Opportunities" value={`${fmtCount(filtered.length)} / ${fmtCount(data.opportunities.length)}`} />
          <HopperChip label="Customers" value={fmtCount(new Set(filtered.map((o) => o.customer)).size)} />
          <HopperChip label="Regions" value={regionsInView.join(" · ") || "—"} />
          <HopperChip label="EVS Types" value={fmtCount(new Set(filtered.map((o) => o.engine_value_stream)).size)} />
        </div>

        {/* Secondary KPIs */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          <HopperKpi label="Mature" value={fmtCount(mature)} icon={<ShieldCheck className="h-4 w-4" />} accent="success" />
          <HopperKpi label="Immature" value={fmtCount(immature)} icon={<ShieldAlert className="h-4 w-4" />} />
          <HopperKpi label="Onerous" value={fmtCount(onerous)} icon={<AlertCircle className="h-4 w-4" />} accent="danger" />
          <HopperKpi label="Not Onerous" value={fmtCount(notOnerous)} icon={<ShieldCheck className="h-4 w-4" />} />
          <HopperKpi
            label="Regions"
            value={fmtCount(regionsInView.length)}
            sub={regionsInView.join(", ") || "—"}
            icon={<Globe2 className="h-4 w-4" />}
          />
        </div>

        {/* Charts row 1 */}
        <div className="grid gap-4 lg:grid-cols-2">
          <HopperChartCard title="Pipeline by Status" subtitle="CRP term benefit (£m) by canonical pipeline stage">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pipelineData} margin={{ top: 10, right: 10, left: 0, bottom: 60 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="stage" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.6)" }} interval={0} angle={-25} height={80} textAnchor="end" />
                <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} tickFormatter={(v) => `£${v}m`} />
                <Tooltip
                  formatter={(v: number) => fmtGBP(v)}
                  contentStyle={{ background: "oklch(0.22 0.04 165)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, fontSize: 12 }}
                  itemStyle={{ color: "white" }}
                  labelStyle={{ color: "white" }}
                />
                <Bar dataKey="value" fill={palette.accent} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </HopperChartCard>

          <HopperChartCard title="CRP by Region" subtitle="Share of CRP term benefit">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={regionDonut} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} strokeWidth={0}>
                  {regionDonut.map((_, i) => (
                    <Cell key={i} fill={seriesColors[i % seriesColors.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => fmtGBP(v)}
                  contentStyle={{ background: "oklch(0.22 0.04 165)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, fontSize: 12 }}
                  itemStyle={{ color: "white" }}
                  labelStyle={{ color: "white" }}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }} />
              </PieChart>
            </ResponsiveContainer>
          </HopperChartCard>
        </div>

        {/* Charts row 2 */}
        <div className="grid gap-4 lg:grid-cols-2">
          <HopperChartCard title={`Top ${topCustomers.length} Customers`} subtitle="By CRP term benefit (£m)">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topCustomers} layout="vertical" margin={{ top: 6, right: 10, left: 10, bottom: 6 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} tickFormatter={(v) => `£${v}m`} />
                <YAxis dataKey="customer" type="category" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.75)" }} width={100} />
                <Tooltip
                  formatter={(v: number) => fmtGBP(v)}
                  contentStyle={{ background: "oklch(0.22 0.04 165)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, fontSize: 12 }}
                  itemStyle={{ color: "white" }}
                  labelStyle={{ color: "white" }}
                />
                <Bar dataKey="value" fill={palette.blue} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </HopperChartCard>

          <HopperChartCard title="Engine Value Stream Distribution" subtitle="Count of opportunities per EVS">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={evsData} margin={{ top: 10, right: 10, left: 0, bottom: 40 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} interval={0} angle={-18} height={60} textAnchor="end" />
                <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} />
                <Tooltip
                  contentStyle={{ background: "oklch(0.22 0.04 165)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, fontSize: 12 }}
                  itemStyle={{ color: "white" }}
                  labelStyle={{ color: "white" }}
                />
                <Bar dataKey="value" fill={palette.copper} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </HopperChartCard>
        </div>

        {/* Charts row 3 */}
        <div className="grid gap-4 lg:grid-cols-2">
          <HopperChartCard title="Annual Profit Forecast" subtitle="Sum of annual profit (£m)">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={annualForecast} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.75)" }} />
                <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} tickFormatter={(v) => `£${v}m`} />
                <Tooltip
                  formatter={(v: number) => fmtGBP(v)}
                  contentStyle={{ background: "oklch(0.22 0.04 165)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, fontSize: 12 }}
                  itemStyle={{ color: "white" }}
                  labelStyle={{ color: "white" }}
                />
                <Bar dataKey="value" fill={palette.accent} radius={[3, 3, 0, 0]}>
                  {annualForecast.map((_, i) => (
                    <Cell key={i} fill={i < 2 ? palette.accent : i === 2 ? palette.blue : palette.copper} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </HopperChartCard>

          <HopperChartCard title="Restructure Type Split" subtitle="CRP term benefit (£m)">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={restructureSplit} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} strokeWidth={0}>
                  {restructureSplit.map((_, i) => (
                    <Cell key={i} fill={seriesColors[i % seriesColors.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => fmtGBP(v)}
                  contentStyle={{ background: "oklch(0.22 0.04 165)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, fontSize: 12 }}
                  itemStyle={{ color: "white" }}
                  labelStyle={{ color: "white" }}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10, color: "rgba(255,255,255,0.75)" }} />
              </PieChart>
            </ResponsiveContainer>
          </HopperChartCard>
        </div>

        {/* Register */}
        <HopperCollapsible title="Opportunities Register" defaultOpen icon={<Database className="h-4 w-4" />}>
          <DataTable
            columns={registerCols}
            rows={filtered}
            maxRows={200}
            getRowId={(r, i) => `${r.region}-${r.customer}-${i}`}
          />
        </HopperCollapsible>
      </div>
    </div>
  )
}

/* ---------- Scoped dark helpers ---------- */

function HopperSelect({
  label,
  value,
  onChange,
  options,
  width = "7rem",
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: readonly string[]
  width?: string
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-medium text-white/60">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded border border-white/15 bg-white/5 px-2 text-xs text-white"
        style={{ minWidth: width }}
      >
        <option value="__all__" className="bg-[oklch(0.22_0.04_165)]">All</option>
        {options.map((o) => (
          <option key={o} value={o} className="bg-[oklch(0.22_0.04_165)]">
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}

function HopperChip({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs">
      <span className="font-medium uppercase tracking-[0.1em] text-white/55">{label}</span>
      <span className="text-white tnum">{value}</span>
    </div>
  )
}

function HopperKpi({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string
  value: string
  sub?: string
  icon?: React.ReactNode
  accent?: "gold" | "primary" | "success" | "danger"
}) {
  const valueTone =
    accent === "gold"
      ? "text-[var(--chart-2)]"
      : accent === "primary"
        ? "text-[var(--chart-4)]"
        : accent === "success"
          ? "text-[var(--chart-4)]"
          : accent === "danger"
            ? "text-destructive"
            : "text-white"
  const iconBg =
    accent === "gold"
      ? "bg-[var(--chart-2)]/15 text-[var(--chart-2)]"
      : accent === "primary"
        ? "bg-[var(--chart-4)]/15 text-[var(--chart-4)]"
        : accent === "success"
          ? "bg-[var(--chart-4)]/15 text-[var(--chart-4)]"
          : accent === "danger"
            ? "bg-destructive/20 text-destructive"
            : "bg-white/10 text-white/70"
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/55">{label}</span>
        {icon ? <span className={`flex h-8 w-8 items-center justify-center rounded-md ${iconBg}`}>{icon}</span> : null}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className={`font-display text-2xl font-semibold tracking-tight tnum ${valueTone}`}>{value}</span>
        {sub ? <span className="text-xs text-white/55 text-pretty truncate">{sub}</span> : null}
      </div>
    </div>
  )
}

function HopperChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-4">
      <div className="min-w-0">
        <h3 className="font-display text-sm font-semibold tracking-tight text-white/95 truncate">{title}</h3>
        {subtitle ? <p className="text-xs text-white/55 truncate mt-0.5">{subtitle}</p> : null}
      </div>
      <div className="w-full" style={{ height: 300 }}>
        {children}
      </div>
    </div>
  )
}

function HopperCollapsible({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string
  icon?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon ? <span className="text-white/70">{icon}</span> : null}
          <span className="font-display text-sm font-semibold text-white/95">{title}</span>
        </div>
        <ChevronDown className={`h-4 w-4 text-white/50 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <div className="px-4 pb-4">{children}</div> : null}
    </div>
  )
}
