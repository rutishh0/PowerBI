import { cn } from "@/lib/utils"

interface RRWordmarkProps {
  className?: string
  subtitle?: string
  tone?: "light" | "dark"
}

/**
 * "ROLLS-ROYCE / CIVIL AEROSPACE" stacked wordmark.
 * Pure typography — no raster/brand asset dependency.
 */
export function RRWordmark({ className, subtitle = "Civil Aerospace", tone = "light" }: RRWordmarkProps) {
  const textColor = tone === "light" ? "text-sidebar-foreground" : "text-foreground"
  const subColor = tone === "light" ? "text-sidebar-primary" : "text-accent"
  return (
    <div className={cn("flex flex-col leading-none", className)}>
      <span className={cn("font-display font-semibold tracking-[0.18em] text-[0.78rem]", textColor)}>
        ROLLS-ROYCE
      </span>
      <span
        className={cn(
          "font-display font-medium tracking-[0.32em] text-[0.6rem] mt-1",
          subColor,
        )}
      >
        {subtitle.toUpperCase()}
      </span>
    </div>
  )
}

/** Compact roundel-style monogram: two interlocking Rs via typography */
export function RRMonogram({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative flex h-9 w-9 items-center justify-center rounded-full border border-sidebar-primary/40 bg-sidebar-primary/10 text-sidebar-primary font-display font-bold tracking-tighter text-[0.7rem]",
        className,
      )}
      aria-hidden="true"
    >
      RR
    </div>
  )
}
