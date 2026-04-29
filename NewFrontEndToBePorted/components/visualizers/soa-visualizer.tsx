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
  Wallet,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  List,
  Filter,
  Receipt,
  FileText,
} from "lucide-react"
import type { SOAData, SOASectionItem } from "@/lib/types"
import { KpiCard } from "@/components/shared/kpi-card"
import { InfoChip } from "@/components/shared/info-chip"
import { SectionHeader } from "@/components/shared/section-header"
import { ChartCard } from "@/components/shared/chart-card"
import { DataTable, type DataTableColumn } from "@/components/shared/data-table"
import { fmtMoney, fmtCount, fmtPct, fmtDays, fmtDate } from "@/lib/format"
import { agingColors, palette, seriesColors } from "@/lib/chart-palette"

interface SoaVisualizerProps {
  data: SOAData
  filename: string
  mode?: "standard" | "executive"
}

type SoaItemRow = SOASectionItem & { _section: string; _sectionType: string }

export function SoaVisualizer({ data, filename, mode = "standard" }: SoaVisualizerProps) {
  const [section, setSection] = useState("__all__")
  const [currency, setCurrency] = useState("__all__")
  const [minAmount, setMinAmount] = useState<number>(0)

  // Flatten all items with section metadata
  const allItems: SoaItemRow[] = useMemo(
    () =>
      data.sections.flatMap((s) =>
        s.items.map((i) => ({ ...i, _section: s.name, _sectionType: s.section_type })),
      ),
    [data.sections],
  )

  const uniqueSections = useMemo(
    () => Array.from(new Set(allItems.map((i) => i._section))),
    [allItems],
  )
  const uniqueCurrencies = useMemo(
    () => Array.from(new Set(allItems.map((i) => i.currency ?? "USD"))),
    [allItems],
  )

  const filtered = useMemo(() => {
    return allItems.filter((i) => {
      if (section !== "__all__" && i._section !== section) return false
      if (currency !== "__all__" && i.currency !== currency) return false
      if (minAmount && Math.abs(i.amount ?? 0) < minAmount) return false
      return true
    })
  }, [allItems, section, currency, minAmount])

  // KPI recalcs
  const totalCharges = filtered.filter((i) => (i.amount ?? 0) > 0).reduce((a, b) => a + (b.amount ?? 0), 0)
  const totalCredits = filtered.filter((i) => (i.amount ?? 0) < 0).reduce((a, b) => a + (b.amount ?? 0), 0)
  const totalOverdue = filtered
    .filter((i) => (i.amount ?? 0) > 0 && (i.days_late ?? 0) > 0)
    .reduce((a, b) => a + (b.amount ?? 0), 0)
  const netBalance = totalCharges + totalCredits

  // Section breakdown donut
  const sectionDonutData = useMemo(() => {
    const grouped = new Map<string, number>()
    for (const i of filtered) {
      grouped.set(i._section, (grouped.get(i._section) ?? 0) + Math.abs(i.amount ?? 0))
    }
    return Array.from(grouped.entries()).map(([name, value]) => ({ name, value }))
  }, [filtered])

  // Charges vs credits stacked
  const cvcData = useMemo(() => {
    const grouped = new Map<string, { name: string; Charges: number; Credits: number }>()
    for (const i of filtered) {
      const g = grouped.get(i._section) ?? { name: i._section, Charges: 0, Credits: 0 }
      if ((i.amount ?? 0) >= 0) g.Charges += i.amount ?? 0
      else g.Credits += Math.abs(i.amount ?? 0)
      grouped.set(i._section, g)
    }
    return Array.from(grouped.values())
  }, [filtered])

  // Aging analysis
  const agingData = useMemo(() => {
    const buckets = [
      { name: "Current", v: 0 },
      { name: "1-30", v: 0 },
      { name: "31-60", v: 0 },
      { name: "61-90", v: 0 },
      { name: "91-180", v: 0 },
      { name: "180+", v: 0 },
    ]
    for (const i of filtered) {
      if ((i.amount ?? 0) <= 0) continue
      const d = i.days_late ?? 0
      const v = i.amount ?? 0
      if (d <= 0) buckets[0].v += v
      else if (d <= 30) buckets[1].v += v
      else if (d <= 60) buckets[2].v += v
      else if (d <= 90) buckets[3].v += v
      else if (d <= 180) buckets[4].v += v
      else buckets[5].v += v
    }
    return buckets
  }, [filtered])

  const tableCols: DataTableColumn<SoaItemRow>[] = [
    { key: "reference", header: "Reference", accessor: (r) => r.reference, sortable: true, widthClass: "w-[8rem]" },
    { key: "doc_date", header: "Doc Date", accessor: (r) => r.doc_date, sortable: true, widthClass: "w-[6.5rem]" },
    { key: "due_date", header: "Due Date", accessor: (r) => r.due_date, sortable: true, widthClass: "w-[6.5rem]" },
    {
      key: "amount",
      header: "Amount",
      accessor: (r) => r.amount,
      sortable: true,
      align: "right",
      render: (r) => (
        <span className={r.amount && r.amount < 0 ? "text-success" : ""}>{fmtMoney(r.amount ?? 0, r.currency ?? "USD")}</span>
      ),
    },
    { key: "currency", header: "Cur.", accessor: (r) => r.currency, sortable: true, fastFilter: true, widthClass: "w-[4rem]" },
    { key: "section", header: "Section", accessor: (r) => r._section, sortable: true, fastFilter: true, fastFilterValue: (r) => r._section },
    {
      key: "text",
      header: "Text",
      accessor: (r) => r.text,
      render: (r) => <span className="text-muted-foreground text-xs">{r.text}</span>,
    },
    {
      key: "days_late",
      header: "Days Late",
      accessor: (r) => r.days_late ?? 0,
      sortable: true,
      align: "right",
      render: (r) => {
        const d = r.days_late ?? 0
        if (d <= 0) return <span className="text-success text-xs">Current</span>
        return <span className="text-destructive font-medium">{fmtDays(d)}</span>
      },
    },
  ]

  return (
    <div className="px-6 py-6 flex flex-col gap-6 max-w-[120rem] mx-auto w-full">
      {/* Header */}
      <SectionHeader
        icon={Receipt}
        title={data.metadata.title ?? "Statement of Account"}
        badge="SOA"
        description={`${filename} · ${data.metadata.source_sheet ?? ""}${mode === "executive" ? " · Executive view" : ""}`}
      />

      {/* Info chips */}
      <div className="flex flex-wrap gap-2">
        <InfoChip label="Customer" value={data.metadata.customer_name ?? "—"} />
        <InfoChip label="Account" value={data.metadata.customer_number ?? "—"} />
        {data.metadata.contact_email ? <InfoChip label="Contact" value={data.metadata.contact_email} /> : null}
        <InfoChip label="LPI Rate" value={fmtPct(data.metadata.lpi_rate ?? 0)} />
        <InfoChip label="Report Date" value={fmtDate(data.metadata.report_date)} />
        <InfoChip label="Avg Days Late" value={fmtDays(data.metadata.avg_days_late ?? 0)} />
      </div>

      {/* Global filter bar */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          <span className="font-medium uppercase tracking-[0.1em]">Filters</span>
        </div>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-muted-foreground">Section</span>
          <select
            value={section}
            onChange={(e) => setSection(e.target.value)}
            className="h-8 rounded border border-input bg-background px-2 text-xs min-w-[10rem]"
          >
            <option value="__all__">All sections</option>
            {uniqueSections.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-muted-foreground">Currency</span>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="h-8 rounded border border-input bg-background px-2 text-xs min-w-[6rem]"
          >
            <option value="__all__">All</option>
            {uniqueCurrencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-muted-foreground">Min |amount|</span>
          <input
            type="number"
            value={minAmount || ""}
            onChange={(e) => setMinAmount(Number(e.target.value) || 0)}
            placeholder="0"
            className="h-8 rounded border border-input bg-background px-2 text-xs w-[7rem]"
          />
        </label>
        {(section !== "__all__" || currency !== "__all__" || minAmount > 0) ? (
          <button
            onClick={() => {
              setSection("__all__")
              setCurrency("__all__")
              setMinAmount(0)
            }}
            className="h-8 self-end rounded border border-input bg-background px-3 text-xs font-medium hover:bg-muted transition-colors"
          >
            Reset
          </button>
        ) : null}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Net Balance"
          value={fmtMoney(netBalance)}
          subtitle={netBalance >= 0 ? "Customer owes RR" : "Credit in favour of customer"}
          icon={Wallet}
          tone={netBalance >= 0 ? "danger" : "success"}
        />
        <KpiCard
          label="Total Charges"
          value={fmtMoney(totalCharges)}
          subtitle={`${filtered.filter((i) => (i.amount ?? 0) > 0).length} invoices`}
          icon={TrendingUp}
          tone="danger"
        />
        <KpiCard
          label="Total Credits"
          value={fmtMoney(totalCredits)}
          subtitle={`${filtered.filter((i) => (i.amount ?? 0) < 0).length} credit notes`}
          icon={TrendingDown}
          tone="success"
        />
        <KpiCard
          label="Total Overdue"
          value={fmtMoney(totalOverdue)}
          subtitle={`Avg ${fmtDays(data.metadata.avg_days_late ?? 0)} past due`}
          icon={AlertTriangle}
          tone="warning"
        />
        <KpiCard
          label="Line Items"
          value={fmtCount(filtered.length)}
          subtitle={`Of ${allItems.length} total`}
          icon={List}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Section Breakdown" subtitle="Distribution by absolute value">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={sectionDonutData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="55%"
                outerRadius="85%"
                paddingAngle={2}
                strokeWidth={0}
              >
                {sectionDonutData.map((_, i) => (
                  <Cell key={i} fill={seriesColors[i % seriesColors.length]} />
                ))}
              </Pie>
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
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Charges vs Credits" subtitle="By section">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cvcData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} interval={0} angle={-15} height={50} textAnchor="end" />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={(v) => fmtMoney(v, "USD")} />
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
              <Bar dataKey="Charges" stackId="a" fill={palette.danger} radius={[2, 2, 0, 0]} />
              <Bar dataKey="Credits" stackId="a" fill={palette.success} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Aging Analysis" subtitle="Overdue buckets — open items">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={agingData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={(v) => fmtMoney(v, "USD")} />
              <Tooltip
                formatter={(v: number) => fmtMoney(v)}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="v" radius={[3, 3, 0, 0]}>
                {agingData.map((_, i) => (
                  <Cell key={i} fill={agingColors[i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Section details */}
      <div className="flex flex-col gap-3">
        <SectionHeader icon={FileText} title="Section Summary" description="Totals by section (filtered)" />
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {data.sections.map((s) => {
            const items = filtered.filter((i) => i._section === s.name)
            const total = items.reduce((a, b) => a + (b.amount ?? 0), 0)
            const overdue = items.filter((i) => (i.amount ?? 0) > 0 && (i.days_late ?? 0) > 0).reduce((a, b) => a + (b.amount ?? 0), 0)
            return (
              <div key={s.name} className="rounded-lg border border-border bg-card p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-display text-sm font-semibold tracking-tight">{s.name}</h4>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    {s.section_type}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className={`font-display text-xl font-semibold tnum ${total < 0 ? "text-success" : "text-foreground"}`}>
                    {fmtMoney(total)}
                  </span>
                  <span className="text-xs text-muted-foreground">{items.length} items</span>
                </div>
                {overdue > 0 ? (
                  <div className="text-xs text-destructive">
                    {fmtMoney(overdue)} overdue
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>

      {/* Register */}
      <div className="flex flex-col gap-3">
        <SectionHeader icon={List} title="Invoice Register" description="All line items across sections" />
        <DataTable
          columns={tableCols}
          rows={filtered}
          maxRows={100}
          getRowId={(r, i) => `${r._section}-${r.reference}-${i}`}
        />
      </div>
    </div>
  )
}
