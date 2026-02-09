"use client"

import { fmtCurrency } from "@/lib/soa-parser"
import type { GrandTotals } from "@/lib/soa-parser"
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  AlertTriangle,
  Clock,
  FileText,
} from "lucide-react"

interface KpiCardsProps {
  grand: GrandTotals
  avgDaysLate: number | null
}

interface KpiItem {
  label: string
  value: string
  colorClass: string
  icon: React.ReactNode
  borderColor: string
}

export function KpiCards({ grand, avgDaysLate }: KpiCardsProps) {
  const items: KpiItem[] = [
    {
      label: "Total Charges",
      value: fmtCurrency(grand.total_charges, true),
      colorClass: "text-rr-dark",
      icon: <TrendingUp className="h-4 w-4" />,
      borderColor: "border-l-rr-navy",
    },
    {
      label: "Total Credits",
      value: fmtCurrency(grand.total_credits, true),
      colorClass: grand.total_credits < 0 ? "text-rr-green" : "text-rr-dark",
      icon: <TrendingDown className="h-4 w-4" />,
      borderColor: "border-l-rr-green",
    },
    {
      label: "Net Balance",
      value: fmtCurrency(grand.net_balance, true),
      colorClass: grand.net_balance > 0 ? "text-rr-red" : "text-rr-green",
      icon: <DollarSign className="h-4 w-4" />,
      borderColor: grand.net_balance > 0 ? "border-l-rr-red" : "border-l-rr-green",
    },
    {
      label: "Total Overdue",
      value: fmtCurrency(grand.total_overdue, true),
      colorClass: "text-rr-red",
      icon: <AlertTriangle className="h-4 w-4" />,
      borderColor: "border-l-rr-red",
    },
    {
      label: "Avg Days Late",
      value: avgDaysLate != null ? String(avgDaysLate) : "\u2014",
      colorClass: "text-rr-dark",
      icon: <Clock className="h-4 w-4" />,
      borderColor: "border-l-rr-amber",
    },
    {
      label: "Open Items",
      value: String(grand.item_count),
      colorClass: "text-rr-dark",
      icon: <FileText className="h-4 w-4" />,
      borderColor: "border-l-rr-blue2",
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {items.map((item) => (
        <div
          key={item.label}
          className={`bg-card rounded-xl p-4 border-l-4 ${item.borderColor} shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5`}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-muted-foreground">{item.icon}</span>
            <span className="text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground">
              {item.label}
            </span>
          </div>
          <div className={`text-xl font-extrabold ${item.colorClass}`}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  )
}
