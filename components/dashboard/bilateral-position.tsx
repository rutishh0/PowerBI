"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
  Legend,
} from "recharts"
import { SectionHeader } from "./section-header"
import { fmtCurrency } from "@/lib/soa-parser"
import type { SOARecord } from "@/lib/soa-parser"

interface BilateralPositionProps {
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

export function BilateralPosition({ items }: BilateralPositionProps) {
  if (!items.length) return null

  const theyOwe = items.filter((r) => r.Amount > 0).reduce((s, r) => s + r.Amount, 0)
  const weOwe = Math.abs(
    items.filter((r) => r.Amount < 0).reduce((s, r) => s + r.Amount, 0)
  )

  const directionData = [
    { name: "Customer to RR (Charges)", value: theyOwe, fill: "#10069F" },
    { name: "RR to Customer (Credits)", value: weOwe, fill: "#2E7D32" },
  ]

  // Net balance by section
  const sectionNetMap = new Map<string, number>()
  for (const r of items) {
    sectionNetMap.set(r.Section, (sectionNetMap.get(r.Section) || 0) + r.Amount)
  }
  const sectionNetData = Array.from(sectionNetMap.entries()).map(
    ([name, amount]) => ({
      section: name.length > 25 ? name.slice(0, 23) + "..." : name,
      amount,
      fill: amount > 0 ? "#10069F" : "#2E7D32",
    })
  )

  return (
    <div>
      <SectionHeader>Bilateral Position</SectionHeader>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Bilateral Position">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={directionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: "#555" }}
                tickLine={false}
                axisLine={{ stroke: "#D0D1DC" }}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#555" }}
                tickFormatter={(v) => fmtCurrency(v, true)}
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
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {directionData.map((entry, i) => (
                  <Cell key={`cell-${i}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Net Balance by Section">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sectionNetData} layout="vertical">
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
                dataKey="section"
                tick={{ fontSize: 10, fill: "#555" }}
                tickLine={false}
                axisLine={{ stroke: "#D0D1DC" }}
                width={120}
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
              <Legend
                wrapperStyle={{ fontSize: "11px" }}
                iconType="circle"
                iconSize={8}
                payload={[
                  { value: "Owed to RR", type: "circle", color: "#10069F" },
                  { value: "Credit to Customer", type: "circle", color: "#2E7D32" },
                ]}
              />
              <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                {sectionNetData.map((entry, i) => (
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
