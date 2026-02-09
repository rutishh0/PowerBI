"use client"

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
  Legend,
  ResponsiveContainer,
} from "recharts"
import { SectionHeader } from "./section-header"
import {
  SECTION_COLOURS,
  AGING_ORDER,
  AGING_COLORS,
  agingBucket,
  fmtCurrency,
} from "@/lib/soa-parser"
import type { SOARecord } from "@/lib/soa-parser"

interface ExecutiveOverviewProps {
  items: SOARecord[]
}

function ChartCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
      <h3 className="text-sm font-bold text-card-foreground mb-3">{title}</h3>
      {children}
    </div>
  )
}

const currencyFormatter = (v: number) => fmtCurrency(v, true)

export function ExecutiveOverview({ items }: ExecutiveOverviewProps) {
  if (!items.length) return null

  // Donut: Breakdown by Section
  const sectionMap = new Map<string, number>()
  for (const r of items) {
    sectionMap.set(r.Section, (sectionMap.get(r.Section) || 0) + Math.abs(r.Amount))
  }
  const donutData = Array.from(sectionMap.entries()).map(([name, value]) => ({
    name,
    value,
  }))

  // Grouped bar: Charges vs Credits
  const chargeMap = new Map<string, number>()
  const creditMap = new Map<string, number>()
  for (const r of items) {
    if (r.Amount > 0) {
      chargeMap.set(r.Section, (chargeMap.get(r.Section) || 0) + r.Amount)
    } else {
      creditMap.set(r.Section, (creditMap.get(r.Section) || 0) + Math.abs(r.Amount))
    }
  }
  const allSections = Array.from(new Set(items.map((r) => r.Section)))
  const groupedBarData = allSections.map((sec) => ({
    section: sec.length > 20 ? sec.slice(0, 18) + "..." : sec,
    Charges: chargeMap.get(sec) || 0,
    Credits: creditMap.get(sec) || 0,
  }))

  // Aging analysis
  const agingMap = new Map<string, { count: number; total: number }>()
  for (const r of items) {
    const bucket = agingBucket(r["Days Late"])
    const entry = agingMap.get(bucket) || { count: 0, total: 0 }
    entry.count++
    entry.total += r.Amount
    agingMap.set(bucket, entry)
  }
  const agingData = AGING_ORDER.filter((b) => agingMap.has(b)).map((b) => ({
    bucket: b,
    amount: agingMap.get(b)!.total,
    count: agingMap.get(b)!.count,
    fill: AGING_COLORS[b],
  }))

  return (
    <div>
      <SectionHeader>Executive Overview</SectionHeader>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Donut */}
        <ChartCard title="Breakdown by Section">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={donutData}
                cx="50%"
                cy="50%"
                innerRadius={65}
                outerRadius={110}
                paddingAngle={2}
                dataKey="value"
                stroke="#fff"
                strokeWidth={2}
              >
                {donutData.map((_, i) => (
                  <Cell
                    key={`cell-${i}`}
                    fill={SECTION_COLOURS[i % SECTION_COLOURS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => fmtCurrency(value, true)}
                contentStyle={{
                  background: "#fff",
                  border: "1px solid #D0D1DC",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: "11px" }}
                iconType="circle"
                iconSize={8}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Grouped Bar: Charges vs Credits */}
        <ChartCard title="Charges vs Credits by Section">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={groupedBarData} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" />
              <XAxis
                dataKey="section"
                tick={{ fontSize: 10, fill: "#555" }}
                tickLine={false}
                axisLine={{ stroke: "#D0D1DC" }}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#555" }}
                tickFormatter={currencyFormatter}
                tickLine={false}
                axisLine={{ stroke: "#D0D1DC" }}
              />
              <Tooltip
                formatter={(value: number) => fmtCurrency(value, true)}
                contentStyle={{
                  background: "#fff",
                  border: "1px solid #D0D1DC",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "11px" }} iconType="circle" iconSize={8} />
              <Bar dataKey="Charges" fill="#10069F" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Credits" fill="#2E7D32" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Aging Analysis */}
        <ChartCard title="Aging Analysis">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={agingData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" />
              <XAxis
                dataKey="bucket"
                tick={{ fontSize: 9, fill: "#555" }}
                tickLine={false}
                axisLine={{ stroke: "#D0D1DC" }}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#555" }}
                tickFormatter={currencyFormatter}
                tickLine={false}
                axisLine={{ stroke: "#D0D1DC" }}
              />
              <Tooltip
                formatter={(value: number) => fmtCurrency(value, true)}
                contentStyle={{
                  background: "#fff",
                  border: "1px solid #D0D1DC",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                {agingData.map((entry, i) => (
                  <Cell key={`cell-${i}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  )
}
