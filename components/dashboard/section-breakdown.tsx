"use client"

import { useState } from "react"
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { SectionHeader } from "./section-header"
import { DataTable } from "./data-table"
import {
  SECTION_COLOURS,
  fmtCurrency,
  formatDate,
} from "@/lib/soa-parser"
import type { SectionData, SOARecord } from "@/lib/soa-parser"

interface SectionBreakdownProps {
  sections: Map<string, SectionData>
  showCredits: boolean
}

function MiniMetric({
  label,
  value,
  colorClass = "text-rr-dark",
}: {
  label: string
  value: string
  colorClass?: string
}) {
  return (
    <div className="bg-card rounded-lg p-3 border-l-4 border-l-rr-navy shadow-sm border border-border">
      <div className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </div>
      <div className={`text-base font-extrabold ${colorClass}`}>{value}</div>
    </div>
  )
}

function SectionTab({
  secName,
  secData,
  showCredits,
}: {
  secName: string
  secData: SectionData
  showCredits: boolean
}) {
  const rows = secData.rows
  if (!rows.length) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No line items found in <strong>{secName}</strong>.
      </p>
    )
  }

  const secTotal =
    secData.totals.total ?? rows.reduce((s, r) => s + r.Amount, 0)
  const secCharges = rows.filter((r) => r.Amount > 0).reduce((s, r) => s + r.Amount, 0)
  const secCredits = rows.filter((r) => r.Amount < 0).reduce((s, r) => s + r.Amount, 0)
  const secOverdue = secData.totals.overdue ?? null
  const secCreditsAvail = secData.totals["available credit"] ?? null
  const secItems = rows.length

  // Status distribution
  const statusMap = new Map<string, number>()
  for (const r of rows) {
    const status = r.Status
      ? r.Status.length > 40
        ? r.Status.slice(0, 38) + "..."
        : r.Status
      : "Unknown"
    statusMap.set(status, (statusMap.get(status) || 0) + 1)
  }
  const statusData = Array.from(statusMap.entries()).map(([name, value]) => ({
    name,
    value,
  }))

  // Top items
  const topItems = [...rows]
    .sort((a, b) => b.Amount - a.Amount)
    .slice(0, 8)
    .map((r) => ({
      label:
        (r.Text ? r.Text.slice(0, 30) : r.Reference || "Item") +
        (r.Reference ? ` (${r.Reference})` : ""),
      amount: r.Amount,
    }))

  // Table data
  const displayRows = showCredits
    ? rows
    : rows.filter((r) => r["Entry Type"] === "Charge")

  const tableRows = displayRows.map((r) => ({
    Reference: r.Reference || "\u2014",
    "Doc No": r["Document No"] || "\u2014",
    "Doc Date": formatDate(r["Document Date"]),
    "Due Date": formatDate(r["Due Date"]),
    Amount: fmtCurrency(r.Amount),
    Currency: r.Currency || "\u2014",
    Text: r.Text ? (r.Text.length > 40 ? r.Text.slice(0, 38) + "..." : r.Text) : "\u2014",
    Status: r.Status ? (r.Status.length > 30 ? r.Status.slice(0, 28) + "..." : r.Status) : "\u2014",
    "Days Late": r["Days Late"] != null ? String(r["Days Late"]) : "\u2014",
    Type: r["Entry Type"],
  }))

  const columns = [
    "Reference",
    "Doc No",
    "Doc Date",
    "Due Date",
    "Amount",
    "Currency",
    "Text",
    "Status",
    "Days Late",
    "Type",
  ]

  return (
    <div className="space-y-4">
      {/* Section KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MiniMetric label="Section Total" value={fmtCurrency(secTotal, true)} />
        <MiniMetric label="Charges" value={fmtCurrency(secCharges, true)} />
        <MiniMetric
          label="Credits"
          value={fmtCurrency(secCredits, true)}
          colorClass="text-rr-green"
        />
        {secOverdue != null ? (
          <MiniMetric
            label="Overdue"
            value={fmtCurrency(secOverdue, true)}
            colorClass="text-rr-red"
          />
        ) : (
          <MiniMetric label="Items" value={String(secItems)} />
        )}
        {secCreditsAvail != null ? (
          <MiniMetric
            label="Available Credit"
            value={fmtCurrency(secCreditsAvail, true)}
            colorClass="text-rr-green"
          />
        ) : (
          <MiniMetric
            label="Net"
            value={fmtCurrency(secCharges + secCredits, true)}
          />
        )}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status pie */}
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
          <h4 className="text-xs font-bold text-card-foreground mb-2">
            Status Distribution
          </h4>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
                stroke="#fff"
                strokeWidth={2}
              >
                {statusData.map((_, i) => (
                  <Cell
                    key={`cell-${i}`}
                    fill={SECTION_COLOURS[i % SECTION_COLOURS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "#fff",
                  border: "1px solid #D0D1DC",
                  borderRadius: "8px",
                  fontSize: "11px",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Top items */}
        <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
          <h4 className="text-xs font-bold text-card-foreground mb-2">
            Top Items by Amount
          </h4>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={topItems} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" />
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: "#555" }}
                tickFormatter={(v) => fmtCurrency(v, true)}
                tickLine={false}
                axisLine={{ stroke: "#D0D1DC" }}
              />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ fontSize: 9, fill: "#555" }}
                tickLine={false}
                axisLine={{ stroke: "#D0D1DC" }}
                width={140}
              />
              <Tooltip
                formatter={(value: number) => fmtCurrency(value, true)}
                contentStyle={{
                  background: "#fff",
                  border: "1px solid #D0D1DC",
                  borderRadius: "8px",
                  fontSize: "11px",
                }}
              />
              <Bar dataKey="amount" fill="#10069F" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Data table */}
      <div>
        <h4 className="text-xs font-bold text-card-foreground mb-2">
          Detailed Line Items
        </h4>
        <DataTable columns={columns} rows={tableRows} maxHeight={400} />
      </div>
    </div>
  )
}

export function SectionBreakdown({
  sections,
  showCredits,
}: SectionBreakdownProps) {
  const tabNames = Array.from(sections.keys())
  const [activeTab, setActiveTab] = useState(tabNames[0] || "")

  if (!tabNames.length) return null

  return (
    <div>
      <SectionHeader>Section Breakdown</SectionHeader>

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto pb-1 mb-4">
        {tabNames.map((name) => (
          <button
            key={name}
            onClick={() => setActiveTab(name)}
            className={`whitespace-nowrap px-4 py-2 rounded-t-lg text-xs font-semibold border border-b-0 transition-colors ${
              activeTab === name
                ? "bg-rr-navy text-card border-rr-navy"
                : "bg-card text-card-foreground border-border hover:bg-muted"
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      {/* Active tab content */}
      <div className="bg-card rounded-b-xl rounded-tr-xl p-5 border border-border shadow-sm">
        {sections.has(activeTab) && (
          <SectionTab
            secName={activeTab}
            secData={sections.get(activeTab)!}
            showCredits={showCredits}
          />
        )}
      </div>
    </div>
  )
}
