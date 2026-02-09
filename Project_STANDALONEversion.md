# CLAUDE_STANDALONE.md — Rolls-Royce SOA Dashboard (Standalone / Work Laptop Version)

## What This Project Is

A **Statement of Account (SOA) Dashboard** for **Rolls-Royce Civil Aerospace**. It ingests RR-style SOA Excel workbooks (.xlsx) and visualises CRC payments, TotalCare, Spare Parts, Late Payment Interest, credits, balances, ageing, and more.

**Nothing is hard-coded to a particular customer or column position.** The parser dynamically detects sections, headers, column mappings, and amounts from any RR-style SOA workbook.

**This is the STANDALONE version** — designed for locked-down work laptops where `pip install` is not available. It uses **zero external dependencies** — only the Python standard library.

There is also a full-featured Streamlit version (`app.py`) with its own documentation (`CLAUDE.md`). The parsing logic is shared between both versions but implemented slightly differently (pandas vs plain dicts).

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI Framework | Python `http.server` (stdlib) — serves complete HTML pages |
| Charts | Chart.js 4.4.0 (loaded from CDN in browser) |
| Data | Plain Python lists of dicts (no pandas) |
| Excel Parser | `zipfile` + `xml.etree.ElementTree` (reads .xlsx as ZIP of XML) |
| Interactivity | Vanilla JavaScript (tab switching, table filtering, search) |
| Language | Python 3.8+ (stdlib only) |

**External resource:** Chart.js is loaded from `https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js` in the browser. Requires internet access on the machine running the browser.

## How to Run

```bash
python app_standalone.py
# Auto-opens browser to http://localhost:8050
# Press Ctrl+C in terminal to stop
```

No pip, no venv, no dependencies. Just Python.

---

## File Structure

This version is a **single self-contained file**:

```
app_standalone.py     # THE ENTIRE APP — ~580 lines, zero dependencies
CLAUDE_STANDALONE.md  # THIS FILE — context documentation
```

When deployed to a work laptop, you only need `app_standalone.py`. Nothing else.

---

## Code Architecture (`app_standalone.py`, ~580 lines)

```
Lines 1-19        Imports (all stdlib: os, sys, io, re, math, json, zipfile, html,
                  threading, webbrowser, http.server, urllib.parse, xml.etree)
Lines 21-37       Colour palette constants (identical to Streamlit version)
Lines 40-145      Pure-Python XLSX reader (read_xlsx function)
Lines 148-397     SOA parser (parse_soa function — ported from app.py)
                  Includes: _is_section_header, _is_header_row, _is_summary_row,
                  _coerce_amount, _coerce_date, _coerce_int, _normalise_header,
                  _map_columns, _find_amount_col
Lines 400-425     Formatting helpers: fmt_currency, fmt_date, esc (HTML escape),
                  aging_bucket
Lines 428-495     CSS string constant (all dashboard styling)
Lines 498-530     HTML builder helpers: _metric_card_html, _section_hdr,
                  _build_table_html, _get_display_cols
Lines 533-700     build_dashboard_html(data) — generates the complete dashboard page:
                  header, customer info, KPIs, all charts (Chart.js), tabs,
                  section breakdowns, invoice register, filters, footer, JS
Lines 703-730     UPLOAD_HTML constant — the file upload landing page
Lines 733-790     HTTP server: _parse_multipart, DashboardHandler class
                  Routes: GET / (upload), POST /upload (parse), GET /dashboard
Lines 793-810     main() — starts server, auto-opens browser
```

---

## Colour Palette

Identical to the Streamlit version:

```python
RR_NAVY   = "#10069F"   # Primary brand blue
RR_DARK   = "#0C0033"   # Deep navy (strong text)
RR_SILVER = "#C0C0C0"   # Accents
RR_LIGHT  = "#E8E8EE"   # Light backgrounds
RR_WHITE  = "#FFFFFF"
RR_GOLD   = "#B8860B"   # Currently unused
RR_RED    = "#D32F2F"   # Negative values
RR_GREEN  = "#2E7D32"   # Positive values / credits
RR_BLUE2  = "#1565C0"   # Secondary blue (gradients)
RR_AMBER  = "#F9A825"   # Warning-level aging

SECTION_COLOURS = ["#10069F", "#1565C0", "#5E35B1", "#00838F", "#C62828", "#EF6C00", "#2E7D32", "#6A1B9A"]

AGING_COLORS = {
    "Current": "#2E7D32",     "1-30 Days": "#66BB6A",
    "31-60 Days": "#F9A825",  "61-90 Days": "#EF6C00",
    "91-180 Days": "#D32F2F", "180+ Days": "#B71C1C",  "Unknown": "#9E9E9E"
}
```

| Surface | Colour |
|---|---|
| Page background | `#F0F1F5` |
| Main text | `#1a1a2e` |
| Header gradient | `linear-gradient(135deg, #10069F, #0C0033)` |
| Section header gradient | `linear-gradient(90deg, #10069F, #1565C0)` |
| Table header bg | `#10069F` with white text |
| Table alt rows | `#F5F5FA` |
| Active tab | `#10069F` bg, white text |
| Inactive tab | `#FFFFFF` bg, `#333` text |
| Metric card left-border | `#10069F` |

---

## XLSX Parser (Pure Python)

Since openpyxl can't be installed, the standalone version reads `.xlsx` files using only `zipfile` and `xml.etree.ElementTree`.

### How XLSX Files Work

`.xlsx` is a ZIP archive containing XML files:
```
[xlsx ZIP contents]
├── xl/sharedStrings.xml     # Shared string table (most text cells reference an index)
├── xl/styles.xml            # Cell formatting (needed to detect date cells)
├── xl/workbook.xml          # Sheet names and order
└── xl/worksheets/sheet1.xml # Actual cell data (rows, columns, values)
```

### Parsing Steps (`read_xlsx` function)

1. **Open ZIP**, read all relevant XML files
2. **Shared Strings** (`xl/sharedStrings.xml`):
   - Parse `<si>` elements, each containing `<t>` text or `<r><t>` rich text runs
   - Build a list: `shared_strings[index]` → string value
3. **Date Detection** (`xl/styles.xml`):
   - Built-in date format IDs: 14-22, 45-47
   - Custom formats: scan `<numFmt>` for codes containing "yy", "mm", "dd" (but not "h" — that's time)
   - Map cell style indices (`<xf>` in `<cellXfs>`) to date format IDs
   - Result: `date_style_indices` set — if a cell's `s` attribute is in this set, its numeric value is a date
4. **Sheet Names** (`xl/workbook.xml`): extract from `<sheet>` elements
5. **Cell Data** (`xl/worksheets/sheet1.xml`):
   - Iterate `<row>` → `<c>` (cell) elements
   - Cell reference "A1" → column 0, row 0. "AB12" → column 27, row 11
   - Cell type `t` attribute:
     - `"s"` → shared string: `<v>` is index into shared_strings list
     - `"inlineStr"` → inline: text in `<is><t>`
     - `"b"` → boolean: "1" = True
     - absent → number: parse `<v>` as float, check if date-styled
   - Date conversion: `datetime(1899, 12, 30) + timedelta(days=serial_number)`
   - Integer detection: if `num == int(num)` and not huge, store as `int`
6. **Pad rows** to equal width, return `(sheet_name, list_of_rows)`

### Key Function: `_excel_serial_to_date(serial)`
```python
# Excel epoch with Lotus 123 leap year bug compensation
datetime(1899, 12, 30) + timedelta(days=int(serial))
```
Valid range: serial 1–200000. Returns None for out-of-range values.

### Key Function: `_col_letter_to_idx(col_str)`
```python
# "A"→0, "B"→1, "Z"→25, "AA"→26, "AZ"→51
```

---

## SOA Parser (`parse_soa` function)

Identical logic to the Streamlit version but uses plain Python dicts/lists instead of pandas DataFrames.

### Input: Raw file bytes (from HTTP upload)
### Output:
```python
{
    "metadata": {
        "title": str, "customer_name": str, "customer_id": str,
        "contact": str, "lpi_rate": float, "avg_days_late": int,
        "report_date": datetime
    },
    "sections": OrderedDict {
        "Section Name": {
            "header": list[str|None],
            "colmap": dict,             # semantic key → column index
            "rows": list[dict],         # line item records
            "totals": {"total": float, "overdue": float, ...}
        }
    },
    "all_items": list[dict],            # NOT a DataFrame — plain list of dicts
    "grand_totals": {
        "total_charges": float, "total_credits": float, "net_balance": float,
        "total_overdue": float, "item_count": int,
        "section_totals": dict, "section_overdue": dict, "available_credits": dict
    }
}
```

### Key Differences from Streamlit Version

| Aspect | Streamlit (`app.py`) | Standalone (`app_standalone.py`) |
|---|---|---|
| `all_items` type | `pd.DataFrame` | `list[dict]` |
| Date type | `pd.Timestamp` | `datetime` |
| Grand totals calc | `df.loc[df["Amount"] > 0, "Amount"].sum()` | `sum(r["Amount"] for r in all_items if r["Amount"] > 0)` |
| Days Late auto-calc | `pd.Timestamp.now().normalize()` | `datetime.now().replace(hour=0,...)` |
| Date coercion | Returns `pd.Timestamp` | Returns `datetime` |

### Three-Pass Strategy (same as Streamlit)

**Pass 1 — Metadata** (first 15 rows): customer name/ID, contact, LPI rate, avg days late, report date

**Pass 2 — Structure**: master header row, section boundaries

**Pass 3 — Data**: column mapping, record extraction, summary totals

### Detection Rules

- **Section header**: ≤3 non-empty cells, matches keywords (charges, credits, totalcare, spare parts, late payment, interest, customer responsibility, usable, offset)
- **Column header**: ≥4 non-empty cells, no numbers >100, ≥3 keyword hits
- **Summary row**: Short text ≤25 chars, exact match (total, overdue, available credit)
- **"TotalCare" is NOT "total"** — the parser requires standalone labels

### Column Mapping

| Semantic Key | Header Label Match |
|---|---|
| `amount` | contains "amount" |
| `currency` | "curr" or "currency" |
| `due_date` | "net due" or "due date" |
| `doc_date` | "document"+"date", "invoice date" |
| `doc_no` | "document"+"no" |
| `reference` | contains "reference" |
| `text` | exactly "text" |
| `assignment` | "assignment" or "arrangement" |
| `rr_comments` | "r-r comment" or "rr comment" |
| `action_owner` | "action" or "reqd" |
| `days_late` | "days"+"late" |
| `status` | contains "status" |
| `type` | contains "type" |

---

## HTTP Server Architecture

### Routes

| Method | Path | Behaviour |
|---|---|---|
| GET | `/` | Serves `UPLOAD_HTML` (branded upload page) |
| GET | `/dashboard` | Serves cached dashboard HTML (or redirects to `/` if no data) |
| POST | `/upload` | Parses multipart form, runs SOA parser, caches HTML, 303→`/dashboard` |

### Request Flow

```
Browser GET /  →  Upload page (branded HTML form with file input)
       ↓ user selects .xlsx, clicks "Upload & Analyse"
Browser POST /upload  →  Server parses multipart body, extracts file bytes
       ↓
       parse_soa(file_bytes)  →  data dict
       ↓
       build_dashboard_html(data)  →  complete HTML string (cached in _dashboard_cache)
       ↓
       303 Redirect → /dashboard
       ↓
Browser GET /dashboard  →  Serves the pre-rendered HTML
```

### Multipart Form Parsing (`_parse_multipart`)

Manually splits POST body by boundary (no `cgi.FieldStorage`):
```python
parts = body.split(b"--" + boundary)
# For each part: extract Content-Disposition name/filename, extract content after \r\n\r\n
```

### Server Startup

```python
server = HTTPServer(("", 8050), DashboardHandler)
threading.Timer(1.0, lambda: webbrowser.open("http://localhost:8050")).start()
server.serve_forever()
```
- Port 8050 (hardcoded as `PORT` constant)
- Browser auto-opens after 1-second delay
- Ctrl+C stops gracefully

---

## HTML Generation (`build_dashboard_html`)

The entire dashboard is rendered server-side as a single HTML string. All data is embedded directly — no AJAX calls.

### Chart.js Integration

Each chart is a `<canvas>` element + a `<script>` block that creates a `new Chart()`:

```html
<div class="chart-box">
  <canvas id="chartDonut"></canvas>
  <script>
    new Chart(document.getElementById('chartDonut'), {
      type: 'doughnut',
      data: { labels: [...], datasets: [{ data: [...], backgroundColor: [...] }] },
      options: { responsive: true, cutout: '55%', plugins: { title: {...}, legend: {...} } }
    });
  </script>
</div>
```

Chart types used:
- `doughnut` — Breakdown by Section, Status Distribution
- `bar` — Charges vs Credits, Aging Analysis, Bilateral Position
- `bar` with `indexAxis:'y'` — Net Balance by Section, Top Items by Amount
- `pie` — Status Distribution per section

### Data Embedding

Python data is embedded in HTML via `json.dumps()`:
```python
html += f"data: {json.dumps(values)}"
```

For the filter system, raw amounts and days-late are embedded as JS arrays:
```python
amounts_json = json.dumps([r["Amount"] for r in all_items])
days_late_json = json.dumps([r.get("Days Late") or 0 for r in all_items])
```

---

## Client-Side JavaScript

### Tab Switching
```javascript
function switchTab(idx) {
    document.querySelectorAll('.tab-btn').forEach((b,i) => b.classList.toggle('active', i===idx));
    document.querySelectorAll('.tab-panel').forEach((p,i) => p.classList.toggle('active', i===idx));
}
```
Tabs use `.active` CSS class for visibility (`.tab-panel { display:none }` / `.tab-panel.active { display:block }`).

### Table Filtering (Complete Invoice Register)
```javascript
function filterTable() {
    // Reads selected options from Section/Type multiselects + search text
    // Shows/hides table rows based on data-section and data-type attributes
    // Recalculates summary: count, total amount, overdue amount using rawAmounts[] array
}
```

Each table row has `data-section` and `data-type` attributes for filtering:
```html
<tr data-section="TotalCare Charges" data-type="Charge">...</tr>
```

### Currency Formatting (JS)
```javascript
function fmtCurrency(val) {
    const neg = val < 0;
    const av = Math.abs(val);
    let s = '$' + av.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
    return neg ? '-' + s : s;
}
```

---

## CSS (Embedded in Python `CSS` constant)

No Streamlit CSS issues here — we control the entire DOM. Key classes:

| Class | Purpose |
|---|---|
| `.rr-header` | Dark gradient header bar |
| `.rr-header .title` | White header title text |
| `.rr-logo-text` | ROLLS-ROYCE bordered logo |
| `.metric-card` | White KPI card with blue left border |
| `.metric-card .value.negative` | Red text for negative values |
| `.metric-card .value.positive` | Green text for positive values |
| `.section-hdr` | Blue gradient section divider |
| `.info-bar` | White customer info bar |
| `.info-chip` | Grey rounded metadata badge |
| `.chart-box` | White rounded container for Chart.js canvas |
| `table.data-table` | Styled data table |
| `.tab-btn` / `.tab-btn.active` | Tab button (white/navy) |
| `.tab-panel` / `.tab-panel.active` | Tab content (hidden/visible) |
| `.filter-row` / `.filter-group` | Filter controls layout |
| `.summary-metrics` | Bottom summary (items, total, overdue) |
| `.grid`, `.grid-6`, `.grid-5`, `.grid-3`, `.grid-2` | CSS Grid layouts |

Responsive: at `≤900px`, grids collapse to fewer columns.

---

## Dashboard UI Sections

### 1. Header Bar
- Gradient `#10069F` → `#0C0033`, white title/subtitle, ROLLS-ROYCE bordered logo

### 2. Customer Info Bar
- White card: customer name, info chips for ID, contact, LPI rate, avg days late, report date

### 3. KPI Cards (6-column CSS grid)
- Total Charges, Total Credits, Net Balance, Total Overdue, Avg Days Late, Open Items

### 4. Executive Overview (3-column grid)
- Donut: Breakdown by Section
- Grouped bar: Charges vs Credits by Section
- Coloured bar: Aging Analysis

### 5. Bilateral Position (2-column grid)
- Bar: Customer→RR vs RR→Customer
- Horizontal bar: Net Balance by Section

### 6. Section Breakdown (JS tabs)
- Per tab: 5 KPI cards, status pie chart, top items horizontal bar, full data table

### 7. Complete Invoice Register
- Multiselect filters (Section, Type) + text search
- Full HTML table with data-attributes for JS filtering
- Summary metrics: Filtered Items, Total, Overdue (recalculated live by JS)

### 8. Footer

---

## Known Limitations vs Streamlit Version

| Feature | Streamlit | Standalone |
|---|---|---|
| File upload | Drag-and-drop widget | Standard HTML file input |
| Chart library | Plotly (interactive tooltips, zoom) | Chart.js (hover tooltips, no zoom) |
| Table filtering | Server-side (Streamlit reruns) | Client-side JS (faster, no round-trip) |
| Table sorting | Built-in st.dataframe | Not implemented (could add JS sort) |
| Amount range filter | Slider widget | Not implemented (has text search instead) |
| Live reload | Streamlit auto-reloads on code change | Must restart `python app_standalone.py` |
| Status multiselect filter | Yes | Not implemented (has text search) |
| Sidebar | Dark branded sidebar | No sidebar (upload is a separate page) |

---

## Important Rules (What NOT to Do)

1. **Do NOT add any `import` that isn't from the Python standard library** — the entire point is zero dependencies.
2. **Do NOT hard-code column positions or customer names** — parser must stay dynamic.
3. **Do NOT use `cgi.FieldStorage`** — it's deprecated in Python 3.13+. The multipart parser is manual.
4. **Chart.js requires internet access** in the browser. If the work laptop blocks CDN, the charts will not render (tables and KPIs will still work).
5. **Keep parsing logic in sync** with `app.py` if modifying the parser.
6. **Port is hardcoded to 8050** — if that's blocked, change the `PORT` constant at the top of the file.
