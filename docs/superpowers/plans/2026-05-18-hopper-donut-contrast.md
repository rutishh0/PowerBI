# Hopper Donut Contrast Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the two Hopper donut charts (Restructure Type Split, CRP by Region) legible on the dark dashboard panel — both the slices and the legend labels.

**Architecture:** Add `seriesColorsLight` ordered palette to `chart-palette.ts`. Two donut charts swap their `seriesColors` reference for `seriesColorsLight`. Both donuts add a Legend `formatter` that forces light text color.

**Tech Stack:** TypeScript, recharts 2.15.0. No new deps.

**Spec:** `V8/docs/superpowers/specs/2026-05-18-hopper-donut-contrast-design.md`

---

## Task 1: Add `seriesColorsLight` to chart-palette

**Files:**
- Modify: `V8/NewFrontEndToBePorted/lib/chart-palette.ts`

- [ ] **Step 1: Append new export below the existing `seriesColors` block**

Find the end of the `seriesColors` block:

```ts
export const seriesColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-5)",
  "var(--chart-4)",
  "var(--chart-3)",
  "var(--chart-6)",
]
```

Insert directly below it:

```ts

/** Series colors safe on dark panels: same set as seriesColors but with
 * the near-background navy (chart-1) demoted to last position so it never
 * lands on a chart's dominant first segment. */
export const seriesColorsLight = [
  "var(--chart-2)",   // gold
  "var(--chart-5)",   // mid blue
  "var(--chart-4)",   // green
  "var(--chart-3)",   // red
  "var(--chart-6)",   // copper
  "var(--chart-1)",   // navy (last — still in rotation for 6+ series)
]
```

- [ ] **Step 2: Type check**
```
cd "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/NewFrontEndToBePorted" && pnpm tsc --noEmit
```
Expected: exit 0.

---

## Task 2: Swap palette and fix Legend in Global Hopper visualizer

**Files:**
- Modify: `V8/NewFrontEndToBePorted/components/visualizers/global-hopper-visualizer.tsx`

- [ ] **Step 1: Update palette import**

Change line 33:
```ts
import { palette, seriesColors } from "@/lib/chart-palette"
```
to:
```ts
import { palette, seriesColors, seriesColorsLight } from "@/lib/chart-palette"
```

- [ ] **Step 2: Update CRP by Region donut (≈lines 306-319)**

Find:
```tsx
<PieChart>
  <Pie data={regionData} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} strokeWidth={0}>
    {regionData.map((_, i) => (
      <Cell key={i} fill={seriesColors[i % seriesColors.length]} />
    ))}
  </Pie>
  <Tooltip
    formatter={(v: number) => fmtGBP(v)}
    contentStyle={{ background: "oklch(0.22 0.04 165)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, fontSize: 12 }}
    itemStyle={{ color: "white" }}
    labelStyle={{ color: "white" }}
  />
  <Legend iconSize={8} wrapperStyle={{ fontSize: 10, color: "rgba(255,255,255,0.75)" }} />
</PieChart>
```

Replace with:
```tsx
<PieChart>
  <Pie data={regionData} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} strokeWidth={0}>
    {regionData.map((_, i) => (
      <Cell key={i} fill={seriesColorsLight[i % seriesColorsLight.length]} />
    ))}
  </Pie>
  <Tooltip
    formatter={(v: number) => fmtGBP(v)}
    contentStyle={{ background: "oklch(0.22 0.04 165)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, fontSize: 12 }}
    itemStyle={{ color: "white" }}
    labelStyle={{ color: "white" }}
  />
  <Legend
    iconSize={8}
    wrapperStyle={{ fontSize: 10 }}
    formatter={(value: string) => (
      <span style={{ color: "rgba(255,255,255,0.85)" }}>{value}</span>
    )}
  />
</PieChart>
```

- [ ] **Step 3: Update Restructure Type Split donut (≈lines 383-400)**

Find:
```tsx
<PieChart>
  <Pie data={restructureSplit} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} strokeWidth={0}>
    {restructureSplit.map((_, i) => (
      <Cell key={i} fill={seriesColors[i % seriesColors.length]} />
    ))}
  </Pie>
  <Tooltip
    formatter={(v: number) => fmtGBP(v)}
    contentStyle={{ background: "oklch(0.22 0.04 165)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, fontSize: 12 }}
    itemStyle={{ color: "white" }}
    labelStyle={{ color: "white" }}
  />
  <Legend iconSize={8} wrapperStyle={{ fontSize: 10, color: "rgba(255,255,255,0.75)" }} />
</PieChart>
```

Replace with:
```tsx
<PieChart>
  <Pie data={restructureSplit} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} strokeWidth={0}>
    {restructureSplit.map((_, i) => (
      <Cell key={i} fill={seriesColorsLight[i % seriesColorsLight.length]} />
    ))}
  </Pie>
  <Tooltip
    formatter={(v: number) => fmtGBP(v)}
    contentStyle={{ background: "oklch(0.22 0.04 165)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, fontSize: 12 }}
    itemStyle={{ color: "white" }}
    labelStyle={{ color: "white" }}
  />
  <Legend
    iconSize={8}
    wrapperStyle={{ fontSize: 10 }}
    formatter={(value: string) => (
      <span style={{ color: "rgba(255,255,255,0.85)" }}>{value}</span>
    )}
  />
</PieChart>
```

- [ ] **Step 4: Check if `seriesColors` import is still used elsewhere in the file**
```
grep -n "seriesColors\b" "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/NewFrontEndToBePorted/components/visualizers/global-hopper-visualizer.tsx"
```
If `seriesColors` (without `Light` suffix) appears nowhere except the import line, drop it from the import. If it appears in other charts, keep it.

- [ ] **Step 5: Type check**
```
cd "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/NewFrontEndToBePorted" && pnpm tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 6: Production build**
```
cd "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/NewFrontEndToBePorted" && pnpm build
```
Expected: exit 0.

---

## Spec coverage check

| Spec section | Task |
|---|---|
| §2.1 New `seriesColorsLight` palette | Task 1 Step 1 |
| §2.2 Use in both donut charts | Task 2 Steps 2-3 |
| §2.3 Legend formatter with light text color | Task 2 Steps 2-3 (formatter included in both) |
| §3 Import update | Task 2 Step 1 |
| §4 Out of scope (bar charts, other visualizers) | Not touched by any task |
| §5 Verification | Task 1 Step 2, Task 2 Steps 5-6 |
| §6 Risk: unused `seriesColors` import lingers | Task 2 Step 4 (explicit check) |
