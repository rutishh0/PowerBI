# CLAUDE.md — Rolls-Royce SOA Dashboard (Streamlit Version)

## What This Project Is

A **Statement of Account (SOA) Dashboard** for **Rolls-Royce Civil Aerospace**. It ingests RR-style SOA Excel workbooks (.xlsx) and visualises CRC payments, TotalCare, Spare Parts, Late Payment Interest, credits, balances, ageing, and more.

**Nothing is hard-coded to a particular customer or column position.** The parser dynamically detects sections, headers, column mappings, and amounts from any RR-style SOA workbook.

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI Framework | Streamlit (with heavy custom CSS via `st.markdown(unsafe_allow_html=True)`) |
| Charts | Plotly Express + Plotly Graph Objects |
| Data | Pandas DataFrames, NumPy |
| Excel Parser | openpyxl (`load_workbook(file, data_only=True)`) |
| Language | Python 3.10+ |

## How to Run

```bash
pip install -r requirements.txt
streamlit run app.py
# or just: run.bat
```

---

## File Structure

```
V5/
├── app.py                      # THE APP — Streamlit dashboard (1249 lines)
├── requirements.txt            # streamlit>=1.54, plotly>=6.5, openpyxl>=3.1, pandas>=2.2, numpy>=1.23
├── run.bat                     # "streamlit run app.py"
├── app - Copy.py               # Backup copy
├── requirements - Copy.txt     # Backup copy
├── CLAUDE.md                   # THIS FILE
├── Rutish_Airways_Statement_of_Account.htm         # Excel HTML export (reference only)
└── Rutish_Airways_Statement_of_Account_files/      # Excel HTML export assets (reference only)
```

There is also an `app_standalone.py` (zero-dependency version for locked-down laptops) — that has its own separate documentation file `CLAUDE_STANDALONE.md`. Do not confuse the two.

**No `.xlsx` test files are committed** — the user uploads them at runtime via the sidebar.

---

## Code Architecture (`app.py`, 1249 lines)

```
Lines 1-24        Imports (pandas, plotly, streamlit, openpyxl, numpy)
Lines 25-47       Page config, colour palette constants, SECTION_COLOURS
Lines 49-204      CSS injection — single <style> block via st.markdown
Lines 207-254     Section/header/summary detection keyword lists + _is_section_header()
Lines 255-283     _is_header_row() — detects column header rows
Lines 284-303     _is_summary_row() — detects Total/Overdue/Available Credit rows
Lines 304-434     Helper functions: _find_amount_col, _coerce_amount, _coerce_date,
                  _coerce_int, _normalise_header, _map_columns
Lines 437-737     parse_soa_workbook() — main 3-pass parser, returns dict
Lines 739-831     Visualisation helpers: fmt_currency, metric_card HTML, make_donut,
                  CHART_LAYOUT, make_bar, aging_bucket, AGING_ORDER, AGING_COLORS
Lines 832-854     Sidebar: file uploader, currency display select, show-credits checkbox
Lines 855-870     Header bar HTML (uses <div> not <h1> — see gotchas)
Lines 872-885     Welcome/empty state (when no file uploaded)
Lines 887-920     File parsing + customer info bar with info chips
Lines 922-944     KPI cards — 6-column grid (Total Charges, Credits, Net Balance,
                  Total Overdue, Avg Days Late, Open Items)
Lines 946-994     Executive Overview — 3 charts:
                    • Breakdown by Section (donut)
                    • Charges vs Credits by Section (grouped bar)
                    • Aging Analysis (coloured bar)
Lines 996-1039    Bilateral Position — 2 charts:
                    • Customer→RR vs RR→Customer (bar)
                    • Net Balance by Section (horizontal bar)
Lines 1042-1172   Section Breakdown — tabbed interface (st.tabs):
                    Per tab: 5 KPI cards, status pie chart, top items bar, data table
Lines 1174-1235   Complete Invoice Register:
                    Filters (multiselect section/type/status, amount slider),
                    full data table, summary metrics (items, total, overdue)
Lines 1237-1249   Footer
```

---

## Colour Palette

```python
RR_NAVY   = "#10069F"   # Primary brand blue (headers, borders, active tabs, chart default)
RR_DARK   = "#0C0033"   # Deep navy (sidebar bg, strong text, header gradient end)
RR_SILVER = "#C0C0C0"   # Accents
RR_LIGHT  = "#E8E8EE"   # Light backgrounds
RR_WHITE  = "#FFFFFF"
RR_GOLD   = "#B8860B"   # Currently unused
RR_RED    = "#D32F2F"   # Negative values, overdue
RR_GREEN  = "#2E7D32"   # Positive values, credits
RR_BLUE2  = "#1565C0"   # Secondary blue (gradients, section header end)
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
| Sidebar background | `#0C0033` |
| Sidebar text | `#E0E0F0` (light) |
| Main area text | `#1a1a2e` (dark) |
| Header gradient | `linear-gradient(135deg, #10069F, #0C0033)` |
| Section header gradient | `linear-gradient(90deg, #10069F, #1565C0)` |
| Table header bg | `#10069F` with white text |
| Metric card border-left | `#10069F` |
| Active tab | `#10069F` bg, white text |
| Inactive tab | `#FFFFFF` bg, `#333` text |

---

## CSS Architecture and CRITICAL Gotchas

All CSS is one `<style>` block injected at lines 50-203 via `st.markdown()`.

### The Core Problem

Streamlit wraps all `unsafe_allow_html` content inside its own DOM (`<div class="stMarkdown">`, `<div data-testid="stMarkdownContainer">`, etc.). Streamlit also applies its own aggressive CSS to `h1`, `h2`, `p`, `span`, etc.

### Specific Issues and Solutions

**1. Global text color rule (line 59):**
```css
.stApp p, .stApp span, .stApp label, .stApp div { color: #1a1a2e; }
```
This is needed for main-area readability but **leaks into**: the dark header bar, dark sidebar, active tabs. Every dark-background element needs explicit inline colour overrides.

**2. Header title MUST use `<div>` not `<h1>` (line 865):**
Streamlit forces its own `color` on `<h1>` elements through extremely high-specificity internal selectors. Even `style="color:#FFFFFF !important"` on an `<h1>` does NOT work. The solution is:
```html
<div style="color:#FFFFFF; font-size:1.65rem; font-weight:700;">Statement of Account Dashboard</div>
```

**3. Active tab text (lines 166-173):**
Setting `color: #FFFFFF` on the tab container is not enough — the text inside is in a child `<p>` or `<span>` that inherits the global dark color. Fix:
```css
.stTabs [aria-selected="true"] p,
.stTabs [aria-selected="true"] span,
.stTabs [aria-selected="true"] div { color: #FFFFFF !important; }
```

**4. Sidebar widget text:**
The sidebar has `background: #0C0033` with `color: #E0E0F0`. If you add ANY global rule targeting `[data-baseweb="select"]` or `[data-baseweb="slider"]` elements, it will override sidebar dropdown/slider text to dark colours, making them invisible. Always scope such rules to `.stMainBlockContainer`.

**5. NEVER create `.streamlit/config.toml` with `[theme]` settings.**
Setting `textColor` there forces dark text on ALL widget internals (sidebar selects, file uploaders, checkboxes), making them unreadable on the dark sidebar.

---

## The SOA Parser — Detailed Logic

### Input: RR SOA Excel Workbooks

General structure of the worksheets:
1. **Metadata rows** (first ~15 rows): Customer name, ID, contact, LPI rate, average days late, report date
2. **Master header row**: Column labels — "Reference", "Document No", "Document Date", "Amount", "Currency", etc.
3. **Section header rows**: Single-cell rows like "TotalCare Charges", "Spare Parts Credits", "Late Payment Interest"
4. **Data rows** under each section: Line items with amounts, dates, references
5. **Summary rows**: "Total", "Overdue", "Available Credit" with associated amounts

### Three-Pass Strategy

**Pass 1 — Metadata** (scans first 15 rows):
- Keywords: "statement of account", "customer" (+name/+#), "contact", "lpi"/"lp rate", "average days late", "today"
- LPI rate: handles both "1.5000%" strings and raw decimals < 1
- Extracts: `customer_name`, `customer_id`, `contact`, `lpi_rate`, `avg_days_late`, `report_date`

**Pass 2 — Structure Detection**:
- `_is_header_row()`: ≥4 non-empty cells, no large numbers (>100), ≥3 keyword hits
  - Keywords: company, account, reference, document, date, amount, curr, text, assignment, arrangement, comments, status, action, days, late, lpi, invoice, type, interest, net due
- `_is_section_header()`: ≤3 non-empty cells, not numeric, not a summary keyword, matches section keywords
  - Section keywords: charges, credits, credit, totalcare, familycare, missioncare, spare parts, late payment, interest, customer respon, customer responsibility, usable, offset
- `_is_summary_row()`: Short text (≤25 chars), exact match to: total, overdue, available credit, total overdue, net balance
  - **Critical:** "TotalCare" must NOT match as "total" — the parser requires standalone labels

**Pass 3 — Data Extraction** per section:
- Checks rows `start+1` to `start+3` for section-local header rows
- `_map_columns()` maps header labels to semantic keys:

| Key | Matches |
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
| `interest_method` | "interest" or "calc" |
| `po_reference` | "etr" or "po" or "pr" |
| `lpi_cumulated` | contains "lpi" |
| `customer_comments` | "comment" (not r-r/rr) |
| `customer_name` | "customer" (not comment/name/respon) |

- Amount extraction: tries mapped column first, falls back to scanning for any numeric > 0.01
- Auto-computes Days Late from Due Date when not explicitly available: `max(0, (today - due_date).days)`
- Status derivation: checks R-R Comments, Action Owner, Customer Comments for status keywords (ready for payment, under approval, dispute, payment pending, invoice sent, credit note, etc.)
- Entry Type: "Credit" if amount < 0, else "Charge"

### Output Data Model

```python
{
    "metadata": {
        "title": str, "customer_name": str, "customer_id": str,
        "contact": str, "lpi_rate": float, "avg_days_late": int,
        "report_date": pd.Timestamp
    },
    "sections": OrderedDict {
        "Section Name": {
            "header": list[str|None],
            "colmap": dict,             # semantic key → column index
            "rows": list[dict],         # line item records
            "totals": {"total": float, "overdue": float, "available credit": float, ...}
        }
    },
    "all_items": pd.DataFrame,          # flattened across all sections
    "grand_totals": {
        "total_charges": float, "total_credits": float, "net_balance": float,
        "total_overdue": float, "item_count": int,
        "section_totals": dict, "section_overdue": dict, "available_credits": dict
    }
}
```

Each **record** dict:
```python
{
    "Section": str, "Amount": float, "Entry Type": "Charge"|"Credit",
    "Company": str|None, "Account": str|None, "Reference": str|None,
    "Document Date": pd.Timestamp|None, "Due Date": pd.Timestamp|None,
    "Currency": str|None, "Text": str|None, "Assignment": str|None,
    "R-R Comments": str|None, "Action Owner": str|None, "Days Late": int|None,
    "Customer Comments": str|None, "Status": str|None, "PO Reference": str|None,
    "LPI Cumulated": str|None, "Type": str|None, "Document No": str|None,
    "Interest Method": str|None, "Customer Name": str|None
}
```

### Date Handling
- openpyxl with `data_only=True` returns `datetime` objects for date-formatted cells
- `_coerce_date()` also tries string parsing with formats: `%d/%m/%Y`, `%m/%d/%Y`, `%Y-%m-%d`, `%d-%m-%Y`, `%d.%m.%Y`
- Dates are stored as `pd.Timestamp` in this version

---

## Dashboard UI Sections

### 1. Header Bar
- Gradient `#10069F` → `#0C0033`, white text, ROLLS-ROYCE bordered logo right-aligned
- Uses `<div>` NOT `<h1>` for title (Streamlit forces its own h1 colour)

### 2. Customer Info Bar
- White card: customer name (bold #0C0033), info chips for ID, contact, LPI rate, avg days late, report date

### 3. KPI Cards (6 columns via `st.columns(6)`)
- Total Charges, Total Credits (.positive green), Net Balance (.negative red/.positive green), Total Overdue (.negative red), Avg Days Late, Open Items

### 4. Executive Overview (`st.columns([1,1,1])`)
- Donut: Breakdown by Section (absolute amounts)
- Grouped bar: Charges vs Credits by Section (navy/green)
- Bar: Aging Analysis (coloured by severity)

### 5. Bilateral Position (`st.columns([1,1])`)
- Bar: Customer→RR vs RR→Customer
- Horizontal bar: Net Balance by Section (navy=owed, green=credit)

### 6. Section Breakdown (`st.tabs()`)
- Per tab: 5 KPI cards (`st.columns(5)`), status pie + top items bar (`st.columns([1,1])`), `st.dataframe()` table

### 7. Complete Invoice Register
- 4 filter columns: Section multiselect, Type multiselect, Status multiselect, Amount Range slider
- `st.dataframe()` with filtered data
- 3 summary metrics via `st.metric()`

### 8. Footer
- Centered, `color:#999`, `font-size:.75rem`

---

## Important Rules (What NOT to Do)

1. **Do NOT add `.streamlit/config.toml` with `[theme]`** — breaks sidebar widget text colours.
2. **Do NOT use `<h1>` in `st.markdown(unsafe_allow_html=True)`** — use styled `<div>` instead.
3. **Do NOT add global CSS for `[data-baseweb="select"]` / `[data-baseweb="slider"]`** without scoping to `.stMainBlockContainer` — breaks sidebar.
4. **Do NOT hard-code column positions or customer names** — parser must stay dynamic.
5. **Keep parsing logic in sync** with `app_standalone.py` if modifying the parser.
