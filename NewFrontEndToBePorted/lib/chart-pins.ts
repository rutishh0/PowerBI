/**
 * Per-browser pinning for which charts a user wants to see on a dashboard.
 * Backed by localStorage. SSR-safe.
 */

export function loadPins(key: string, fallback: readonly string[]): Set<string> {
  if (typeof window === "undefined") return new Set(fallback)
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return new Set(fallback)
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set(fallback)
    const out = parsed.filter((v): v is string => typeof v === "string")
    return new Set(out)
  } catch {
    return new Set(fallback)
  }
}

export function savePins(key: string, ids: Set<string>): void {
  if (typeof window === "undefined") return
  try {
    const sorted = Array.from(ids).sort()
    window.localStorage.setItem(key, JSON.stringify(sorted))
  } catch {
    // Quota exceeded or storage disabled — degrade silently.
  }
}

export function clearPins(key: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}
