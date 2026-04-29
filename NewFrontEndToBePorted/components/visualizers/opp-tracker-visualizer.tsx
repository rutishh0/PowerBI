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
  Target,
  TrendingUp,
  Trophy,
  Users,
  Filter,
  Layers,
  CircleDot,
  Calendar,
  Briefcase,
  AlertTriangle,
  ChevronDown,
} from "lucide-react"
import type { OppTrackerData, OppRecord } from "@/lib/types"
import { KpiCard } from "@/components/shared/kpi-card"
import { InfoChip } from "@/components/shared/info-chip"
import { SectionHeader } from "@/components/shared/section-header"
import { ChartCard } from "@/components/shared/chart-card"
import { DataTable, type DataTableColumn } from "@/components/shared/data-table"
import { CollapsibleSection } from "@/components/shared/collapsible-section"
import { fmtM, fmtCount, fmtPct, fmtDate } from "@/lib/format"
import { palette, seriesColors } from "@/lib/chart-palette"

const STATUS_ORDER = ["Hopper", "ICT", "Negotiations", "Contracting", "Completed", "Cancelled"] as const
const PHASE_ORDER = [
  "idea_generation",
  "approval_to_launch",
  "strategy_approval",
  "be_generated",
  "approval",
  "negotiation_strategy",
  "proposal_submitted",
  "proposal_signed",
] as const
const PHASE_LABELS: Record<string, string> = {
  idea_generation: "Idea Gen",
  approval_to_launch: "Launch",
  strategy_approval: "Strategy",
  be_generated: "BE Gen",
  approval: "Approval",
  negotiation_strategy: "Negotiation",
  proposal_submitted: "Submitted",
  proposal_signed: "Signed",
}

interface OppTrackerVisualizerProps {
  data: OppTrackerData
  filename: string
}

export function OppTrackerVisualizer({ data, filename }: OppTrackerVisualizerProps) {
  const [customer, setCustomer] = useState("__all__")
  const [status, setStatus] = useState("__all__")
  const [extProb, setExtProb] = useState("__all__")
  const [priority, setPriority] = useState<string>("__all__")
  const [oppType, setOppType] = useState("__all__")
  const [minValue, setMinValue] = useState(0)

  const allRecords: OppRecord[] = useMemo(
    () => [
      ...data.opportunities_by_level.Hopper.records,
      ...data.opportunities_by_level.ICT.records,
      ...data.opportunities_by_level.Contract.records,
    ],
    [data],
  )

  const filtered = useMemo(() => {
    return allRecords.filter((r) => {
      if (customer !== "__all__" && r.customer !== customer) return false
      if (status !== "__all__" && r.status !== status) return false
      if (extProb !== "__all__" && r.ext_probability !== extProb) return false
      if (priority !== "__all__" && String(r.priority) !== priority) return false
      if (oppType !== "__all__" && r.opportunity_type !== oppType) return false
      if (minValue > 0 && r.sum_26_27 < minValue) return false
      return true
    })
  }, [allRecords, customer, status, extProb, priority, oppType, minValue])

  const customers = useMemo(() => Array.from(new Set(allRecords.map((r) => r.customer))).sort(), [allRecords])
  const oppTypes = useMemo(() => Array.from(new Set(allRecords.map((r) => r.opportunity_type))).sort(), [allRecords])

  // Hero KPIs
  const sum2026 = filtered.reduce((a, b) => a + b.benefit_2026, 0)
  const sum2027 = filtered.reduce((a, b) => a + b.benefit_2027, 0)
  const sum2627 = filtered.reduce((a, b) => a + b.sum_26_27, 0)
  const sumTerm = filtered.reduce((a, b) => a + b.term_benefit, 0)

  // Stacked: value by type & ext probability
  const typeByExtProb = useMemo(() => {
    const map = new Map<string, { name: string; High: number; Med: number; Low: number }>()
    for (const r of filtered) {
      const row = map.get(r.opportunity_type) ?? { name: r.opportunity_type, High: 0, Med: 0, Low: 0 }
      row[r.ext_probability] += r.sum_26_27
      map.set(r.opportunity_type, row)
    }
    return Array.from(map.values()).map((r) => ({
      ...r,
      High: +r.High.toFixed(1),
      Med: +r.Med.toFixed(1),
      Low: +r.Low.toFixed(1),
    }))
  }, [filtered])

  // Stacked: value by status & ext probability
  const statusByExtProb = useMemo(() => {
    const map = new Map<string, { name: string; High: number; Med: number; Low: number }>()
    for (const s of STATUS_ORDER) map.set(s, { name: s, High: 0, Med: 0, Low: 0 })
    for (const r of filtered) {
      const row = map.get(r.status) ?? { name: r.status, High: 0, Med: 0, Low: 0 }
      row[r.ext_probability] += r.sum_26_27
      map.set(r.status, row)
    }
    return Array.from(map.values()).map((r) => ({
      ...r,
      High: +r.High.toFixed(1),
      Med: +r.Med.toFixed(1),
      Low: +r.Low.toFixed(1),
    }))
  }, [filtered])

  // Top 15 customers by sum_26_27
  const topCustomers = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of filtered) map.set(r.customer, (map.get(r.customer) ?? 0) + r.sum_26_27)
    return Array.from(map.entries())
      .map(([customer, value]) => ({ customer, value: +value.toFixed(1) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15)
  }, [filtered])

  // Financial forecast by level
  const forecastByLevel = useMemo(() => {
    const levels: { name: string; records: OppRecord[] }[] = [
      { name: "Hopper", records: filtered.filter((r) => data.opportunities_by_level.Hopper.records.some((h) => h.number === r.number)) },
      { name: "ICT", records: filtered.filter((r) => data.opportunities_by_level.ICT.records.some((h) => h.number === r.number)) },
      { name: "Contract", records: filtered.filter((r) => data.opportunities_by_level.Contract.records.some((h) => h.number === r.number)) },
    ]
    return levels.map(({ name, records }) => ({
      name,
      "2026+27": +records.reduce((a, b) => a + b.sum_26_27, 0).toFixed(1),
      "2026": +records.reduce((a, b) => a + b.benefit_2026, 0).toFixed(1),
      "2027": +records.reduce((a, b) => a + b.benefit_2027, 0).toFixed(1),
    }))
  }, [filtered, data.opportunities_by_level])

  // Pipeline donut
  const pipelineDonut = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of STATUS_ORDER) map.set(s, 0)
    for (const r of filtered) map.set(r.status, (map.get(r.status) ?? 0) + 1)
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .filter((r) => r.value > 0)
  }, [filtered])

  // Priority breakdown
  const priorityCards = useMemo(() => {
    const priorities = Array.from(new Set(allRecords.map((r) => r.priority))).sort()
    return priorities.map((p) => {
      const recs = filtered.filter((r) => r.priority === p)
      return {
        priority: p,
        count: recs.length,
        sum26_27: +recs.reduce((a, b) => a + b.sum_26_27, 0).toFixed(1),
        term: +recs.reduce((a, b) => a + b.term_benefit, 0).toFixed(1),
      }
    })
  }, [allRecords, filtered])

  const completedCount = filtered.filter((r) => r.status === "Completed").length
  const pipelineCount = filtered.filter((r) => r.status !== "Completed" && r.status !== "Cancelled").length
  const ictN = filtered.filter((r) => r.status === "ICT").length
  const negN = filtered.filter((r) => r.status === "Negotiations").length
  const ctrN = filtered.filter((r) => r.status === "Contracting").length

  const topOppsCols: DataTableColumn<OppRecord>[] = [
    { key: "customer", header: "Customer", accessor: (r) => r.customer, sortable: true, fastFilter: true, widthClass: "w-[10rem]" },
    { key: "asks", header: "Asks", accessor: (r) => r.asks, render: (r) => <span className="text-muted-foreground text-xs">{r.asks}</span> },
    { key: "ext", header: "Ext Prob", accessor: (r) => r.ext_probability, sortable: true, fastFilter: true, widthClass: "w-[6rem]" },
    { key: "status", header: "Status", accessor: (r) => r.status, sortable: true, fastFilter: true, widthClass: "w-[8rem]" },
    {
      key: "sum",
      header: "26+27 $M",
      accessor: (r) => r.sum_26_27,
      sortable: true,
      align: "right",
      render: (r) => <span className="font-semibold tnum">{fmtM(r.sum_26_27)}</span>,
      widthClass: "w-[7rem]",
    },
  ]

  const levelCols: DataTableColumn<OppRecord>[] = [
    { key: "number", header: "#", accessor: (r) => r.number, sortable: true, widthClass: "w-[3rem]" },
    { key: "project", header: "Project", accessor: (r) => r.project, sortable: true, widthClass: "w-[10rem]" },
    { key: "programme", header: "Programme", accessor: (r) => r.programme, sortable: true, fastFilter: true, widthClass: "w-[9rem]" },
    { key: "customer", header: "Customer", accessor: (r) => r.customer, sortable: true, fastFilter: true, widthClass: "w-[8rem]" },
    { key: "asks", header: "Asks", accessor: (r) => r.asks, render: (r) => <span className="text-muted-foreground text-xs">{r.asks}</span> },
    { key: "ext", header: "Ext", accessor: (r) => r.ext_probability, sortable: true, fastFilter: true, widthClass: "w-[5rem]" },
    { key: "status", header: "Status", accessor: (r) => r.status, sortable: true, fastFilter: true, widthClass: "w-[7rem]" },
    { key: "priority", header: "Prio", accessor: (r) => r.priority, sortable: true, align: "center", widthClass: "w-[4rem]" },
    {
      key: "sum",
      header: "Sum $M",
      accessor: (r) => r.sum_26_27,
      sortable: true,
      align: "right",
      render: (r) => <span className="tnum">{fmtM(r.sum_26_27)}</span>,
      widthClass: "w-[6rem]",
    },
    {
      key: "term",
      header: "Term $M",
      accessor: (r) => r.term_benefit,
      sortable: true,
      align: "right",
      render: (r) => <span className="tnum font-medium">{fmtM(r.term_benefit)}</span>,
      widthClass: "w-[6rem]",
    },
  ]

  return (
    <div className="bg-[oklch(0.16_0.04_260)] text-white min-h-full">
      <div className="px-6 py-6 flex flex-col gap-6 max-w-[125rem] mx-auto w-full">
        {/* Header banner */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-start gap-3 min-w-0">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--chart-2)]/15 text-[var(--chart-2)]">
              <Target className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-balance">
                {data.cover?.title ?? data.metadata.report_title}
              </h2>
              <p className="text-sm text-white/60 mt-1">
                {data.cover?.subtitle ?? filename}
                {data.metadata.away_day_date ? ` · Away Day ${fmtDate(data.metadata.away_day_date)}` : ""}
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <span className="inline-flex items-center rounded bg-[var(--chart-2)]/15 px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] text-[var(--chart-2)]">
              OPP TRACKER
            </span>
            <span className="inline-flex items-center rounded bg-white/10 px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] text-white/80">
              ROLLS‑ROYCE
            </span>
          </div>
        </div>

        {/* Global filter bar */}
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center gap-2 text-xs text-white/60">
            <Filter className="h-3.5 w-3.5" />
            <span className="font-medium uppercase tracking-[0.1em]">Filters</span>
          </div>
          <DarkSelect label="Customer" value={customer} onChange={setCustomer} options={customers} width="10rem" />
          <DarkSelect label="Status" value={status} onChange={setStatus} options={STATUS_ORDER as readonly string[]} width="8rem" />
          <DarkSelect label="Ext Prob" value={extProb} onChange={setExtProb} options={["High", "Med", "Low"]} width="6rem" />
          <DarkSelect label="Priority" value={priority} onChange={setPriority} options={["1", "2", "3"]} width="5rem" />
          <DarkSelect label="Type" value={oppType} onChange={setOppType} options={oppTypes} width="10rem" />
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-white/60">Min Value $M</span>
            <input
              type="number"
              value={minValue || ""}
              onChange={(e) => setMinValue(Number(e.target.value) || 0)}
              placeholder="0"
              className="h-8 rounded border border-white/15 bg-white/5 px-2 text-xs text-white w-[6rem]"
            />
          </label>
          {(customer !== "__all__" || status !== "__all__" || extProb !== "__all__" || priority !== "__all__" || oppType !== "__all__" || minValue > 0) ? (
            <button
              onClick={() => {
                setCustomer("__all__")
                setStatus("__all__")
                setExtProb("__all__")
                setPriority("__all__")
                setOppType("__all__")
                setMinValue(0)
              }}
              className="h-8 self-end rounded border border-white/20 bg-white/5 px-3 text-xs font-medium hover:bg-white/10 transition-colors"
            >
              Reset
            </button>
          ) : null}
        </div>

        {/* Hero KPIs */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DarkKpi label="2026 Benefit" value={fmtM(sum2026)} icon={<Calendar className="h-4 w-4" />} />
          <DarkKpi label="2027 Benefit" value={fmtM(sum2027)} icon={<Calendar className="h-4 w-4" />} />
          <DarkKpi label="2026 + 2027" value={fmtM(sum2627)} icon={<TrendingUp className="h-4 w-4" />} accent="gold" />
          <DarkKpi label="Term Impact" value={fmtM(sumTerm)} icon={<Trophy className="h-4 w-4" />} accent="primary" />
        </div>

        {/* Meta chips */}
        <div className="flex flex-wrap gap-2">
          <DarkChip label="Away Day" value={fmtDate(data.metadata.away_day_date)} />
          <DarkChip label="Sheets" value={data.metadata.sheets_parsed.join(" · ")} />
          <DarkChip label="Opportunities" value={`${fmtCount(filtered.length)} / ${fmtCount(allRecords.length)}`} />
          <DarkChip label="Customers" value={fmtCount(customers.length)} />
          <DarkChip label="Programmes" value={fmtCount(new Set(allRecords.map((r) => r.programme)).size)} />
        </div>

        {/* Priority breakdown */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {priorityCards.map((p) => (
            <DarkKpi
              key={p.priority}
              label={`Priority ${p.priority}`}
              value={fmtM(p.sum26_27)}
              sub={`${p.count} opps · ${fmtM(p.term)} term`}
              icon={<Layers className="h-4 w-4" />}
            />
          ))}
          <DarkKpi
            label="Completed"
            value={fmtCount(completedCount)}
            sub={`${fmtPct(allRecords.length ? completedCount / allRecords.length : 0)} of total`}
            icon={<Trophy className="h-4 w-4" />}
            accent="success"
          />
          <DarkKpi
            label="Pipeline"
            value={fmtCount(pipelineCount)}
            sub={`${ictN} ICT · ${negN} Neg · ${ctrN} Ctr`}
            icon={<CircleDot className="h-4 w-4" />}
          />
        </div>

        {/* Charts row 1 */}
        <div className="grid gap-4 lg:grid-cols-2">
          <DarkChartCard title="Value by Type & External Probability" subtitle="$M stacked by probability">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={typeByExtProb} margin={{ top: 10, right: 10, left: 0, bottom: 30 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} interval={0} angle={-18} height={55} textAnchor="end" />
                <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} tickFormatter={(v) => `$${v}m`} />
                <Tooltip
                  formatter={(v: number) => fmtM(v)}
                  contentStyle={{ background: "oklch(0.22 0.05 260)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, fontSize: 12 }}
                  itemStyle={{ color: "white" }}
                  labelStyle={{ color: "white" }}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }} />
                <Bar dataKey="High" stackId="p" fill={palette.accent} radius={[0, 0, 0, 0]} />
                <Bar dataKey="Med" stackId="p" fill={palette.blue} radius={[0, 0, 0, 0]} />
                <Bar dataKey="Low" stackId="p" fill={palette.copper} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </DarkChartCard>

          <DarkChartCard title="Value by Status & External Probability" subtitle="Pipeline stages stacked by probability">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusByExtProb} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} />
                <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} tickFormatter={(v) => `$${v}m`} />
                <Tooltip
                  formatter={(v: number) => fmtM(v)}
                  contentStyle={{ background: "oklch(0.22 0.05 260)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, fontSize: 12 }}
                  itemStyle={{ color: "white" }}
                  labelStyle={{ color: "white" }}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }} />
                <Bar dataKey="High" stackId="p" fill={palette.accent} />
                <Bar dataKey="Med" stackId="p" fill={palette.blue} />
                <Bar dataKey="Low" stackId="p" fill={palette.copper} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </DarkChartCard>
        </div>

        {/* Charts row 2 */}
        <div className="grid gap-4 lg:grid-cols-3">
          <DarkChartCard title="Top Customers (26+27 $M)" subtitle={`Top ${topCustomers.length} of ${customers.length}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topCustomers} layout="vertical" margin={{ top: 6, right: 10, left: 10, bottom: 6 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} tickFormatter={(v) => `$${v}m`} />
                <YAxis dataKey="customer" type="category" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.75)" }} width={90} />
                <Tooltip
                  formatter={(v: number) => fmtM(v)}
                  contentStyle={{ background: "oklch(0.22 0.05 260)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, fontSize: 12 }}
                  itemStyle={{ color: "white" }}
                  labelStyle={{ color: "white" }}
                />
                <Bar dataKey="value" fill={palette.accent} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </DarkChartCard>

          <DarkChartCard title="Forecast by Level" subtitle="Hopper / ICT / Contract estimation">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={forecastByLevel} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.75)" }} />
                <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} tickFormatter={(v) => `$${v}m`} />
                <Tooltip
                  formatter={(v: number) => fmtM(v)}
                  contentStyle={{ background: "oklch(0.22 0.05 260)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, fontSize: 12 }}
                  itemStyle={{ color: "white" }}
                  labelStyle={{ color: "white" }}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }} />
                <Bar dataKey="2026+27" fill={palette.accent} radius={[2, 2, 0, 0]} />
                <Bar dataKey="2026" fill={palette.blue} radius={[2, 2, 0, 0]} />
                <Bar dataKey="2027" fill={palette.copper} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </DarkChartCard>

          <DarkChartCard title="Pipeline Status" subtitle="Count by status">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pipelineDonut} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} strokeWidth={0}>
                  {pipelineDonut.map((_, i) => (
                    <Cell key={i} fill={seriesColors[i % seriesColors.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "oklch(0.22 0.05 260)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, fontSize: 12 }}
                  itemStyle={{ color: "white" }}
                  labelStyle={{ color: "white" }}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }} />
              </PieChart>
            </ResponsiveContainer>
          </DarkChartCard>
        </div>

        {/* Tables */}
        <DarkCollapsible title="Top Opportunities by Value" defaultOpen icon={<Trophy className="h-4 w-4" />}>
          <DataTable
            columns={topOppsCols}
            rows={[...filtered].sort((a, b) => b.sum_26_27 - a.sum_26_27).slice(0, 30)}
            getRowId={(r) => `${r.number}-${r.project}`}
          />
        </DarkCollapsible>

        <DarkCollapsible title="Opportunities by Estimation Level" icon={<Layers className="h-4 w-4" />}>
          <div className="flex flex-col gap-5">
            {(["Hopper", "ICT", "Contract"] as const).map((lvl) => {
              const sheet = data.opportunities_by_level[lvl].sheet_name
              const recs = data.opportunities_by_level[lvl].records.filter((r) => filtered.includes(r))
              return (
                <div key={lvl} className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between">
                    <h4 className="font-display text-sm font-semibold text-white/90">
                      {lvl} <span className="text-white/50 text-xs font-normal">({sheet} · {recs.length} records)</span>
                    </h4>
                    <span className="text-xs text-white/60 tnum">
                      {fmtM(recs.reduce((a, b) => a + b.sum_26_27, 0))} · {fmtM(recs.reduce((a, b) => a + b.term_benefit, 0))} term
                    </span>
                  </div>
                  <DataTable columns={levelCols} rows={recs} maxRows={50} getRowId={(r) => `${lvl}-${r.number}`} />
                </div>
              )
            })}
          </div>
        </DarkCollapsible>

        <DarkCollapsible title="Project Timeline & Milestones" icon={<Calendar className="h-4 w-4" />}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[60rem] text-xs">
              <thead>
                <tr className="text-white/60 border-b border-white/10">
                  <th className="text-left px-2 py-2 font-medium">Project</th>
                  <th className="text-left px-2 py-2 font-medium">Customer</th>
                  {PHASE_ORDER.map((p) => (
                    <th key={p} className="text-center px-2 py-2 font-medium uppercase tracking-[0.08em] text-[10px]">
                      {PHASE_LABELS[p]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.timeline.milestones.map((m) => {
                  const currentIdx = PHASE_ORDER.indexOf(m.current_phase as (typeof PHASE_ORDER)[number])
                  return (
                    <tr key={m.project} className="border-b border-white/5 hover:bg-white/[0.03]">
                      <td className="px-2 py-2 font-medium text-white/90">{m.project}</td>
                      <td className="px-2 py-2 text-white/70">{m.customer}</td>
                      {PHASE_ORDER.map((p, i) => {
                        const date = m.milestones[p]
                        const state = date ? (i === currentIdx ? "current" : "done") : i === currentIdx ? "current" : "future"
                        return (
                          <td
                            key={p}
                            className={
                              state === "done"
                                ? "px-2 py-2 text-center bg-[var(--chart-4)]/20 text-[var(--chart-4)] tnum text-[10px]"
                                : state === "current"
                                  ? "px-2 py-2 text-center bg-[var(--chart-2)]/25 text-[var(--chart-2)] font-semibold tnum text-[10px]"
                                  : "px-2 py-2 text-center text-white/20"
                            }
                            title={date ?? "—"}
                          >
                            {date ? date.slice(5) : "—"}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </DarkCollapsible>

        <DarkCollapsible title="Opportunities & Threats" icon={<AlertTriangle className="h-4 w-4" />}>
          <DataTable
            columns={[
              { key: "project", header: "Project", accessor: (r) => r.project, sortable: true },
              { key: "customer", header: "Customer", accessor: (r) => r.customer, sortable: true, fastFilter: true },
              { key: "opp", header: "Opportunity", accessor: (r) => r.opportunity, render: (r) => <span className="text-white/70 text-xs">{r.opportunity}</span> },
              {
                key: "status",
                header: "Status",
                accessor: (r) => r.status,
                sortable: true,
                fastFilter: true,
                render: (r) => (
                  <span
                    className={
                      r.status === "At Risk"
                        ? "inline-flex rounded bg-destructive/20 text-destructive px-1.5 py-0.5 text-[10px] font-semibold"
                        : r.status === "On Track"
                          ? "inline-flex rounded bg-success/20 text-success px-1.5 py-0.5 text-[10px] font-semibold"
                          : "inline-flex rounded bg-white/10 text-white/70 px-1.5 py-0.5 text-[10px] font-semibold"
                    }
                  >
                    {r.status}
                  </span>
                ),
              },
              { key: "owner", header: "Owner", accessor: (r) => r.owner, sortable: true, fastFilter: true, widthClass: "w-[8rem]" },
              { key: "pack", header: "Pack Improvement", accessor: (r) => r.pack_improvement ?? "—", widthClass: "w-[9rem]" },
              { key: "due", header: "Due Date", accessor: (r) => r.due_date ?? "—", sortable: true, widthClass: "w-[7rem]" },
            ]}
            rows={data.opps_and_threats.items}
            getRowId={(r, i) => `${r.project}-${i}`}
          />
        </DarkCollapsible>

        <DarkCollapsible title="Project Summary" icon={<Briefcase className="h-4 w-4" />}>
          <DataTable
            columns={[
              { key: "group", header: "Group", accessor: (r) => r.group, sortable: true, fastFilter: true, widthClass: "w-[7rem]" },
              { key: "project", header: "Project", accessor: (r) => r.project, sortable: true },
              { key: "customer", header: "Customer", accessor: (r) => r.customer, sortable: true, fastFilter: true },
              { key: "programme", header: "Programme", accessor: (r) => r.programme, sortable: true, fastFilter: true },
              {
                key: "margin",
                header: "CRP Margin $M",
                accessor: (r) => r.crp_margin,
                sortable: true,
                align: "right",
                render: (r) => <span className="tnum">{fmtM(r.crp_margin)}</span>,
              },
              {
                key: "pct",
                header: "CRP %",
                accessor: (r) => r.crp_pct,
                sortable: true,
                align: "right",
                render: (r) => <span className="tnum">{fmtPct(r.crp_pct)}</span>,
              },
              {
                key: "onerous",
                header: "Onerous",
                accessor: (r) => r.onerous,
                render: (r) => (
                  <span
                    className={
                      r.onerous === "Onerous"
                        ? "inline-flex rounded bg-destructive/20 text-destructive px-1.5 py-0.5 text-[10px] font-semibold"
                        : "inline-flex rounded bg-white/10 text-white/70 px-1.5 py-0.5 text-[10px] font-semibold"
                    }
                  >
                    {r.onerous}
                  </span>
                ),
              },
            ]}
            rows={data.project_summary.projects}
            getRowId={(r) => r.project}
          />
        </DarkCollapsible>
      </div>
    </div>
  )
}

/* ---------- Dark theme helpers (scoped to this visualizer) ---------- */

function DarkSelect({
  label,
  value,
  onChange,
  options,
  width,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: readonly string[]
  width: string
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
        <option value="__all__" className="bg-[oklch(0.22_0.05_260)]">All</option>
        {options.map((o) => (
          <option key={o} value={o} className="bg-[oklch(0.22_0.05_260)]">
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}

function DarkChip({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs">
      <span className="font-medium uppercase tracking-[0.1em] text-white/55">{label}</span>
      <span className="text-white tnum">{value}</span>
    </div>
  )
}

function DarkKpi({
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
  accent?: "gold" | "primary" | "success"
}) {
  const valueTone =
    accent === "gold" ? "text-[var(--chart-2)]" : accent === "primary" ? "text-[var(--chart-5)]" : accent === "success" ? "text-[var(--chart-4)]" : "text-white"
  const iconBg =
    accent === "gold"
      ? "bg-[var(--chart-2)]/15 text-[var(--chart-2)]"
      : accent === "primary"
        ? "bg-[var(--chart-5)]/15 text-[var(--chart-5)]"
        : accent === "success"
          ? "bg-[var(--chart-4)]/15 text-[var(--chart-4)]"
          : "bg-white/10 text-white/70"
  return (
    <div className="group flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/55">{label}</span>
        {icon ? <span className={`flex h-8 w-8 items-center justify-center rounded-md ${iconBg}`}>{icon}</span> : null}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className={`font-display text-2xl font-semibold tracking-tight tnum ${valueTone}`}>{value}</span>
        {sub ? <span className="text-xs text-white/55 text-pretty">{sub}</span> : null}
      </div>
    </div>
  )
}

function DarkChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 flex flex-col gap-4">
      <div className="min-w-0">
        <h3 className="font-display text-sm font-semibold tracking-tight text-white/95 truncate">{title}</h3>
        {subtitle ? <p className="text-xs text-white/55 truncate mt-0.5">{subtitle}</p> : null}
      </div>
      <div className="w-full" style={{ height: 280 }}>
        {children}
      </div>
    </div>
  )
}

function DarkCollapsible({
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
