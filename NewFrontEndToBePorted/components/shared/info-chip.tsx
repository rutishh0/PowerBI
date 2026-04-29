import { cn } from "@/lib/utils"

interface InfoChipProps {
  label: string
  value: React.ReactNode
  className?: string
}

export function InfoChip({ label, value, className }: InfoChipProps) {
  if (value === null || value === undefined || value === "") return null
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-md border border-border bg-card/70 px-3 py-1.5 text-xs",
        className,
      )}
    >
      <span className="font-medium uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
      <span className="text-foreground tnum">{value}</span>
    </div>
  )
}
