"use client"

import { useMemo, useState } from "react"
import { Check, ChevronDown, X } from "lucide-react"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

/**
 * Membership test used by every visualizer's filter predicate.
 * An empty selection means "no filter" (i.e. all rows pass).
 */
export function inSel(sel: string[], v: string): boolean {
  return sel.length === 0 || sel.includes(v)
}

interface MultiSelectProps {
  label: string
  options: readonly string[]
  /** Selected values. `[]` means "All". */
  value: string[]
  onChange: (next: string[]) => void
  width?: string
  /** Visual tone for the trigger button. Dropdown content is always a
   *  light popover surface (legible over any dashboard theme). */
  tone?: "dark" | "light"
  placeholderAll?: string
  triggerClassName?: string
}

/**
 * Themeable multi-select filter. Renders a compact trigger that fits the
 * existing single-select filter bars, and a portaled checkbox list. Used by
 * the Hopper, Opportunity Tracker and Commercial Plan visualizers.
 */
export function MultiSelect({
  label,
  options,
  value,
  onChange,
  width = "9rem",
  tone = "dark",
  placeholderAll = "All",
  triggerClassName,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const summary =
    value.length === 0
      ? placeholderAll
      : value.length === 1
        ? value[0]
        : `${value[0]} +${value.length - 1}`

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options
  }, [options, query])

  function toggle(o: string) {
    onChange(value.includes(o) ? value.filter((v) => v !== o) : [...value, o])
  }

  const isAll = value.length === 0
  const triggerTone =
    tone === "dark"
      ? "border-white/15 bg-white/5 text-white hover:bg-white/10"
      : "border-input bg-background text-foreground hover:bg-muted"
  const labelTone = tone === "dark" ? "text-white/60" : "text-muted-foreground"

  return (
    <div className="flex flex-col gap-1 text-xs">
      <span className={cn("font-medium", labelTone)}>{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex h-8 items-center justify-between gap-2 rounded border px-2 text-xs transition-colors",
              triggerTone,
              triggerClassName,
            )}
            style={{ minWidth: width, maxWidth: "16rem" }}
          >
            <span className={cn("truncate", isAll && "opacity-70")}>{summary}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-60 p-0">
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <span className="text-xs font-semibold">{label}</span>
            {value.length > 0 ? (
              <button
                type="button"
                onClick={() => onChange([])}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            ) : null}
          </div>
          {options.length > 8 ? (
            <div className="px-2 pt-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="h-7 w-full rounded border border-input bg-background px-2 text-xs text-foreground"
              />
            </div>
          ) : null}
          <div className="max-h-60 overflow-auto p-1">
            {filteredOptions.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">No matches</div>
            ) : (
              filteredOptions.map((o) => {
                const checked = value.includes(o)
                return (
                  <button
                    type="button"
                    key={o}
                    onClick={() => toggle(o)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        checked ? "border-primary bg-primary text-primary-foreground" : "border-input",
                      )}
                    >
                      {checked ? <Check className="h-3 w-3" /> : null}
                    </span>
                    <span className="truncate">{o}</span>
                  </button>
                )
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
