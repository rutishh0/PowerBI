/**
 * Numeric / date formatting helpers — match V6 spec §14.4 numeric formatting rules.
 */

export function fmtUSD(v: number | null | undefined, opts?: { short?: boolean }): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—"
  const abs = Math.abs(v)
  const sign = v < 0 ? "-" : ""
  if (opts?.short !== false) {
    if (abs >= 1_000_000_000) return `${sign}$${(abs / 1e9).toFixed(1)}B`
    if (abs >= 1_000_000) return `${sign}$${(abs / 1e6).toFixed(1)}M`
    if (abs >= 1_000) return `${sign}$${(abs / 1e3).toFixed(1)}K`
  }
  return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function fmtMoney(v: number | null | undefined, currency = "USD"): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—"
  const sym = currency === "GBP" ? "£" : currency === "EUR" ? "€" : "$"
  const abs = Math.abs(v)
  const sign = v < 0 ? "-" : ""
  if (abs >= 1_000_000_000) return `${sign}${sym}${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1_000_000) return `${sign}${sym}${(abs / 1e6).toFixed(2)}M`
  if (abs >= 1_000) return `${sign}${sym}${(abs / 1e3).toFixed(1)}K`
  return `${sign}${sym}${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function fmtFullMoney(v: number | null | undefined, currency = "USD"): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—"
  const sym = currency === "GBP" ? "£" : currency === "EUR" ? "€" : "$"
  const sign = v < 0 ? "-" : ""
  return `${sign}${sym}${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Opp Tracker format: $X.Xm (millions only, single decimal) */
export function fmtM(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—"
  const sign = v < 0 ? "-" : ""
  return `${sign}$${Math.abs(v).toFixed(1)}m`
}

/** Global Hopper format: £X.Xm / £X.Xbn */
export function fmtGBP(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—"
  const sign = v < 0 ? "-" : ""
  const abs = Math.abs(v)
  if (abs >= 1000) return `${sign}£${(abs / 1000).toFixed(2)}bn`
  return `${sign}£${abs.toFixed(1)}m`
}

export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—"
  return `${(v * 100).toFixed(digits)}%`
}

export function fmtCount(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—"
  return v.toLocaleString("en-US")
}

export function fmtDate(v: string | null | undefined): string {
  if (!v) return "—"
  return v
}

export function fmtDays(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—"
  return `${Math.round(v).toLocaleString("en-US")}d`
}
