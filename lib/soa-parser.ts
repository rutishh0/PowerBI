/**
 * Rolls-Royce Civil Aerospace -- Statement of Account Parser
 * ===========================================================
 * A faithful TypeScript port of the Python/openpyxl parser.
 * Uses the SheetJS (xlsx) library to read workbooks client-side.
 *
 * NOTHING is hard-coded to a particular customer or column position.
 * The parser detects sections, headers, and amounts dynamically.
 */

import * as XLSX from "xlsx"

// ── Types ──────────────────────────────────────────────────────

export interface SOAMetadata {
  title?: string
  customer_name?: string
  customer_id?: string
  contact?: string
  lpi_rate?: number
  avg_days_late?: number
  report_date?: Date
}

export interface SOARecord {
  Section: string
  Amount: number
  Company?: string | null
  Account?: string | null
  Reference?: string | null
  "Document Date"?: Date | null
  "Due Date"?: Date | null
  Currency?: string | null
  Text?: string | null
  Assignment?: string | null
  "R-R Comments"?: string | null
  "Action Owner"?: string | null
  "Days Late"?: number | null
  "Customer Comments"?: string | null
  Status?: string | null
  "PO Reference"?: string | null
  "LPI Cumulated"?: string | null
  Type?: string | null
  "Document No"?: string | null
  "Interest Method"?: string | null
  "Customer Name"?: string | null
  "Entry Type": "Charge" | "Credit"
  "Source File"?: string
}

export interface SectionData {
  header: (string | null)[]
  colmap: Record<string, number>
  rows: SOARecord[]
  totals: Record<string, number>
}

export interface GrandTotals {
  total_charges: number
  total_credits: number
  net_balance: number
  item_count: number
  total_overdue: number
  section_totals?: Record<string, number>
  section_overdue?: Record<string, number>
  available_credits?: Record<string, number>
}

export interface ParsedSOA {
  metadata: SOAMetadata
  sections: Map<string, SectionData>
  all_items: SOARecord[]
  grand_totals: GrandTotals
}

// ── Constants ──────────────────────────────────────────────────

const SECTION_KEYWORDS = [
  "charges", "credits", "credit", "totalcare", "familycare", "missioncare",
  "spare parts", "late payment", "interest", "customer respon",
  "customer responsibility", "usable", "offset",
]

const HEADER_KEYWORDS = [
  "company", "account", "reference", "document", "date", "amount", "curr",
  "text", "assignment", "arrangement", "comments", "status", "action",
  "days", "late", "lpi", "invoice", "type", "interest", "net due",
]

// ── Utility Functions ──────────────────────────────────────────

function isSectionHeader(rowValues: (string | number | null)[], _colCount: number): boolean {
  const nonEmpty = rowValues
    .map((v, i) => [i, v] as [number, string | number | null])
    .filter(([, v]) => v != null && String(v).trim() !== "")
  if (nonEmpty.length === 0) return false
  if (nonEmpty.length > 3) return false

  const text = String(nonEmpty[0][1]).trim().toLowerCase()

  // Must not be purely numeric
  const num = parseFloat(text.replace(/,/g, ""))
  if (!isNaN(num)) return false

  // Exclude summary-row patterns
  const textClean = text.replace(/:$/, "")
  if (["total", "overdue", "available credit", "total overdue", "net balance"].includes(textClean)) {
    return false
  }

  // Also exclude if the SECOND cell is a number (looks like a summary)
  if (nonEmpty.length === 2) {
    const secondStr = String(nonEmpty[1][1]).replace(/,/g, "").replace(/\$/g, "").trim()
    const secondNum = parseFloat(secondStr)
    if (!isNaN(secondNum)) {
      if (["total", "overdue", "credit", "balance"].some((sw) => textClean.includes(sw))) {
        return false
      }
    }
  }

  return SECTION_KEYWORDS.some((kw) => text.includes(kw))
}

function isHeaderRow(rowValues: (string | number | null)[]): boolean {
  const nonEmpty = rowValues.filter((v) => v != null && String(v).trim() !== "")
  if (nonEmpty.length < 4) return false

  // Reject if any cell is a large number
  for (const v of nonEmpty) {
    const s = String(v).replace(/,/g, "").replace(/\$/g, "").trim()
    const n = parseFloat(s)
    if (!isNaN(n) && Math.abs(n) > 100) return false
  }

  // Only count keywords in SHORT text cells
  const shortTexts = nonEmpty
    .filter((v) => String(v).trim().length < 35)
    .map((v) => String(v).trim().toLowerCase())
  if (shortTexts.length < 3) return false

  let hits = 0
  for (const t of shortTexts) {
    for (const kw of HEADER_KEYWORDS) {
      if (t.includes(kw)) {
        hits++
        break
      }
    }
  }
  return hits >= 3
}

function isSummaryRow(rowValues: (string | number | null)[]): string | null {
  for (const v of rowValues) {
    if (v == null) continue
    const t = String(v).trim().toLowerCase().replace(/:$/, "")
    if (t.length > 25) continue
    if (
      ["total", "overdue", "available credit", "total overdue", "net balance"].includes(t)
    ) {
      return t
    }
  }
  return null
}

function coerceAmount(val: unknown): number | null {
  if (val == null) return null
  if (typeof val === "number") return val
  const s = String(val).trim().replace(/,/g, "").replace(/\$/g, "").replace(/ /g, "")
  if (["", "-", "$ -", "$-"].includes(s)) return null
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

function coerceDate(val: unknown): Date | null {
  if (val == null) return null
  if (val instanceof Date) return val
  // xlsx often returns dates as serial numbers
  if (typeof val === "number") {
    // Excel date serial number
    try {
      const date = XLSX.SSF.parse_date_code(val)
      if (date) {
        return new Date(date.y, date.m - 1, date.d)
      }
    } catch {
      // not a date serial
    }
    return null
  }
  const s = String(val).trim()
  // Try common formats
  const formats = [
    /^(\d{2})\/(\d{2})\/(\d{4})$/, // dd/mm/yyyy or mm/dd/yyyy
    /^(\d{4})-(\d{2})-(\d{2})$/,   // yyyy-mm-dd
    /^(\d{2})-(\d{2})-(\d{4})$/,   // dd-mm-yyyy
    /^(\d{2})\.(\d{2})\.(\d{4})$/,  // dd.mm.yyyy
  ]
  for (const fmt of formats) {
    const m = s.match(fmt)
    if (m) {
      // Try dd/mm/yyyy first (common in UK/RR context)
      const d = new Date(s)
      if (!isNaN(d.getTime())) return d
    }
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function coerceInt(val: unknown): number | null {
  if (val == null) return null
  const n = Number(val)
  return isNaN(n) ? null : Math.round(n)
}

function normaliseHeader(raw: (string | number | null)[]): (string | null)[] {
  return raw.map((h) => {
    if (h == null) return null
    return String(h).trim().replace(/\s+/g, " ")
  })
}

function mapColumns(header: (string | null)[]): Record<string, number> {
  const mapping: Record<string, number> = {}
  const hl = header.map((h) => (h ? h.toLowerCase() : ""))

  for (let i = 0; i < hl.length; i++) {
    const h = hl[i]
    if (!h) continue
    if (h.includes("amount")) {
      mapping.amount = i
    } else if (h === "curr" || h === "currency") {
      mapping.currency = i
    } else if (h.includes("net due") || h.includes("due date")) {
      mapping.due_date = i
    } else if (h.includes("document") && h.includes("date")) {
      mapping.doc_date = i
    } else if (h.includes("document") && h.includes("no")) {
      mapping.doc_no = i
    } else if (h.includes("invoice date")) {
      mapping.doc_date = i
    } else if (h.includes("reference")) {
      mapping.reference = i
    } else if (h.includes("company")) {
      mapping.company = i
    } else if (h.includes("account")) {
      mapping.account = i
    } else if (h === "text") {
      mapping.text = i
    } else if (h.includes("assignment") || h.includes("arrangement")) {
      mapping.assignment = i
    } else if (h.includes("r-r comment") || h.includes("rr comment")) {
      mapping.rr_comments = i
    } else if (h.includes("action") || h.includes("reqd")) {
      mapping.action_owner = i
    } else if (h.includes("days") && h.includes("late")) {
      mapping.days_late = i
    } else if (h.includes("rata")) {
      mapping.rata_date = i
    } else if (h.includes("comment") && !h.includes("r-r") && !h.includes("rr")) {
      mapping.customer_comments = i
    } else if (h.includes("status")) {
      mapping.status = i
    } else if (
      h.includes("customer") &&
      !h.includes("comment") &&
      !h.includes("name") &&
      !h.includes("respon")
    ) {
      mapping.customer_name = i
    } else if (h.includes("lpi")) {
      mapping.lpi_cumulated = i
    } else if (h.includes("etr") || h.includes("po") || h.includes("pr")) {
      mapping.po_reference = i
    } else if (h.includes("type")) {
      mapping.type = i
    } else if (h.includes("interest") || h.includes("calc")) {
      mapping.interest_method = i
    }
  }

  // Fallback date columns
  if (!("doc_date" in mapping)) {
    for (let i = 0; i < hl.length; i++) {
      if (hl[i].includes("date") && !Object.values(mapping).includes(i)) {
        mapping.doc_date = i
        break
      }
    }
  }
  if (!("due_date" in mapping)) {
    for (let i = 0; i < hl.length; i++) {
      if (hl[i].includes("due") && !Object.values(mapping).includes(i)) {
        mapping.due_date = i
        break
      }
    }
  }

  return mapping
}

function findAmountCol(header: (string | null)[]): number | null {
  for (let i = 0; i < header.length; i++) {
    if (header[i] && header[i]!.toLowerCase().includes("amount")) {
      return i
    }
  }
  return null
}

// ── Main Parser ────────────────────────────────────────────────

export function parseSOAWorkbook(buffer: ArrayBuffer): ParsedSOA {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true })
  const wsName = wb.SheetNames[0]
  const ws = wb.Sheets[wsName]

  // Convert sheet to array of arrays
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1")
  const maxCol = range.e.c + 1
  const allRows: (string | number | Date | null)[][] = []

  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: (string | number | Date | null)[] = []
    for (let c = 0; c <= range.e.c; c++) {
      const cellAddr = XLSX.utils.encode_cell({ r, c })
      const cell = ws[cellAddr]
      if (!cell) {
        row.push(null)
      } else if (cell.t === "d") {
        row.push(cell.v as Date)
      } else if (cell.t === "n") {
        row.push(cell.v as number)
      } else {
        row.push(cell.v != null ? String(cell.v) : null)
      }
    }
    allRows.push(row)
  }

  // ── PASS 1: Metadata ──
  const metadata: SOAMetadata = {}
  const metaRows = allRows.slice(0, 15)

  for (const row of metaRows) {
    const joined = row
      .filter((v) => v != null)
      .map(String)
      .join(" ")
      .toLowerCase()

    for (let vi = 0; vi < row.length; vi++) {
      const v = row[vi]
      if (v == null) continue
      const s = String(v).trim()
      const sl = s.toLowerCase()

      if (sl.includes("statement of account")) {
        metadata.title = s
      }
      if (sl.includes("customer") && (sl.includes("name") || sl.includes(":")) && !metadata.customer_name) {
        for (let nvi = vi + 1; nvi < row.length; nvi++) {
          if (row[nvi] != null) {
            metadata.customer_name = String(row[nvi]).trim()
            break
          }
        }
      }
      if (
        (sl.includes("customer") && (sl.includes("#") || (sl.includes("n") && sl.includes(":")))) ||
        sl.includes("customer n")
      ) {
        for (let nvi = vi + 1; nvi < row.length; nvi++) {
          if (row[nvi] != null) {
            metadata.customer_id = String(row[nvi]).trim()
            break
          }
        }
      }
      if (sl.includes("contact")) {
        for (let nvi = vi + 1; nvi < row.length; nvi++) {
          if (row[nvi] != null) {
            metadata.contact = String(row[nvi]).trim()
            break
          }
        }
      }
      if (sl.includes("lpi") || sl.includes("lp ratio") || sl.includes("lp rate")) {
        for (const nv of row) {
          if (nv == null) continue
          const nvStr = String(nv).trim()
          if (nvStr.includes("%")) {
            const pctVal = parseFloat(nvStr.replace("%", ""))
            if (!isNaN(pctVal)) {
              metadata.lpi_rate = pctVal / 100
              break
            }
          }
          const amt = coerceAmount(nv)
          if (amt != null && amt > 0 && Math.abs(amt) < 1) {
            metadata.lpi_rate = amt
            break
          }
        }
      }
      if (sl.includes("average days late") || sl.includes("avg days late") || joined.includes("average days late")) {
        for (const nv of row) {
          if (nv == null) continue
          const val = coerceInt(nv)
          if (val != null && val > 0) {
            metadata.avg_days_late = val
            break
          }
        }
      }
      if (sl.includes("today")) {
        for (const nv of row) {
          const d = coerceDate(nv)
          if (d) {
            metadata.report_date = d
            break
          }
        }
      }
    }
  }

  // ── PASS 2: Identify section boundaries and headers ──
  let masterHeader: (string | null)[] | null = null
  let masterHeaderIdx: number | null = null
  const sectionsInfo: { name: string; start: number; end: number }[] = []

  for (let idx = 0; idx < allRows.length; idx++) {
    const row = allRows[idx] as (string | number | null)[]
    if (isHeaderRow(row) && masterHeader == null) {
      masterHeader = normaliseHeader(row)
      masterHeaderIdx = idx
      continue
    }
    if (isSectionHeader(row, maxCol)) {
      const name = String(row.find((v) => v != null && String(v).trim() !== "")).trim()
      sectionsInfo.push({ name, start: idx, end: allRows.length })
    }
  }

  // Assign end boundaries
  for (let i = 0; i < sectionsInfo.length; i++) {
    if (i + 1 < sectionsInfo.length) {
      sectionsInfo[i].end = sectionsInfo[i + 1].start
    } else {
      sectionsInfo[i].end = allRows.length
    }
  }

  // ── PASS 3: Parse each section ──
  const sections = new Map<string, SectionData>()
  const allItemsList: SOARecord[] = []

  for (const sec of sectionsInfo) {
    const secName = sec.name
    const start = sec.start
    const end = sec.end

    let header = masterHeader
    let headerIdx = masterHeaderIdx
    let colMap: Record<string, number> = {}

    // Check if section has its own header row
    for (let offset = 1; offset <= 3; offset++) {
      const ri = start + offset
      if (ri >= end) break
      if (isHeaderRow(allRows[ri] as (string | number | null)[])) {
        header = normaliseHeader(allRows[ri] as (string | number | null)[])
        headerIdx = ri
        break
      }
    }

    if (header) {
      colMap = mapColumns(header)
    }

    let amtIdx = colMap.amount ?? null
    if (amtIdx == null && header) {
      amtIdx = findAmountCol(header)
      if (amtIdx != null) colMap.amount = amtIdx
    }

    const dataRows: SOARecord[] = []
    const totals: Record<string, number> = {}
    const dataStart = headerIdx != null && headerIdx >= start ? headerIdx + 1 : start + 1

    for (let ri = dataStart; ri < end; ri++) {
      const row = allRows[ri] as (string | number | null)[]

      // Check for summary row
      const summaryType = isSummaryRow(row)
      if (summaryType) {
        for (const v of row) {
          const amt = coerceAmount(v)
          if (amt != null) {
            totals[summaryType] = amt
            break
          }
        }
        continue
      }

      // Skip section headers or sub-headers
      if (isSectionHeader(row, maxCol)) continue
      if (isHeaderRow(row)) {
        header = normaliseHeader(row)
        colMap = mapColumns(header!)
        amtIdx = colMap.amount ?? null
        if (amtIdx == null && header) {
          amtIdx = findAmountCol(header)
          if (amtIdx != null) colMap.amount = amtIdx
        }
        continue
      }

      // Must have at least an amount to be a data row
      let amtVal: number | null = null
      if (amtIdx != null && amtIdx < row.length) {
        amtVal = coerceAmount(row[amtIdx])
      }
      // Fallback: scan for a plausible amount
      if (amtVal == null) {
        for (let ci = 0; ci < row.length; ci++) {
          const a = coerceAmount(row[ci])
          if (a != null && Math.abs(a) > 0.01) {
            if (Math.abs(a) > 100 || (colMap.days_late != null && ci !== colMap.days_late)) {
              amtVal = a
              break
            }
          }
        }
      }

      if (amtVal == null) continue

      const get = (key: string, coerce: "str" | "float" | "date" | "int" = "str") => {
        const ci = colMap[key]
        if (ci == null || ci >= row.length) return null
        const v = row[ci]
        if (v == null) return null
        if (coerce === "float") return coerceAmount(v)
        if (coerce === "date") return coerceDate(v)
        if (coerce === "int") return coerceInt(v)
        return String(v).trim()
      }

      const record: SOARecord = {
        Section: secName,
        Amount: amtVal,
        Company: get("company") as string | null,
        Account: get("account") as string | null,
        Reference: get("reference") as string | null,
        "Document Date": get("doc_date", "date") as Date | null,
        "Due Date": get("due_date", "date") as Date | null,
        Currency: get("currency") as string | null,
        Text: get("text") as string | null,
        Assignment: get("assignment") as string | null,
        "R-R Comments": get("rr_comments") as string | null,
        "Action Owner": get("action_owner") as string | null,
        "Days Late": get("days_late", "int") as number | null,
        "Customer Comments": get("customer_comments") as string | null,
        Status: get("status") as string | null,
        "PO Reference": get("po_reference") as string | null,
        "LPI Cumulated": get("lpi_cumulated") as string | null,
        Type: get("type") as string | null,
        "Document No": get("doc_no") as string | null,
        "Interest Method": get("interest_method") as string | null,
        "Customer Name": get("customer_name") as string | null,
        "Entry Type": amtVal < 0 ? "Credit" : "Charge",
      }

      // Auto-compute Days Late from Due Date
      if (record["Days Late"] == null && record["Due Date"] != null) {
        const due = record["Due Date"]
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        if (due < today) {
          record["Days Late"] = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
        } else {
          record["Days Late"] = 0
        }
      }

      // Derive Status field
      if (!record.Status) {
        const statusKeywords = [
          "ready for payment", "under approval", "under review",
          "dispute", "ongoing", "et to process", "payment pending",
          "invoice sent", "credit note", "approved",
          "transfer", "invoice approved", "pending for payment",
        ]
        for (const field of ["R-R Comments", "Action Owner", "Customer Comments"] as const) {
          const fv = record[field]
          if (fv && statusKeywords.some((kw) => fv.toLowerCase().includes(kw))) {
            record.Status = fv
            break
          }
        }
      }
      if (!record.Status) {
        const rrc = record["R-R Comments"]
        if (rrc) record.Status = rrc
      }

      dataRows.push(record)
      allItemsList.push(record)
    }

    sections.set(secName, { header: header || [], colmap: colMap, rows: dataRows, totals })
  }

  // ── Grand totals ──
  const grand: GrandTotals = {
    total_charges: 0,
    total_credits: 0,
    net_balance: 0,
    item_count: 0,
    total_overdue: 0,
    section_totals: {},
    section_overdue: {},
    available_credits: {},
  }

  for (const [secName, secData] of sections.entries()) {
    for (const [k, v] of Object.entries(secData.totals)) {
      if (k.includes("total overdue")) {
        grand.total_overdue = v
      } else if (k.includes("overdue")) {
        grand.section_overdue![secName] = v
      } else if (k.includes("available credit")) {
        grand.available_credits![secName] = v
      } else if (k.includes("total")) {
        grand.section_totals![secName] = v
      }
    }
  }

  if (allItemsList.length > 0) {
    grand.total_charges = allItemsList.filter((r) => r.Amount > 0).reduce((s, r) => s + r.Amount, 0)
    grand.total_credits = allItemsList.filter((r) => r.Amount < 0).reduce((s, r) => s + r.Amount, 0)
    grand.net_balance = allItemsList.reduce((s, r) => s + r.Amount, 0)
    grand.item_count = allItemsList.length
    if (!grand.total_overdue) {
      const overdueSum = Object.values(grand.section_overdue || {}).reduce((s, v) => s + v, 0)
      if (overdueSum) grand.total_overdue = overdueSum
    }
  }

  return { metadata, sections, all_items: allItemsList, grand_totals: grand }
}

// ── Helpers ────────────────────────────────────────────────────

export function fmtCurrency(val: number | null | undefined, short = false): string {
  if (val == null || isNaN(val)) return "\u2014"
  const neg = val < 0
  const av = Math.abs(val)
  let s: string
  if (short && av >= 1_000_000) {
    s = `$${(av / 1_000_000).toFixed(2)}M`
  } else if (short && av >= 1_000) {
    s = `$${(av / 1_000).toFixed(1)}K`
  } else {
    s = `$${av.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  return neg ? `-${s}` : s
}

export function agingBucket(days: number | null | undefined): string {
  if (days == null || isNaN(days)) return "Unknown"
  const d = Math.round(days)
  if (d <= 0) return "Current"
  if (d <= 30) return "1-30 Days"
  if (d <= 60) return "31-60 Days"
  if (d <= 90) return "61-90 Days"
  if (d <= 180) return "91-180 Days"
  return "180+ Days"
}

export const AGING_ORDER = [
  "Current", "1-30 Days", "31-60 Days", "61-90 Days", "91-180 Days", "180+ Days", "Unknown",
]

export const AGING_COLORS: Record<string, string> = {
  "Current": "#2E7D32",
  "1-30 Days": "#66BB6A",
  "31-60 Days": "#F9A825",
  "61-90 Days": "#EF6C00",
  "91-180 Days": "#D32F2F",
  "180+ Days": "#B71C1C",
  "Unknown": "#9E9E9E",
}

export const SECTION_COLOURS = [
  "#10069F", "#1565C0", "#5E35B1", "#00838F", "#C62828", "#EF6C00", "#2E7D32", "#6A1B9A",
]

export function formatDate(d: Date | null | undefined): string {
  if (!d) return "\u2014"
  const day = String(d.getDate()).padStart(2, "0")
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

// ── Merge helper (multi-file) ──────────────────────────────────

export interface MergedData {
  df_all: SOARecord[]
  merged_sections: Map<string, SectionData>
  merged_grand: GrandTotals
  all_metadata: SOAMetadata[]
}

export function mergeParsedFiles(
  parsedFiles: Map<string, ParsedSOA>,
  selectedSources: string[]
): MergedData {
  const frames: SOARecord[] = []
  const mergedSections = new Map<string, SectionData>()
  const allMetadata: SOAMetadata[] = []
  const multi = selectedSources.length > 1

  for (const fname of selectedSources) {
    const data = parsedFiles.get(fname)!
    allMetadata.push(data.metadata)
    for (const item of data.all_items) {
      frames.push({ ...item, "Source File": fname })
    }
    for (const [secName, secData] of data.sections.entries()) {
      const key = multi ? `${fname} - ${secName}` : secName
      mergedSections.set(key, {
        ...secData,
        rows: secData.rows.map((r) => ({ ...r, "Source File": fname })),
      })
    }
  }

  const mergedGrand: GrandTotals = {
    total_charges: 0,
    total_credits: 0,
    net_balance: 0,
    item_count: 0,
    total_overdue: 0,
    section_totals: {},
    section_overdue: {},
  }

  if (frames.length > 0) {
    mergedGrand.total_charges = frames.filter((r) => r.Amount > 0).reduce((s, r) => s + r.Amount, 0)
    mergedGrand.total_credits = frames.filter((r) => r.Amount < 0).reduce((s, r) => s + r.Amount, 0)
    mergedGrand.net_balance = frames.reduce((s, r) => s + r.Amount, 0)
    mergedGrand.item_count = frames.length

    let totalOverdue = 0
    for (const fname of selectedSources) {
      const g = parsedFiles.get(fname)!.grand_totals
      for (const [sn, sv] of Object.entries(g.section_totals || {})) {
        const k = multi ? `${fname} - ${sn}` : sn
        mergedGrand.section_totals![k] = (mergedGrand.section_totals![k] || 0) + sv
      }
      for (const [sn, sv] of Object.entries(g.section_overdue || {})) {
        const k = multi ? `${fname} - ${sn}` : sn
        mergedGrand.section_overdue![k] = (mergedGrand.section_overdue![k] || 0) + sv
      }
      totalOverdue += g.total_overdue || 0
    }
    mergedGrand.total_overdue = totalOverdue || mergedGrand.net_balance
  }

  return {
    df_all: frames,
    merged_sections: mergedSections,
    merged_grand: mergedGrand,
    all_metadata: allMetadata,
  }
}
