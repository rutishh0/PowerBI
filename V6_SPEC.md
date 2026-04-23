# V6 — Rolls-Royce Civil Aerospace Dashboard (Backend + Behavior Spec)

> A single-document, end-to-end contract of the V6 Flask backend, its parsers, its AI chat subsystem, its PDF export subsystem, the data model, and the behaviors the frontend must implement.
>
> This document is written both as an internal engineering spec and as the source material for regenerating the frontend with an AI UI builder (v0, Lovable, etc). It intentionally describes **what** must be on screen and **what data** drives each element — never the visual styling. The AI UI builder picks the visual design; this document fixes the feature surface, contracts, and behaviors.
>
> **Canonical location of the code described here:** `V6/`
> - `server.py` — Flask routes + session state
> - `parser.py` — universal Rolls-Royce Excel parser (6 file types) + legacy SOA parser
> - `pdf_export.py` — three PDF report generators (SOA / Opp / Hopper)
> - `ai_chat.py` — multi-LLM router and system-prompt builder
> - `storage.py` — Postgres + Cloudflare R2 helpers
> - `templates/index.html` — SPA shell (login-gated)
> - `templates/login.html` — login page
> - `static/js/app.js` — controller (upload, view switching, chat, export)
> - `static/js/dashboard.js` — chart library (ApexCharts wrappers) + per-file-type visualizers

---

## Table of Contents

1. Purpose and context
2. System architecture
3. Authentication
4. File upload flow
5. R2 multipart upload flow
6. File types — per-type parser outputs and dashboard features
    - 6.1 SOA (Statement of Account)
    - 6.2 INVOICE_LIST
    - 6.3 OPPORTUNITY_TRACKER (MEA)
    - 6.4 SHOP_VISIT_HISTORY
    - 6.5 SVRG_MASTER
    - 6.6 GLOBAL_HOPPER
    - 6.7 UNKNOWN / ERROR fallbacks
7. Dashboard view modes
8. AI chat subsystem
9. PDF export subsystem
10. API reference
11. Data model
12. Environment variables
13. Feature flags
14. Frontend features spec (for the UI builder)
15. Non-functional requirements
16. Known rough edges not to reproduce
17. Prompt recommendations for the UI builder

---

## 1. Purpose and context

### 1.1 What this app is

The V6 "Rolls-Royce Civil Aerospace Data Visualizer" is a password-gated internal Flask single-page web app for analyzing and visualizing six known Rolls-Royce Civil Aerospace finance/operations spreadsheets. Users upload Excel workbooks (or PDFs, Word docs, PowerPoint decks, and images); the backend detects the file type, parses it into a canonical JSON shape, and exposes the result to a browser UI that:

- Renders file-type-specific KPI cards, charts, and filterable tables.
- Lets the user switch between Standard / Executive / Slides / Compare / AI views.
- Supports an AI chat assistant grounded in the uploaded data (multi-LLM, multimodal).
- Generates branded PDF reports server-side (three variants: SOA, Opportunity Tracker, Global Hopper).
- Archives files to PostgreSQL (inline BYTEA) and/or Cloudflare R2 (chunked multipart).

The UI explicitly presents this as a **fictional / sample-data tool** ("Rutish Airways" and "Ethiopian" test data). The AI chat page carries an "Experimental Feature — non-compliant tool. Use at your own risk" disclaimer.

### 1.2 Who uses it

- Rolls-Royce Civil Aerospace finance / commercial / aftermarket teams who receive workbooks like:
  - Customer **Statements of Account** (SOAs)
  - Quarterly **Invoice Lists** (EPI open-items)
  - **MEA Profit Opportunities Tracker** workbooks
  - **Global Commercial Optimisation Hopper** workbooks
  - Trent engine **Shop Visit History** reports
  - Trent 900 **SVRG Master** guarantee administration files

The app is for internal use only ("ROLLS-ROYCE CIVIL AEROSPACE — For internal use only" appears in the PDF footers and page footers).

### 1.3 Domain glossary (quote verbatim)

Quote these terms verbatim in the UI — do not paraphrase.

- **TotalCare** — an RR long-term service agreement; a charge category in SOAs.
- **CRC** — Customer Responsible Charges; an SOA section.
- **LPI** — Late Payment Interest. "LPI Rate" is the percentage rate; "LPI Cumulated" is accumulated LPI on a line item.
- **CRP** — Contract Risk Profile / Contract Review Point (context-dependent; frontend should treat "CRP Term Benefit" and "CRP Margin" as opaque financial metrics).
- **EVS** — Engine Value Stream. "Top Level EVS" is the rollup category.
- **RATA** — an invoice/arrangement timing concept; appears as a date column in legacy SOA.
- **SVRG / eSVRG** — Service Value Reliability Guarantee / enhanced SVRG. Trent 900 guarantee administration uses these terms.
- **HPTB** — High Pressure Turbine Blade (appears in SVRG context).
- **ZRE / ZRA / ZRI** — SAP-style document type codes used in SOA `Type` columns (keep as opaque text).
- **Trent family** — engine models: Trent XWB-84, Trent XWB-97, Trent 1000, Trent 500, Trent 700, Trent 7000, RB211. Part numbers in Shop Visit files are typically prefixed with the engine model.
- **Hopper** — Global Commercial Optimisation Hopper (GBP-denominated opportunity register).
- **Opp / MEA Tracker** — MEA Profit Opportunities Tracker (USD-denominated regional opportunity log).
- **MEA** — Middle East & Africa region.
- **Away Day Date** — governance meeting date referenced in the MEA tracker metadata.
- **ICT** — Internal Cost Team (an estimation level in the Opp Tracker).
- **L2 / L3** — estimation level sheets: L2 = ICT-evaluated estimates, L3 = Contract-level estimates. MEA LOG / Opp Log = Hopper (account-management-level) estimates.
- **5YP** — Five-Year Plan (years 2025–2029 typically).
- **KAM Pack** — Key Account Management pack.
- **ESN** — Engine Serial Number (Trent 900 ESNs are typically 5-digit `9xxxx`).

---

## 2. System architecture

### 2.1 Stack

- **Web framework**: Flask 3.x
- **WSGI server**: gunicorn (production) or `app.run()` (dev)
- **CORS**: `flask-cors` with wide-open default (`CORS(app)` — no origin restriction)
- **Parsing**: `pandas`, `openpyxl`, `pypdf`, `python-docx`, `python-pptx`, `numpy`
- **PDFs**: `fpdf2` (Helvetica only) + `matplotlib` (Agg backend) for chart strips in Opp/Hopper reports
- **Database**: PostgreSQL via `psycopg2-binary` with a `ThreadedConnectionPool` (min=1, max=20)
- **Object storage**: Cloudflare R2 via `boto3` (S3-compatible), `signature_version='s3v4'`, `region_name='auto'`
- **LLMs**: OpenRouter (Qwen 3 VL 235B default), DigitalOcean GenAI (GPT-oss-120b), NVIDIA (Kimi K2.5 streaming), Google Vertex AI (GLM-5 via service account), Google Gemini 3 Pro Preview (google-genai SDK)
- **Frontend**: Jinja-rendered HTML + vanilla JS (no framework), ApexCharts 3.49, Lucide icons, GSAP + ScrollTrigger for entrance animations, DM Sans / Plus Jakarta Sans / JetBrains Mono Google Fonts.

### 2.2 Process flow: request lifecycle

```
Browser
  │  (multipart/form-data OR base64-in-JSON)
  ▼
Flask route (server.py)
  │  @login_required (checks session["authenticated"])
  │  Parses request body
  ▼
parser.parse_file(BytesIO, filename=...)
  │  _load_workbook()   → dict[sheet_name] = DataFrame (header=None, dtype=object)
  │  detect_file_type() → score-based detection
  │  dispatch to _parse_<type>()
  ▼
_sanitize_for_json(result)   # NaN → None, datetime → ISO, numpy → Python
  ▼
JSON response  +  stored in _parsed_store[sid][filename]
  ▼
Browser (app.js) calls RRVisualizer.renderVisualizer(filesData, container)
  │  Switches on file_type
  │  Calls one of _renderSOA / _renderInvoiceList / _renderOpportunityTracker /
  │                _renderGlobalHopper / _renderShopVisit / _renderSVRG /
  │                _renderUnknown / _renderError
```

### 2.3 Process boundaries / in-memory state

Two global dicts in `server.py` hold per-session state (in-process memory — **not Redis**):

```python
_parsed_store   = {}   # { sid: { filename: {type, file_type, parsed, file_bytes} } }
_chat_history   = {}   # { sid: [ {role, content}, ... ] }
_multipart_sessions = {}   # { session_upload_id: {r2_key, r2_upload_id, parts[], filename, total, file_size, created} }
```

This has important consequences:
- **Does not survive restart.**
- **Does not work with multiple gunicorn workers** (sessions stick to whichever worker the upload hit).
- The app is therefore best run single-worker (`-w 1`) in production.

### 2.4 Deployment: Render.com

- Persistent PG database at `dpg-d70dc76uk2gs7398bptg-a.oregon-postgres.render.com` (credentials checked into `.env` — see §16).
- Cloudflare R2 bucket `power` at `c9efa18147ff521ba12611483eeb9ef3.r2.cloudflarestorage.com`.
- The service is "srv-d69b4m14tr6s73ciadc0" in the user's Render account.
- `run.bat` runs `python server.py 2>&1` locally. In production, `gunicorn server:app` is expected (not captured in repo; inferred from `gunicorn>=21.2.0` in `requirements.txt`).

### 2.5 `MAX_CONTENT_LENGTH`

`app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024` (50 MB). The R2 chunked path was designed so each chunk's base64-inflated JSON request stays within this cap (8 MB raw × 1.33 ≈ 10.6 MB + overhead).

---

## 3. Authentication

### 3.1 Password gate

Single shared password, no user accounts.

- **Env var**: `APP_PASSWORD` (default `"rollsroyce"` if unset — see `server.py` L158).
- **Mechanism**: Flask session cookie. When the password matches, `session["authenticated"] = True`.
- **Decorator**: Every protected route wears `@login_required`, which redirects unauthenticated requests to `/login`.

### 3.2 Session key

```python
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "rr-soa-dashboard-" + uuid.uuid4().hex[:8])
```

If `FLASK_SECRET_KEY` is unset, a random key is generated **per process start** — which invalidates all existing sessions every restart. Production MUST set `FLASK_SECRET_KEY` to a stable value.

### 3.3 `_get_session_id()`

All per-session dict keys come from:

```python
def _get_session_id():
    if "sid" not in session:
        session["sid"] = uuid.uuid4().hex
    return session["sid"]
```

A new `sid` is minted the first time any protected route is hit after login.

### 3.4 Login endpoints

| Route | Method | Behavior |
|---|---|---|
| `/login` | GET | Renders `login.html` |
| `/login` | POST | Compares `request.form.get("password")` against `APP_PASSWORD`; sets `session["authenticated"] = True`; redirects to `/`. On failure re-renders login with `error="Invalid access code"` |
| `/logout` | GET | `session.clear()`; redirect to `/login` |

### 3.5 A secondary admin password (frontend-only)

The frontend has a second password gate in `app.js` (`PASSWORD = 'ChickenMan123'`) that unlocks the "Files" tab and the "Secret Chat" floating button. This is **client-side only** and offers no real security — documented here so the v0 redesign preserves the behavior.

---

## 4. File upload flow

### 4.1 Supported file formats (inline parse path)

Excel: `.xlsx`, `.xls`, `.xlsb`, `.xlsm` — parsed by `parser.parse_file()` and dispatched to one of six type-specific parsers.

Non-Excel: also accepted for AI-chat context only (no dashboard rendering):
- `.pdf` — extracted via `pypdf`, text stored.
- `.docx` — extracted via `python-docx`, text stored.
- `.pptx` — extracted via `python-pptx`, text stored (per-slide with `[Slide N]` headers).
- `.png`, `.jpg`, `.jpeg`, `.webp`, `.heic`, `.heif`, `.gif` — stored as base64 for multimodal AI.

Anything else: rejected with `{"file": name, "error": "Unsupported file type."}`.

### 4.2 Two upload paths

`/api/upload` accepts **either**:

**Path A — multipart/form-data** (browsers' native file upload):

```
POST /api/upload
Content-Type: multipart/form-data; boundary=...

files=@file1.xlsx
files=@file2.xlsx
```

**Path B — base64-in-JSON** (NetSkope bypass — primary path used by the frontend):

```
POST /api/upload
Content-Type: application/json

{
  "files": [
    { "name": "ETH SOA.xlsx", "data": "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,UEsDBBQAA..." },
    { "name": "another.xlsx", "data": "<base64 without data: prefix>" }
  ]
}
```

The `data:` header is optional and stripped. The server base64-decodes each payload. If decoding fails, that file is silently skipped.

`server.py` checks JSON first (L183–L199); if no files came via JSON **and** the request has a `files` field in `request.files`, it falls back to multipart (L202–L205). Mixing both paths in one request is not supported — JSON wins.

### 4.3 Per-file processing inside `/api/upload`

For each file:

1. Save raw bytes to Postgres `file_uploads` table via `save_file_to_db(fname, bytes, sid)` (fire-and-forget — failures logged but not returned).
2. Dispatch by extension:
   - Excel → `parse_file(BytesIO, filename=fname)` → `_sanitize_for_json()` → result stored under `_parsed_store[sid][fname]` with `type="excel"` and `file_type=<detected>`.
   - PDF → `pypdf.PdfReader` → concatenated page text → `type="pdf"`, raw `file_bytes` retained (enables Gemini native PDF reading).
   - DOCX → `docx.Document` → paragraphs joined with `\n` → `type="docx"`.
   - PPTX → per-slide text+table extraction, joined with `[Slide N]\n...` headers → `type="pptx"`.
   - Image → base64 string + `mime` (`image/png` or `image/jpeg` inferred from extension, with `.jpeg`/`.jpg`/`.heic`/`.heif`/`.webp`/`.gif` all mapped to `image/jpeg` in the current code — see §16) → `type="image"`.

3. Append any exceptions to the `errors` list; continue with remaining files (partial success is fine).

### 4.4 Response shape

**Success (200)**:

```json
{
  "files": {
    "ETH SOA.xlsx": {
      "file_type": "SOA",
      "metadata": { ... },
      "sections": [ ... ],
      "grand_totals": { ... },
      "aging_buckets": { ... },
      "summary_sheet": { ... },
      "all_sheets": [ ... ],
      "errors": []
    },
    "report.pdf": {
      "text_preview": "First 200 chars..."
    }
  },
  "errors": [
    { "file": "broken.xls", "error": "..." }
  ] // or null
}
```

**Failure (400)**:
- `{"error": "No files provided"}` if both paths yielded zero files.
- `{"error": "All files failed to process", "details": [...]}` if every file raised.

### 4.5 Storage fan-out

Every upload is double-stored:
1. **`_parsed_store[sid][fname]`** — in-memory for dashboard rendering, PDF export, AI chat grounding.
2. **Postgres `file_uploads`** — inline BYTEA copy (via `save_file_to_db`) for later retrieval through the `/api/files/*` endpoints.

R2 is only populated via the dedicated multipart endpoints (§5), not `/api/upload`.

---

## 5. R2 multipart upload flow

### 5.1 Purpose

Handle files larger than Flask's 50 MB inline cap by streaming 8 MB chunks to R2 as S3 multipart parts, bypassing any in-memory reassembly on the server.

### 5.2 Protocol

**Step 1 — initialize**:

```
POST /api/r2/chunk-init
Body: { "filename": "big.xlsx", "total_chunks": 12 }
Response: { "upload_id": "<hex32>" }
```

Server allocates an R2 key (`uploads/YYYY-MM/<hex12>_<safe_filename>`), opens an R2 multipart upload, and stores session state in `_multipart_sessions[session_id]`.

**Step 2 — upload each chunk (1-based index `chunk_index` sent as 0-based from JS)**:

```
POST /api/r2/chunk-upload
Body: { "upload_id": "...", "chunk_index": 0, "data": "<base64 chunk>" }
Response: { "received": 1, "total": 12 }
```

Server base64-decodes, streams directly to R2 via `upload_part(r2_key, r2_upload_id, part_number=chunk_index+1, bytes)`, records the returned ETag. Garbage-collects the decoded buffer immediately.

**Step 3 — finalize**:

```
POST /api/r2/chunk-finalize
Body: { "upload_id": "..." }
Response: { "id": 123, "filename": "big.xlsx", "r2_key": "...", "public_url": "...", "file_size": 104857600 }
```

Server verifies all parts received, sorts them by PartNumber, calls `complete_multipart_upload`, saves metadata to `r2_file_uploads` Postgres table, and returns the row ID.

If any part is missing the server aborts the R2 multipart upload and returns 400.

### 5.3 Chunk size

Frontend: `CHUNK_SIZE = 8 * 1024 * 1024` (8 MB). Base64 overhead × 1.33 ≈ 10.6 MB per request — comfortably under the 50 MB `MAX_CONTENT_LENGTH`.

### 5.4 R2 key format

```
uploads/YYYY-MM/<12-char hex UUID>_<original filename, spaces→_, /→_, \→_>
```

Example: `uploads/2026-04/7f3a9b2c8d1e_Global_Hopper_v2.xlsx`.

### 5.5 R2 bucket layout

All uploads live under the single `uploads/` prefix. There is no per-user partition — the `session_id` is stored in the `r2_file_uploads` Postgres row, not in the key. Key collisions are avoided by the 12-char UUID.

---

## 6. File types

The universal parser supports six recognized types plus `UNKNOWN` and `ERROR` fallbacks. Detection is scoring-based (parser.py L164–L257).

### 6.0 Type detection

Scores each known type based on:

1. **Sheet-name hard boosts** (+8): e.g. a sheet called `SoA` → SOA; `MEA LOG`, `L2`, `L3` → OPPORTUNITY_TRACKER; `GLOBAL LOG` → GLOBAL_HOPPER; `MENU`, `CLAIMS SUMMARY`, `EVENT ENTRY` → SVRG_MASTER; `report page*` → SHOP_VISIT.
2. **Sheet-prefix boosts** (+8): `soa ...` → SOA; `report page...` → SHOP_VISIT.
3. **Content signal scan** (+1 each): scans first 25 rows for keywords like "statement of account", "lpi rate", "totalcare charges", "reference key 3", "opp log sheet", "event item part number", "trent 900 guarantee", "commercial optimisation opportunity report".

Tie-break: if a `global log` sheet exists and `GLOBAL_HOPPER > 0`, return `GLOBAL_HOPPER` (otherwise shared sheets like `COVER`, `COUNT`, `SUM` would inflate `OPPORTUNITY_TRACKER`).

Fallback: best-scoring type, else `UNKNOWN`.

Every per-type parser exists behind this dispatcher:

```python
parse_file(source, filename, is_base64=False) → dict
# returns at minimum: { "file_type": "...", "metadata": {...}, "errors": [...] }
# always JSON-serialisable, never crashes (crashes fall back to _parse_unknown)
```

---

### 6.1 SOA (Statement of Account)

#### 6.1.1 Detection heuristics

Sheet names: `soa`, `soa summary`, `soa 26.1`, or any `soa *` prefix.
Content signals: "statement of account", "lpi rate", "customer name:", "totalcare charges", "customer responsible charges", "spare parts charges", "late payment interest", "credits usable", "total overdue".

#### 6.1.2 Parser output shape

```json
{
  "file_type": "SOA",
  "metadata": {
    "title": "Statement of Account",
    "customer_name": "Rutish Airways",
    "customer_number": "1009374",
    "contact_email": "receivables@example.com",
    "lpi_rate": 0.07,
    "report_date": "2026-04-10",
    "avg_days_late": 12.34,
    "source_file": "ETH SOA.xlsx",
    "source_sheet": "SoA 26.1"
  },
  "sections": [
    {
      "name": "TotalCare Charges",
      "section_type": "totalcare",  // one of: charges, credits, totalcare, spare_parts, lpi, crc
      "total": 1234567.89,
      "overdue": 123456.78,
      "available_credit": null,
      "items": [
        {
          "company_code": "6500",
          "account": "1009374",
          "reference": "1820146074",
          "doc_date": "2025-12-01",
          "due_date": "2026-01-30",
          "amount": 87654.32,
          "currency": "USD",
          "text": "Trent XWB-84 TotalCare Jan 2026",
          "assignment": "DEG 9054",
          "rr_comments": "Ready for payment",
          "action_owner": "Customer",
          "days_late": 0,
          "customer_comments": "Awaiting approval",
          "po_reference": "PO12345",
          "lpi_cumulated": 123.45
        }
        // ...
      ]
    }
    // ... more sections
  ],
  "grand_totals": {
    "total_overdue": 345678.90,
    "total_credits": -125000.00,   // negative; sum of all items where amount < 0
    "net_balance": 5432100.00
  },
  "summary_sheet": {
    "Total Overdue": 345678.90,
    "Available Credit": 125000.00
    // free-form label → value pairs pulled from any "Summary" sheet
  },
  "aging_buckets": {
    "current": 100000.00,
    "1_30_days": 50000.00,
    "31_60_days": 25000.00,
    "61_90_days": 10000.00,
    "91_180_days": 5000.00,
    "over_180_days": 1000.00
  },
  "all_sheets": ["Cover", "SoA 26.1", "SoA Summary"],
  "errors": []
}
```

#### 6.1.3 Section types and classification

`_classify_section(name)` maps section-header strings to a `section_type` enum:

| Substring in section name (case-insensitive) | `section_type` |
|---|---|
| contains "credit" | `credits` |
| contains "totalcare" | `totalcare` |
| contains "spare" or "parts" | `spare_parts` |
| contains "late payment", "lpi", "interest" | `lpi` |
| contains "customer responsible" or "crc" | `crc` |
| anything else | `charges` |

#### 6.1.4 Aging-bucket logic

For every row with `amount > 0` (receivable, not a credit):

| `days_late` range | bucket key |
|---|---|
| `None` or `≤ 0` | `current` |
| `1 – 30` | `1_30_days` |
| `31 – 60` | `31_60_days` |
| `61 – 90` | `61_90_days` |
| `91 – 180` | `91_180_days` |
| `> 180` | `over_180_days` |

Credits (negative amounts) are excluded from aging.

Grand-total `total_overdue` is the sum of section `overdue` values (or the explicit "Total Overdue" row if the sheet has one).

#### 6.1.5 Column aliases (dynamic column discovery)

The SOA parser first-claims columns by keyword. Field → alias list:

```python
"company_code":      ["company code", "co code", "company"],
"account":           ["account"],
"reference":         ["reference", "ref no", "doc no", "document no", "invoice no"],
"doc_date":          ["document date", "doc date", "posting date", "inv date"],
"due_date":          ["net due date", "due date", "payment date", "net due"],
"amount":            ["amount in doc", "amount", "balance", "value"],
"currency":          ["curr", "currency"],
"text":              ["text", "description", "narrative", "detail"],
"assignment":        ["assignment", "assign", "reference key 1", "ref key 1"],
"rr_comments":       ["r-r comments", "rr comments", "rr note", "comments"],
"action_owner":      ["action owner", "action", "awaiting approval", "owner"],
"days_late":         ["days late", "days overdue", "overdue days"],
"customer_comments": ["eth comments", "customer comments", "airline comments", "customer note"],
"po_reference":      ["eth po reference", "eth po", "po reference", "po ref", "purchase order", "po number"],
"lpi_cumulated":     ["lpi cumulated", "lpi cum", "cumulated lpi"],
```

If a field can't be mapped by keyword, the parser falls back to a positional default (company_code=col 0, account=col 1, reference=col 2, …, lpi_cumulated=col 14).

#### 6.1.6 Frontend must render (SOA)

Standard view inside `_renderSOA()` in `dashboard.js`:

**Header block / badge**:
- Section title "Statement of Account" (or `metadata.title`).
- Badge "SOA" on the right.

**Customer info chip bar** (chips only shown if field is non-null):
- Customer name, Customer number, Contact email, LPI Rate (displayed with % suffix), Report Date, Avg Days Late.

**KPI grid — 5 cards** (in order):
1. **Net Balance** — `totalCharges + totalCredits`. Danger color if `>= 0`, success if `< 0` (client owes money vs RR owes). Icon: wallet.
2. **Total Charges** — sum of positive amounts. Danger color. Icon: trending-up.
3. **Total Credits** — sum of negative amounts (will be negative). Success color. Icon: trending-down.
4. **Total Overdue** — sum of amounts where `days_late > 0`. Warning color. Icon: alert-triangle.
5. **Line Items** — count of rows. Neutral. Icon: list.

**Chart row — 3 charts**:
1. **Section Breakdown** — donut chart. Labels = section names. Values = `sum(abs(amount))` per section.
2. **Charges vs Credits** — stacked bar. X = section name; two series "Charges" (red) and "Credits" (green, displayed as positive magnitude).
3. **Aging Analysis** — distributed bar. Categories `['Current', '1-30', '31-60', '61-90', '91-180', '180+']`. Colors ramp from green to dark red.

**Section Details strip** — one collapsible subsection per section with header showing `{name}  {total}  {N items}`.

**Invoice Register — filterable/sortable table** with columns:
`Reference | Doc Date | Due Date | Amount | Currency | Section | Text | Days Late`.
Max 100 rows in initial render with "Showing X of Y" footer when more.

**Global filter bar** above the content:
- `section` dropdown (all distinct section names).
- `currency` dropdown (all distinct currencies).
- `min_amount` threshold input (filters `abs(amount) >= min_amount`).

Changing a filter re-runs `renderContent(filteredItems)` — all KPIs, charts, subsections, and the table recalc from the filtered set.

**Interactions**:
- Sort every column on the register table (click header).
- In-table per-column filter bar (built by `_filterableDataTable` with "Currency" and "Section" fastfilter chips).
- Expand/collapse section detail bars.

#### 6.1.7 Legacy SOA parser (backward compat)

`parser.py` also exports `parse_soa_workbook(file)`, `serialize_parsed_data(parsed)`, `aging_bucket(days)`, `fmt_currency(val, short)`, `AGING_ORDER`, `AGING_COLORS` — the V1–V4 SOA parser kept for the legacy PDF export path (see §9.1). The legacy result shape differs from the universal parser: `sections` is an `OrderedDict` keyed by section name (not a list), each entry has `header/colmap/rows/totals`; `all_items` is a flat list with `PascalCase Title` keys (`Section`, `Amount`, `Reference`, `Document Date`, `Due Date`, `Days Late`, `Status`, `Entry Type`, `R-R Comments`, `Action Owner`, `Customer Comments`, `Type`, `PO Reference`, `LPI Cumulated`, `Interest Method`, `Customer Name`). The frontend detects this via `_isLegacySOA()` and routes to the old rendering code path.

Legacy auto-derivations:
- `Days Late` is computed from `Due Date` against `metadata.report_date` (or today) if the column is missing.
- `Status` is derived from `R-R Comments`, `Action Owner`, `Customer Comments` by keyword scan (`"ready for payment"`, `"under approval"`, `"dispute"`, …).
- `Entry Type` = `"Credit"` if `Amount < 0` else `"Charge"`.

---

### 6.2 INVOICE_LIST

#### 6.2.1 Detection

Content signals: "reference key 3", "amount in doc. curr.", "net due date", "document date", "document currency".

#### 6.2.2 Parser output

```json
{
  "file_type": "INVOICE_LIST",
  "metadata": {
    "source_file": "EPI 16.02.xlsx",
    "source_sheet": "Sheet1",
    "total_items": 247,
    "currencies": ["USD", "EUR"]
  },
  "items": [
    {
      "reference": "1820146074",
      "doc_date": "2025-12-01",
      "due_date": "2026-01-30",
      "currency": "USD",
      "amount": 87654.32,
      "reference_key3": "DEG 9054",
      "text": "Trent XWB-84 TotalCare Jan 2026",
      "assignment": "DEG 9054"
    }
    // ...
  ],
  "totals": {
    "total_amount": 8421000.50,
    "total_positive": 9000000.00,
    "total_negative": -579000.50,
    "item_count": 247
  },
  "sheet_subtotals": [
    { "row_index": 48, "amount": 123456.78 }
    // Excel formatting rows with amount but no identifying fields
  ],
  "all_sheets": ["Sheet1"],
  "errors": []
}
```

#### 6.2.3 Heuristics

- Uses the largest sheet by non-null count.
- Subtotal/running-total rows (rows with an amount but `reference == doc_date == due_date == text == assignment == None`) are extracted into `sheet_subtotals` and excluded from `items`.

#### 6.2.4 Frontend must render (INVOICE_LIST)

**Header**: "Invoice List — Open Items Register", badge "EPI".

**Info chips**: Source file, Total Items count, Currencies list.

**KPI grid — 4 cards**:
1. **Total Amount** — sum of all amounts. Neutral. Icon: wallet.
2. **Receivables** — sum of positive amounts. Danger color. Icon: trending-up.
3. **Credits** — sum of negative amounts. Success color. Icon: trending-down.
4. **Line Items** — count. Neutral. Icon: hash.

**Charts — 2**:
1. **Amount by Due Date** — area chart. Series = amount grouped by `YYYY-MM` from `due_date`. Single color (blue2). Smooth curve with gradient fill.
2. **Amount Distribution** — donut chart. Two slices: "Receivables" (red) vs "Credits" (green, absolute).

**Register table**:
`Reference | Doc Date | Due Date | Amount | Currency | Text | Assignment`. Max 150 rows. Per-column fastfilter on Currency.

**Global filters**: `currency` dropdown, `min_amount` threshold.

---

### 6.3 OPPORTUNITY_TRACKER (MEA / Opp Tracker)

#### 6.3.1 Detection

Sheet names `l2`, `l3`, `mea log`, `opps and threats`, `date input`, `count`, `sum`, `timeline`, `input`, `cover`.
Content signals: "opp log sheet", "type of opportunity", "external probability", "internal complexity", "evaluation level", "term benefit", "away day date", "ict estimates", "commercial optimisation", "profit opportunities tracker", "account management evaluations", "cash reciepts" *(sic)*, "in year profit", "existing deal", "new deal", "resource prioritization", "contracting actuals", "financial criteria".

#### 6.3.2 Parser output (comprehensive)

```json
{
  "file_type": "OPPORTUNITY_TRACKER",
  "metadata": {
    "source_file": "MEA Tracker 2026Q2.xlsx",
    "away_day_date": "2026-03-15",
    "exchange_rate": null,
    "report_title": "Commercial Optimisation Opportunity Report",
    "sheets_parsed": ["MEA LOG", "L2", "L3"],
    "all_sheets": ["Cover", "Menu", "MEA LOG", "L2", "L3", "Summary", "Opps and Threats", "Date Input", "Timeline", "COUNT", "INPUT", "SUM", "Sheet1"],
    "estimation_levels": { "MEA LOG": "Hopper", "L2": "ICT", "L3": "Contract" }
  },
  "opportunities": {                       // backward-compatible flat map sheet_name → records
    "MEA LOG": [<record>, <record>, ...],
    "L2": [...],
    "L3": [...]
  },
  "opportunities_by_level": {              // new structured view, keyed by level label
    "Hopper":   { "sheet_name": "MEA LOG", "records": [...], "sums": {...} },
    "ICT":      { "sheet_name": "L2",      "records": [...], "sums": {...} },
    "Contract": { "sheet_name": "L3",      "records": [...], "sums": {...} }
  },
  "summary": {
    "total_opportunities": 127,
    "by_status":          { "Hopper": 60, "ICT": 30, "Contracting": 10, "Completed": 20, "Cancelled": 7 },
    "by_programme":       { "Trent XWB-84": 40, "Trent 1000": 30, ... },
    "by_customer":        { "Emirates": 18, "Ethiopian": 12, ... },
    "by_opportunity_type":{ "CRP Uplift": 25, "SPE Release": 10, ... },
    "total_term_benefit": 1234.56,
    "estimation_level_sums": {
      "ICT":      { "sheet_name": "L2", "count": 30, "total_term_benefit": 456.78, "total_2026": 120.0, "total_2027": 180.0, "total_sum_26_27": 300.0, "sums_from_sheet": {...} },
      "Contract": { ... },
      "Hopper":   { ... }
    }
  },
  "project_summary": { "projects": [ <project record>, ... ] },
  "opps_and_threats": { "totals": {...}, "items": [ <opportunity-threat record>, ... ] },
  "timeline": { "milestones": [ <milestone record>, ... ] },
  "customer_analytics": { "customers": [...], "sorted_rankings": {...} },
  "calculator": { "filters": {...}, "computed_sums": {...}, "totals": {...} },
  "cover": { "title": "...", "subtitle": "..." },
  "input_config": {
    "probability_scores": { "High": 3, "Med": 2, "Low": 1 },
    "complexity_scores":  { "High": 1, "Med": 1, "Low": 1 },
    "weights": {},
    "years":       [2026, 2027, 2028, 2029, 2030, 2031],
    "statuses":    ["Hopper", "ICT", "Negotiations", "Contracting", "Completed"],
    "customers":   [...],
    "projects":    [...],
    "programmes":  [...]
  },
  "reference_data": {
    "programmes": [...], "operators": [...], "projects": [...],
    "tca_agreement_types": [...], "spe_services_types": [...],
    "opportunity_types": [...], "lever_types": [...]
  },
  "errors": []
}
```

#### 6.3.3 Opportunity record (MEA LOG / L2 / L3) shape

```json
{
  "number": 42,
  "project": "Mid-term CRP uplift",
  "programme": "Trent XWB-84",
  "customer": "Emirates",
  "region": "MEA",
  "asks": "Renegotiate rate cards for EK fleet through 2028",
  "opportunity_type": "CRP Uplift",
  "levers": "Rate card renegotiation; SPE release",
  "priority": 1,                           // float, also may be 2 or 3
  "spe_related": "Y",
  "num_spe": 3,
  "crp_pct": 0.08,                         // 8 %
  "ext_probability": "High",               // "High" | "Med" | "Low"
  "int_complexity": "Med",
  "status": "ICT",                         // "Hopper" | "ICT" | "Negotiations" | "Contracting" | "Completed" | "Cancelled" (see 6.3.5)
  "evaluation_level": "L2",
  "term_benefit": 120.0,                   // $M
  "benefit_2026": 30.0,
  "benefit_2027": 45.0,
  "sum_26_27": 75.0,
  "financials": {
    "existing_deal_cash":   { "yr_2025": null, "yr_2026": 10, "yr_2027": 12, "yr_2028": 15, "yr_2029": 18, "yr_2030": 20 },
    "existing_deal_profit": { ... },
    "new_deal_cash":        { ... },
    "new_deal_profit":      { ... }
  },
  "supporting_financials": {
    "deal_benefits": ..., "expected_deal_costs": ..., "inyear_profit_impact": ...,
    "fyp_profit_improvement": ..., "term_profit_improvement": ...,
    "total_crp_term_revenue": ..., "total_crp_term_margin": ..., "crp_margin_pct": ...
  },
  "to_go": {
    "togo_term_revenue": ..., "togo_term_cost": ..., "togo_term_profit": ...
  },
  "resource_priority": {
    "res_account_mgmt": ..., "res_contract_mgmt": ..., "res_service_business": ...,
    "res_business_evaluation": ..., "res_sales_contracting": ..., "res_customer_ops": ...
  }
}
```

#### 6.3.4 Estimation level classification

Sheet name → level:

| Sheet name (case-insensitive) | Level label |
|---|---|
| `L2` | `ICT` |
| `L3` | `Contract` |
| contains `MEA LOG` or `OPP LOG` | `Hopper` |
| anything else | `Unknown` |

#### 6.3.5 Frontend must render (OPPORTUNITY_TRACKER)

This view is **deliberately presented on a dark background** (the frontend overrides `dashboard-body` and `main-content` to `#03002E` while in this view). When designing, the UI builder should still honor the tracker's distinct "dark premium" feel — but the colors themselves are the builder's choice.

**Title banner**: uses `cover.title` (or "MEA Commercial Optimisation Report"). Shows badges "OPP TRACKER" and "ROLLS‑ROYCE" on the right.

**Financial Hero KPIs — 4 cards**:
1. **2026** — `sum(benefit_2026)`. Format `$X.Xm`.
2. **2027** — `sum(benefit_2027)`.
3. **2026 + 2027** — `sum(sum_26_27)`. Accent color.
4. **Term Impact** — `sum(term_benefit)`. Primary color.

**Meta chip bar**: Away Day, Sheets parsed, Opportunities (total / active), Customers count, Programmes count.

**Priority breakdown — N+2 KPI cards** (one per priority value present, plus Completed + Pipeline):
- Priority 1 / 2 / 3 — each shows sum of `sum_26_27`, count of opps, and term benefit.
- "Completed" — count of records with status "Completed". Subtitle: `{pct}% of total`.
- "Pipeline" — count of active-not-completed. Subtitle: `{ICT_n} ICT · {Neg_n} Neg · {Ctr_n} Ctr`.

**Charts — row 1 (2 charts)**:
1. **Sum of Value by Type & External Probability** — stacked bar. X = opportunity types; 3 series = High/Med/Low; Y = $M.
2. **Sum of Value by Status & External Probability** — stacked bar. X = status list (`Hopper, ICT, Negotiations, Contracting, Completed, Cancelled`); 3 series = High/Med/Low.

**Charts — row 2 (3 charts)**:
1. **Sum of Value by Customer** — horizontal bar of top 15 customers by `sum_26_27`.
2. **Financial Forecast by Level** — bar chart by estimation level (ICT / Contract / Hopper) showing `total_sum_26_27`, `total_2026`, `total_2027`.
3. **Pipeline Status** — donut chart of `by_status` counts.

**Estimation Level cards** — one KPI card per estimation level with count, term benefit, 2026, 2027.

**Ext Probability & Opportunity Types chip rows** — one row of chips per ext-probability level (with count, 26+27 sum, term) and one row of chips per opportunity type (with count and $M).

**Collapsible sections** (start collapsed except "Top Opportunities"):

- **Top Opportunities by Value** — filterable table top 30 by `sum_26_27`. Cols: `Customer | Asks | Ext Prob | Status | Sum of Value (26+27)`. Per-column fastfilters on Customer, Ext Prob, Status.
- **Opportunities by Estimation Level** — per sheet (MEA LOG / L2 / L3), a subsection header and filterable table. Cols: `# | Project | Programme | Customer | Asks | Ext Prob | Status | Priority | Sum $M | Term $M`. Per-column fastfilters on Customer, Ext Prob, Status.
- **Project Timeline & Milestones** — summary table (`Project | Customer | Current Phase | Days to Sign`) **plus** a Gantt-style visualization: one row per project, one column per phase (`Idea Gen | Launch | Strategy | BE Gen | Approval | Negotiation | Submitted | Signed`). Each cell colored by state (done / current / future / empty) with the phase date shown on hover.
- **Opportunities & Threats** — filterable table. Cols: `Project | Customer | Opportunity | Status | Owner | Pack Improvement | Due Date`. Per-column fastfilters on Customer, Status, Owner.
- **Project Summary** — filterable table. Cols: `Group | Project | Customer | Programme | CRP Margin ($M) | CRP % | Onerous`. Per-column fastfilters on Group, Customer, Programme.

**Global filter bar** (Opp Tracker specific):
- `customer` (cascades to `project`).
- `status`.
- `ext_probability` (High / Med / Low).
- `priority` (1 / 2 / 3).
- `opportunity_type`.
- `min_value` (threshold on `sum_26_27`).

Changing a filter re-runs `renderContent(filteredRecords)` end-to-end.

#### 6.3.6 Date-input milestones schema

```json
{
  "project": "...",
  "customer": "...",
  "milestones": {
    "idea_generation":     "2025-09-01",
    "approval_to_launch":  "2025-10-15",
    "strategy_approval":   "2025-11-20",
    "be_generated":        "2026-01-10",
    "approval":            "2026-02-14",
    "negotiation_strategy":"2026-03-01",
    "proposal_submitted":  "2026-04-10",
    "proposal_signed":     null
  },
  "current_phase": "proposal_submitted",
  "source": "Date Input"          // or "Timeline" (Gantt-style fallback)
}
```

Current phase = latest-non-null milestone in the canonical order above.

---

### 6.4 SHOP_VISIT_HISTORY

#### 6.4.1 Detection

Content signals: "event item part number", "event item serial number", "action code", "rework level", "service event number", "shopvisit_type", "shopvisit_location". Sheet names starting with `report page` and a sheet named `glossary_2` boost the score.

#### 6.4.2 Parser output

```json
{
  "file_type": "SHOP_VISIT_HISTORY",
  "metadata": {
    "source_file": "SV History 2026.xlsx",
    "source_sheet": "Report Page 1",
    "engine_models": ["Trent XWB-84", "Trent 1000"],
    "total_engines": 57,
    "operators": ["Emirates", "Ethiopian", "Singapore"]
  },
  "shop_visits": [
    {
      "part_number": "Trent XWB-84",
      "serial_number": "91020",
      "event_datetime": "2025-08-14",
      "operator": "Emirates",
      "parent_serial": "A6-EDA",
      "registration": "A6-EDA",
      "action_code": "SV",
      "rework_level": "Shop Visit",
      "service_event": "SE123456",
      "hsn": 15000.0,
      "csn": 2400.0,
      "hssv": 100.0,
      "cssv": 20.0,
      "sv_type": "PERFORMANCE",
      "sv_location": "Dahlewitz"
    }
    // ...
  ],
  "maintenance_actions": [ /* same row shape but not "current status" and not "shop visit" */ ],
  "current_status": [ /* rows whose action_code or rework_level contains "current status" */ ],
  "statistics": {
    "total_shop_visits":     245,
    "total_maintenance":     1203,
    "total_engines_tracked": 57,
    "sv_types":     { "PERFORMANCE": 120, "HEAVY": 80, "LIGHT": 45 },
    "sv_locations": { "Dahlewitz": 110, "Derby": 80, "Montreal": 55 }
  },
  "all_sheets": ["Report Page 1", "Glossary_2"],
  "errors": []
}
```

#### 6.4.3 Record classification

For each data row:
- If `action_code.lower()` or `rework_level.lower()` contains `"current status"` → `current_status`.
- Elif `rework_level.lower()` contains `"shop visit"` → `shop_visits`.
- Else → `maintenance_actions`.

Engine model detection: first token of unique `part_number` values across `shop_visits` + `current_status`.

#### 6.4.4 Frontend must render (SHOP_VISIT_HISTORY)

**Header**: "Trent Engine Shop Visit History" with badge "SHOP VISIT" (orange).

**Info chips**: Source file, Engine Models list, Operators count.

**KPI grid — 4 cards**:
1. Engines Tracked — unique serial numbers. Icon: disc.
2. Shop Visits — count. Warning color. Icon: wrench.
3. Maintenance Actions — count. Icon: settings.
4. Current Status — count. Success. Icon: activity.

**Charts — 2**:
1. **Shop Visit Types** — donut. Values = counts per `sv_type`.
2. **Shop Visit Locations** — horizontal bar. Categories = `sv_location`.

**Shop Visit Events table** (filterable, max 150 rows):
`Serial No. | Event Date | Operator | Action Code | Rework Level | SV Type | SV Location | HSN | CSN`. Fastfilters on Operator, SV Type, Location.

**Current Engine Status** table (shown only if records exist): `Serial No. | Part Number | Operator | Registration | HSN | CSN`.

**Global filters**: `operator`, `sv_type`, `sv_location` dropdowns.

---

### 6.5 SVRG_MASTER

#### 6.5.1 Detection

Sheet names `MENU`, `CLAIMS SUMMARY`, `EVENT ENTRY`. Content signals: "trent 900 guarantee", "trent 900 guarantee administration", "claims summary", "event entry", "hptb", "svrg", "esvrg", "enhanced guarantees".

#### 6.5.2 Parser output

```json
{
  "file_type": "SVRG_MASTER",
  "metadata": {
    "source_file": "SVRG Master 2026.xlsx",
    "customer": "Emirates",
    "engine_model": "Trent 900",
    "all_sheets": ["MENU", "CLAIMS SUMMARY", "EVENT ENTRY", "Chart1", "Chart2", "DESCRIPTIONS", "Sheet3", "HPTB Log"]
  },
  "claims_summary": {
    "claims": [
      {
        "date": "2025-03-12",
        "year": 2025.0,
        "credit_ref": "CR12345",
        "guarantee": "SVRG",
        "credit_value": 250000.0,
        "cumulative_value": 850000.0
      }
      // ...
    ],
    "total_claims": 47,
    "total_credit_value": 4500000.0
  },
  "event_entries": {
    "events": [
      {
        "event_type": "Disruption",
        "date": "2024-11-03",
        "engine_serial": "91020",
        "aircraft": "A6-EDA",
        "tsn_tsr": 12500.0,
        "csn_csr": 2100.0,
        "description": "IFSD due to EGT margin exhaustion",
        "qualification": "Qualified",
        "justification": "Within guarantee window",
        "rr_input": "Qualified",
        "rr_justification": "Root cause: HPTB distress",
        "guarantee_coverage": "SVRG",
        "comments": "Credit issued Q1 2025"
      }
      // ...
    ],
    "total_events": 120,
    "qualifications":   { "Qualified": 80, "Non-Qualified": 30, "Pending": 10 },
    "guarantee_types":  { "SVRG": 90, "eSVRG": 25, "None": 5 }
  },
  "available_sheets": {
    "HPTB Log": { "row_count": 250, "col_count": 30 },
    "Dispatch Reliability": { "row_count": 80, "col_count": 15 }
    // (excludes MENU, EVENT ENTRY, CLAIMS SUMMARY, Chart1/2, DESCRIPTIONS, Sheet3)
  },
  "errors": []
}
```

#### 6.5.3 Frontend must render (SVRG_MASTER)

**Header**: "SVRG Master — Guarantee Administration", badge "SVRG" (purple).

**Info chips**: Customer, Engine Model, Source file.

**KPI grid — 5 cards**:
1. Total Claims — count. Icon: file-check.
2. Total Credit Value — `sum(credit_value)`. Success. Icon: credit-card.
3. Total Events — `len(events)`. Icon: alert-circle.
4. Qualified Events — count where qualification = "Qualified". Success. Icon: check-circle.
5. Guarantee Types — comma-separated list from unique `claims.guarantee` values. Icon: shield.

**Charts — 2**:
1. **Claims Over Time** — combo chart. X = claim dates. Column = `credit_value`; line = `cumulative_value`.
2. **Event Qualification** — donut of `qualifications` counts.

**Claims Summary table** (filterable): `Date | Year | Credit Ref | Guarantee | Credit Value | Cumulative`. Fastfilters on Guarantee, Year.

**Event Entries table** (filterable): `Event Type | Date | Engine Serial | Aircraft | Description | Qualification | Coverage`. Fastfilters on Qualification, Coverage.

**Available Data Sheets** table (read-only): `Sheet Name | Rows | Columns` — shows any unrecognized sheets the parser found.

**Global filters**: `guarantee`, `qualification`, `year`. Guarantee filters both claims and events; qualification filters events only; year filters claims.

---

### 6.6 GLOBAL_HOPPER

#### 6.6.1 Detection

Sheet names: `global log`, `detail_report`, `exec_report`, `data validations`.
Content signals: "commercial optimisation opportunity report", "global commercial optimisation hopper", "crp term benefit", "restructure type", "opportunity maturity", "signature ap", "engine value stream", "top level evs", "vp/account manager", "onerous/non onerous", "project plan requirements", "expected year of signature".

Disambiguation: if any sheet contains `global log` (case-insensitive) **and** the GLOBAL_HOPPER score > 0, the detector returns `GLOBAL_HOPPER` to prevent shared sheets (COVER, COUNT, SUM) from pushing the result toward OPPORTUNITY_TRACKER.

#### 6.6.2 Parser output

```json
{
  "file_type": "GLOBAL_HOPPER",
  "metadata": {
    "source_file": "Global Commercial Optimisation Hopper (v2).xlsx",
    "title": "Commercial Optimisation Opportunity Report",
    "currency": "GBP",
    "total_opportunities": 215,
    "regions": ["AP", "EU", "MEA", "NAM", "SAM", "CHINA"],
    "all_sheets": ["Cover", "Global Log", "Detail_Report", "Exec_Report", "Data Validations"],
    "sheets_parsed": ["Global Log"]
  },
  "opportunities": [
    {
      "region": "MEA",
      "customer": "Emirates",
      "engine_value_stream": "Trent XWB-84",
      "top_level_evs": "Widebody",
      "vp_owner": "Jane Doe",
      "restructure_type": "Rate card renegotiation",
      "maturity": "Mature",
      "onerous_type": "Onerous Contract",
      "initiative": "Q2 2026 CRP uplift",
      "project_plan_req": "Yes",
      "status": "Negotiations Started",
      "expected_year": 2026,
      "signature_ap": "AP12",
      "crp_term_benefit": 45.5,
      "profit_2026": 12.0,
      "profit_2027": 10.5,
      "profit_2028": 8.0,
      "profit_2029": 7.0,
      "profit_2030": 5.0
    }
    // ...
  ],
  "summary": {
    "total_opportunities": 215,
    "by_region":              { "MEA": 40, "EU": 55, ... },
    "by_region_value":        { "MEA": 350.5, "EU": 420.0, ... },   // sum of crp_term_benefit per region
    "by_status":              { "Initial idea": 30, "ICT formed": 25, ... },
    "by_status_value":        { ... },
    "by_restructure_type":    { ... },
    "by_restructure_type_value": { ... },
    "by_maturity":            { "Mature": 150, "Immature": 65 },
    "by_maturity_value":      { ... },
    "by_evs":                 { "Trent XWB-84": 80, ... },
    "by_evs_value":           { ... },
    "by_customer":            { ... },
    "by_customer_value":      { ... },
    "by_top_level_evs":       { "Widebody": 120, "Narrowbody": 50, ... },
    "by_onerous":             { "Onerous Contract": 70, "Not Onerous": 145 },
    "by_expected_year":       { "2026": 80, "2027": 55, ... },
    "by_vp_owner":            { ... },
    "pipeline_stages": [
      { "stage": "Initial idea",               "count": 30, "value": 250.5 },
      { "stage": "ICT formed",                 "count": 25, "value": 180.0 },
      { "stage": "Strategy Approved",          "count": 20, "value": 150.0 },
      { "stage": "Financial Modelling Started","count": 15, "value": 120.0 },
      { "stage": "Financial Modelling Complete","count": 12, "value": 95.0 },
      { "stage": "Financials Approved",        "count": 10, "value": 80.0 },
      { "stage": "Negotiations Started",       "count": 8,  "value": 70.0 },
      { "stage": "Negotiations Concluded",     "count": 5,  "value": 50.0 },
      { "stage": "Contracting Started",        "count": 3,  "value": 30.0 },
      { "stage": "Contracting Concluded",      "count": 2,  "value": 25.0 }
    ],
    "total_crp_term_benefit": 1234.5,
    "total_profit_2026": 200.0,
    "total_profit_2027": 180.0,
    "total_profit_2028": 150.0,
    "total_profit_2029": 120.0,
    "total_profit_2030": 100.0,
    "top_customers": [ { "customer": "Emirates", "crp_term_benefit": 75.5 }, ... ],  // top 20
    "unique_regions":           [...],
    "unique_evs":               [...],
    "unique_statuses":          [...],
    "unique_restructure_types": [...],
    "unique_maturities":        [...],
    "unique_customers":         [...]
  },
  "detail_report": [ { /* freeform row dict from Detail_Report sheet */ }, ... ],
  "exec_report":   [ { /* freeform row dict from Exec_Report sheet */ }, ... ],
  "reference_data": { /* label → list of values from Data Validations sheet */ },
  "errors": []
}
```

Notes:
- Currency is **always GBP** for Global Hopper (hardcoded in parser + PDF export). Display with `£` prefix.
- `expected_year` is coerced to `int` or `null`. Bad/text values in the column ("Confirm with Harry") become `null`.
- Pipeline stages are emitted in the **canonical order above**, not alphabetical.

#### 6.6.3 Frontend must render (GLOBAL_HOPPER)

Like the Opp Tracker, the Hopper view is rendered on a dark background.

**Title banner**: `meta.title` with "GLOBAL HOPPER" (green) and "ROLLS‑ROYCE" badges.

**Filter bar (top)**:
- Region dropdown (from `summary.unique_regions`).
- Customer dropdown (`summary.unique_customers`).
- EVS dropdown (`summary.unique_evs`).
- Status dropdown (`summary.unique_statuses`).
- Maturity dropdown (`summary.unique_maturities`).
- Restructure Type dropdown (`summary.unique_restructure_types`).

**Hero KPIs — 4 cards**:
1. **CRP Term Benefit** — `fmtGBP(total_crp_term_benefit)` with `£X.Xm` / `£X.Xbn` scaling.
2. **Profit 2026** — `£X.Xm`.
3. **Profit 2027** — `£X.Xm` (accent).
4. **Profit 2028–30** — sum of 2028+2029+2030 (primary).

**Meta chips**: Currency (GBP), Opportunities count, Customers count, Regions (comma-joined), EVS Types count.

**Secondary KPIs — 5 cards**:
1. Mature — `by_maturity.Mature`. Success.
2. Immature — `by_maturity.Immature`.
3. Onerous — `by_onerous["Onerous Contract"]`. Danger.
4. Not Onerous — `by_onerous["Not Onerous"]`.
5. Regions count (subtitle = regions list).

**Charts — row 1 (2 charts)**:
1. **Pipeline by Status** — bar chart in canonical pipeline stage order, values = `by_status_value`.
2. **CRP by Region** — donut. Labels = regions; values = `by_region_value`.

**Charts — row 2 (2 charts)**:
1. **Top 15 Customers by CRP Term Benefit** — horizontal bar.
2. **Engine Value Stream Distribution** — bar (categories = EVS, values = count).

**Charts — row 3 (2 charts)**:
1. **Annual Profit Forecast (GBP)** — bar chart with 5 bars: 2026, 2027, 2028, 2029, 2030.
2. **Restructure Type Split** — donut.

**Tables (each collapsible)**:

- **Opportunities Register** — `Region | Customer | EVS | Restructure Type | Maturity | Status | CRP Term (£m) | 2026 (£m) | 2027 (£m) | VP/Owner`. Max height 500 px with internal scroll; money columns right-aligned.
- **Executive Report** — dynamic columns from `exec_report[0]`. Numeric cells are `.toFixed(1)`.
- **Detail Report** — dynamic columns from `detail_report[0]`.

Clicking a filter re-runs `_applyGlobalHopperFilters(uid, allOpps, ...)` which:
- Recomputes all 4 hero KPIs.
- Rebuilds `filteredSummary` (status / region / customer / EVS / restructure type value maps).
- Calls `_renderGlobalHopperCharts(...)` to re-render all 6 charts.
- Does NOT rebuild the Opportunities Register table (this is an inferred limitation — it only updates KPIs and charts).

---

### 6.7 UNKNOWN / ERROR fallbacks

#### 6.7.1 `_parse_unknown()`

Generic extraction when type detection fails. Output:

```json
{
  "file_type": "UNKNOWN",
  "metadata": { "source_file": "..." },
  "sheets": {
    "Sheet1": {
      "headers": [ "Col A", "Col B", ... ],
      "rows":    [ { "Col A": "...", "Col B": 42 }, ... ],
      "row_count": 107
    }
    // per sheet
  },
  "errors": [
    "File type could not be determined; generic extraction applied."
  ]
}
```

Frontend renders a basic table per sheet (see `_renderUnknown` in dashboard.js).

#### 6.7.2 `ERROR` — parser crash

```json
{
  "file_type": "ERROR",
  "metadata": { "source_file": "..." },
  "errors": [ "Could not load workbook — file may be corrupt or unsupported." ]
}
```

Frontend renders a centered "Failed to render {name}" error card.

#### 6.7.3 `<TYPE>_FALLBACK`

If a type-specific parser crashes, the universal dispatcher falls back to `_parse_unknown()` and rewrites `file_type` to `<original>_FALLBACK`. Example: `SOA_FALLBACK`. The frontend treats these as Unknown.

#### 6.7.4 Multi-file session support (cross-references)

`parser.parse_session(files, is_base64=True)` is a higher-level entry point that parses a list and builds:

- `files` map (filename → parse result, same as `/api/upload` response).
- `cross_references.cross_refs`: map keyed by `invoice_ref | assignment | account | customer | esn | programme | project`, each value = only the keys seen in ≥ 2 distinct files.
- `cross_references.stats`: `total_keys_extracted`, `cross_file_matches`, `matches_by_type`.
- `combined_open_items`: flat list of SOA + INVOICE_LIST rows sorted by `days_late DESC`, `abs(amount) DESC`. Each row tagged with `_source_file`, `_source_section`, `_file_type`.
- `session_summary`: files loaded, file types present, cross-file matches, session errors.

**This is currently NOT called by `server.py`** — it is available for future use. The dashboard has a `_renderCrossRefHints()` function (dashboard.js L2519) that shows cross-file hints when multiple files are present, but it uses a lighter-weight inline computation.

---

## 7. Dashboard view modes

`app.js` tracks `_currentView` and switches between five modes (plus Files):

| View pill | `_currentView` value | Feature-flag gated? |
|---|---|---|
| Standard | `standard` | always on |
| Executive | `executive` | always on |
| Slides | `presentation` | always on |
| Compare | `comparison` | `show_compare` |
| Files | `files` | `show_files` |
| AI Assistant | `ai` | `show_ai` |

### 7.1 Standard view

All content sections visible: customer info, KPIs, debt decomposition, executive charts, bilateral charts, section breakdown tabs, invoice register. For new-format parser output (`_detectNewParserFormat() === true`), the universal visualizer is used instead — which means the dashboard content for SOA looks identical to §6.1.6 regardless of whether Standard or Executive is selected.

### 7.2 Executive view

**Legacy SOA path**: shows only customer info + KPIs + debt decomposition + executive charts (hides bilateral, section breakdown, invoice register, export footer).

**New-format path**: defers entirely to the universal visualizer (same as Standard).

### 7.3 Slides / Presentation view

Full-screen slide deck with prev/next nav and keyboard arrows.

**Legacy SOA**: slides = Customer Overview + Key Metrics + Executive Charts + Bilateral Position + one slide per section.

**New-format** (Opp Tracker / Global Hopper / new SOA / Invoice List): each file produces its own branded slide sequence (built by `_buildOppTrackerSlides`, `_buildGlobalHopperSlides`, `_buildNewSOASlides`, `_buildInvoiceListSlides`).

### 7.4 Compare view

Three-pane side-by-side layout. User types one prompt; frontend POSTs to `/api/compare`, which runs the same prompt + system prompt against 4 cloud LLMs in parallel (OpenRouter Qwen, DigitalOcean GPT-120b, NVIDIA Kimi, Gemini 3 Pro — see §8). Each pane shows the response body and elapsed time. Currently only three panes are rendered in the UI (Qwen / GPT / Kimi); Gemini results are returned but not displayed — this is a UI bug flagged for review.

Panes render a typing-dots spinner until the async response arrives.

### 7.5 Files view

Password-gated (client-side `ChickenMan123`). Two panels:

- **V1 — Archived Files (PostgreSQL)**: list of inline-stored files with `filename | upload date | size | actions` columns. Supports drag-drop upload (base64 JSON to `/api/files/upload`), click-to-download (`/api/files/{id}`), delete.
- **V2 — Cloud Storage (Cloudflare R2)**: list of R2-stored files with the same columns. Drag-drop to upload (chunked 8 MB to `/api/r2/chunk-init/upload/finalize`). Click row to parse (`/api/r2/files/{id}/parse`), download (`/api/r2/files/{id}`), or delete.

### 7.6 AI Assistant view

Dedicated chat UI (see §8).

### 7.7 Welcome state

Shown when no files are uploaded. Hero with an aircraft SVG, "Upload Workbook(s)" CTA, and three feature cards (Smart Detection / Rich Analytics / Cross-File Linking).

---

## 8. AI chat subsystem

### 8.1 Entry points

- `POST /api/chat` — single-model chat with history, grounded in uploaded files.
- `POST /api/chat/clear` — resets `_chat_history[sid]`.
- `POST /api/compare` — parallel fan-out to 4 models, no history preserved.

### 8.2 Provider routing (prefix-based)

`ai_chat.call_openrouter(messages, system_prompt, model=None, file_attachments=None)` routes by the `model` string prefix (`ai_chat.py` L311–L328):

| Model prefix | Provider | Function | Multimodal | Streaming |
|---|---|---|---|---|
| `digitalocean/` | DigitalOcean GenAI | `call_digitalocean` | no (images flattened to text note) | no |
| `nvidia/` | NVIDIA | `call_nvidia` | no | yes (SSE) |
| `google/` | Google Cloud Vertex AI (GLM-5) | `call_google_glm` | no | no |
| `gemini/` | Google Gemini 3 Pro Preview | `call_gemini3pro` | **yes** (native PDF + image bytes) | no |
| (no prefix / anything else) | OpenRouter "default" stub | returns `{"error": "OpenRouter path not configured"}` | — | — |

**Critical note**: the OpenRouter fallback branch at the end of `call_openrouter` is currently dead code — it returns an error instead of actually calling OpenRouter. Users selecting `qwen/qwen3-vl-235b-a22b-thinking` (the nominal OpenRouter default) from the model dropdown will therefore get "OpenRouter path not configured". This is tracked in §16.

### 8.3 Models exposed in the dropdown

From `templates/index.html` lines 462–472:

| Option `value` | Label |
|---|---|
| `digitalocean/openai-gpt-oss-120b` (**selected**) | GPT OSS 120b (DigitalOcean) |
| `nvidia/moonshotai/kimi-k2.5` | Kimi K2.5 (NVIDIA) |
| `qwen/qwen3-vl-235b-a22b-thinking` | Qwen 3 VL 235B (Thinking) |
| `google/zai-org/glm-5-maas` | GLM-5 (Google Vertex) |
| `gemini/gemini-3-pro-preview` | Gemini 3 Pro (Google) |

### 8.4 System prompt construction

`ai_chat.build_system_prompt(parsed_data_dict)` builds a plain-text prompt with this skeleton:

```
You are a professional financial data analyst AI assistant for Rolls-Royce Civil Aerospace.
You are embedded in a Statement of Account (SOA) Dashboard.

CRITICAL RULES — YOU MUST FOLLOW THESE EXACTLY:
1. ONLY answer questions based on the data provided below. Do NOT use any external knowledge.
2. If the answer is not in the provided data, say: 'This information is not available in the uploaded data.'
3. Do NOT make up, infer, or hallucinate any numbers, dates, or facts not explicitly in the data.
4. Always cite specific numbers from the data when answering financial questions.
5. Be precise with currency amounts — always include the exact figures from the data.
6. When asked to generate emails, reports, or summaries, base them ONLY on the actual data below.
7. When computing totals or filtering, ALWAYS iterate through ALL line items. NEVER skip items.

DATE FIELD DEFINITIONS — VERY IMPORTANT:
- 'Document Date' = the date the invoice/document was CREATED or ISSUED.
- 'Due Date' (also called 'Net Due Date') = the date by which PAYMENT IS DUE from the client.
- When a user asks 'what is due in [month]' ..., they mean Due Date falls in that month.
- 'Days Late' = how many days past the Due Date the payment is overdue (0 = not yet due).

YOUR CAPABILITIES:
- Answer questions about the SOA data ...
- Generate professional email templates ...
- Create structured report text, explain trends, patterns, and anomalies ...

RESPONSE FORMAT RULES:
- For regular answers: respond in clear, professional language with markdown formatting.
- For email templates: wrap the email in a code block with ```email``` markers.
- For chart requests: respond with a JSON chart specification wrapped in ```chart``` markers.
  {"type": "bar"|"donut"|"line", "title": "...", "labels": [...], "series": [{"name": "...", "data": [...]}]}

═══════════════════════════════════════════════════
UPLOADED SOA DATA (This is your ONLY source of truth):
═══════════════════════════════════════════════════

── FILE: <filename> ──

<per-file content>

──────────

Current date/time: YYYY-MM-DD HH:MM
REMEMBER: ONLY use the data above ...
```

**Per-file content injected:**

- **PDF / DOCX**: full extracted text verbatim (no truncation).
- **Image**: placeholder `[IMAGE CONTENT ATTACHED]` — actual bytes go through the multimodal channel separately.
- **Global Hopper**: title, currency (GBP), opportunity count, region list, computed or provided summary statistics, a full enumerated opportunity list with fields `Region, Customer, EVS, Restructure Type, Maturity, Status, CRP Term Benefit, Profit 2026-2030, VP Owner, Initiative`, and a top-10 customers-by-CRP-value list.
- **SOA / legacy Excel**: metadata key-value dump, grand totals, every section with its totals **plus every line item**, summary statistics (total line items, charges count+sum, credits count+sum, net balance, overdue count+sum, avg days late), and an aging breakdown. No truncation.

### 8.5 Multimodal handling

`POST /api/chat` (`server.py` L777–L874) assembles two parallel attachment lists:

- `images_to_attach` — OpenAI-format `[{"type": "image_url", "image_url": {"url": "data:<mime>;base64,..."}}, ...]` for models like Qwen-VL.
- `gemini_file_attachments` — `[{"mime_type": "...", "base64": "...", "filename": "..."}, ...]` for the native Gemini SDK path. **Includes PDFs** (Gemini 3 Pro reads PDF bytes natively).

`images_to_attach` is appended to the user message `content` list alongside the text part. `gemini_file_attachments` is passed to `call_openrouter` **only when** the selected model starts with `gemini/`, and Gemini's handler inserts them at index 0 of the last user message's `parts` array.

### 8.6 Chat history cap

`MAX_HISTORY_MESSAGES = 20` (ai_chat.py L37). The last 20 messages are sent on every turn; older turns are silently dropped.

### 8.7 Response parsing

Every provider's response text is piped through `parse_ai_response(content)` which:

1. Extracts `` ```chart ... ``` `` fences with a JSON body and JSON-parses them into a `charts` list. Invalid JSON → block skipped.
2. Extracts `` ```email ... ``` `` fences into an `emails` list (raw text).
3. Replaces the fences in the text with `[CHART_PLACEHOLDER]` / `[EMAIL_PLACEHOLDER]`.

Return: `{"content": cleaned_text, "charts": [...], "emails": [...], "error": None}`.

### 8.8 Response shape returned to the browser

```json
{
  "content": "Markdown response text with [CHART_PLACEHOLDER] / [EMAIL_PLACEHOLDER] tokens inline",
  "charts": [
    {
      "type": "bar" | "donut" | "line" | "pie",
      "title": "...",
      "labels": [...],
      "series": [{"name": "...", "data": [...]}]
    }
  ],
  "emails": [
    "Subject: ...\n\nDear Sir/Madam, ...\n\nKind regards,\nRolls-Royce Receivables Team"
  ]
}
```

Errors are returned as `{"error": "..."}` with HTTP 502.

### 8.9 Compare endpoint

`POST /api/compare`:
- Reads `message` from request body.
- Builds the same system prompt as `/api/chat`.
- Spawns 3 parallel workers (`ThreadPoolExecutor(max_workers=3)`) iterating over **4** model configs:

```python
[
  {"id": "qwen/qwen3-vl-235b-a22b-thinking",   "name": "Qwen 3 VL (OpenRouter)"},
  {"id": "digitalocean/openai-gpt-oss-120b",   "name": "GPT 120b (DigitalOcean)"},
  {"id": "nvidia/moonshotai/kimi-k2.5",         "name": "Kimi K2.5 (NVIDIA)"},
  {"id": "gemini/gemini-3-pro-preview",         "name": "Gemini 3 Pro (Google)"},
]
```

Each worker uses a temp history with just the current user message (**does not touch `_chat_history`**). Returns:

```json
{
  "results": [
    { "model_id": "...", "model_name": "...", "content": "...", "error": null, "time": "4.23s" },
    ...
  ]
}
```

Results are sorted back into the original model order.

### 8.10 Frontend must render (AI Assistant view)

From `templates/index.html` + `app.js`:

**Welcome state** (before first message):
- Bot icon.
- "AI Data Assistant" title.
- Model selector dropdown (5 options, default: GPT OSS 120b).
- Description text + experimental-feature disclaimer.

**Quick actions grid** — bindable prompt chips (array defined in JS as `QUICK_ACTIONS`). Click a chip → fills input and sends.

**Message thread**:
- User messages (avatar, right-aligned body).
- Assistant messages (bot avatar, left-aligned body, timestamp).
- Chart fences render as actual ApexCharts inline.
- Email fences render as a copyable box (with Copy button) or a modal.

**Typing indicator** (shown while loading): three-dot spinner + live elapsed-seconds timer display.

**Activity Log panel** (collapsible): timestamped entries with icons for `init | send | api | wait | receive | render | error | success | info`. Scrolls to bottom on new entry.

**Chat input bar** (bottom of panel):
- Clear-chat button (trash icon) — POSTs `/api/chat/clear`.
- Textarea (auto-resizes up to 120 px height, Enter-to-send, Shift+Enter for newline).
- Send button.

**Compare mode** (separate view):
- Single shared prompt input at top.
- Three side-by-side panes titled "Qwen 3 VL 235B" / "GPT 120b" / "Kimi K2.5". Each shows a typing spinner until results arrive, then renders markdown body + elapsed time badge. Gemini 3 Pro results are included in the server response but not rendered in the current UI — left for the redesign to include a fourth pane.

---

## 9. PDF export subsystem

One unified endpoint dispatches to three report generators.

### 9.1 `POST /api/export-pdf` — dispatcher

Request body (JSON):

```json
{
  "currency_symbol": "USD",              // default "USD"
  "selected_files": ["ETH SOA.xlsx"],    // default: all files in session
  "file_type": "OPPORTUNITY_TRACKER",    // optional; if absent inferred from first file's file_type
  "sections_to_include": [               // see per-report sections below
    "kpis", "top_opps", "estimation_level", "timeline",
    "opps_threats", "project_summary", "customer_breakdown"
  ],
  "filters": {                           // report-specific; see below
    "customer": "Emirates",
    "status": "ICT",
    "min_value": 10.0
  }
}
```

Response: `application/pdf` binary stream with `Content-Disposition: attachment; filename=<generated>.pdf`. Errors return 400 / 500 JSON `{"error": "..."}`.

Dispatch logic (server.py L358–L467):

1. If `file_type == 'GLOBAL_HOPPER'` (or first file's parsed data is GLOBAL_HOPPER) → `generate_hopper_pdf_report()`. Filename: `Global_Hopper_Report.pdf`.
2. Elif `file_type == 'OPPORTUNITY_TRACKER'` (or inferred) → `generate_opp_pdf_report()`. Filename: `Opportunity_Tracker_<customer>.pdf` (spaces → `_`; customer from `metadata.customer` if set, else `Report`).
3. Else → legacy SOA path `generate_pdf_report()`. Filename: `SOA_Report_<customer>.pdf` using `metadata.customer_name`.

### 9.2 Generator 1 — SOA (`generate_pdf_report`)

Signature:

```python
generate_pdf_report(
    metadata: dict,
    grand_totals: dict,
    filtered_df: pd.DataFrame,
    sections_summary: dict,
    source_files: list = None,
    currency_symbol: str = "USD",
) → bytes
```

**Orientation**: A4 Landscape. Font: Helvetica (fpdf2 default). Branding: navy header bar + navy section underlines + footer "ROLLS-ROYCE CIVIL AEROSPACE - For internal use only".

**Sections produced (all always included; no user toggles)**:
1. Title bar — "ROLLS-ROYCE" + "Statement of Account Report" + timestamp.
2. Customer Information grid — customer name, customer ID, contact, LPI rate (percent), avg days late, report date.
3. KPIs — 6-card grid (Total Charges, Total Credits, Net Balance, Total Overdue, Avg Days Late, Open Items). Red/green accents by sign.
4. Section Summary table — columns: `Section | Total | Charges | Credits | Overdue | Items`.
5. Filtered Invoice Register table — max 100 rows, columns: `Section | Reference | Doc Date | Due Date | Amount | Status | Type | Days Late`; footer "Showing first 100 of X filtered records".
6. Data Sources list (if `source_files` has more than one entry).

### 9.3 Generator 2 — Opp Tracker (`generate_opp_pdf_report`)

Signature:

```python
generate_opp_pdf_report(parsed_data: dict, sections_to_include: list, filters: dict) → bytes
```

**Filters supported**: `customer`, `project`, `priority`, `ext_probability`, `status`, `opp_type` (list), `min_value` (applied against `sum_26_27`).

**Currency**: `$X.Xm` format via `_fmtM`. Uses matplotlib chart strip.

**Sections by key** (all toggleable via `sections_to_include`):

| Key | Produces |
|---|---|
| `kpis` | KPI row (2026 / 2027 / 26+27 / Term Impact), info badges, priority-breakdown cards, 3-chart matplotlib strip (priority doughnut / estimation-level bar / top-5-customers horizontal bar) |
| `top_opps` | "Top Opportunities by Value" table, top 25, columns `# | Customer | Project | Asks | Ext Prob | Priority | Status | Value (26+27)` |
| `estimation_level` | Per-sheet summary cards, per-sheet detail tables `Customer | Asks | Ext Prob | Status | 2026 | 2027 | 26+27` (top 20 each) |
| `opps_threats` | "Opportunities & Threats" table `Customer | Description | Type | Status | Owner` |
| `project_summary` | "Project Summary" table `Project | Customer | Status | Value | Notes` |
| `customer_breakdown` | Table `Customer | Opportunities | Value (26+27) | Term Benefit | % of Total` |
| `timeline` | "Project Timeline & Milestones" table `Milestone | Date | Status | Owner | Notes` |

**Title subtitle**: `Generated: DD Month YYYY  |  N Opportunities  |  M Customers` (prepends `Filtered: <customer>` if customer filter active).

### 9.4 Generator 3 — Global Hopper (`generate_hopper_pdf_report`)

Signature:

```python
generate_hopper_pdf_report(parsed_data: dict, sections_to_include: list = None, filters: dict = None) → bytes
```

**Default sections** when `sections_to_include is None`: `["kpis", "charts", "pipeline", "top_opps", "exec_report", "customer_breakdown"]`.

**Filters supported**: `region`, `customer`, `status`, `maturity`, `restructure_type`, `min_value` (on `crp_term_benefit`). All string matching is lowercase-exact.

**Currency**: GBP. Format `GBP X.Xm` (symbol spelled out because Helvetica does not render £).

**Sections**:

| Key | Produces |
|---|---|
| `kpis` | KPI row (CRP TERM BENEFIT, PROFIT 2026, PROFIT 2027, TOTAL OPPORTUNITIES); info line (source file, region list ≤ 5 + "+N more", currency) |
| `charts` | 3-chart matplotlib strip: Region donut (CRP by region) / Top-10 customers horizontal bar / YoY profit bar 2026–2030 |
| `pipeline` | "Pipeline by Status" table `Status / Stage | Count | CRP Term Benefit (GBP m)` + TOTAL row |
| `top_opps` | "Top 25 Opportunities by CRP Term Benefit" — `# | Region | Customer | EVS | Restructure | Status | CRP Term | 2026 | 2027` |
| `exec_report` | "Executive Report" — uses `parsed_data.exec_report` raw keys, with fallbacks for both humanized (`"Sum of CRP Term Benefit £m"`) and snake_case keys |
| `customer_breakdown` | "Customer Breakdown" — `Customer | Opps | CRP Term (GBP m) | Profit 2026 | Profit 2027 | % of Total CRP` |

### 9.5 Frontend must render (Export modal)

From `index.html` L617–L669 and `app.js` L3530–L3664:

- Triggered from either the sidebar "Export PDF Report" button or the in-dashboard footer "Generate PDF Report" button.
- Modal overlay with:
  - Header: "Export PDF Report" + X close button.
  - Body: "Sections to Include" group with 7 checkboxes (all checked by default):
    - KPIs & Financial Summary (→ `kpis`)
    - Top Opportunities (→ `top_opps`)
    - Estimation Level breakdown (→ `estimation_level`)
    - Project Timeline (→ `timeline`)
    - Opportunities & Threats (→ `opps_threats`)
    - Project Summary (→ `project_summary`)
    - Customer Breakdown (Charts) (→ `customer_breakdown`)
  - Footer: Cancel + "Generate PDF" button.
- On Generate: fetch `/api/export-pdf` with JSON body `{ selected_files, file_type, sections_to_include, filters, currency_symbol: '$' }`. Receives a blob; triggers browser download using the filename from `Content-Disposition` (falls back to `Opportunity_Tracker_Report.pdf`).
- While generating, a full-screen loading overlay is shown (`RRComponents.showLoading()`).
- On failure a red toast with the error message.

**Current filter gaps**: the modal does not expose currency choice (hard-coded to `$`) or filter choices. The `filters` object is pulled from `RRVisualizer.getActiveGlobalFilters()`, so whatever the user has applied in the dashboard filter bar is automatically forwarded.

---

## 10. API reference

Every protected endpoint uses `@login_required`, which redirects (HTML) to `/login` if unauthenticated. API clients should expect a 302 to `/login` when the session is missing.

### 10.1 Auth

#### GET `/login`

- Auth: no.
- Response: `text/html` login page.

#### POST `/login`

- Auth: no.
- Request: `application/x-www-form-urlencoded` — `password=<code>`.
- Response: 302 to `/` on success, or 200 `text/html` re-render with error banner on failure.

#### GET `/logout`

- Auth: no.
- Clears session, redirects to `/login`.

#### GET `/`

- Auth: yes.
- Response: `text/html` — renders `index.html` with `feature_flags` context.

#### GET `/api/config`

- Auth: yes.
- Response: `application/json` — `{ "show_ai": bool, "show_files": bool, "show_compare": bool, "show_secret_chat": bool }`.

### 10.2 Upload & parsing

#### POST `/api/upload`

- Auth: yes.
- Request (Path A — multipart): `Content-Type: multipart/form-data` with `files` field (one or more).
- Request (Path B — JSON): `Content-Type: application/json` with `{ "files": [{ "name": "...", "data": "[data:...;base64,]<b64>" }] }`.
- Response (200): `{ "files": { "<fname>": <parsed-or-preview>, ... }, "errors": [...] | null }`.
- Response (400): `{ "error": "No files provided" }` or `{ "error": "All files failed to process", "details": [...] }`.
- Per-file error entries: `{ "file": "...", "error": "..." }`.

### 10.3 PDF export

#### POST `/api/export-pdf`

- Auth: yes.
- Request: JSON. Fields:
  - `currency_symbol` (str, default `"USD"`) — passed to SOA report.
  - `selected_files` (list[str], default all) — at present only the first entry is used.
  - `file_type` (str, optional) — overrides inferred type. Accepts `"GLOBAL_HOPPER" | "OPPORTUNITY_TRACKER" | anything else (falls back to SOA)`.
  - `sections_to_include` (list[str]) — Opp/Hopper section keys (see §9).
  - `filters` (dict) — report-specific filter shape (see §9).
- Response (200): `application/pdf` binary with download headers.
- Response (400): `{ "error": "No data available. Please upload files first." }`.
- Response (500): `{ "error": "... PDF generation failed: ..." }`.

### 10.4 AI

#### POST `/api/chat`

- Auth: yes.
- Request: JSON — `{ "message": "...", "model": "digitalocean/openai-gpt-oss-120b" }` (model optional; see §8.2).
- Response (200): `{ "content": "...", "charts": [...], "emails": [...] }`.
- Response (400): `{ "error": "No data available. Please upload files first." }` or `{ "error": "No message provided" }`.
- Response (502): `{ "error": "<provider error>" }`.

#### POST `/api/chat/clear`

- Auth: yes.
- Request: no body.
- Response (200): `{ "status": "ok" }`.

#### POST `/api/compare`

- Auth: yes.
- Request: JSON — `{ "message": "..." }`.
- Response (200):

```json
{
  "results": [
    { "model_id": "...", "model_name": "...", "content": "...", "error": null, "time": "2.34s" }
    // 4 entries in model order
  ]
}
```

- Errors: 400 (no data / no message), never bubbles up provider errors — provider failures appear inline as `"error": "..."` in the result entry.

### 10.5 Files (inline, PostgreSQL BYTEA)

#### GET `/api/files`

- Auth: yes.
- Response (200): `[{ "id": 123, "filename": "...", "upload_date": "ISO8601", "file_size": 12345 }, ...]`. Sorted by `upload_date DESC`.

#### GET `/api/files/<int:file_id>`

- Auth: yes.
- Response (200): binary attachment (`send_file` with `download_name=<filename>`).
- Response (404): `{ "error": "File not found" }`.

#### POST `/api/files/upload`

- Auth: yes.
- Request: JSON — `{ "files": [{ "name": "...", "data": "[data:...;base64,]<b64>" }, ...] }`.
- Response (200): `{ "message": "Successfully uploaded N files", "count": N }`.
- Response (400): `{ "error": "No files provided" }`.
- Response (500): `{ "error": "<exception>" }`.
- Note: does **not** run the parser; pure archive.

#### DELETE `/api/files/<int:file_id>`

- Auth: yes.
- Response (200): `{ "message": "File deleted successfully" }`.
- Response (500): `{ "error": "Failed to delete file" }`.

### 10.6 R2 cloud storage

#### POST `/api/r2/chunk-init`

- Auth: yes.
- Request: JSON — `{ "filename": "...", "total_chunks": N }`.
- Response (200): `{ "upload_id": "<hex32>" }`.
- Response (400): `{ "error": "filename and total_chunks required" }`.
- Response (500): `{ "error": "Failed to start multipart upload on R2" }`.

#### POST `/api/r2/chunk-upload`

- Auth: yes.
- Request: JSON — `{ "upload_id": "...", "chunk_index": 0..N-1, "data": "<b64>" }`.
- Response (200): `{ "received": k, "total": N }`.
- Response (400): missing fields or invalid base64.
- Response (404): invalid/expired upload_id.
- Response (500): part upload failure.

#### POST `/api/r2/chunk-finalize`

- Auth: yes.
- Request: JSON — `{ "upload_id": "..." }`.
- Response (200): `{ "id": db_row_id, "filename": "...", "r2_key": "...", "public_url": "..." | null, "file_size": bytes }`.
- Response (400): `{ "error": "Missing parts: received k/N" }`.
- Response (500): R2 assembly failure.

#### GET `/api/r2/files`

- Auth: yes.
- Response (200): `[{ "id", "filename", "r2_key", "public_url", "file_size", "upload_date" }, ...]` sorted by `upload_date DESC`.

#### GET `/api/r2/files/<int:file_id>`

- Auth: yes.
- Downloads file bytes from R2 and streams them to the client as an attachment.
- Response (404): file not found in DB.
- Response (500): R2 download failed.

#### DELETE `/api/r2/files/<int:file_id>`

- Auth: yes.
- Deletes row from Postgres **and** object from R2.
- Response (200): `{ "message": "File deleted from R2 and database" }`.
- Response (404): file not found.

#### POST `/api/r2/files/<int:file_id>/parse`

- Auth: yes.
- Downloads file from R2, runs `parse_file()`, saves result into `_parsed_store[sid]`.
- Response (200): `{ "files": { "<filename>": <parsed dict> } }`.
- Response (404): file not found.
- Response (500): download or parse failure.

---

## 11. Data model

### 11.1 PostgreSQL DDL

```sql
CREATE TABLE IF NOT EXISTS file_uploads (
    id          SERIAL PRIMARY KEY,
    filename    VARCHAR(255) NOT NULL,
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    file_data   BYTEA NOT NULL,
    file_size   INT,
    session_id  VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS r2_file_uploads (
    id          SERIAL PRIMARY KEY,
    filename    VARCHAR(255) NOT NULL,
    r2_key      VARCHAR(512) NOT NULL,
    public_url  TEXT,
    file_size   BIGINT,
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    session_id  VARCHAR(64)
);
```

Created automatically at module import via `init_db()` (which is called at the top of `server.py` so it runs under gunicorn even without `__main__`).

### 11.2 Connection pooling

`ThreadedConnectionPool(min=1, max=20, DATABASE_URL)`. Every `get_db_connection()` must be paired with a `return_db_connection(conn)` in a `finally` block — already done in every CRUD helper in `storage.py`.

### 11.3 In-memory per-process state

```python
_parsed_store = {           # Keyed by session_id
    sid: {
        filename: {
            "type": "excel" | "pdf" | "docx" | "pptx" | "image",
            "file_type": "SOA" | "INVOICE_LIST" | ...,  # only for excel
            "parsed": { ... },                            # only for excel
            "text": "...",                                 # pdf/docx/pptx
            "base64": "...", "mime": "...",                # image
            "file_bytes": b"..."                           # always retained
        }
    }
}
_chat_history = {           # Keyed by session_id
    sid: [ {"role": "user"|"assistant", "content": str|list}, ... ]
}
_multipart_sessions = {     # Keyed by session_upload_id (distinct from sid)
    session_upload_id: {
        "filename": "...", "r2_key": "...", "r2_upload_id": "...",
        "total": N, "parts": [{"PartNumber": int, "ETag": str}],
        "file_size": bytes, "created": epoch
    }
}
```

Neither is persisted; all three are wiped on server restart.

### 11.4 R2 bucket layout

- **Bucket**: `power` (from `R2_BUCKET_NAME` env var).
- **Key prefix**: `uploads/YYYY-MM/`.
- **Object name**: `<12-char hex UUID>_<sanitised filename>` (sanitised = spaces / `/` / `\` replaced with `_`).

No lifecycle / expiration rules set by the app.

---

## 12. Environment variables

All read via `python-dotenv` (`load_dotenv()` at module import). Required env vars marked with (R); optional with (O).

| Variable | Purpose | Default | Required? |
|---|---|---|---|
| `APP_PASSWORD` | Shared password for the login gate | `"rollsroyce"` | O (but should be set in prod) |
| `FLASK_SECRET_KEY` | Flask session signing key | ephemeral random | O (should be set in prod to keep sessions stable) |
| `PORT` | HTTP port for `python server.py` | `5000` | O |
| `DATABASE_URL` | Postgres URL for `psycopg2` | — | R |
| `R2_ENDPOINT_URL` | Cloudflare R2 S3 endpoint | — | R (for R2 features) |
| `R2_ACCESS_KEY_ID` | R2 access key | — | R |
| `R2_SECRET_ACCESS_KEY` | R2 secret | — | R |
| `R2_BUCKET_NAME` | R2 bucket name | `"power"` | O |
| `R2_PUBLIC_URL` | Public URL prefix for R2 (used to compute `public_url` in metadata) | `""` | O |
| `OPENROUTER_API_KEY` | OpenRouter auth (currently unused in code path; see §16) | — | O |
| `DIGITALOCEAN_API_KEY` | DO GenAI auth | — | R (if AI chat enabled) |
| `NVIDIA_API_KEY` | NVIDIA inference auth | — | R (if Kimi used) |
| `GOOGLE_CLOUD_API_KEY` | Vertex AI API key for Gemini 3 Pro | — | O (preferred) |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Vertex AI service-account JSON (inline, for Render.com) | — | O (fallback for GLM-5) |
| — | Local file `notional-analog-486611-t3-459586a9ad37.json` | — | fallback fallback for GLM-5 |

A `.env.example` is not present. The committed `.env` (flagged in §16) contains real R2 and Postgres credentials.

---

## 13. Feature flags

Single master flag in `server.py` L99–L108:

```python
ENABLE_EXTRA_FEATURES = True

FEATURE_FLAGS = {
    "show_ai":          ENABLE_EXTRA_FEATURES,
    "show_files":       ENABLE_EXTRA_FEATURES,
    "show_compare":     ENABLE_EXTRA_FEATURES,
    "show_secret_chat": ENABLE_EXTRA_FEATURES,
}
```

`FEATURE_FLAGS` is passed to both `index.html` (Jinja context) and `/api/config` (JSON), and bridged to JS as `window.__FEATURE_FLAGS`.

Flag effects:

| Flag | UI element it gates |
|---|---|
| `show_ai` | "AI Assistant" view pill + experimental badge; AI chat container |
| `show_files` | "Files" view pill; Files container (V1 inline + V2 R2 panels) |
| `show_compare` | "Compare" view pill; comparison container + `/api/compare` UI |
| `show_secret_chat` | Floating red "alert-circle" debug button (bottom right); password modal; floating secret-chat window (admin AI command center) |

When `ENABLE_EXTRA_FEATURES = False`, the Standard/Executive/Slides views remain visible for uploaded SOA/Invoice/Opp/Hopper files; AI and Files become inaccessible; `/api/chat`, `/api/compare`, `/api/files/*`, `/api/r2/*` routes still exist on the server (no server-side gating) but have no UI entry points.

The secret chat button (`secret-chat.js`) is a separate compact admin chat window that is NOT documented in this spec — it's feature-gated and the user has explicitly asked to leave it out of the redesign.

---

## 14. Frontend features spec (for the UI builder)

This section tells the UI builder **what must be on screen**. Visual styling is up to the builder. Use Rolls-Royce's brand sensibility (navy + metallic gold + white; premium / aerospace / financial) without prescribing specific colors or sizes.

### 14.1 Global shell

- **Login page** (`/login`): centered card with "ROLLS-ROYCE / CIVIL AEROSPACE" logo lockup, "Financial Dashboard" subtitle, a single `password` input with show/hide eye toggle, an "Access Dashboard" submit button, and an error banner slot. A footer line reads "For authorized users only. Contact your Rolls-Royce representative for access."
- **Main SPA** (`/`): sidebar + main content layout.
- **Sidebar contents, top to bottom**:
  - Logo lockup: "ROLLS-ROYCE" / "CIVIL AEROSPACE".
  - **Upload Files** section:
    - Drop zone with icon, headline "Drop Excel files here", subhead listing accepted extensions (`.xlsx, .xls, .xlsb, .xlsm, .pptx`).
    - Hidden file input, `accept=".xlsx,.xls,.xlsb,.xlsm,.pptx"`, `multiple`. Note: the input's `accept` attribute is narrower than the server's actual acceptance — PDFs, Word, PowerPoint and images are accepted server-side but not exposed through this input (the V2 R2 upload is the broader-accept path).
    - Inline progress bar.
    - List of uploaded-file chips below (one chip per file with a colored dot keyed to file-type and the filename).
  - **Dashboard View** section:
    - View pills: Standard, Executive, Slides, [Compare], [Files], [AI Assistant]. Bracketed items are feature-flagged. AI pill carries an "(Experimental)" badge.
  - **Filters** section (visible only for legacy SOA data): accordion with Invoice Type, Entry Type, Overdue Status checkbox groups + "Reset All Filters" button + unread-filter-count badge.
  - **Export** section (visible only when data is loaded): "Export PDF Report" button (opens the modal).
  - **Sidebar Footer**: "Data Visualizer" / "Finance & Receivables".
- **Main content header bar**: "Data Visualizer" title + "Rolls-Royce Civil Aerospace — Finance & Receivables" subtitle + ROLLS-ROYCE logo mark on the right. Below, a breadcrumb showing home icon + active view name (e.g. "Standard View").
- **Main content footer**: "ROLLS-ROYCE CIVIL AEROSPACE — Data Visualizer / Data sourced from uploaded workbook(s) · For internal use only".
- **Logout**: not present in the sidebar, but available via `GET /logout`. The redesign should add a logout button (e.g. in a user menu).

### 14.2 Welcome state (empty)

- Hero block: animated aircraft SVG, "Welcome to the RR Data Visualizer" heading, descriptive paragraph explaining smart detection of SOA / Invoice / Opp Tracker / Shop Visit / SVRG / Global Hopper.
- Primary CTA: "Upload Workbook(s)".
- 3-card feature grid below:
  - **Smart Detection** — "Automatically identifies SOA, Invoice Lists, Opportunity Trackers, Shop Visits, and SVRG files."
  - **Rich Analytics** — "Interactive charts, KPI cards, aging analysis, pipeline views, and engine timelines at a glance."
  - **Cross-File Linking** — "Upload multiple files to discover shared references, customers, and invoice links across datasets."

### 14.3 File upload behaviors

- **Drag + drop** onto the drop zone.
- **Click** the drop zone or CTA to open the file picker.
- **Multiple selection** supported.
- **Unsupported files** surfaced as a per-file toast.
- **Progress**: inline progress bar fills 30% → 60% → 90% → 100% as the request proceeds.
- **Success**: toast `N file(s) loaded successfully`; file-chip list updates; dashboard content replaces welcome state.
- **Errors**: red toast with the per-file error message.
- **Merge semantics**: uploading more files adds to `_filesData`, does not replace. File chips show all accumulated files.

### 14.4 Per-file-type frontend contracts

See §6 (each file-type subsection contains a "Frontend must render" block). Key global patterns:

- **Filtering**: each visualizer has a top-of-viz filter bar with dropdowns + (optional) threshold inputs. Changing a filter re-renders KPIs, charts and tables in place.
- **Sort**: every rendered table has sortable column headers (ascending / descending / reset by repeated click).
- **In-table fastfilters**: some tables have per-column chip filters (dropdowns above the table) — e.g. Opportunity Tracker's top-opps table has fastfilters on Customer / Ext Prob / Status.
- **Collapse / expand**: in the Opp Tracker, the five main post-hero sections (Top Opportunities, By Estimation Level, Project Timeline, Opps & Threats, Project Summary) are collapsible; Top Opportunities starts open, others start closed. In Global Hopper, all three tables (Opportunities Register, Executive Report, Detail Report) are collapsible and start closed.
- **Numeric formatting**:
  - USD dashboards: `$X.XM`, `$X.XK`, `$X.XX` (via `_fmtCurrency`).
  - Opp Tracker specifically: `$X.Xm` for values > 0 (millions only).
  - Global Hopper: `£X.Xm` and `£X.Xbn` (never `$`).
  - Counts: locale-formatted integers with commas.
  - Percentages: `X.X%`.
  - Dates: ISO-like strings (`YYYY-MM-DD`) as stored.
  - Missing / NaN: em-dash `—`.
- **Negative values in tables**: render in a "negative" color (distinct from positive).
- **Hover on chart element**: show a themed tooltip with the formatted value.
- **Cross-reference panel** (appears when multiple files uploaded): a "viz-crossref" section rendered at the bottom listing hints like "Invoice ref X found in N files" or "Customer Y appears in N files". The exact data contract comes from `_renderCrossRefHints()` in dashboard.js — inferred from the function name and the `_build_cross_references` parser helper (§6.7.4); verify before implementing.

### 14.5 PDF export modal

- Triggered from the sidebar "Export PDF Report" button or the main-content "Generate PDF Report" button.
- Modal overlay centered:
  - Header: "Export PDF Report" + X close.
  - Body: "Sections to Include" with 7 checkboxes (all checked by default — see §9.5 for the key mapping).
  - Footer: Cancel (closes modal) + "Generate PDF" button.
- On generate: spinner overlay, POST `/api/export-pdf`, download the returned PDF blob using the filename from `Content-Disposition`, toast success/failure.

### 14.6 AI Assistant view

- Model selector (5-option dropdown, default GPT OSS 120b).
- Welcome state: bot icon, title, description + experimental disclaimer.
- Quick-actions grid (array of `{label, prompt, icon}` — suggest 6–8 buttons like "Summarize this month's overdue", "Draft a payment reminder email", "Chart aging buckets", "What's the total credit note balance?").
- Chat message thread with user/assistant avatars and timestamps.
- Assistant messages render markdown; `[CHART_PLACEHOLDER]` tokens are replaced with a live ApexCharts chart (driven by the corresponding entry in `charts`); `[EMAIL_PLACEHOLDER]` tokens become an email-preview box with a Copy button.
- Typing indicator with live elapsed-seconds timer during a pending request.
- Activity-log drawer at the bottom (collapsible), timestamped entries with icons for connection / send / response / error.
- Input bar (bottom): clear-history trash button, auto-resizing textarea (Enter = send, Shift+Enter = newline), send button.

### 14.7 Compare view

- Single prompt input at top.
- 3 or 4 side-by-side panes with model-name header, response body slot, elapsed-time badge.
- Each pane shows a typing spinner until the fetched response arrives; errors render in a red inline message.
- Markdown rendering + inline charts/emails if present (same logic as regular chat).

### 14.8 Slides / Presentation view

- Slide navigation bar with "< Previous" / slide indicator ("Slide N of M · Slide Name") / "Next >" + keyboard arrow support.
- Per slide, re-use the KPI / chart / table components — each file type has its own slide sequence.

### 14.9 Files view

- Client-side password gate ("Restricted File Access") — single password input + Unlock button.
- Once unlocked, two panels stacked:
  - **Archived Files (PostgreSQL)** — inline files. Columns: Filename / Date Uploaded / Size / Actions (download, delete). Drop zone above the table; refresh button in the header.
  - **V2 Cloud Storage (Cloudflare R2)** — chunked files. Same columns + an additional Parse action. Different color accent (Cloudflare orange in the current UI, but pick your own). Shows per-upload progress bars for active chunked uploads.
- Both tables scroll within a fixed height; both support click-to-download via the Actions column.

### 14.10 Responsive behavior (inferred)

The current CSS is desktop-first. Redesign expectations:

- **Desktop (≥ 1200 px)**: full sidebar + main content split.
- **Tablet (768–1199 px)**: sidebar may collapse to a rail or hamburger.
- **Mobile (< 768 px)**: hide sidebar behind a drawer; KPI grids collapse to single column; charts fit viewport; tables become horizontally scrollable.
- Chart containers should have `height` configured; avoid aspect-ratio quirks in narrow viewports.

### 14.11 Loading / empty / error states

| State | Expected UI |
|---|---|
| Upload in progress | Full-screen semi-transparent overlay with a spinner; progress bar in sidebar. |
| AI response pending | Typing-dots animation in the chat thread with a live elapsed timer in seconds. |
| API 502 / 400 | Red toast with the server message. |
| Parser returned `file_type: ERROR` | Red error card inline in the visualizer with "Failed to render {filename}: {error}" text. |
| Parser returned `file_type: UNKNOWN` | Fallback raw-sheets table (one per sheet) with a warning "File type could not be determined; generic extraction applied." |
| No data + view != welcome | Show welcome state (if view is Standard / Executive / Slides / AI). |
| Files view without password unlock | Lock-icon empty state with password input. |

### 14.12 Toasts

Four toast types: success, error, warning, info. Stack in a corner; auto-dismiss after a few seconds; closable.

### 14.13 Global components the builder needs

- KPI Card (label + value + optional subtitle + optional icon + optional color class: success / danger / warning / neutral).
- Section Header (icon + title + optional badge chip + optional action button).
- Info Chip (`<b>Label:</b> value`).
- Filterable/Sortable Data Table (header row, per-column sort on click, optional per-column "fastfilter" chip rows above the body, max-rows footer "Showing X of Y" when truncated, horizontal scroll on overflow).
- Chart Card (header + fixed-height chart body).
- Gantt Cell (per-row-per-phase cell colored by state: done / current / future / empty, with tooltip).
- Collapsible Section (header pill + chevron that rotates; body animates on expand).
- Dropdown Select (used pervasively for filters).
- Threshold Number Input (for `min_amount` / `min_value`).
- Modal Overlay (PDF export + password + secret chat).
- Toast.
- File Chip (color dot + filename).
- Tab Bar + Tab Content (used in legacy Section Breakdown).
- Loading Overlay.

### 14.14 Chart types used (ApexCharts in current impl; the builder may substitute any modern chart lib)

- **Donut** — section breakdowns, opp type distributions, SV types, event qualifications, region split, status pipeline, restructure type.
- **Bar** — aging buckets (distributed), charges vs credits (stacked), section financial breakdowns, customer value top-N, year-over-year profits, EVS distribution, SV locations (horizontal), top customers (horizontal).
- **Stacked bar** — charges vs credits, opp-type × ext-probability, status × ext-probability.
- **Line / combo** — SVRG claims-over-time (column + cumulative line).
- **Area** — invoice list amount-by-due-date timeline.
- **Pie** — status breakdowns (rarely; mostly donut).
- **Custom Gantt table** — Opp Tracker project timeline (HTML table with colored cells per phase).

### 14.15 Animation expectations

GSAP is used today for page-load and section-entrance animations. The redesign should include:

- Subtle header entry (fade/slide) on page load.
- Staggered KPI card entry.
- Chart-in animation (ApexCharts ships this — `easeinout` over 800 ms; keep this feel).
- Tab-switch fade.
- Collapsible-section expand/collapse transition.

Exact timings / easings: your call.

---

## 15. Non-functional requirements

- **Inline upload cap**: 50 MB per request (Flask `MAX_CONTENT_LENGTH`).
- **Chunked R2 upload cap**: no server-side upper bound; 8 MB chunks, up to R2's 5 TB object limit.
- **Multi-worker gunicorn caveat**: in-memory state (`_parsed_store`, `_chat_history`, `_multipart_sessions`) is per-worker. Run with `-w 1` unless sessions are migrated to Redis.
- **Authentication**: single shared password, cookie-based. No RBAC / multi-user. No rate limiting. No brute-force protection. No MFA.
- **CORS**: wide-open (`CORS(app)` without args). Any origin can hit the API if it has a valid session cookie.
- **Session timeout**: none configured. Flask sessions are permanent by default and persist via cookie until cookie expiry (browser default: close of browser session unless `SESSION_PERMANENT=True` is set, which it is not here).
- **Database pool**: 1–20 connections. Postgres server must allow at least that many.
- **LLM timeouts**: 120 s for DigitalOcean, 600 s for NVIDIA streaming, up to 120 s × 3 retries (2s / 4s / 6s backoff) for GLM-5, no explicit timeout for Gemini 3 Pro (SDK default).
- **Base64 decoding**: malformed upload bodies are silently skipped inside `/api/upload`; the request still returns 200 if any file succeeds. Caller must check `errors` field.
- **PDF page size**: A4 Landscape (297×210 mm).
- **Matplotlib charts** inside PDFs: rendered at 150 DPI.
- **Log verbosity**: the app uses `print()` for diagnostic output (not structured logging). Render.com captures these as stdout log lines.

---

## 16. Known rough edges not to reproduce

These were inherited from V5 and partially cleaned up in the V6 refactor. The redesign should not reintroduce them.

1. **Committed secrets**: `.env` in the repo contains live Postgres and R2 credentials. Rotate and move to Render.com environment variables on re-deploy.
2. **Default password**: `APP_PASSWORD` defaults to `"rollsroyce"` if unset. Production must set it.
3. **Dead OpenRouter branch**: the default-fallback path in `call_openrouter` returns an error instead of calling OpenRouter. Qwen from the dropdown therefore does not work. Redesign: either implement the OpenRouter call properly or remove Qwen from the dropdown.
4. **Unreachable Gemini pane in Compare view**: the `/api/compare` endpoint returns 4 model results; the UI only renders 3. Fix the UI to render all 4 or remove Gemini from the compare list.
5. **Hardcoded GCP fallback key file**: `ai_chat.call_google_glm` falls back to reading `"notional-analog-486611-t3-459586a9ad37.json"` from the working directory. Remove this fallback and require env vars only.
6. **Streamlit `app.py`** at 95 KB is stale — a relic from V3. Not imported, not served, not useful. Delete.
7. **`_multipart_sessions` TTL**: entries have a `created` timestamp but no sweeper. A GC job should prune sessions older than ~1 hour.
8. **Duplicate deps in `requirements.txt`**: none seen at this revision — good. Keep clean.
9. **Multi-worker state loss**: in-memory stores. Consider moving `_parsed_store`, `_chat_history` and `_multipart_sessions` to Redis before scaling beyond 1 worker.
10. **Legacy SOA parser alive**: both `parse_soa_workbook` (legacy OrderedDict format) and the new `_parse_soa` (list-based) exist and differ in output shape. The PDF export still uses the legacy format; the frontend has `_isLegacySOA()` to disambiguate. Consolidate when possible.
11. **Image MIME inference is crude**: `server.py` treats anything other than `.png` as `image/jpeg`, so `.webp`, `.heic`, `.heif`, `.gif` are mis-labelled. Gemini's native handler receives the wrong MIME.
12. **The Gantt phase cells** pick the phase color from a fixed 8-color array with no accessibility considerations.
13. **`ENABLE_EXTRA_FEATURES = True` is hardcoded** — not env-driven. Consider reading from an env var so the same image can run in restricted and permissive modes.
14. **No CSRF protection** on any POST endpoint. The `flask-cors` setup allows cross-origin access. An authenticated cookie on another tab could be exploited. Redesign should add CSRF tokens or SameSite=strict cookies plus origin checks.
15. **`CHUNK_SIZE = 8 MB` is client-only**; server trusts whatever chunks arrive. A malicious client can send very small chunks to inflate the parts count. R2 caps at 10,000 parts per upload; bound `total_chunks` server-side.

---

## 17. Prompt recommendations for the UI builder

Feed this entire document to the UI builder (v0, Lovable, Bolt, etc.). Then use one of the prompts below to kick off the design. The builder handles visuals — this doc fixes what must be on screen.

### 17.1 Starter prompt — premium dark with gold accent

> Design a modern premium dashboard called **"Rolls-Royce Civil Aerospace Data Visualizer"**. Target audience: internal finance and commercial teams who analyze long, dense Excel spreadsheets.
>
> Follow the feature list in the attached spec section-for-section — every KPI card, chart, table, filter bar, collapsible section, modal, view mode, and behavior is listed there. Do not invent features; do not skip features.
>
> Use your own judgment on visuals. The vibe I want: **deep navy (#020B3A range) base, metallic gold accents, white/light text, generous whitespace, aerospace-industrial feel**. Inter or DM Sans for body, a display serif or a sharp geometric display font for hero numbers, JetBrains Mono for tabular data. Fluid responsive: full sidebar at desktop, drawer on mobile. Use shadcn/ui primitives or the builder's equivalent. Charts: recharts or ApexCharts, whichever the builder defaults to. Animation: subtle — fades, stagger, and chart-in; no bounces or confetti.
>
> The dashboard has six file-type-specific visualizers — follow the "Frontend must render" bullets inside each §6.x subsection. The view-mode switcher (Standard / Executive / Slides / Compare / Files / AI) is in §7. The AI Assistant behavior is in §8. The PDF export modal is in §9.5. Environment details and non-functional constraints are in §12 and §15.
>
> Produce a React + TypeScript app with Tailwind + shadcn. Target Vercel deployment. Wire every API call to the endpoints listed in §10 (don't mock them — read the body shapes from the spec and use fetch).

### 17.2 Starter prompt — light financial

> Same as above but: **white/off-white background, deep-navy primary, muted gold accents used sparingly for highlights only, traditional financial-report feel** (Bloomberg / Reuters aesthetic rather than Tesla / Stripe). Clean borders, dense tables, large readable numbers, minimal animation.

### 17.3 Starter prompt — "just the shell" for manual hookup

> Build only the app shell: sidebar with the sections listed in §14.1, main content area with the view-mode switcher and the welcome state from §14.2, the PDF-export modal from §14.5, and the AI Assistant layout from §14.6. Leave all data visualizers as placeholder sections with the labels from §6 — I'll wire those up separately. Return the React app with TypeScript, Tailwind, and routing set up.

### 17.4 Tips for iterating

- If the builder misses a chart type, quote the §6 subsection and the specific chart bullet.
- If the builder produces a generic "dashboard" look, explicitly reference "Rolls-Royce Civil Aerospace" premium aerospace + financial context and ask for deep navy + metallic gold (without dictating hex values — let the builder choose).
- If the builder collapses too many sections into tabs, remind it that the Opp Tracker hero page is intentionally long and scroll-driven: KPI row → chart row 1 → chart row 2 → priority cards → estimation-level cards → probability/type chips → 5 collapsible tables. Same for Global Hopper.
- Keep API endpoints exactly as listed in §10 so the backend can be used unchanged.

---

## Appendix A — File inventory (V6/ root)

Absolute paths:

- `C:\Users\Rutishkrishna\Desktop\RR\RR Powerbi\V6\server.py`
- `C:\Users\Rutishkrishna\Desktop\RR\RR Powerbi\V6\parser.py`
- `C:\Users\Rutishkrishna\Desktop\RR\RR Powerbi\V6\pdf_export.py`
- `C:\Users\Rutishkrishna\Desktop\RR\RR Powerbi\V6\ai_chat.py`
- `C:\Users\Rutishkrishna\Desktop\RR\RR Powerbi\V6\storage.py`
- `C:\Users\Rutishkrishna\Desktop\RR\RR Powerbi\V6\requirements.txt`
- `C:\Users\Rutishkrishna\Desktop\RR\RR Powerbi\V6\run.bat`
- `C:\Users\Rutishkrishna\Desktop\RR\RR Powerbi\V6\.env`
- `C:\Users\Rutishkrishna\Desktop\RR\RR Powerbi\V6\app.py` (stale Streamlit — see §16 item 6)
- `C:\Users\Rutishkrishna\Desktop\RR\RR Powerbi\V6\templates\index.html`
- `C:\Users\Rutishkrishna\Desktop\RR\RR Powerbi\V6\templates\login.html`
- `C:\Users\Rutishkrishna\Desktop\RR\RR Powerbi\V6\static\js\app.js`
- `C:\Users\Rutishkrishna\Desktop\RR\RR Powerbi\V6\static\js\dashboard.js`
- `C:\Users\Rutishkrishna\Desktop\RR\RR Powerbi\V6\static\js\login.js`
- `C:\Users\Rutishkrishna\Desktop\RR\RR Powerbi\V6\static\js\secret-chat.js` (feature-gated admin chat; not documented here)

## Appendix B — Endpoint checklist

Use this one-pager when wiring the frontend:

```
GET    /                                  → HTML (auth)
GET    /login                             → HTML
POST   /login                             → 302 or HTML
GET    /logout                            → 302
GET    /api/config                        → JSON feature flags (auth)
POST   /api/upload                        → JSON files+errors (auth)
POST   /api/export-pdf                    → application/pdf (auth)
GET    /api/files                         → JSON list (auth)
GET    /api/files/<id>                    → binary file (auth)
POST   /api/files/upload                  → JSON count (auth)
DELETE /api/files/<id>                    → JSON ok (auth)
POST   /api/r2/chunk-init                 → JSON upload_id (auth)
POST   /api/r2/chunk-upload               → JSON received/total (auth)
POST   /api/r2/chunk-finalize             → JSON file meta (auth)
GET    /api/r2/files                      → JSON list (auth)
GET    /api/r2/files/<id>                 → binary file (auth)
DELETE /api/r2/files/<id>                 → JSON ok (auth)
POST   /api/r2/files/<id>/parse           → JSON files (auth)
POST   /api/chat                          → JSON content/charts/emails (auth)
POST   /api/chat/clear                    → JSON ok (auth)
POST   /api/compare                       → JSON results (auth)
```

## Appendix C — Field name quick-reference (verbatim, copy/paste into schemas)

### SOA item

`company_code, account, reference, doc_date, due_date, amount, currency, text, assignment, rr_comments, action_owner, days_late, customer_comments, po_reference, lpi_cumulated`

### SOA section

`name, section_type, total, overdue, available_credit, items[]`

### SOA section_type enum

`charges | credits | totalcare | spare_parts | lpi | crc`

### SOA metadata

`title, customer_name, customer_number, contact_email, lpi_rate, report_date, avg_days_late, source_file, source_sheet`

### SOA grand_totals

`total_overdue, total_credits, net_balance`

### SOA aging_buckets

`current, 1_30_days, 31_60_days, 61_90_days, 91_180_days, over_180_days`

### INVOICE_LIST item

`reference, doc_date, due_date, currency, amount, reference_key3, text, assignment`

### INVOICE_LIST totals

`total_amount, total_positive, total_negative, item_count`

### OPPORTUNITY_TRACKER opportunity

`number, project, programme, customer, region, asks, opportunity_type, levers, priority, spe_related, num_spe, crp_pct, ext_probability, int_complexity, status, evaluation_level, term_benefit, benefit_2026, benefit_2027, sum_26_27, financials, supporting_financials, to_go, resource_priority`

### OPPORTUNITY_TRACKER financials (per group)

Groups: `existing_deal_cash, existing_deal_profit, new_deal_cash, new_deal_profit`. Each group: `yr_2025, yr_2026, yr_2027, yr_2028, yr_2029, yr_2030`.

### OPPORTUNITY_TRACKER milestones (Date Input)

`idea_generation, approval_to_launch, strategy_approval, be_generated, approval, negotiation_strategy, proposal_submitted, proposal_signed`

### SHOP_VISIT record

`part_number, serial_number, event_datetime, operator, parent_serial, registration, action_code, rework_level, service_event, hsn, csn, hssv, cssv, sv_type, sv_location`

### SVRG claim

`date, year, credit_ref, guarantee, credit_value, cumulative_value`

### SVRG event

`event_type, date, engine_serial, aircraft, tsn_tsr, csn_csr, description, qualification, justification, rr_input, rr_justification, guarantee_coverage, comments`

### GLOBAL_HOPPER opportunity

`region, customer, engine_value_stream, top_level_evs, vp_owner, restructure_type, maturity, onerous_type, initiative, project_plan_req, status, expected_year, signature_ap, crp_term_benefit, profit_2026, profit_2027, profit_2028, profit_2029, profit_2030`

### GLOBAL_HOPPER pipeline stages (canonical order)

`Initial idea, ICT formed, Strategy Approved, Financial Modelling Started, Financial Modelling Complete, Financials Approved, Negotiations Started, Negotiations Concluded, Contracting Started, Contracting Concluded`

### AI response envelope

`content, charts[], emails[], error`

### AI chart-fence JSON

`type ("bar" | "donut" | "line" | "pie"), title, labels[], series[] ({ name, data[] })`

---

*End of V6_SPEC.md.*
