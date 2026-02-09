"use client"

import type { SOAMetadata } from "@/lib/soa-parser"
import { Building2, Hash, User, Percent, Clock, CalendarDays } from "lucide-react"

interface CustomerInfoProps {
  metaList: SOAMetadata[]
}

function InfoChip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-1.5 bg-accent rounded-md px-2.5 py-1 text-xs border border-border">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground font-medium">{label}:</span>
      <span className="font-semibold text-rr-dark">{value}</span>
    </div>
  )
}

export function CustomerInfo({ metaList }: CustomerInfoProps) {
  if (!metaList.length) return null

  return (
    <div className="space-y-2">
      {metaList.map((meta, i) => {
        const name = meta.customer_name || "Unknown Customer"
        const id = meta.customer_id || "\u2014"
        const contact = meta.contact || "\u2014"
        const lpiRate = meta.lpi_rate
        const avgLate = meta.avg_days_late
        const reportDate = meta.report_date

        return (
          <div
            key={`${name}-${i}`}
            className="bg-card rounded-xl px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 shadow-sm border border-border"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-rr-navy/10 flex items-center justify-center">
                <Building2 className="h-4.5 w-4.5 text-rr-navy" />
              </div>
              <span className="font-extrabold text-rr-dark text-base">
                {name}
              </span>
              <InfoChip icon={<Hash className="h-3 w-3" />} label="ID" value={id} />
              <InfoChip icon={<User className="h-3 w-3" />} label="Contact" value={contact} />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {lpiRate != null && (
                <InfoChip
                  icon={<Percent className="h-3 w-3" />}
                  label="LPI Rate"
                  value={`${(lpiRate * 100).toFixed(2)}%`}
                />
              )}
              {avgLate != null && (
                <InfoChip
                  icon={<Clock className="h-3 w-3" />}
                  label="Avg Days Late"
                  value={String(avgLate)}
                />
              )}
              {reportDate && (
                <InfoChip
                  icon={<CalendarDays className="h-3 w-3" />}
                  label="Report"
                  value={reportDate.toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
