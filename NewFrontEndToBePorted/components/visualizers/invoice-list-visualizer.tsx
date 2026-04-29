"use client"

import { useMemo, useState } from "react"
import {
  Area,
  AreaChart,
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
import { Wallet, TrendingUp, TrendingDown, Hash, FileSpreadsheet, Filter } from "lucide-react"
import type { InvoiceListData, InvoiceItem } from "@/lib/types"
import { KpiCard } from "@/components/shared/kpi-card"
import { InfoChip } from "@/components/shared/info-chip"
import { SectionHeader } from "@/components/shared/section-header"
import { ChartCard } from "@/components/shared/chart-card"
import { DataTable, type DataTableColumn } from "@/components/shared/data-table"
import { fmtMoney, fmtCount } from "@/lib/format"
import { palette } from "@/lib/chart-palette"

export function InvoiceListVisualizer({
  data,
  filename,
}: {
  data: InvoiceListData
  filename: string
}) {
  const [currency, setCurrency] = useState("__all__")
  const [minAmount, setMinAmount] = useState(0)

  const filtered = useMemo(() => {
    return data.items.filter((i) => {
      if (currency !== "__all__" && i.currency !== currency) return false
      if (minAmount && Math.abs(i.amount) < minAmount) return false
      return true
    })
  }, [data.items, currency, minAmount])

  const totalAmt = filtered.reduce((a, b) => a + b.amount, 0)
  const posAmt = filtered.filter((i) => i.amount > 0).reduce((a, b) => a + b.amount, 0)
  const negAmt = filtered.filter((i) => i.amount < 0).reduce((a, b) => a + b.amount, 0)

  const byMonth = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of filtered) {
      if (!i.due_date) continue
      const key = i.due_date.slice(0, 7)
      m.set(key, (m.get(key) ?? 0) + i.amount)
    }
    return Array.from(m.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value]) => ({ name, value: Math.round(value) }))
  }, [filtered])

  const distData = [
    { name: "Receivables", value: posAmt },
    { name: "Credits", value: Math.abs(negAmt) },
  ]

  const cols: DataTableColumn<InvoiceItem>[] = [
    { key: "reference", header: "Reference", accessor: (r) => r.reference, sortable: true },
    { key: "doc_date", header: "Doc Date", accessor: (r) => r.doc_date, sortable: true },
    { key: "due_date", header: "Due Date", accessor: (r) => r.due_date, sortable: true },
    {
      key: "amount",
      header: "Amount",
      accessor: (r) => r.amount,
      sortable: true,
      align: "right",
      render: (r) => (
        <span className={r.amount < 0 ? "text-success" : ""}>{fmtMoney(r.amount, r.currency)}</span>
      ),
    },
    { key: "currency", header: "Cur.", accessor: (r) => r.currency, sortable: true, fastFilter: true, widthClass: "w-[4rem]" },
    {
      key: "text",
      header: "Text",
      accessor: (r) => r.text,
      render: (r) => <span className="text-muted-foreground text-xs truncate block max-w-md">{r.text}</span>,
    },
    { key: "assignment", header: "Assignment", accessor: (r) => r.assignment, widthClass: "w-[7rem]" },
  ]

  return (
    <div className="px-6 py-6 flex flex-col gap-6 max-w-[120rem] mx-auto w-full">
      <SectionHeader
        icon={FileSpreadsheet}
        title="Invoice List — Open Items Register"
        badge="EPI"
        description={`${filename} · ${data.metadata.source_sheet}`}
      />

      <div className="flex flex-wrap gap-2">
        <InfoChip label="Source" value={data.metadata.source_file} />
        <InfoChip label="Items" value={fmtCount(data.metadata.total_items)} />
        <InfoChip label="Currencies" value={data.metadata.currencies.join(", ")} />
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          <span className="font-medium uppercase tracking-[0.1em]">Filters</span>
        </div>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-muted-foreground">Currency</span>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="h-8 rounded border border-input bg-background px-2 text-xs min-w-[6rem]"
          >
            <option value="__all__">All</option>
            {data.metadata.currencies.map((c) => (
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
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total Amount" value={fmtMoney(totalAmt)} icon={Wallet} />
        <KpiCard label="Receivables" value={fmtMoney(posAmt)} tone="danger" icon={TrendingUp} />
        <KpiCard label="Credits" value={fmtMoney(Math.abs(negAmt))} tone="success" icon={TrendingDown} subtitle="Credit notes (abs.)" />
        <KpiCard label="Line Items" value={fmtCount(filtered.length)} icon={Hash} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Amount by Due Date" subtitle="Aggregated by month" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={byMonth} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="inv-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={palette.blue} stopOpacity={0.5} />
                  <stop offset="95%" stopColor={palette.blue} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={(v) => fmtMoney(v)} />
              <Tooltip
                formatter={(v: number) => fmtMoney(v)}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={palette.blue}
                strokeWidth={2}
                fill="url(#inv-area)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Amount Distribution">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={distData}
                dataKey="value"
                nameKey="name"
                innerRadius="55%"
                outerRadius="85%"
                paddingAngle={3}
                strokeWidth={0}
              >
                <Cell fill={palette.danger} />
                <Cell fill={palette.success} />
              </Pie>
              <Tooltip
                formatter={(v: number) => fmtMoney(v)}
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
              />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="flex flex-col gap-3">
        <SectionHeader title="Open Items Register" description="Filtered view — click column headers to sort" />
        <DataTable columns={cols} rows={filtered} maxRows={150} getRowId={(r) => r.reference} />
      </div>
    </div>
  )
}
