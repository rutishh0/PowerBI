"""
PDF Export Module for Rolls-Royce Power BI Dashboard
====================================================
Consolidated module that produces three distinct branded PDF reports:

    * ``generate_pdf_report``         -- Legacy SOA (Statement of Account) report
    * ``generate_opp_pdf_report``     -- Opportunity Tracker report (with charts)
    * ``generate_hopper_pdf_report``  -- Global Commercial Optimisation Hopper report

All three entry-point signatures are preserved verbatim so that existing
``server.py`` imports continue to function unchanged.

The file is organised as:

    1. Shared constants & helpers
    2. SOA report (RRPDFReport + generate_pdf_report)
    3. Opportunity Tracker report (OppPDF + generate_opp_pdf_report)
    4. Global Hopper report (HopperPDF + generate_hopper_pdf_report)
"""

import io
from datetime import datetime

import pandas as pd
from fpdf import FPDF


# =============================================================================
# 1. SHARED CONSTANTS & HELPERS
# =============================================================================

# -- Shared brand palette (used by Opp + Hopper, and re-exposed on the SOA
#    PDF class via its own attribute names to preserve legacy styling). ------

NAVY     = (3, 0, 46)
DARK     = (12, 0, 51)
ACCENT   = (16, 6, 159)
WHITE    = (255, 255, 255)
LIGHT    = (232, 232, 238)
GREEN    = (0, 200, 117)
RED      = (255, 69, 58)
CYAN     = (0, 200, 255)
AMBER    = (255, 179, 0)
GREY_BG  = (245, 245, 250)
GREY_TXT = (130, 130, 150)


def _hex_to_rgb(hex_str: str) -> tuple:
    """Convert a hex colour string (e.g. '#102030') to an (R, G, B) tuple."""
    hex_str = hex_str.lstrip('#')
    return tuple(int(hex_str[i:i + 2], 16) for i in (0, 2, 4))


# -- Text sanitisation -------------------------------------------------------
#
# Two flavours of _safe exist because the three reports have subtly different
# expectations:
#
#   * _safe_soa       -- Legacy SOA behaviour (no .strip(), no newline
#                        handling, does not map GBP). Preserves exact SOA
#                        output.
#   * _safe           -- Shared Opp/Hopper behaviour: strips whitespace,
#                        collapses newlines, and maps the GBP symbol to the
#                        literal string "GBP" (required because the Hopper
#                        report uses Helvetica which cannot render U+00A3).
#                        The GBP mapping is a harmless no-op for the Opp
#                        report since its source data contains no GBP symbols.

def _safe_soa(text) -> str:
    """Sanitise text for fpdf2 Helvetica - SOA variant (legacy behaviour)."""
    s = str(text) if text is not None else "-"
    s = s.replace("—", "-")    # em dash
    s = s.replace("–", "-")    # en dash
    s = s.replace("‘", "'")    # left single quote
    s = s.replace("’", "'")    # right single quote
    s = s.replace("“", '"')    # left double quote
    s = s.replace("”", '"')    # right double quote
    s = s.replace("…", "...")  # ellipsis
    s = s.replace(" ", " ")    # non-breaking space
    return s


def _safe(text) -> str:
    """Sanitise text for fpdf2 Helvetica (Opp + Hopper variant).

    Includes GBP-symbol replacement for Helvetica safety (preserved from the
    original Hopper module -- Helvetica cannot render U+00A3).
    """
    if text is None:
        return "-"
    s = str(text)
    for old, new in [
        ("—", "-"), ("–", "-"), ("‘", "'"), ("’", "'"),
        ("“", '"'), ("”", '"'), ("…", "..."), (" ", " "),
        ("£", "GBP"), ("\n", " "), ("\r", ""),
        ("•", "-"), ("·", "-"),                # bullets
        ("×", "x"), ("→", "->"), ("←", "<-"),  # math / arrows
    ]:
        s = s.replace(old, new)
    # Final guard: strip anything outside Latin-1 so a rogue glyph never
    # crashes Helvetica. Replaced with '?' so omissions are visible.
    out = []
    for ch in s:
        try:
            ch.encode("latin-1")
            out.append(ch)
        except UnicodeEncodeError:
            out.append("?")
    return "".join(out).strip()


# -- Numeric coercion / formatting (shared between Opp & Hopper) ------------

def _val(v):
    """Coerce a value to float, stripping common currency symbols."""
    if v is None:
        return 0.0
    try:
        if isinstance(v, str):
            v = v.replace(",", "").replace("$", "").replace("€", "").replace("£", "")
        return float(v)
    except Exception:
        return 0.0


def _trunc(s, maxlen):
    """Safe-truncate a value to ``maxlen`` chars with a trailing '..'."""
    s = _safe(s)
    return s[:maxlen - 2] + ".." if len(s) > maxlen else s


# =============================================================================
# 2. SOA REPORT  (generate_pdf_report)
# =============================================================================

def _fmt_currency(val, currency_symbol: str = "USD") -> str:
    """Format a currency value for SOA PDF display."""
    if val is None or pd.isna(val):
        return "-"
    try:
        val = float(val)
        sign = "-" if val < 0 else ""
        abs_val = abs(val)
        return f"{sign}{currency_symbol} {abs_val:,.2f}"
    except (ValueError, TypeError):
        return "-"


def _fmt_date(val) -> str:
    """Format a date value for SOA PDF display."""
    if val is None or pd.isna(val):
        return "-"
    if isinstance(val, pd.Timestamp):
        return val.strftime("%d/%m/%Y")
    if isinstance(val, str):
        return _safe_soa(val)
    return _safe_soa(str(val))


def _fmt_number(val) -> str:
    """Format an integer-like value for SOA PDF display."""
    if val is None or pd.isna(val):
        return "-"
    try:
        return f"{int(val):,}"
    except (ValueError, TypeError):
        return _safe_soa(str(val))


class RRPDFReport(FPDF):
    """Custom PDF class with Rolls-Royce SOA branding."""

    # Brand colours (RGB tuples) - kept as class attributes for backwards
    # compatibility with the legacy call-sites inside generate_pdf_report.
    RR_NAVY  = (16, 6, 159)
    RR_DARK  = (12, 0, 51)
    RR_WHITE = (255, 255, 255)
    RR_RED   = (211, 47, 47)
    RR_GREEN = (46, 125, 50)
    RR_LIGHT = (232, 232, 238)

    def __init__(self):
        super().__init__(orientation='L', unit='mm', format='A4')
        self.set_auto_page_break(auto=True, margin=15)
        self.add_page()

    def header(self):
        """Override header - leave empty as we'll add a custom title bar."""
        pass

    def footer(self):
        """Add branded footer."""
        self.set_y(-15)
        self.set_font('Helvetica', 'I', 8)
        self.set_text_color(*self.RR_NAVY)
        self.cell(0, 10, 'ROLLS-ROYCE CIVIL AEROSPACE - For internal use only', 0, 0, 'C')


def generate_pdf_report(
    metadata: dict,
    grand_totals: dict,
    filtered_df: pd.DataFrame,
    sections_summary: dict,
    source_files: list = None,
    currency_symbol: str = "USD",
) -> bytes:
    """
    Generate a branded SOA PDF report and return the PDF as bytes.

    Args:
        metadata: Customer info dict
        grand_totals: Summary totals dict
        filtered_df: Filtered DataFrame with all items
        sections_summary: Per-section summary dict
        source_files: List of source file names (optional)
        currency_symbol: Currency display symbol

    Returns:
        bytes: PDF file content
    """

    pdf = RRPDFReport()

    # ========== TITLE BAR ==========
    pdf.set_fill_color(*RRPDFReport.RR_DARK)
    pdf.set_text_color(*RRPDFReport.RR_WHITE)
    pdf.set_font('Helvetica', 'B', 16)
    pdf.cell(0, 12, '', 0, 1, fill=True)  # Background bar
    pdf.set_xy(10, 10)
    pdf.cell(80, 12, 'ROLLS-ROYCE', 0, 0, 'L')
    pdf.set_font('Helvetica', 'B', 14)
    pdf.cell(0, 12, 'Statement of Account Report', 0, 0, 'C')
    pdf.set_font('Helvetica', '', 10)
    pdf.cell(-80, 12, datetime.now().strftime("%d/%m/%Y %H:%M"), 0, 1, 'R')

    pdf.ln(5)

    # ========== CUSTOMER INFO SECTION ==========
    pdf.set_font('Helvetica', 'B', 12)
    pdf.set_text_color(*RRPDFReport.RR_NAVY)
    pdf.cell(0, 8, 'Customer Information', 0, 1)
    pdf.set_draw_color(*RRPDFReport.RR_NAVY)
    pdf.line(10, pdf.get_y(), 287, pdf.get_y())
    pdf.ln(3)

    # Customer info grid
    pdf.set_font('Helvetica', '', 9)
    pdf.set_text_color(0, 0, 0)

    info_items = [
        ("Customer Name", metadata.get("customer_name", "-")),
        ("Customer ID", metadata.get("customer_id", "-")),
        ("Contact", metadata.get("contact", "-")),
        ("LPI Rate", f"{metadata.get('lpi_rate', 0) * 100:.4f}%" if metadata.get('lpi_rate') else "-"),
        ("Avg Days Late", _fmt_number(metadata.get("avg_days_late"))),
        ("Report Date", _fmt_date(metadata.get("report_date"))),
    ]

    col_width = 90
    x_start = 10
    y_start = pdf.get_y()

    for i, (label, value) in enumerate(info_items):
        row = i // 3
        col = i % 3
        x = x_start + (col * col_width)
        y = y_start + (row * 7)

        pdf.set_xy(x, y)
        pdf.set_font('Helvetica', 'B', 9)
        pdf.cell(30, 6, label + ":", 0, 0)
        pdf.set_font('Helvetica', '', 9)
        pdf.cell(60, 6, _safe_soa(value), 0, 0)

    pdf.ln(20)

    # ========== KPI SUMMARY ==========
    pdf.set_font('Helvetica', 'B', 12)
    pdf.set_text_color(*RRPDFReport.RR_NAVY)
    pdf.cell(0, 8, 'Key Performance Indicators', 0, 1)
    pdf.set_draw_color(*RRPDFReport.RR_NAVY)
    pdf.line(10, pdf.get_y(), 287, pdf.get_y())
    pdf.ln(3)

    kpis = [
        ("Total Charges", grand_totals.get("total_charges", 0), None),
        ("Total Credits", grand_totals.get("total_credits", 0), RRPDFReport.RR_GREEN),
        ("Net Balance", grand_totals.get("net_balance", 0),
         RRPDFReport.RR_RED if grand_totals.get("net_balance", 0) > 0 else RRPDFReport.RR_GREEN),
        ("Total Overdue", grand_totals.get("total_overdue", 0), RRPDFReport.RR_RED),
        ("Avg Days Late", metadata.get("avg_days_late", 0), None),
        ("Open Items", grand_totals.get("item_count", 0), None),
    ]

    box_width = 90
    box_height = 20
    x_start = 10
    y_start = pdf.get_y()

    for i, (label, value, color) in enumerate(kpis):
        row = i // 3
        col = i % 3
        x = x_start + (col * box_width)
        y = y_start + (row * (box_height + 3))

        # Border
        pdf.set_draw_color(*RRPDFReport.RR_NAVY)
        pdf.rect(x, y, box_width - 3, box_height)

        # Label
        pdf.set_xy(x + 2, y + 3)
        pdf.set_font('Helvetica', 'B', 9)
        pdf.set_text_color(80, 80, 80)
        pdf.cell(box_width - 7, 5, label, 0, 0)

        # Value
        pdf.set_xy(x + 2, y + 10)
        pdf.set_font('Helvetica', 'B', 12)
        if color:
            pdf.set_text_color(*color)
        else:
            pdf.set_text_color(*RRPDFReport.RR_NAVY)

        if "Items" in label or "Days Late" in label:
            val_str = _fmt_number(value)
        else:
            val_str = _fmt_currency(value, currency_symbol)

        pdf.cell(box_width - 7, 8, val_str, 0, 0)

    pdf.ln(50)

    # ========== SECTION SUMMARY TABLE ==========
    pdf.set_font('Helvetica', 'B', 12)
    pdf.set_text_color(*RRPDFReport.RR_NAVY)
    pdf.cell(0, 8, 'Section Summary', 0, 1)
    pdf.set_draw_color(*RRPDFReport.RR_NAVY)
    pdf.line(10, pdf.get_y(), 287, pdf.get_y())
    pdf.ln(3)

    # Table headers
    headers = ["Section", "Total", "Charges", "Credits", "Overdue", "Items"]
    col_widths = [70, 35, 35, 35, 35, 25]

    pdf.set_fill_color(*RRPDFReport.RR_NAVY)
    pdf.set_text_color(*RRPDFReport.RR_WHITE)
    pdf.set_font('Helvetica', 'B', 9)

    for i, header in enumerate(headers):
        pdf.cell(col_widths[i], 7, header, 1, 0, 'C', fill=True)
    pdf.ln()

    # Table rows
    pdf.set_text_color(0, 0, 0)
    pdf.set_font('Helvetica', '', 8)

    row_num = 0
    for section, data in sections_summary.items():
        if row_num % 2 == 0:
            pdf.set_fill_color(*RRPDFReport.RR_WHITE)
        else:
            pdf.set_fill_color(*RRPDFReport.RR_LIGHT)

        pdf.cell(col_widths[0], 6, _safe_soa(section)[:35], 1, 0, 'L', fill=True)
        pdf.cell(col_widths[1], 6, _fmt_currency(data.get("total", 0), currency_symbol), 1, 0, 'R', fill=True)
        pdf.cell(col_widths[2], 6, _fmt_currency(data.get("charges", 0), currency_symbol), 1, 0, 'R', fill=True)
        pdf.cell(col_widths[3], 6, _fmt_currency(data.get("credits", 0), currency_symbol), 1, 0, 'R', fill=True)
        pdf.cell(col_widths[4], 6, _fmt_currency(data.get("overdue", 0), currency_symbol), 1, 0, 'R', fill=True)
        pdf.cell(col_widths[5], 6, _fmt_number(data.get("items", 0)), 1, 0, 'C', fill=True)
        pdf.ln()
        row_num += 1

    pdf.ln(5)

    # ========== FILTERED INVOICE REGISTER ==========
    if not filtered_df.empty:
        pdf.add_page()
        pdf.set_font('Helvetica', 'B', 12)
        pdf.set_text_color(*RRPDFReport.RR_NAVY)
        pdf.cell(0, 8, 'Invoice Register (Filtered)', 0, 1)
        pdf.set_draw_color(*RRPDFReport.RR_NAVY)
        pdf.line(10, pdf.get_y(), 287, pdf.get_y())
        pdf.ln(3)

        # Limit to 100 rows to keep PDF manageable
        display_df = filtered_df.head(100).copy()

        # Table headers
        inv_headers = ["Section", "Reference", "Doc Date", "Due Date", "Amount", "Status", "Type", "Days Late"]
        inv_col_widths = [45, 30, 25, 25, 35, 30, 25, 20]

        pdf.set_fill_color(*RRPDFReport.RR_NAVY)
        pdf.set_text_color(*RRPDFReport.RR_WHITE)
        pdf.set_font('Helvetica', 'B', 8)

        for i, header in enumerate(inv_headers):
            pdf.cell(inv_col_widths[i], 7, header, 1, 0, 'C', fill=True)
        pdf.ln()

        # Table rows
        pdf.set_font('Helvetica', '', 7)

        row_num = 0
        for idx, row in display_df.iterrows():
            # Check if we need a new page
            if pdf.get_y() > 180:
                pdf.add_page()
                # Re-print headers
                pdf.set_fill_color(*RRPDFReport.RR_NAVY)
                pdf.set_text_color(*RRPDFReport.RR_WHITE)
                pdf.set_font('Helvetica', 'B', 8)
                for i, header in enumerate(inv_headers):
                    pdf.cell(inv_col_widths[i], 7, header, 1, 0, 'C', fill=True)
                pdf.ln()
                pdf.set_font('Helvetica', '', 7)
                row_num = 0

            if row_num % 2 == 0:
                pdf.set_fill_color(*RRPDFReport.RR_WHITE)
            else:
                pdf.set_fill_color(*RRPDFReport.RR_LIGHT)

            # Amount coloring
            amount = row.get("Amount", 0)
            try:
                amount_float = float(amount) if amount is not None else 0
            except (ValueError, TypeError):
                amount_float = 0

            pdf.set_text_color(0, 0, 0)
            pdf.cell(inv_col_widths[0], 6, _safe_soa(row.get("Section", "-"))[:22], 1, 0, 'L', fill=True)
            pdf.cell(inv_col_widths[1], 6, _safe_soa(row.get("Reference", "-") or "-")[:15], 1, 0, 'L', fill=True)
            pdf.cell(inv_col_widths[2], 6, _fmt_date(row.get("Document Date")), 1, 0, 'C', fill=True)
            pdf.cell(inv_col_widths[3], 6, _fmt_date(row.get("Due Date")), 1, 0, 'C', fill=True)

            if amount_float < 0:
                pdf.set_text_color(*RRPDFReport.RR_RED)
            pdf.cell(inv_col_widths[4], 6, _fmt_currency(amount_float, currency_symbol), 1, 0, 'R', fill=True)
            pdf.set_text_color(0, 0, 0)

            pdf.cell(inv_col_widths[5], 6, _safe_soa(row.get("Status", "-") or "-")[:15], 1, 0, 'L', fill=True)
            pdf.cell(inv_col_widths[6], 6, _safe_soa(row.get("Entry Type", "-") or "-")[:12], 1, 0, 'L', fill=True)
            pdf.cell(inv_col_widths[7], 6, _fmt_number(row.get("Days Late")), 1, 0, 'C', fill=True)
            pdf.ln()
            row_num += 1

        if len(filtered_df) > 100:
            pdf.ln(3)
            pdf.set_font('Helvetica', 'I', 8)
            pdf.set_text_color(100, 100, 100)
            pdf.cell(0, 5, f'Showing first 100 of {len(filtered_df)} filtered records', 0, 1, 'L')

    # ========== DATA SOURCES ==========
    if source_files:
        pdf.ln(5)
        pdf.set_font('Helvetica', 'B', 10)
        pdf.set_text_color(*RRPDFReport.RR_NAVY)
        pdf.cell(0, 6, 'Data Sources:', 0, 1)
        pdf.set_font('Helvetica', '', 8)
        pdf.set_text_color(0, 0, 0)
        for fname in source_files:
            pdf.cell(0, 5, f'  - {_safe_soa(fname)}', 0, 1)

    # Return PDF as bytes
    return bytes(pdf.output())


# =============================================================================
# 3. OPPORTUNITY TRACKER REPORT  (generate_opp_pdf_report)
# =============================================================================

def _fmtM(val):
    """Format as $X.Xm (Opportunity Tracker - USD-style millions)."""
    if val is None:
        return "-"
    v = float(val)
    sign = "-" if v < 0 else ""
    return f"{sign}${abs(v):,.1f}m"


def _generate_charts(records):
    """Generate a horizontal strip of 3 styling charts and return as BytesIO PNG."""
    # Lazy-import matplotlib so the SOA & Hopper paths don't pay the cost
    # when they don't need it.
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    NAVY_HEX   = '#03002e'
    ACCENT_HEX = '#10069f'
    GREEN_HEX  = '#00c875'
    AMBER_HEX  = '#ffb300'
    CYAN_HEX   = '#00c8ff'
    GREY_HEX   = '#828296'

    plt.style.use('default')
    fig, (ax1, ax2, ax3) = plt.subplots(1, 3, figsize=(11, 3.5), dpi=150)
    fig.patch.set_facecolor('white')

    def clean_ax(ax):
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.spines['left'].set_color('#E8E8EE')
        ax.spines['bottom'].set_color('#E8E8EE')
        ax.tick_params(colors=GREY_HEX, labelsize=8)
        ax.title.set_color(NAVY_HEX)
        ax.title.set_fontsize(10)
        ax.title.set_weight('bold')

    # CHART 1: Priority Doughnut
    by_priority = {}
    for r in records:
        p = str(r.get('priority', '?')).replace('.0', '')
        if p in ('', 'None', 'nan'):
            p = '?'
        if p == '?':
            continue
        by_priority[p] = by_priority.get(p, 0) + _val(r.get('sum_26_27'))

    p_keys = sorted(by_priority.keys())
    p_vals = [by_priority[k] for k in p_keys]
    p_labels = [f"Priority {k}" for k in p_keys]
    color_map = {'1': GREEN_HEX, '2': ACCENT_HEX, '3': AMBER_HEX}
    p_colors = [color_map.get(k, CYAN_HEX) for k in p_keys]

    if sum(p_vals) > 0:
        wedges, texts, autotexts = ax1.pie(
            p_vals, labels=p_labels, autopct='%1.0f%%',
            colors=p_colors, startangle=90,
            textprops={'color': NAVY_HEX, 'fontsize': 8, 'weight': 'bold'},
            wedgeprops={'width': 0.4, 'edgecolor': 'white', 'linewidth': 2}
        )
        for autotext in autotexts:
            autotext.set_color('white')
            autotext.set_weight('bold')
    ax1.set_title("Value by Priority (26+27)")

    # CHART 2: Estimation Level Bar Chart
    by_level = {}
    for r in records:
        sh = r.get('_sheet', 'Unknown')
        by_level[sh] = by_level.get(sh, 0) + _val(r.get('sum_26_27'))

    l_sorted = sorted(by_level.items(), key=lambda x: x[1], reverse=True)
    l_names = [x[0] for x in l_sorted]
    l_vals = [x[1] for x in l_sorted]

    clean_ax(ax2)
    if sum(l_vals) > 0:
        bars = ax2.bar(l_names, l_vals, color=ACCENT_HEX, alpha=0.9, width=0.6)
        for bar in bars:
            h = bar.get_height()
            ax2.annotate(f"${h:,.0f}m",
                         xy=(bar.get_x() + bar.get_width() / 2, h),
                         xytext=(0, 3),
                         textcoords="offset points",
                         ha='center', va='bottom', fontsize=7, color=NAVY_HEX, weight='bold')

    ax2.set_title("Value by Source (26+27)")
    ax2.set_yticks([])
    ax2.spines['left'].set_visible(False)

    # CHART 3: Top Customers Horizontal Bar
    by_cust = {}
    for r in records:
        c = r.get('customer', 'Unknown')
        if not c or c.lower() == 'nan':
            continue
        by_cust[c] = by_cust.get(c, 0) + _val(r.get('sum_26_27'))

    c_sorted = sorted(by_cust.items(), key=lambda x: x[1], reverse=True)[:5]
    c_sorted.reverse()
    c_names = [x[0][:15] for x in c_sorted]
    c_vals = [x[1] for x in c_sorted]

    clean_ax(ax3)
    if sum(c_vals) > 0:
        bars_h = ax3.barh(c_names, c_vals, color=GREEN_HEX, alpha=0.9, height=0.6)
        for bar in bars_h:
            w = bar.get_width()
            ax3.annotate(f"${w:,.0f}m",
                         xy=(w, bar.get_y() + bar.get_height() / 2),
                         xytext=(3, 0),
                         textcoords="offset points",
                         ha='left', va='center', fontsize=7, color=NAVY_HEX, weight='bold')

    ax3.set_title("Top 5 Customers by Value")
    ax3.set_xticks([])
    ax3.spines['bottom'].set_visible(False)

    plt.tight_layout(pad=2.0)
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=150)
    plt.close(fig)
    buf.seek(0)
    return buf


class OppPDF(FPDF):
    """Custom PDF class for the Opportunity Tracker report."""

    def __init__(self):
        super().__init__(orientation="L", unit="mm", format="A4")
        self.set_auto_page_break(auto=True, margin=18)

    def header(self):
        pass

    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", "I", 7)
        self.set_text_color(*GREY_TXT)
        self.cell(0, 10,
                  f"ROLLS-ROYCE CIVIL AEROSPACE  |  Opportunity Tracker  |  "
                  f"Page {self.page_no()}  |  Internal use only", 0, 0, "C")

    # -- Drawing helpers -----------------------------------------------------

    def _title_bar(self, title, subtitle=""):
        """Full-width navy bar with title."""
        self.set_fill_color(*NAVY)
        self.rect(0, 0, 297, 25, "F")
        self.set_xy(10, 5)
        self.set_font("Helvetica", "B", 16)
        self.set_text_color(*WHITE)
        self.cell(200, 8, _safe(title), 0, 0, "L")
        if subtitle:
            self.set_font("Helvetica", "", 9)
            self.set_text_color(180, 180, 210)
            self.set_xy(10, 14)
            self.cell(200, 6, _safe(subtitle), 0, 0, "L")
        # Right side: RR badge
        self.set_font("Helvetica", "B", 9)
        self.set_text_color(*WHITE)
        self.set_xy(230, 8)
        self.set_fill_color(*ACCENT)
        self.cell(25, 7, "OPP TRACKER", 0, 0, "C", True)
        self.set_xy(258, 8)
        self.set_fill_color(40, 40, 70)
        self.cell(28, 7, "ROLLS-ROYCE", 0, 0, "C", True)
        self.set_y(30)

    def _section_header(self, title, icon_char=""):
        """Styled section header with accent pill."""
        y = self.get_y()
        if y > 170:   # Near bottom? New page
            self.add_page()
            y = self.get_y()
        self.ln(4)
        self.set_fill_color(*ACCENT)
        self.set_text_color(*WHITE)
        self.set_font("Helvetica", "B", 10)
        label = f"  {icon_char}  {title}  " if icon_char else f"  {title}  "
        w = self.get_string_width(label) + 8
        self.cell(w, 7, label, 0, 1, "L", True)
        self.ln(3)

    def _kpi_card(self, x, y, w, h, label, value, color=NAVY, small_text=""):
        """Draw a single KPI box."""
        self.set_fill_color(*GREY_BG)
        self.rect(x, y, w, h, "F")
        # Accent top border
        self.set_fill_color(*color)
        self.rect(x, y, w, 1.5, "F")
        # Label
        self.set_xy(x, y + 3)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*GREY_TXT)
        self.cell(w, 5, label, 0, 2, "C")
        # Value
        self.set_font("Helvetica", "B", 14)
        self.set_text_color(*color)
        self.cell(w, 8, str(value), 0, 2, "C")
        # Small text
        if small_text:
            self.set_font("Helvetica", "", 7)
            self.set_text_color(*GREY_TXT)
            self.cell(w, 4, small_text, 0, 0, "C")

    def _table(self, headers, rows, col_widths, max_rows=40):
        """Draw a styled table with alternating row colors.

        Alignment rule: last column is right-aligned, all others left.
        """
        y_start = self.get_y()
        # Header row
        self.set_fill_color(*NAVY)
        self.set_text_color(*WHITE)
        self.set_font("Helvetica", "B", 8)
        x = self.l_margin
        for i, h in enumerate(headers):
            self.set_xy(x, self.get_y())
            self.cell(col_widths[i], 7, h, 0, 0, "C", True)
            x += col_widths[i]
        self.ln(7)

        # Data rows
        self.set_font("Helvetica", "", 7.5)
        count = 0
        for row in rows[:max_rows]:
            if self.get_y() > 185:   # Near bottom
                self.add_page()
                # Re-draw header on new page
                self.set_fill_color(*NAVY)
                self.set_text_color(*WHITE)
                self.set_font("Helvetica", "B", 8)
                x = self.l_margin
                for i2, h2 in enumerate(headers):
                    self.set_xy(x, self.get_y())
                    self.cell(col_widths[i2], 7, h2, 0, 0, "C", True)
                    x += col_widths[i2]
                self.ln(7)
                self.set_font("Helvetica", "", 7.5)

            fill = count % 2 == 0
            if fill:
                self.set_fill_color(245, 245, 252)
            else:
                self.set_fill_color(*WHITE)
            self.set_text_color(*DARK)

            x = self.l_margin
            for i, cell_val in enumerate(row):
                self.set_xy(x, self.get_y())
                align = "R" if i == len(row) - 1 else "L"
                self.cell(col_widths[i], 6.5, _safe(str(cell_val)), 0, 0, align, True)
                x += col_widths[i]
            self.ln(6.5)
            count += 1

        if len(rows) > max_rows:
            self.set_font("Helvetica", "I", 7)
            self.set_text_color(*GREY_TXT)
            self.cell(0, 5, f"  ... and {len(rows) - max_rows} more rows", 0, 1)


def generate_opp_pdf_report(
    parsed_data: dict,
    sections_to_include: list,
    filters: dict,
) -> bytes:
    """Generate a premium Opportunity Tracker PDF report."""

    pdf = OppPDF()
    pdf.add_page()

    # -- Flatten opportunities -----------------------------------------------
    opportunities = parsed_data.get("opportunities", {})
    all_items = []
    for sheet_name, recs in opportunities.items():
        if isinstance(recs, list):
            for r in recs:
                all_items.append({**r, "_sheet": sheet_name})

    if not all_items:
        all_items = parsed_data.get("all_items", [])

    # -- Apply filters -------------------------------------------------------
    filtered = []
    for row in all_items:
        if filters.get("customer") and row.get("customer") != filters["customer"]:
            continue
        if filters.get("project") and row.get("project") != filters["project"]:
            continue
        if filters.get("priority") and str(row.get("priority")) != str(filters["priority"]):
            continue
        if filters.get("ext_probability") and row.get("ext_probability") != filters["ext_probability"]:
            continue
        if filters.get("status") and row.get("status") != filters["status"]:
            continue
        opp_types = filters.get("opp_type", [])
        if opp_types and isinstance(opp_types, list) and len(opp_types) > 0:
            if row.get("opp_type", "Unknown") not in opp_types:
                continue
        try:
            mv = filters.get("min_value")
            if mv is not None and _val(row.get("sum_26_27")) < float(mv):
                continue
        except Exception:
            pass
        filtered.append(row)

    meta = parsed_data.get("metadata", {})
    summary = parsed_data.get("summary", {})

    # -- Compute aggregates --------------------------------------------------
    total_26 = sum(_val(r.get("benefit_2026")) for r in filtered)
    total_27 = sum(_val(r.get("benefit_2027")) for r in filtered)
    total_26_27 = sum(_val(r.get("sum_26_27")) for r in filtered)
    total_term = sum(_val(r.get("term_benefit")) for r in filtered)
    active = [r for r in filtered if str(r.get("status", "")).lower() not in ("completed", "lost", "declined")]
    customers = set(r.get("customer") for r in filtered if r.get("customer"))

    # =========================================================================
    # PAGE 1: Title + KPIs + Priority Breakdown
    # =========================================================================

    date_str = datetime.now().strftime("%d %B %Y")
    subtitle = f"Generated: {date_str}  |  {len(filtered)} Opportunities  |  {len(customers)} Customers"
    if filters.get("customer"):
        subtitle = f"Filtered: {filters['customer']}  |  " + subtitle
    pdf._title_bar("COMMERCIAL OPTIMISATION OPPORTUNITY REPORT", subtitle)

    if len(filtered) == 0:
        pdf.set_font("Helvetica", "I", 12)
        pdf.set_text_color(100, 100, 100)
        pdf.cell(0, 10, "No data matches the selected filters.", 0, 1, "C")
        return bytes(pdf.output())

    # -- KPI Cards row -------------------------------------------------------
    if "kpis" in sections_to_include:
        y = pdf.get_y() + 2
        card_w = 62
        gap = 6
        x = 12
        pdf._kpi_card(x, y, card_w, 22, "2026", _fmtM(total_26), NAVY)
        x += card_w + gap
        pdf._kpi_card(x, y, card_w, 22, "2027", _fmtM(total_27), NAVY)
        x += card_w + gap
        pdf._kpi_card(x, y, card_w, 22, "2026 + 2027", _fmtM(total_26_27), GREEN)
        x += card_w + gap
        pdf._kpi_card(x, y, card_w, 22, "TERM IMPACT", _fmtM(total_term), ACCENT,
                       f"{len(active)} active of {len(filtered)} total")
        pdf.set_y(y + 28)

        # Info badges
        pdf.set_font("Helvetica", "", 7.5)
        pdf.set_text_color(*GREY_TXT)
        away_day = meta.get("away_day_date", "-")
        sheets_str = ", ".join(opportunities.keys()) if opportunities else "-"
        info_line = (
            f"Away Day: {away_day}   |   Sheets: {sheets_str}   |   "
            f"Opportunities: {len(filtered)} ({len(active)} active)   |   "
            f"Customers: {len(customers)}   |   "
            f"Programmes: {meta.get('programmes', '-')}"
        )
        pdf.cell(0, 5, info_line, 0, 1, "L")
        pdf.ln(3)

        # -- Priority breakdown ----------------------------------------------
        by_priority = {}
        for r in filtered:
            p = str(r.get("priority", "?")).replace(".0", "")
            if p in ("", "None", "nan"):
                p = "?"
            if p not in by_priority:
                by_priority[p] = {"count": 0, "sum_26_27": 0, "term": 0}
            by_priority[p]["count"] += 1
            by_priority[p]["sum_26_27"] += _val(r.get("sum_26_27"))
            by_priority[p]["term"] += _val(r.get("term_benefit"))

        completed = len([r for r in filtered if str(r.get("status", "")).lower() == "completed"])
        pipeline = len(active)

        priority_order = sorted([k for k in by_priority if k not in ("?",)]) + (["?"] if "?" in by_priority else [])
        p_colors = {"1": GREEN, "2": ACCENT, "3": AMBER}

        y = pdf.get_y()
        card_w2 = 50
        gap2 = 4
        x = 12
        for pk in priority_order[:3]:
            pd_item = by_priority[pk]
            color = p_colors.get(pk, GREY_TXT)
            pdf._kpi_card(x, y, card_w2, 22, f"PRIORITY {pk}", _fmtM(pd_item["sum_26_27"]),
                           color, f"{pd_item['count']} opps · Term: {_fmtM(pd_item['term'])}")
            x += card_w2 + gap2

        # Completed + Pipeline cards
        pdf._kpi_card(x, y, card_w2, 22, "COMPLETED", str(completed), GREEN,
                       f"{round(completed / max(len(filtered), 1) * 100)}% of total")
        x += card_w2 + gap2
        pdf._kpi_card(x, y, card_w2, 22, "PIPELINE", str(pipeline), CYAN,
                       f"{len(set(r.get('customer') for r in active if r.get('customer')))} customers")
        pdf.set_y(y + 28)

        # -- Visual Charts ---------------------------------------------------
        chart_data = [r for r in filtered if _val(r.get("sum_26_27")) > 0]
        if chart_data:
            chart_buf = _generate_charts(chart_data)
            # Center the image. Width 280mm out of 297mm page width (A4 Landscape)
            x_img = (297 - 280) / 2
            pdf.image(chart_buf, x=x_img, w=280)
            pdf.ln(5)

    # =========================================================================
    # TOP OPPORTUNITIES TABLE
    # =========================================================================

    if "top_opps" in sections_to_include:
        pdf._section_header("Top Opportunities by Value")
        top_sorted = sorted(filtered, key=lambda r: _val(r.get("sum_26_27")), reverse=True)[:25]

        headers = ["#", "Customer", "Project", "Asks", "Ext Prob", "Priority", "Status", "Value (26+27)"]
        col_widths = [8, 35, 30, 90, 22, 18, 25, 35]

        rows = []
        for i, r in enumerate(top_sorted, 1):
            rows.append([
                str(i),
                _trunc(r.get("customer", ""), 18),
                _trunc(r.get("project", ""), 16),
                _trunc(r.get("asks", ""), 55),
                _safe(r.get("ext_probability", "")),
                str(r.get("priority", "")).replace(".0", ""),
                _trunc(r.get("status", ""), 12),
                _fmtM(_val(r.get("sum_26_27"))),
            ])
        pdf._table(headers, rows, col_widths, max_rows=25)

    # =========================================================================
    # ESTIMATION LEVEL BREAKDOWN
    # =========================================================================

    if "estimation_level" in sections_to_include:
        est_levels = {}
        est_level_names = meta.get("estimation_levels", {})
        for r in filtered:
            sh = r.get("_sheet", "Unknown")
            if sh not in est_levels:
                est_levels[sh] = {"count": 0, "sum_26_27": 0, "term": 0}
            est_levels[sh]["count"] += 1
            est_levels[sh]["sum_26_27"] += _val(r.get("sum_26_27"))
            est_levels[sh]["term"] += _val(r.get("term_benefit"))

        pdf._section_header("Estimation Level Breakdown")

        # Summary cards per level
        y = pdf.get_y()
        card_w3 = 85
        gap3 = 6
        x = 12
        level_colors = [ACCENT, GREEN, AMBER, CYAN, NAVY]
        for idx, (sh, data) in enumerate(est_levels.items()):
            if x + card_w3 > 290:
                pdf.set_y(y + 26)
                y = pdf.get_y()
                x = 12
            level_label = est_level_names.get(sh, sh)
            color = level_colors[idx % len(level_colors)]
            pdf._kpi_card(x, y, card_w3, 22, f"{level_label} ({sh})",
                           _fmtM(data["sum_26_27"]), color,
                           f"{data['count']} opps · Term: {_fmtM(data['term'])}")
            x += card_w3 + gap3
        pdf.set_y(y + 28)

        # Detailed table per sheet
        for sh, data in est_levels.items():
            level_label = est_level_names.get(sh, sh)
            sheet_recs = [r for r in filtered if r.get("_sheet") == sh]
            sheet_recs.sort(key=lambda r: _val(r.get("sum_26_27")), reverse=True)

            pdf.set_font("Helvetica", "B", 9)
            pdf.set_text_color(*NAVY)
            pdf.cell(0, 6,
                     f"{level_label} ({sh}) - {len(sheet_recs)} opps - "
                     f"{_fmtM(data['sum_26_27'])} (26+27)  ·  {_fmtM(data['term'])} term",
                     0, 1, "L")
            pdf.ln(1)

            headers = ["Customer", "Asks", "Ext Prob", "Status", "2026", "2027", "26+27"]
            col_widths = [35, 100, 22, 25, 30, 30, 25]
            rows = []
            for r in sheet_recs[:20]:
                rows.append([
                    _trunc(r.get("customer", ""), 18),
                    _trunc(r.get("asks", ""), 60),
                    _safe(r.get("ext_probability", "")),
                    _trunc(r.get("status", ""), 12),
                    _fmtM(_val(r.get("benefit_2026"))),
                    _fmtM(_val(r.get("benefit_2027"))),
                    _fmtM(_val(r.get("sum_26_27"))),
                ])
            pdf._table(headers, rows, col_widths, max_rows=20)
            pdf.ln(3)

    # =========================================================================
    # OPPORTUNITIES & THREATS
    # =========================================================================

    if "opps_threats" in sections_to_include:
        ot_data = parsed_data.get("opps_and_threats", {})
        ot_rows = ot_data.get("rows", [])
        if not ot_rows:
            # Try alternate key structure
            ot_rows = parsed_data.get("sections", {}).get("Opps and Threats", {}).get("rows", [])

        # Apply customer filter
        if filters.get("customer"):
            ot_rows = [r for r in ot_rows if r.get("Customer") == filters["customer"]
                       or r.get("customer") == filters["customer"]]

        if ot_rows:
            pdf._section_header("Opportunities & Threats")
            headers = ["Customer", "Description", "Type", "Status", "Owner"]
            col_widths = [40, 130, 30, 35, 30]
            rows = []
            for r in ot_rows:
                rows.append([
                    _trunc(r.get("Customer", r.get("customer", "")), 20),
                    _trunc(r.get("Description", r.get("description", "")), 78),
                    _trunc(r.get("Type", r.get("type", "")), 14),
                    _trunc(r.get("Status", r.get("status", "")), 16),
                    _trunc(r.get("Action Owner", r.get("action_owner", "")), 14),
                ])
            pdf._table(headers, rows, col_widths, max_rows=30)

    # =========================================================================
    # PROJECT SUMMARY
    # =========================================================================

    if "project_summary" in sections_to_include:
        proj_summary = parsed_data.get("project_summary", {})
        proj_rows = proj_summary.get("rows", [])

        if proj_rows:
            pdf._section_header("Project Summary")
            headers = ["Project", "Customer", "Status", "Value", "Notes"]
            col_widths = [40, 35, 30, 35, 127]
            rows = []
            for r in proj_rows:
                rows.append([
                    _trunc(r.get("Project", r.get("project", "")), 20),
                    _trunc(r.get("Customer", r.get("customer", "")), 18),
                    _trunc(r.get("Status", r.get("status", "")), 14),
                    _fmtM(_val(r.get("Value", r.get("value", 0)))),
                    _trunc(r.get("Notes", r.get("notes", "")), 75),
                ])
            pdf._table(headers, rows, col_widths, max_rows=30)

    # =========================================================================
    # CUSTOMER BREAKDOWN
    # =========================================================================

    if "customer_breakdown" in sections_to_include:
        by_cust = {}
        for r in filtered:
            c = r.get("customer", "Unknown")
            if c not in by_cust:
                by_cust[c] = {"count": 0, "sum_26_27": 0, "term": 0}
            by_cust[c]["count"] += 1
            by_cust[c]["sum_26_27"] += _val(r.get("sum_26_27"))
            by_cust[c]["term"] += _val(r.get("term_benefit"))

        sorted_custs = sorted(by_cust.items(), key=lambda x: x[1]["sum_26_27"], reverse=True)

        pdf._section_header("Customer Breakdown")
        headers = ["Customer", "Opportunities", "Value (26+27)", "Term Benefit", "% of Total"]
        col_widths = [60, 30, 45, 45, 30]
        rows = []
        for cust, data in sorted_custs:
            pct = round(data["sum_26_27"] / max(total_26_27, 1) * 100, 1)
            rows.append([
                _trunc(cust, 30),
                str(data["count"]),
                _fmtM(data["sum_26_27"]),
                _fmtM(data["term"]),
                f"{pct}%",
            ])
        pdf._table(headers, rows, col_widths, max_rows=30)

    # =========================================================================
    # TIMELINE (if selected)
    # =========================================================================

    if "timeline" in sections_to_include:
        timeline = parsed_data.get("timeline", {})
        t_rows = timeline.get("rows", [])
        if t_rows:
            pdf._section_header("Project Timeline & Milestones")
            headers = ["Milestone", "Date", "Status", "Owner", "Notes"]
            col_widths = [50, 30, 30, 30, 127]
            rows = []
            for r in t_rows:
                rows.append([
                    _trunc(r.get("Milestone", r.get("milestone", "")), 25),
                    _safe(r.get("Date", r.get("date", ""))),
                    _trunc(r.get("Status", r.get("status", "")), 14),
                    _trunc(r.get("Owner", r.get("owner", "")), 14),
                    _trunc(r.get("Notes", r.get("notes", "")), 75),
                ])
            pdf._table(headers, rows, col_widths, max_rows=25)

    return bytes(pdf.output())


# =============================================================================
# 4. GLOBAL HOPPER REPORT  (generate_hopper_pdf_report)
# =============================================================================

# -- Palette tuned to match the dashboard's dark-navy theme -----------------
# These hex values are the closest sRGB equivalents to the oklch CSS vars
# the React dashboard uses. The shared (NAVY, ACCENT, GREEN, ...) RGB tuples
# above are kept for the SOA / Opp reports; the Hopper report layers a
# warmer gold accent on top to match the var(--chart-2) used in the UI.
HOPPER_NAVY      = '#0a1d2e'   # panel/header background
HOPPER_NAVY_RGB  = (10, 29, 46)
HOPPER_GOLD      = '#c9a961'   # primary accent (CRP, 2026/27 profit)
HOPPER_GOLD_RGB  = (201, 169, 97)
HOPPER_BLUE      = '#2563eb'   # secondary (top customers, 2028 profit)
HOPPER_BLUE_RGB  = (37, 99, 235)
HOPPER_COPPER    = '#d97706'   # tertiary (EVS distribution, 2029/30 profit)
HOPPER_COPPER_RGB = (217, 119, 6)
HOPPER_GREEN     = '#10b981'   # success (mature, not-onerous)
HOPPER_GREEN_RGB = (16, 185, 129)
HOPPER_RED       = '#dc2626'   # warning (onerous, immature)
HOPPER_RED_RGB   = (220, 38, 38)
HOPPER_TEXT_DARK = (17, 24, 39)
HOPPER_TEXT_MUTE = (107, 114, 128)
HOPPER_BG_LIGHT  = (249, 250, 251)
HOPPER_BG_ALT    = (243, 244, 246)
HOPPER_BORDER    = (229, 231, 235)

DONUT_PALETTE = [HOPPER_GOLD, HOPPER_BLUE, HOPPER_GREEN, HOPPER_COPPER,
                 HOPPER_RED, '#6366f1', '#0891b2', '#a16207']


def _fmtM_gbp(val):
    """Format as GBP millions: 'GBP X.Xm' (Hopper-specific)."""
    if val is None:
        return "-"
    try:
        v = float(val)
    except (TypeError, ValueError):
        return "-"
    sign = "-" if v < 0 else ""
    return f"{sign}GBP {abs(v):,.1f}m"


def _fmtM_short(val):
    """Shorter currency format for tight Hopper table cells."""
    if val is None:
        return "-"
    try:
        v = float(val)
    except (TypeError, ValueError):
        return "-"
    sign = "-" if v < 0 else ""
    return f"{sign}{abs(v):,.1f}m"


def _pct(part, whole):
    """Safe percentage string."""
    if not whole:
        return "0.0%"
    return f"{(part / whole) * 100:.1f}%"


# =============================================================================
# Hopper chart rendering — matplotlib → PNG embedded into the PDF
# =============================================================================

def _generate_hopper_charts(filtered, summary):
    """Three-chart hero strip for page 1 (Pipeline / Region / Annual Profit).

    Returns a BytesIO PNG sized for landscape A4 page width.
    """
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    # Canonical pipeline order — matches the React dashboard
    PIPELINE_ORDER = [
        "Initial idea", "ICT formed", "Strategy Approved",
        "Financial Modelling Started", "Financial Modelling Complete",
        "Financials Approved", "Negotiations Started",
        "Negotiations Concluded", "Contracting Started",
        "Contracting Concluded",
    ]

    plt.style.use('default')
    fig, (ax1, ax2, ax3) = plt.subplots(1, 3, figsize=(13, 3.8), dpi=160,
                                         gridspec_kw={'width_ratios': [1.4, 1, 1]})
    fig.patch.set_facecolor('white')

    def style_axes(ax):
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.spines['left'].set_color('#e5e7eb')
        ax.spines['bottom'].set_color('#e5e7eb')
        ax.tick_params(colors='#374151', labelsize=8)
        ax.title.set_color(HOPPER_NAVY)
        ax.title.set_fontsize(10)
        ax.title.set_weight('bold')
        ax.grid(True, axis='y', linestyle='--', alpha=0.25, color='#6b7280')

    # -- CHART 1: Pipeline by Status (gold bars) ---------------------------
    pipeline_map = {s: 0.0 for s in PIPELINE_ORDER}
    for r in filtered:
        st = str(r.get('status', '')).strip()
        if st in pipeline_map:
            pipeline_map[st] += _val(r.get('crp_term_benefit'))
    p_vals = [pipeline_map[s] for s in PIPELINE_ORDER]

    style_axes(ax1)
    if sum(p_vals) > 0:
        bars = ax1.bar(range(len(PIPELINE_ORDER)), p_vals, color=HOPPER_GOLD, width=0.65)
        ax1.set_xticks(range(len(PIPELINE_ORDER)))
        ax1.set_xticklabels([s.replace(" ", "\n", 1) if " " in s else s
                              for s in PIPELINE_ORDER],
                             fontsize=6.5, rotation=30, ha='right',
                             color='#374151')
        ax1.tick_params(axis='x', pad=2)
        # Label the tallest bars
        max_val = max(p_vals)
        for bar, v in zip(bars, p_vals):
            if v >= max_val * 0.15:
                ax1.text(bar.get_x() + bar.get_width()/2, bar.get_height(),
                         f"£{v:,.0f}m", ha='center', va='bottom',
                         fontsize=6, color=HOPPER_NAVY, weight='bold')
    ax1.set_title("Pipeline by Status — CRP £m")
    ax1.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f'£{int(x)}m'))

    # -- CHART 2: CRP by Region (donut with gold-led palette) -------------
    by_region = {}
    for r in filtered:
        rgn = str(r.get('region', 'Unknown')).strip() or 'Unknown'
        by_region[rgn] = by_region.get(rgn, 0) + _val(r.get('crp_term_benefit'))
    r_sorted = sorted(by_region.items(), key=lambda x: x[1], reverse=True)
    r_labels = [x[0] for x in r_sorted]
    r_vals = [x[1] for x in r_sorted]

    if sum(r_vals) > 0:
        colors = [DONUT_PALETTE[i % len(DONUT_PALETTE)] for i in range(len(r_labels))]
        wedges, _texts, autotexts = ax2.pie(
            r_vals, labels=[l[:14] for l in r_labels], autopct='%1.0f%%',
            colors=colors, startangle=90,
            pctdistance=0.78,
            textprops={'color': HOPPER_NAVY, 'fontsize': 8, 'weight': 'bold'},
            wedgeprops={'width': 0.38, 'edgecolor': 'white', 'linewidth': 2},
        )
        for autotext in autotexts:
            autotext.set_color('white')
            autotext.set_weight('bold')
            autotext.set_fontsize(7)
    ax2.set_title("CRP by Region")

    # -- CHART 3: Annual Profit Forecast (matches dashboard year colors) ---
    years = ['2026', '2027', '2028', '2029', '2030']
    year_totals = [sum(_val(r.get(f'profit_{y}')) for r in filtered) for y in years]
    style_axes(ax3)
    # Color scheme: 2026 & 2027 gold (near term), 2028 blue (mid),
    # 2029 & 2030 copper (long term) — same as the React chart.
    year_colors = [HOPPER_GOLD, HOPPER_GOLD, HOPPER_BLUE, HOPPER_COPPER, HOPPER_COPPER]
    if any(abs(t) > 0 for t in year_totals):
        bars = ax3.bar(years, year_totals, color=year_colors, width=0.62)
        for bar, v in zip(bars, year_totals):
            if v != 0:
                ax3.text(bar.get_x() + bar.get_width()/2, bar.get_height(),
                         f"£{v:,.0f}m", ha='center',
                         va='bottom' if v >= 0 else 'top',
                         fontsize=7, color=HOPPER_NAVY, weight='bold')
    ax3.set_title("Annual Profit Forecast — £m")
    ax3.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f'£{int(x)}m'))

    plt.tight_layout(pad=1.8)
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=160, facecolor='white')
    plt.close(fig)
    buf.seek(0)
    return buf


def _generate_customer_chart(filtered, top_n=12):
    """Horizontal bar chart: top N customers by CRP (matches dashboard style)."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    by_cust = {}
    for r in filtered:
        c = str(r.get('customer', '')).strip()
        if c and c.lower() not in ('nan', 'none'):
            by_cust[c] = by_cust.get(c, 0) + _val(r.get('crp_term_benefit'))

    items = sorted(by_cust.items(), key=lambda x: x[1], reverse=True)[:top_n]
    items.reverse()
    if not items:
        return None
    names = [n[:22] for n, _ in items]
    vals = [v for _, v in items]

    fig, ax = plt.subplots(figsize=(11, 3.6), dpi=160)
    fig.patch.set_facecolor('white')
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['left'].set_color('#e5e7eb')
    ax.spines['bottom'].set_color('#e5e7eb')
    ax.tick_params(colors='#374151', labelsize=8)
    ax.grid(True, axis='x', linestyle='--', alpha=0.25, color='#6b7280')
    bars = ax.barh(names, vals, color=HOPPER_BLUE, height=0.62)
    for bar, v in zip(bars, vals):
        ax.text(bar.get_width(), bar.get_y() + bar.get_height()/2,
                f"  £{v:,.1f}m", va='center', ha='left',
                fontsize=7, color=HOPPER_NAVY, weight='bold')
    ax.set_title(f"Top {len(items)} Customers — CRP £m",
                 fontsize=10, weight='bold', color=HOPPER_NAVY, loc='left', pad=8)
    ax.xaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f'£{int(x)}m'))
    plt.tight_layout(pad=1.5)
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=160, facecolor='white')
    plt.close(fig)
    buf.seek(0)
    return buf


def _generate_evs_chart(filtered, top_n=10):
    """Vertical bar chart: EVS opportunity counts (matches dashboard style)."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    by_evs = {}
    for r in filtered:
        e = str(r.get('engine_value_stream', '')).strip() or 'Unknown'
        by_evs[e] = by_evs.get(e, 0) + 1
    items = sorted(by_evs.items(), key=lambda x: x[1], reverse=True)[:top_n]
    if not items:
        return None
    names = [n[:14] for n, _ in items]
    counts = [c for _, c in items]

    fig, ax = plt.subplots(figsize=(11, 3.4), dpi=160)
    fig.patch.set_facecolor('white')
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['left'].set_color('#e5e7eb')
    ax.spines['bottom'].set_color('#e5e7eb')
    ax.tick_params(colors='#374151', labelsize=8)
    ax.grid(True, axis='y', linestyle='--', alpha=0.25, color='#6b7280')
    bars = ax.bar(names, counts, color=HOPPER_COPPER, width=0.6)
    for bar, c in zip(bars, counts):
        ax.text(bar.get_x() + bar.get_width()/2, bar.get_height(),
                str(c), ha='center', va='bottom',
                fontsize=8, color=HOPPER_NAVY, weight='bold')
    ax.set_title(f"Engine Value Stream Distribution — opportunities",
                 fontsize=10, weight='bold', color=HOPPER_NAVY, loc='left', pad=8)
    plt.xticks(rotation=20, ha='right')
    plt.tight_layout(pad=1.5)
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=160, facecolor='white')
    plt.close(fig)
    buf.seek(0)
    return buf


class HopperPDF(FPDF):
    """PDF for the Global Commercial Optimisation Hopper report.

    Landscape A4. Color palette matches the React dashboard's dark-navy
    theme so the printed deliverable visually maps back to what the user
    saw on screen.
    """

    PAGE_W = 297
    PAGE_H = 210
    MARGIN_L = 12
    MARGIN_R = 12

    def __init__(self):
        super().__init__(orientation="L", unit="mm", format="A4")
        self.set_auto_page_break(auto=True, margin=20)
        self.set_margins(self.MARGIN_L, 16, self.MARGIN_R)

    def header(self):
        # Drawn explicitly per-page via _page_header(); header() left blank.
        pass

    def footer(self):
        # Footer band
        self.set_y(-14)
        self.set_draw_color(*HOPPER_BORDER)
        self.line(self.MARGIN_L, self.get_y(), self.PAGE_W - self.MARGIN_R, self.get_y())
        self.set_y(-11)
        self.set_font("Helvetica", "", 7)
        self.set_text_color(*HOPPER_TEXT_MUTE)
        self.cell(0, 6,
                  f"ROLLS-ROYCE CIVIL AEROSPACE   |   Global Commercial Optimisation Hopper   |   "
                  f"Page {self.page_no()}   |   Internal use only",
                  0, 0, "C")

    # -- Page-level templates ------------------------------------------------

    def _title_bar(self, title, subtitle=""):
        """Full-bleed navy band at the very top of page 1."""
        # Reset and draw the bar
        self.set_y(0)
        self.set_fill_color(*HOPPER_NAVY_RGB)
        self.rect(0, 0, self.PAGE_W, 28, "F")
        # Thin gold accent strip below the bar
        self.set_fill_color(*HOPPER_GOLD_RGB)
        self.rect(0, 28, self.PAGE_W, 1.2, "F")

        # Title text
        self.set_xy(self.MARGIN_L, 6)
        self.set_font("Helvetica", "B", 17)
        self.set_text_color(*WHITE)
        self.cell(200, 8, _safe(title), 0, 0, "L")

        # Subtitle
        if subtitle:
            self.set_font("Helvetica", "", 9)
            self.set_text_color(190, 200, 215)
            self.set_xy(self.MARGIN_L, 16)
            self.cell(220, 5, _safe(subtitle), 0, 0, "L")

        # Right-hand badges (gold + grey)
        self.set_font("Helvetica", "B", 8)
        bx = self.PAGE_W - self.MARGIN_R - 70
        self.set_xy(bx, 9)
        self.set_fill_color(*HOPPER_GOLD_RGB)
        self.set_text_color(*HOPPER_NAVY_RGB)
        self.cell(34, 6.5, "GLOBAL HOPPER", 0, 0, "C", True)
        self.set_xy(bx + 36, 9)
        self.set_fill_color(45, 55, 72)
        self.set_text_color(*WHITE)
        self.cell(34, 6.5, "ROLLS-ROYCE", 0, 0, "C", True)

        # Park cursor below the title bar
        self.set_y(34)

    def _page_header(self, title):
        """Compact section header for pages 2+ (no navy band)."""
        self.set_y(8)
        self.set_x(self.MARGIN_L)
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(*HOPPER_NAVY_RGB)
        self.cell(0, 6, _safe(title), 0, 1, "L")
        # Gold underline
        y = self.get_y() + 1
        self.set_fill_color(*HOPPER_GOLD_RGB)
        self.rect(self.MARGIN_L, y, 18, 0.8, "F")
        self.set_y(y + 3)

    def _section_header(self, title):
        """Inline section title used between blocks on the same page."""
        y = self.get_y()
        if y > self.PAGE_H - 50:
            self.add_page()
            y = self.get_y()
        self.ln(2)
        self.set_x(self.MARGIN_L)
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(*HOPPER_NAVY_RGB)
        self.cell(0, 6, _safe(title), 0, 1, "L")
        # Thin underline
        y2 = self.get_y()
        self.set_draw_color(*HOPPER_GOLD_RGB)
        self.set_line_width(0.4)
        self.line(self.MARGIN_L, y2, self.MARGIN_L + 18, y2)
        self.set_line_width(0.2)
        self.ln(2)

    # -- Drawing primitives --------------------------------------------------

    def _kpi_card(self, x, y, w, h, label, value, accent_rgb, sub=""):
        """KPI card with left accent strip, label, value, optional sub-line."""
        # Card background
        self.set_fill_color(*HOPPER_BG_LIGHT)
        self.rect(x, y, w, h, "F")
        # Thin border
        self.set_draw_color(*HOPPER_BORDER)
        self.set_line_width(0.2)
        self.rect(x, y, w, h, "D")
        # Left accent strip
        self.set_fill_color(*accent_rgb)
        self.rect(x, y, 1.6, h, "F")

        # Label
        self.set_xy(x + 4, y + 2.5)
        self.set_font("Helvetica", "", 7.5)
        self.set_text_color(*HOPPER_TEXT_MUTE)
        self.cell(w - 5, 4, _safe(label).upper(), 0, 2, "L")
        # Value
        self.set_xy(x + 4, y + 7)
        self.set_font("Helvetica", "B", 14)
        self.set_text_color(*accent_rgb)
        self.cell(w - 5, 7, _safe(value), 0, 2, "L")
        # Sub
        if sub:
            self.set_xy(x + 4, y + h - 5)
            self.set_font("Helvetica", "", 6.5)
            self.set_text_color(*HOPPER_TEXT_MUTE)
            self.cell(w - 5, 3, _safe(sub), 0, 0, "L")

    def _chip(self, label, value, x=None, y=None):
        """Inline pill: 'LABEL' (small grey) + value (dark)."""
        if x is not None:
            self.set_xy(x, y)
        self.set_font("Helvetica", "B", 6.5)
        self.set_text_color(*HOPPER_TEXT_MUTE)
        lab_w = self.get_string_width(label.upper()) + 1
        self.cell(lab_w, 4, label.upper(), 0, 0, "L")
        self.set_font("Helvetica", "B", 7.5)
        self.set_text_color(*HOPPER_NAVY_RGB)
        val_w = self.get_string_width(str(value)) + 4
        self.cell(val_w, 4, " " + _safe(value), 0, 0, "L")
        return lab_w + val_w + 4

    def _table(self, headers, rows, col_widths, *, max_rows=80,
               right_align_idx=None, totals_row=None):
        """Branded data table with alternating rows.

        Parameters
        ----------
        right_align_idx : iterable of int, optional
            Column indices to right-align (numeric columns). If None,
            auto-detect (cells starting with GBP/digit/-).
        totals_row : list, optional
            A pre-formatted last row to render in bold with a top border.
        """
        # -- Header
        x_start = self.MARGIN_L
        self.set_fill_color(*HOPPER_NAVY_RGB)
        self.set_text_color(*WHITE)
        self.set_font("Helvetica", "B", 7.5)
        x = x_start
        for i, h in enumerate(headers):
            self.set_xy(x, self.get_y())
            self.cell(col_widths[i], 6.5, _safe(h).upper(), 0, 0, "C", True)
            x += col_widths[i]
        self.ln(6.5)

        def _draw_header():
            self.set_fill_color(*HOPPER_NAVY_RGB)
            self.set_text_color(*WHITE)
            self.set_font("Helvetica", "B", 7.5)
            xx = x_start
            for ii, hh in enumerate(headers):
                self.set_xy(xx, self.get_y())
                self.cell(col_widths[ii], 6.5, _safe(hh).upper(), 0, 0, "C", True)
                xx += col_widths[ii]
            self.ln(6.5)

        # -- Data rows
        def _cell_align(idx, val):
            if right_align_idx is not None:
                return "R" if idx in right_align_idx else "L"
            sv = str(val).strip()
            if sv.startswith("GBP") or sv.startswith("-") or (sv and (sv[0].isdigit() or sv[0] == "£")):
                return "R"
            return "L"

        self.set_font("Helvetica", "", 7)
        for idx_row, row in enumerate(rows[:max_rows]):
            # Page-break safe
            if self.get_y() > self.PAGE_H - 22:
                self.add_page()
                self._page_header("(continued)")
                _draw_header()
                self.set_font("Helvetica", "", 7)

            # Alternating fill
            if idx_row % 2 == 0:
                self.set_fill_color(*HOPPER_BG_ALT)
            else:
                self.set_fill_color(*WHITE)
            self.set_text_color(*HOPPER_TEXT_DARK)

            x = x_start
            for i, cell_val in enumerate(row):
                self.set_xy(x, self.get_y())
                self.cell(col_widths[i], 5.8, _safe(str(cell_val)),
                          0, 0, _cell_align(i, cell_val), True)
                x += col_widths[i]
            self.ln(5.8)

        # -- Optional totals row
        if totals_row:
            if self.get_y() > self.PAGE_H - 22:
                self.add_page()
                self._page_header("(continued)")
                _draw_header()
            # Top border
            y_now = self.get_y()
            self.set_draw_color(*HOPPER_NAVY_RGB)
            self.set_line_width(0.4)
            self.line(x_start, y_now, x_start + sum(col_widths), y_now)
            self.set_line_width(0.2)

            self.set_fill_color(*HOPPER_BG_LIGHT)
            self.set_text_color(*HOPPER_NAVY_RGB)
            self.set_font("Helvetica", "B", 7.5)
            x = x_start
            for i, cell_val in enumerate(totals_row):
                self.set_xy(x, self.get_y())
                self.cell(col_widths[i], 6, _safe(str(cell_val)),
                          0, 0, _cell_align(i, cell_val), True)
                x += col_widths[i]
            self.ln(6)

        if len(rows) > max_rows:
            self.set_font("Helvetica", "I", 6.5)
            self.set_text_color(*HOPPER_TEXT_MUTE)
            self.cell(0, 4, f"   ... and {len(rows) - max_rows} more rows omitted",
                      0, 1, "L")


def _apply_hopper_filters(opportunities, filters):
    """Apply optional filters dict to the Hopper opportunity list."""
    if not filters:
        return list(opportunities)

    filtered = []
    for row in opportunities:
        if filters.get("region"):
            if str(row.get("region", "")).strip().lower() != str(filters["region"]).strip().lower():
                continue
        if filters.get("customer"):
            if str(row.get("customer", "")).strip().lower() != str(filters["customer"]).strip().lower():
                continue
        if filters.get("status"):
            if str(row.get("status", "")).strip().lower() != str(filters["status"]).strip().lower():
                continue
        if filters.get("maturity"):
            if str(row.get("maturity", "")).strip().lower() != str(filters["maturity"]).strip().lower():
                continue
        if filters.get("restructure_type"):
            if str(row.get("restructure_type", "")).strip().lower() != str(filters["restructure_type"]).strip().lower():
                continue
        try:
            mv = filters.get("min_value")
            if mv is not None and _val(row.get("crp_term_benefit")) < float(mv):
                continue
        except Exception:
            pass
        filtered.append(row)

    return filtered


HOPPER_SECTIONS = (
    "summary",            # title bar + KPI cards + meta strip + secondary KPI chips
    "charts",             # 3-chart hero (Pipeline / Region donut / Annual profit)
    "customer_analysis",  # Top customers chart + table
    "engine_analysis",    # EVS distribution chart + table
    "pipeline",           # Pipeline by Status table with totals
    "restructure",        # Restructure / Maturity / Onerous mini-tables
    "top_opportunities",  # Top 25 opportunities register
    "customer_breakdown", # Full ranked customer table
)


def _aggregate(rows, key, value_fn=None, count=False):
    """Helper: group rows by ``key`` and sum a value field (or count)."""
    out = {}
    for r in rows:
        k = str(r.get(key, "")).strip() or "Unknown"
        if count:
            out[k] = out.get(k, 0) + 1
        else:
            v = value_fn(r) if value_fn else _val(r.get("crp_term_benefit"))
            out[k] = out.get(k, 0) + v
    return out


def generate_hopper_pdf_report(
    parsed_data: dict,
    sections_to_include: list = None,
    filters: dict = None,
) -> bytes:
    """Generate the Global Commercial Optimisation Hopper PDF report.

    Sections (canonical names): ``summary``, ``charts``, ``customer_analysis``,
    ``engine_analysis``, ``pipeline``, ``restructure``, ``top_opportunities``,
    ``customer_breakdown``.

    For backwards compatibility this function also accepts the older section
    names ``kpis``, ``top_opps``, and ``exec_report`` — they map onto the new
    section set.

    Parameters
    ----------
    parsed_data : dict
        Output from ``parser.parse_file`` for a Global Hopper workbook.
    sections_to_include : list, optional
        Subset of ``HOPPER_SECTIONS``. ``None`` or empty -> all sections.
    filters : dict, optional
        Optional row filters with keys: region, customer, status, maturity,
        restructure_type, min_value.

    Returns
    -------
    bytes
        The rendered PDF as a byte string.
    """
    # ------------------------------------------------------------------- inputs
    if not sections_to_include:
        sections_to_include = list(HOPPER_SECTIONS)
    # Legacy section-name aliases (preserve old contract):
    _alias = {"kpis": "summary", "top_opps": "top_opportunities", "exec_report": "customer_breakdown"}
    sections = {(_alias.get(s, s)) for s in sections_to_include}
    if filters is None:
        filters = {}

    meta = parsed_data.get("metadata", {})
    opportunities = parsed_data.get("opportunities", [])
    filtered = _apply_hopper_filters(opportunities, filters)

    # ------------------------------------------------------------------ totals
    total_crp = sum(_val(r.get("crp_term_benefit")) for r in filtered)
    totals_year = {y: sum(_val(r.get(f"profit_{y}")) for r in filtered)
                   for y in (2026, 2027, 2028, 2029, 2030)}
    total_opps = len(filtered)
    customers = {str(r.get("customer", "")).strip() for r in filtered if r.get("customer")}
    regions = {str(r.get("region", "")).strip() for r in filtered if r.get("region")}
    evss = {str(r.get("engine_value_stream", "")).strip() for r in filtered if r.get("engine_value_stream")}
    mature = sum(1 for r in filtered if str(r.get("maturity", "")).strip().lower() == "mature")
    immature = total_opps - mature
    onerous = sum(1 for r in filtered if "onerous" in str(r.get("onerous_type", "")).lower()
                  and "not" not in str(r.get("onerous_type", "")).lower())
    not_onerous = total_opps - onerous

    pdf = HopperPDF()
    pdf.add_page()

    # ============================================================ PAGE 1
    # Title bar always renders so the document is identifiable even when no
    # sections are selected.
    date_str = datetime.now().strftime("%d %B %Y")
    parts = [f"Generated {date_str}",
             f"{total_opps} opportunities",
             f"{len(customers)} customers",
             f"{len(regions)} regions",
             "Currency: GBP"]
    if filters.get("region"):
        parts.insert(0, f"Region: {filters['region']}")
    if filters.get("customer"):
        parts.insert(0, f"Customer: {filters['customer']}")
    subtitle = "   |   ".join(parts)
    pdf._title_bar("COMMERCIAL OPTIMISATION OPPORTUNITY REPORT", subtitle)

    if total_opps == 0:
        pdf.set_font("Helvetica", "I", 12)
        pdf.set_text_color(*HOPPER_TEXT_MUTE)
        pdf.cell(0, 10, "No data matches the selected filters.", 0, 1, "C")
        return bytes(pdf.output())

    # -- KPI cards ----------------------------------------------------------
    if "summary" in sections:
        y = pdf.get_y() + 1
        card_w = (pdf.PAGE_W - pdf.MARGIN_L - pdf.MARGIN_R - 3 * 4) / 4  # 4 cards
        x = pdf.MARGIN_L

        pdf._kpi_card(x, y, card_w, 22, "CRP Term Benefit",
                      _fmtM_gbp(total_crp), HOPPER_GOLD_RGB,
                      f"{total_opps} opportunities • {len(customers)} customers")
        x += card_w + 4

        pdf._kpi_card(x, y, card_w, 22, "Profit 2026",
                      _fmtM_gbp(totals_year[2026]), HOPPER_GOLD_RGB,
                      f"Near-term: {_fmtM_gbp(totals_year[2026] + totals_year[2027])} (26-27)")
        x += card_w + 4

        pdf._kpi_card(x, y, card_w, 22, "Profit 2027",
                      _fmtM_gbp(totals_year[2027]), HOPPER_BLUE_RGB)
        x += card_w + 4

        long_term = totals_year[2028] + totals_year[2029] + totals_year[2030]
        pdf._kpi_card(x, y, card_w, 22, "Profit 2028-30",
                      _fmtM_gbp(long_term), HOPPER_COPPER_RGB,
                      f"Avg/year: {_fmtM_gbp(long_term / 3)}")

        pdf.set_y(y + 24)

        # Secondary KPI chips
        pdf.set_x(pdf.MARGIN_L)
        cur_x = pdf.MARGIN_L
        cur_y = pdf.get_y()
        for label, value in [
            ("Mature", str(mature)),
            ("Immature", str(immature)),
            ("Onerous", str(onerous)),
            ("Not onerous", str(not_onerous)),
            ("EVS types", str(len(evss))),
            ("Regions", ", ".join(sorted(regions)[:4]) +
                        (f" +{len(regions) - 4}" if len(regions) > 4 else "")),
        ]:
            w = pdf._chip(label, value, x=cur_x, y=cur_y)
            cur_x += w + 2
        pdf.ln(6)

    # -- Hero chart strip ----------------------------------------------------
    if "charts" in sections:
        try:
            chart_buf = _generate_hopper_charts(filtered, parsed_data.get("summary", {}))
            avail_w = pdf.PAGE_W - pdf.MARGIN_L - pdf.MARGIN_R
            pdf.image(chart_buf, x=pdf.MARGIN_L, w=avail_w)
            pdf.ln(2)
        except Exception as e:
            pdf.set_font("Helvetica", "I", 8)
            pdf.set_text_color(*HOPPER_TEXT_MUTE)
            pdf.cell(0, 5, _safe(f"(charts unavailable: {e})"), 0, 1, "L")

    # ============================================================ PAGE 2
    # Customer & Engine analysis — chart strip + tables
    if "customer_analysis" in sections or "engine_analysis" in sections:
        pdf.add_page()
        pdf._page_header("Customer & Engine Analysis")

        # -- Top customers chart + table (side-by-side feels cramped on
        # landscape A4 once axis labels are included; render stacked.)
        if "customer_analysis" in sections:
            try:
                cbuf = _generate_customer_chart(filtered, top_n=12)
                if cbuf is not None:
                    pdf.image(cbuf, x=pdf.MARGIN_L,
                              w=pdf.PAGE_W - pdf.MARGIN_L - pdf.MARGIN_R)
                    pdf.ln(2)
            except Exception:
                pass

            by_cust = _aggregate(filtered, "customer")
            cust_count = _aggregate(filtered, "customer", count=True)
            top_custs = sorted(by_cust.items(), key=lambda x: x[1], reverse=True)[:15]
            if top_custs:
                pdf._section_header("Top 15 Customers — by CRP term benefit")
                headers = ["#", "Customer", "Opportunities", "CRP Term (GBP m)", "% of Total"]
                widths = [10, 110, 35, 60, 35]
                rows = []
                for i, (cust, crp) in enumerate(top_custs, 1):
                    rows.append([
                        str(i),
                        _trunc(cust, 60),
                        str(cust_count.get(cust, 0)),
                        _fmtM_gbp(crp),
                        _pct(crp, total_crp),
                    ])
                top_total = sum(v for _, v in top_custs)
                totals = [
                    "", f"Top {len(top_custs)} subtotal",
                    str(sum(cust_count.get(c, 0) for c, _ in top_custs)),
                    _fmtM_gbp(top_total),
                    _pct(top_total, total_crp),
                ]
                pdf._table(headers, rows, widths,
                           right_align_idx={2, 3, 4}, totals_row=totals)

        # -- EVS distribution chart + table
        if "engine_analysis" in sections:
            if pdf.get_y() > pdf.PAGE_H - 90:
                pdf.add_page()
                pdf._page_header("Customer & Engine Analysis (continued)")

            try:
                ebuf = _generate_evs_chart(filtered, top_n=10)
                if ebuf is not None:
                    pdf.image(ebuf, x=pdf.MARGIN_L,
                              w=pdf.PAGE_W - pdf.MARGIN_L - pdf.MARGIN_R)
                    pdf.ln(2)
            except Exception:
                pass

            by_evs_count = _aggregate(filtered, "engine_value_stream", count=True)
            by_evs_crp = _aggregate(filtered, "engine_value_stream")
            evs_sorted = sorted(by_evs_count.items(), key=lambda x: x[1], reverse=True)
            if evs_sorted:
                pdf._section_header("Engine Value Stream Distribution")
                headers = ["Engine Value Stream", "Opportunities", "CRP Term (GBP m)", "% of Total"]
                widths = [120, 40, 60, 30]
                rows = []
                for evs, cnt in evs_sorted:
                    rows.append([
                        _trunc(evs, 50),
                        str(cnt),
                        _fmtM_gbp(by_evs_crp.get(evs, 0)),
                        _pct(by_evs_crp.get(evs, 0), total_crp),
                    ])
                pdf._table(headers, rows, widths,
                           right_align_idx={1, 2, 3},
                           totals_row=["TOTAL", str(total_opps),
                                       _fmtM_gbp(total_crp), "100.0%"])

    # ============================================================ PAGE 3
    # Pipeline & Structure
    if "pipeline" in sections or "restructure" in sections:
        pdf.add_page()
        pdf._page_header("Pipeline & Restructure Breakdown")

        if "pipeline" in sections:
            PIPELINE_ORDER = [
                "Initial idea", "ICT formed", "Strategy Approved",
                "Financial Modelling Started", "Financial Modelling Complete",
                "Financials Approved", "Negotiations Started",
                "Negotiations Concluded", "Contracting Started",
                "Contracting Concluded",
            ]
            by_status_count = _aggregate(filtered, "status", count=True)
            by_status_crp = _aggregate(filtered, "status")

            # Order canonical first, then any unknown statuses by value.
            ordered = []
            for s in PIPELINE_ORDER:
                if s in by_status_count:
                    ordered.append(s)
            extras = sorted(
                (s for s in by_status_count if s not in PIPELINE_ORDER),
                key=lambda s: by_status_crp.get(s, 0), reverse=True,
            )
            ordered.extend(extras)

            if ordered:
                pdf._section_header("Pipeline by Status")
                headers = ["Stage", "Opportunities", "CRP Term (GBP m)", "% of CRP"]
                widths = [130, 40, 55, 30]
                rows = []
                for s in ordered:
                    rows.append([
                        _trunc(s, 60),
                        str(by_status_count.get(s, 0)),
                        _fmtM_gbp(by_status_crp.get(s, 0)),
                        _pct(by_status_crp.get(s, 0), total_crp),
                    ])
                pdf._table(headers, rows, widths,
                           right_align_idx={1, 2, 3},
                           totals_row=["TOTAL", str(total_opps),
                                       _fmtM_gbp(total_crp), "100.0%"])

        if "restructure" in sections:
            if pdf.get_y() > pdf.PAGE_H - 60:
                pdf.add_page()
                pdf._page_header("Pipeline & Restructure Breakdown (continued)")

            # Restructure type table
            by_rtype_count = _aggregate(filtered, "restructure_type", count=True)
            by_rtype_crp = _aggregate(filtered, "restructure_type")
            rtype_sorted = sorted(by_rtype_crp.items(), key=lambda x: x[1], reverse=True)
            if rtype_sorted:
                pdf._section_header("Restructure Type")
                headers = ["Restructure Type", "Opportunities", "CRP Term (GBP m)", "% of CRP"]
                widths = [130, 40, 55, 30]
                rows = []
                for rt, crp in rtype_sorted:
                    rows.append([
                        _trunc(rt, 60),
                        str(by_rtype_count.get(rt, 0)),
                        _fmtM_gbp(crp),
                        _pct(crp, total_crp),
                    ])
                pdf._table(headers, rows, widths,
                           right_align_idx={1, 2, 3},
                           totals_row=["TOTAL", str(total_opps),
                                       _fmtM_gbp(total_crp), "100.0%"])

            # Maturity / Onerous side-by-side mini tables
            if pdf.get_y() > pdf.PAGE_H - 50:
                pdf.add_page()
                pdf._page_header("Pipeline & Restructure Breakdown (continued)")

            pdf._section_header("Maturity & Onerous Split")
            by_mat = _aggregate(filtered, "maturity")
            by_mat_count = _aggregate(filtered, "maturity", count=True)
            by_oner = _aggregate(filtered, "onerous_type")
            by_oner_count = _aggregate(filtered, "onerous_type", count=True)

            # Render two compact tables side-by-side using a manual layout.
            # Each table: 120mm wide, 4 columns: tag/opps/crp/%
            block_w = (pdf.PAGE_W - pdf.MARGIN_L - pdf.MARGIN_R - 6) / 2
            block_left_x = pdf.MARGIN_L
            block_right_x = pdf.MARGIN_L + block_w + 6
            y_start = pdf.get_y()

            # Left: Maturity
            pdf.set_xy(block_left_x, y_start)
            pdf.set_font("Helvetica", "B", 8)
            pdf.set_text_color(*HOPPER_NAVY_RGB)
            pdf.cell(block_w, 5, "MATURITY", 0, 1, "L")
            mat_y = pdf.get_y()
            pdf.set_xy(block_left_x, mat_y)
            pdf.set_fill_color(*HOPPER_NAVY_RGB)
            pdf.set_text_color(*WHITE)
            pdf.set_font("Helvetica", "B", 7)
            for label, w in [("TAG", block_w * 0.45), ("OPPS", block_w * 0.18),
                             ("CRP (GBP m)", block_w * 0.22), ("%", block_w * 0.15)]:
                pdf.cell(w, 5.5, label, 0, 0, "C", True)
            pdf.ln(5.5)
            for tag, crp in sorted(by_mat.items(), key=lambda x: x[1], reverse=True):
                pdf.set_x(block_left_x)
                pdf.set_text_color(*HOPPER_TEXT_DARK)
                pdf.set_font("Helvetica", "", 7)
                pdf.cell(block_w * 0.45, 5, _trunc(tag, 30), 0, 0, "L")
                pdf.cell(block_w * 0.18, 5, str(by_mat_count.get(tag, 0)), 0, 0, "R")
                pdf.cell(block_w * 0.22, 5, _fmtM_short(crp), 0, 0, "R")
                pdf.cell(block_w * 0.15, 5, _pct(crp, total_crp), 0, 0, "R")
                pdf.ln(5)
            mat_y_end = pdf.get_y()

            # Right: Onerous
            pdf.set_xy(block_right_x, y_start)
            pdf.set_font("Helvetica", "B", 8)
            pdf.set_text_color(*HOPPER_NAVY_RGB)
            pdf.cell(block_w, 5, "ONEROUS TYPE", 0, 1, "L")
            pdf.set_xy(block_right_x, mat_y)
            pdf.set_fill_color(*HOPPER_NAVY_RGB)
            pdf.set_text_color(*WHITE)
            pdf.set_font("Helvetica", "B", 7)
            for label, w in [("TAG", block_w * 0.45), ("OPPS", block_w * 0.18),
                             ("CRP (GBP m)", block_w * 0.22), ("%", block_w * 0.15)]:
                pdf.cell(w, 5.5, label, 0, 0, "C", True)
            pdf.ln(5.5)
            for tag, crp in sorted(by_oner.items(), key=lambda x: x[1], reverse=True):
                pdf.set_x(block_right_x)
                pdf.set_text_color(*HOPPER_TEXT_DARK)
                pdf.set_font("Helvetica", "", 7)
                pdf.cell(block_w * 0.45, 5, _trunc(tag, 30), 0, 0, "L")
                pdf.cell(block_w * 0.18, 5, str(by_oner_count.get(tag, 0)), 0, 0, "R")
                pdf.cell(block_w * 0.22, 5, _fmtM_short(crp), 0, 0, "R")
                pdf.cell(block_w * 0.15, 5, _pct(crp, total_crp), 0, 0, "R")
                pdf.ln(5)
            oner_y_end = pdf.get_y()

            # Align cursor below the taller of the two blocks
            pdf.set_y(max(mat_y_end, oner_y_end) + 2)

    # ============================================================ PAGE 4
    # Top Opportunities Register
    if "top_opportunities" in sections:
        pdf.add_page()
        pdf._page_header("Top 25 Opportunities by CRP Term Benefit")

        top_sorted = sorted(filtered, key=lambda r: _val(r.get("crp_term_benefit")),
                            reverse=True)[:25]
        headers = ["#", "Region", "Customer", "Engine VS", "Restructure",
                   "Status", "Maturity", "CRP", "2026", "2027", "VP/Owner"]
        widths = [8, 22, 35, 30, 30, 28, 18, 22, 18, 18, 35]
        rows = []
        for i, r in enumerate(top_sorted, 1):
            rows.append([
                str(i),
                _trunc(r.get("region", ""), 12),
                _trunc(r.get("customer", ""), 18),
                _trunc(r.get("engine_value_stream", r.get("top_level_evs", "")), 16),
                _trunc(r.get("restructure_type", ""), 16),
                _trunc(r.get("status", ""), 14),
                _trunc(r.get("maturity", ""), 9),
                _fmtM_short(_val(r.get("crp_term_benefit"))),
                _fmtM_short(_val(r.get("profit_2026"))),
                _fmtM_short(_val(r.get("profit_2027"))),
                _trunc(r.get("vp_owner", ""), 18),
            ])
        pdf._table(headers, rows, widths,
                   right_align_idx={0, 7, 8, 9}, max_rows=25)

    # ============================================================ PAGE 5
    # Full Customer Breakdown
    if "customer_breakdown" in sections:
        pdf.add_page()
        pdf._page_header("Customer Breakdown — all customers ranked by CRP")

        by_cust = {}
        for r in filtered:
            c = str(r.get("customer", "")).strip() or "Unknown"
            slot = by_cust.setdefault(c, {"count": 0, "crp": 0.0,
                                          "p2026": 0.0, "p2027": 0.0,
                                          "p2830": 0.0})
            slot["count"] += 1
            slot["crp"]   += _val(r.get("crp_term_benefit"))
            slot["p2026"] += _val(r.get("profit_2026"))
            slot["p2027"] += _val(r.get("profit_2027"))
            slot["p2830"] += (_val(r.get("profit_2028")) +
                              _val(r.get("profit_2029")) +
                              _val(r.get("profit_2030")))

        sorted_custs = sorted(by_cust.items(), key=lambda x: x[1]["crp"], reverse=True)

        headers = ["#", "Customer", "Opps", "CRP Term (GBP m)",
                   "Profit 2026", "Profit 2027", "Profit 2028-30", "% of CRP"]
        widths = [8, 75, 18, 38, 32, 32, 38, 26]
        rows = []
        for i, (cust, d) in enumerate(sorted_custs, 1):
            rows.append([
                str(i),
                _trunc(cust, 42),
                str(d["count"]),
                _fmtM_gbp(d["crp"]),
                _fmtM_short(d["p2026"]),
                _fmtM_short(d["p2027"]),
                _fmtM_short(d["p2830"]),
                _pct(d["crp"], total_crp),
            ])
        totals = ["", "TOTAL", str(total_opps), _fmtM_gbp(total_crp),
                  _fmtM_short(totals_year[2026]),
                  _fmtM_short(totals_year[2027]),
                  _fmtM_short(totals_year[2028] + totals_year[2029] + totals_year[2030]),
                  "100.0%"]
        pdf._table(headers, rows, widths,
                   right_align_idx={2, 3, 4, 5, 6, 7},
                   totals_row=totals, max_rows=80)

    return bytes(pdf.output())
