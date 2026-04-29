import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export type KpiTone = "neutral" | "success" | "danger" | "warning" | "accent" | "primary"

interface KpiCardProps {
  label: string
  value: string | number
  subtitle?: string
  icon?: LucideIcon
  tone?: KpiTone
  className?: string
}

const toneMap: Record<KpiTone, string> = {
  neutral: "border-border",
  success: "border-success/30",
  danger: "border-destructive/30",
  warning: "border-warning/40",
  accent: "border-accent/40",
  primary: "border-primary/30",
}

const iconToneMap: Record<KpiTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-success/12 text-success",
  danger: "bg-destructive/12 text-destructive",
  warning: "bg-warning/15 text-warning",
  accent: "bg-accent/15 text-accent-foreground",
  primary: "bg-primary/8 text-primary",
}

const valueToneMap: Record<KpiTone, string> = {
  neutral: "text-foreground",
  success: "text-success",
  danger: "text-destructive",
  warning: "text-foreground",
  accent: "text-foreground",
  primary: "text-primary",
}

export function KpiCard({ label, value, subtitle, icon: Icon, tone = "neutral", className }: KpiCardProps) {
  return (
    <div
      className={cn(
        "group relative flex flex-col gap-3 rounded-lg border bg-card p-4 transition-shadow hover:shadow-sm",
        toneMap[tone],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </span>
        {Icon ? (
          <span className={cn("flex h-8 w-8 items-center justify-center rounded-md", iconToneMap[tone])}>
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className={cn("font-display text-2xl font-semibold tracking-tight tnum", valueToneMap[tone])}>
          {value}
        </span>
        {subtitle ? <span className="text-xs text-muted-foreground text-pretty">{subtitle}</span> : null}
      </div>
    </div>
  )
}
