"use client"

import { useState } from "react"
import { Settings, RotateCcw } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Checkbox } from "@/components/ui/checkbox"
import { CHART_DEFS, type HopperChartCategory } from "./hopper-charts"

const CATEGORY_LABELS: Record<HopperChartCategory, string> = {
  pipeline: "Pipeline",
  regional: "Regional",
  customer: "Customer",
  engine: "Engine",
  financial: "Financial",
  structural: "Structural",
  ownership: "Ownership",
}

interface HopperCustomizeSheetProps {
  pinned: Set<string>
  onChange: (next: Set<string>) => void
  onReset: () => void
}

export function HopperCustomizeSheet({ pinned, onChange, onReset }: HopperCustomizeSheetProps) {
  const [open, setOpen] = useState(false)

  function toggle(id: string) {
    const next = new Set(pinned)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  // Group by category preserving registry order
  const groups = new Map<HopperChartCategory, typeof CHART_DEFS>()
  for (const def of CHART_DEFS) {
    const arr = groups.get(def.category) ?? []
    arr.push(def)
    groups.set(def.category, arr)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="h-8 self-end rounded border border-white/20 bg-white/5 px-3 text-xs font-medium hover:bg-white/10 transition-colors inline-flex items-center gap-1.5"
        >
          <Settings className="h-3.5 w-3.5" />
          Customize
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-[24rem] max-w-[90vw] bg-[oklch(0.17_0.03_165)] text-white border-l border-white/10 overflow-y-auto p-6"
      >
        <SheetHeader className="text-left p-0">
          <SheetTitle className="text-white font-display">Customize Standard View</SheetTitle>
          <SheetDescription className="text-white/60">
            Pick which charts appear on the Hopper dashboard. Your choice is saved in this browser.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {Array.from(groups.entries()).map(([category, defs]) => (
            <div key={category}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2">
                {CATEGORY_LABELS[category]}
              </div>
              <div className="space-y-2">
                {defs.map((def) => {
                  const checked = pinned.has(def.id)
                  return (
                    <label
                      key={def.id}
                      className="flex items-start gap-3 rounded border border-white/10 bg-white/[0.03] p-3 cursor-pointer hover:border-white/30 transition-colors"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggle(def.id)}
                        className="mt-0.5 border-white/40 data-[state=checked]:bg-[var(--chart-2)] data-[state=checked]:border-[var(--chart-2)]"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white">{def.title}</div>
                        <div className="text-xs text-white/55 mt-0.5">{def.description}</div>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onReset}
          className="mt-6 inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white"
        >
          <RotateCcw className="h-3 w-3" />
          Reset to defaults
        </button>
      </SheetContent>
    </Sheet>
  )
}
