/**
 * Chart color palette based on CSS vars.
 * Use with Recharts: fill={palette.primary} etc.
 */
export const palette = {
  primary: "var(--chart-1)",   // navy
  accent: "var(--chart-2)",    // gold
  danger: "var(--chart-3)",    // red
  success: "var(--chart-4)",   // green
  blue: "var(--chart-5)",      // mid blue
  copper: "var(--chart-6)",    // copper
  muted: "var(--muted-foreground)",
  border: "var(--border)",
  foreground: "var(--foreground)",
}

/** Ordered series colors for categorical multi-series charts. */
export const seriesColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-5)",
  "var(--chart-4)",
  "var(--chart-3)",
  "var(--chart-6)",
]

/** Aging-bucket ramp: green → amber → deep red, 6 stops */
export const agingColors = [
  "var(--chart-4)",        // current — green
  "oklch(0.68 0.13 125)",  // 1-30 — yellow-green
  "oklch(0.72 0.14 70)",   // 31-60 — amber (warning)
  "oklch(0.62 0.16 45)",   // 61-90 — copper
  "oklch(0.56 0.18 30)",   // 91-180 — red-orange
  "var(--chart-3)",        // 180+ — deep red
]
