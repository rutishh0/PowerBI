import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface SectionHeaderProps {
  icon?: LucideIcon
  title: string
  badge?: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function SectionHeader({ icon: Icon, title, badge, description, action, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <div className="flex items-center gap-3 min-w-0">
        {Icon ? (
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/8 text-primary">
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-semibold tracking-tight truncate">{title}</h2>
            {badge ? (
              <span className="inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.1em] text-primary">
                {badge}
              </span>
            ) : null}
          </div>
          {description ? (
            <p className="text-xs text-muted-foreground text-pretty mt-0.5">{description}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="flex-shrink-0">{action}</div> : null}
    </div>
  )
}
