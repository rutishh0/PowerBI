"use client"

import { useMemo, useState } from "react"
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  Shield,
  FileCheck2,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  Filter,
  Database,
} from "lucide-react"
import type { SVRGData, SVRGClaim, SVRGEvent } from "@/lib/types"
import { KpiCard } from "@/components/shared/kpi-card"
import { InfoChip } from "@/components/shared/info-chip"
import { SectionHeader } from "@/components/shared/section-header"
import { ChartCard } from "@/components/shared/chart-card"
import { DataTable, type DataTableColumn } from "@/components/shared/data-table"
import { fmtMoney, fmtFullMoney, fmtCount } from "@/lib/format"
import { palette, seriesColors } from "@/lib/chart-palette"

interface SvrgVisualizerProps {
  data: SVRGData
  filename: string
}

export function SvrgVisualizer({ data, filename }: SvrgVisualizerProps) {
  const [guarantee, setGuarantee] = useState("__all__")
  const [qualification, setQualification] = useState("__all__")
  const [year, setYear] = useState("__all__")

  const years = useMemo(
    () => Array.from(new Set(data.claims_summary.claims.map((c) => c.year))).sort(),
    [data.claims_summary.claims],
  )
  const guarantees = useMemo(
    () => Array.from(new Set(data.claims_summary.claims.map((c) => c.guarantee))),
    [data.claims_summary.claims],
  )
  const quals = useMemo(
    () => Array.from(new Set(data.event_entries.events.map((e) => e.qualification))),
    [data.event_entries.events],
  )

  const filteredClaims = useMemo(
    () =>
      data.claims_summary.claims.filter((c) => {
        if (guarantee !== "__all__" && c.guarantee !== guarantee) return false
        if (year !== "__all__" && String(c.year) !== year) return false
        return true
      }),
    [data.claims_summary.claims, guarantee, year],
  )

  const filteredEvents = useMemo(
    () =>
      data.event_entries.events.filter((e) => {
        if (guarantee !== "__all__" && e.guarantee_coverage !== guarantee) return false
        if (qualification !== "__all__" && e.qualification !== qualification) return false
        return true
      }),
    [data.event_entries.events, guarantee, qualification],
  )

  // Totals
  const totalClaims = filteredClaims.length
  const totalCreditValue = filteredClaims.reduce((a, b) => a + b.credit_value, 0)
  const totalEvents = filteredEvents.length
  const qualifiedEvents = filteredEvents.filter((e) => e.qualification === "Qualified").length
  const uniqueGuaranteeTypes = Array.from(new Set(filteredClaims.map((c) => c.guarantee)))

  // Claims over time (recompute cumulative on filtered set)
  const claimsOverTime = useMemo(() => {
    const sorted = [...filteredClaims].sort((a, b) => a.date.localeCompare(b.date))
    let cum = 0
    return sorted.map((c) => {
      cum += c.credit_value
      return { date: c.date, credit: c.credit_value, cumulative: cum }
    })
  }, [filteredClaims])

  // Qualification donut
  const qualDonut = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of filteredEvents) map.set(e.qualification, (map.get(e.qualification) ?? 0) + 1)
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  }, [filteredEvents])

  const claimsCols: DataTableColumn<SVRGClaim>[] = [
    { key: "date", header: "Date", accessor: (r) => r.date, sortable: true, widthClass: "w-[7rem]" },
    { key: "year", header: "Year", accessor: (r) => r.year, sortable: true, fastFilter: true, fastFilterValue: (r) => String(r.year), widthClass: "w-[5rem]" },
    { key: "ref", header: "Credit Ref", accessor: (r) => r.credit_ref, sortable: true, widthClass: "w-[7rem]" },
    {
      key: "guarantee",
      header: "Guarantee",
      accessor: (r) => r.guarantee,
      sortable: true,
      fastFilter: true,
      widthClass: "w-[6rem]",
      render: (r) => (
        <span className="inline-flex rounded bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-semibold">{r.guarantee}</span>
      ),
    },
    {
      key: "credit",
      header: "Credit Value",
      accessor: (r) => r.credit_value,
      sortable: true,
      align: "right",
      render: (r) => <span className="tnum font-medium">{fmtMoney(r.credit_value)}</span>,
    },
    {
      key: "cum",
      header: "Cumulative",
      accessor: (r) => r.cumulative_value,
      sortable: true,
      align: "right",
      render: (r) => <span className="tnum text-muted-foreground">{fmtMoney(r.cumulative_value)}</span>,
    },
  ]

  const eventsCols: DataTableColumn<SVRGEvent>[] = [
    { key: "type", header: "Event Type", accessor: (r) => r.event_type, sortable: true, widthClass: "w-[8rem]" },
    { key: "date", header: "Date", accessor: (r) => r.date, sortable: true, widthClass: "w-[7rem]" },
    { key: "esn", header: "Engine", accessor: (r) => r.engine_serial, sortable: true, widthClass: "w-[6rem]" },
    { key: "ac", header: "Aircraft", accessor: (r) => r.aircraft ?? "—", widthClass: "w-[6rem]" },
    { key: "desc", header: "Description", accessor: (r) => r.description, render: (r) => <span className="text-xs text-muted-foreground">{r.description}</span> },
    {
      key: "qual",
      header: "Qualification",
      accessor: (r) => r.qualification,
      sortable: true,
      fastFilter: true,
      render: (r) => (
        <span
          className={
            r.qualification === "Qualified"
              ? "inline-flex rounded bg-success/15 text-success px-1.5 py-0.5 text-[10px] font-semibold"
              : r.qualification === "Non-Qualified"
                ? "inline-flex rounded bg-destructive/15 text-destructive px-1.5 py-0.5 text-[10px] font-semibold"
                : "inline-flex rounded bg-warning/15 text-warning px-1.5 py-0.5 text-[10px] font-semibold"
          }
        >
          {r.qualification}
        </span>
      ),
      widthClass: "w-[8rem]",
    },
    { key: "cov", header: "Coverage", accessor: (r) => r.guarantee_coverage, sortable: true, fastFilter: true, widthClass: "w-[6rem]" },
  ]

  return (
    <div className="px-6 py-6 flex flex-col gap-6 max-w-[120rem] mx-auto w-full">
      <SectionHeader
        icon={Shield}
        title="SVRG Master — Guarantee Administration"
        badge="SVRG"
        description={`${filename} · ${data.metadata.customer} · ${data.metadata.engine_model}`}
      />

      <div className="flex flex-wrap gap-2">
        <InfoChip label="Customer" value={data.metadata.customer ?? "—"} />
        <InfoChip label="Engine Model" value={data.metadata.engine_model ?? "—"} />
        <InfoChip label="Source" value={data.metadata.source_file} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          <span className="font-medium uppercase tracking-[0.1em]">Filters</span>
        </div>
        <FilterSelect label="Guarantee" value={guarantee} onChange={setGuarantee} options={guarantees} width="7rem" />
        <FilterSelect label="Qualification" value={qualification} onChange={setQualification} options={quals} width="9rem" />
        <FilterSelect label="Year" value={year} onChange={setYear} options={years.map(String)} width="6rem" />
        {(guarantee !== "__all__" || qualification !== "__all__" || year !== "__all__") ? (
          <button
            onClick={() => {
              setGuarantee("__all__")
              setQualification("__all__")
              setYear("__all__")
            }}
            className="h-8 self-end rounded border border-input bg-background px-3 text-xs font-medium hover:bg-muted transition-colors"
          >
            Reset
          </button>
        ) : null}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard label="Total Claims" value={fmtCount(totalClaims)} icon={FileCheck2} tone="primary" />
        <KpiCard label="Credit Value" value={fmtMoney(totalCreditValue)} subtitle={fmtFullMoney(totalCreditValue)} icon={CreditCard} tone="success" />
        <KpiCard label="Total Events" value={fmtCount(totalEvents)} icon={AlertCircle} />
        <KpiCard
          label="Qualified Events"
          value={fmtCount(qualifiedEvents)}
          subtitle={`${totalEvents ? Math.round((qualifiedEvents / totalEvents) * 100) : 0}% qualified`}
          icon={CheckCircle2}
          tone="success"
        />
        <KpiCard
          label="Guarantee Types"
          value={uniqueGuaranteeTypes.length ? uniqueGuaranteeTypes.join(" · ") : "—"}
          subtitle={`${uniqueGuaranteeTypes.length} distinct`}
          icon={Shield}
          tone="accent"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Claims Over Time" subtitle="Credit value (bar) and cumulative (line)">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={claimsOverTime} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickFormatter={(v) => fmtMoney(v)}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickFormatter={(v) => fmtMoney(v)}
              />
              <Tooltip
                formatter={(v: number) => fmtMoney(v)}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="credit" name="Credit" fill={palette.accent} radius={[2, 2, 0, 0]} />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="cumulative"
                name="Cumulative"
                stroke={palette.primary}
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Event Qualification" subtitle="Distribution of qualification outcomes">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={qualDonut} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} strokeWidth={0}>
                {qualDonut.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      entry.name === "Qualified"
                        ? palette.success
                        : entry.name === "Non-Qualified"
                          ? palette.danger
                          : seriesColors[i % seriesColors.length]
                    }
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Claims table */}
      <div className="flex flex-col gap-3">
        <SectionHeader icon={FileCheck2} title="Claims Summary" description="All claim events — filter via column chips" />
        <DataTable columns={claimsCols} rows={filteredClaims} maxRows={100} getRowId={(r, i) => `${r.credit_ref}-${i}`} />
      </div>

      {/* Events table */}
      <div className="flex flex-col gap-3">
        <SectionHeader icon={AlertCircle} title="Event Entries" description="Disruptions, IFSDs and qualifying events" />
        <DataTable columns={eventsCols} rows={filteredEvents} maxRows={100} getRowId={(r, i) => `ev-${r.date}-${i}`} />
      </div>

      {/* Available sheets */}
      {Object.keys(data.available_sheets ?? {}).length > 0 ? (
        <div className="flex flex-col gap-3">
          <SectionHeader icon={Database} title="Available Data Sheets" description="Additional sheets present in source workbook" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(data.available_sheets).map(([name, meta]) => (
              <div key={name} className="rounded-md border border-border bg-card p-3 flex flex-col gap-1">
                <span className="font-medium text-sm truncate">{name}</span>
                <span className="text-xs text-muted-foreground tnum">
                  {fmtCount(meta.row_count)} rows · {fmtCount(meta.col_count)} cols
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function FilterSelect({
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
      <span className="font-medium text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded border border-input bg-background px-2 text-xs"
        style={{ minWidth: width }}
      >
        <option value="__all__">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}
