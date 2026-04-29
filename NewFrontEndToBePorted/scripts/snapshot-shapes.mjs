#!/usr/bin/env node
/**
 * scripts/snapshot-shapes.mjs
 *
 * Uploads every workbook in V7/New info/ to the running Flask backend
 * and validates the response against the structural expectations in
 * lib/types.ts. Prints a PASS / WARN / FAIL report per file so silent
 * field renames or coverage drops surface before users hit them.
 *
 * Usage:
 *   # Make sure Flask is running on http://localhost:5000 first
 *   node scripts/snapshot-shapes.mjs
 *
 *   # Override defaults via env:
 *   API_BASE=http://localhost:5000 \
 *   APP_PASSWORD=rollsroyce \
 *   FILES_DIR='../New info' \
 *   node scripts/snapshot-shapes.mjs
 */

import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const API_BASE = process.env.API_BASE || "http://localhost:5000"
const PASSWORD = process.env.APP_PASSWORD || "rollsroyce"
const FILES_DIR = process.env.FILES_DIR
  ? path.resolve(process.env.FILES_DIR)
  : path.resolve(__dirname, "..", "..", "New info")

/* ─── Expected top-level shape per file_type ─────────────────────────
 * `required` keys must exist; `optional` may be present. Each value is
 * a primitive type tag — "object", "array", "string", "number", "any".
 */
const SHAPES = {
  SOA: {
    required: {
      file_type: "string",
      metadata: "object",
      sections: "array",
      grand_totals: "object",
      aging_buckets: "object",
    },
    optional: { summary_sheet: "object", all_sheets: "array", errors: "array" },
    aging_keys: ["current", "1_30_days", "31_60_days", "61_90_days", "91_180_days", "over_180_days"],
    grand_totals_keys: ["total_overdue", "total_credits", "net_balance"],
  },
  INVOICE_LIST: {
    required: { file_type: "string", metadata: "object", items: "array", totals: "object" },
    optional: { errors: "array" },
    totals_keys: ["total_amount", "total_positive", "total_negative", "item_count"],
  },
  OPPORTUNITY_TRACKER: {
    required: {
      file_type: "string",
      metadata: "object",
      opportunities_by_level: "object",
      summary: "object",
    },
    optional: { opps_and_threats: "object", timeline: "object", project_summary: "object", cover: "object" },
    levels: ["Hopper", "ICT", "Contract"],
  },
  GLOBAL_HOPPER: {
    required: { file_type: "string", metadata: "object", opportunities: "array", summary: "object" },
    summary_keys: [
      "total_opportunities",
      "by_region",
      "by_status",
      "pipeline_stages",
      "total_crp_term_benefit",
      "total_profit_2026",
      "total_profit_2027",
    ],
  },
  SHOP_VISIT_HISTORY: {
    required: {
      file_type: "string",
      metadata: "object",
      shop_visits: "array",
      maintenance_actions: "array",
      current_status: "array",
      statistics: "object",
    },
    statistics_keys: [
      "total_shop_visits",
      "total_maintenance",
      "total_engines_tracked",
      "sv_types",
      "sv_locations",
    ],
  },
  SVRG_MASTER: {
    required: { file_type: "string", metadata: "object", claims_summary: "object", event_entries: "object" },
    optional: { available_sheets: "object" },
    claims_keys: ["claims", "total_claims", "total_credit_value"],
    events_keys: ["events", "total_events", "qualifications", "guarantee_types"],
  },
  COMMERCIAL_PLAN: {
    required: {
      file_type: "string",
      metadata: "object",
      one_year_plan: "object",
      five_year_spe_sales: "object",
      annual_summary: "object",
    },
    optional: { errors: "array" },
  },
  EMPLOYEE_WHEREABOUTS: {
    required: {
      file_type: "string",
      metadata: "object",
      employees: "array",
      whereabouts: "object",
      legend: "object",
      aggregates: "object",
    },
    optional: { errors: "array" },
  },
}

/* ─── Validators ─────────────────────────────────────────────────── */

function tagOf(v) {
  if (v === null) return "null"
  if (Array.isArray(v)) return "array"
  return typeof v
}

function checkShape(parsed) {
  const issues = []
  const ftype = parsed?.file_type
  if (!ftype) return { ftype: "?", issues: ["missing top-level file_type"] }
  const spec = SHAPES[ftype]
  if (!spec) return { ftype, issues: [`no shape spec for ${ftype} — add one to SHAPES`] }

  for (const [key, expected] of Object.entries(spec.required)) {
    if (!(key in parsed)) {
      issues.push(`missing required key '${key}' (expected ${expected})`)
      continue
    }
    const got = tagOf(parsed[key])
    if (expected !== "any" && got !== expected) {
      issues.push(`'${key}' is ${got}, expected ${expected}`)
    }
  }

  // Per-type sub-shape checks
  if (ftype === "SOA") {
    for (const k of spec.aging_keys) {
      if (parsed.aging_buckets && !(k in parsed.aging_buckets)) {
        issues.push(`aging_buckets missing '${k}'`)
      }
    }
    for (const k of spec.grand_totals_keys) {
      if (parsed.grand_totals && !(k in parsed.grand_totals)) {
        issues.push(`grand_totals missing '${k}'`)
      }
    }
  }
  if (ftype === "INVOICE_LIST") {
    for (const k of spec.totals_keys) {
      if (parsed.totals && !(k in parsed.totals)) issues.push(`totals missing '${k}'`)
    }
  }
  if (ftype === "OPPORTUNITY_TRACKER" && parsed.opportunities_by_level) {
    for (const lvl of spec.levels) {
      if (!(lvl in parsed.opportunities_by_level)) {
        issues.push(`opportunities_by_level missing '${lvl}'`)
      }
    }
  }
  if (ftype === "GLOBAL_HOPPER" && parsed.summary) {
    for (const k of spec.summary_keys) {
      if (!(k in parsed.summary)) issues.push(`summary missing '${k}'`)
    }
  }
  if (ftype === "SHOP_VISIT_HISTORY" && parsed.statistics) {
    for (const k of spec.statistics_keys) {
      if (!(k in parsed.statistics)) issues.push(`statistics missing '${k}'`)
    }
  }
  if (ftype === "SVRG_MASTER") {
    if (parsed.claims_summary) {
      for (const k of spec.claims_keys) {
        if (!(k in parsed.claims_summary)) issues.push(`claims_summary missing '${k}'`)
      }
    }
    if (parsed.event_entries) {
      for (const k of spec.events_keys) {
        if (!(k in parsed.event_entries)) issues.push(`event_entries missing '${k}'`)
      }
    }
  }

  return { ftype, issues }
}

/* ─── HTTP helpers ───────────────────────────────────────────────── */

let cookieJar = ""

async function login() {
  const res = await fetch(`${API_BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`login failed (${res.status}): ${txt}`)
  }
  // Capture the Flask session cookie so subsequent requests include it.
  const setCookie = res.headers.get("set-cookie")
  if (!setCookie) throw new Error("login succeeded but no Set-Cookie header — backend misconfigured")
  cookieJar = setCookie
    .split(",")
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ")
}

async function uploadOne(filePath) {
  const buf = await fs.readFile(filePath)
  const base = path.basename(filePath)
  const fd = new FormData()
  fd.append("file", new Blob([buf]), base)
  const res = await fetch(`${API_BASE}/api/upload`, {
    method: "POST",
    headers: { Cookie: cookieJar },
    body: fd,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`upload failed (${res.status}): ${text.slice(0, 200)}`)
  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`upload returned non-JSON: ${text.slice(0, 200)}`)
  }
  // /api/upload may return either {files:{name:parsed}} or a flat {filename, file_type, parsed}
  if (body.files && typeof body.files === "object" && !Array.isArray(body.files)) {
    return Object.values(body.files)[0]
  }
  if (Array.isArray(body.files) && body.files[0]) {
    return body.files[0].parsed
  }
  if (body.parsed) return body.parsed
  return body
}

/* ─── Main ───────────────────────────────────────────────────────── */

async function main() {
  console.log(`📁 Files dir : ${FILES_DIR}`)
  console.log(`🌐 API base  : ${API_BASE}`)
  console.log("")

  await login()
  console.log("🔐 logged in\n")

  const entries = await fs.readdir(FILES_DIR)
  const xlsxFiles = entries.filter((f) => /\.(xlsx|xls|xlsb|xlsm)$/i.test(f)).sort()
  if (xlsxFiles.length === 0) {
    console.log(`No spreadsheet files found in ${FILES_DIR}`)
    return
  }

  let pass = 0
  let warn = 0
  let fail = 0

  for (const fname of xlsxFiles) {
    const fpath = path.join(FILES_DIR, fname)
    process.stdout.write(`⏳ ${fname} … `)
    try {
      const parsed = await uploadOne(fpath)
      const { ftype, issues } = checkShape(parsed)
      if (issues.length === 0) {
        console.log(`✅ PASS  (${ftype})`)
        pass++
      } else {
        console.log(`⚠️  WARN  (${ftype}) — ${issues.length} issue${issues.length === 1 ? "" : "s"}`)
        for (const msg of issues) console.log(`     · ${msg}`)
        warn++
      }
    } catch (err) {
      console.log(`❌ FAIL  ${err.message}`)
      fail++
    }
  }

  console.log("")
  console.log(`Summary: ${pass} pass · ${warn} warn · ${fail} fail`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error("\n💥 harness error:", err)
  process.exit(2)
})
