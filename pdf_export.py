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
    ]:
        s = s.replace(old, new)
    return s.strip()


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

def _fmtM_gbp(val):
    """Format as GBP millions: 'GBP X.Xm' (Hopper-specific)."""
    if val is None:
        return "-"
    v = float(val)
    sign = "-" if v < 0 else ""
    return f"{sign}GBP {abs(v):,.1f}m"


def _fmtM_short(val):
    """Shorter currency format for tight Hopper table cells."""
    if val is None:
        return "-"
    v = float(val)
    sign = "-" if v < 0 else ""
    return f"{sign}{abs(v):,.1f}m"


def _generate_hopper_charts(filtered, summary):
    """Generate a horizontal strip of 3 Hopper charts and return as BytesIO PNG.

    Left   : Region donut (CRP by region)
    Center : Top 10 customers horizontal bar
    Right  : Year-over-year profit forecast bar (2026-2030)
    """
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    NAVY_HEX   = '#03002e'
    ACCENT_HEX = '#10069f'
    GREEN_HEX  = '#00c875'
    AMBER_HEX  = '#ffb300'
    CYAN_HEX   = '#00c8ff'
    GREY_HEX   = '#828296'

    # Extra palette for donut slices
    DONUT_COLORS = [ACCENT_HEX, GREEN_HEX, AMBER_HEX, CYAN_HEX, '#e84393', '#6c5ce7',
                    '#fd79a8', '#00b894', '#636e72', '#d63031']

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

    # -- CHART 1: Region Donut (CRP by region) -------------------------------
    by_region = {}
    for r in filtered:
        rgn = str(r.get('region', 'Unknown')).strip()
        if not rgn or rgn.lower() in ('nan', 'none', ''):
            rgn = 'Unknown'
        by_region[rgn] = by_region.get(rgn, 0) + _val(r.get('crp_term_benefit'))

    r_sorted = sorted(by_region.items(), key=lambda x: x[1], reverse=True)
    r_labels = [x[0] for x in r_sorted]
    r_vals = [x[1] for x in r_sorted]
    r_colors = [DONUT_COLORS[i % len(DONUT_COLORS)] for i in range(len(r_labels))]

    if sum(r_vals) > 0:
        wedges, texts, autotexts = ax1.pie(
            r_vals, labels=[l[:12] for l in r_labels], autopct='%1.0f%%',
            colors=r_colors, startangle=90,
            textprops={'color': NAVY_HEX, 'fontsize': 7, 'weight': 'bold'},
            wedgeprops={'width': 0.4, 'edgecolor': 'white', 'linewidth': 2}
        )
        for autotext in autotexts:
            autotext.set_color('white')
            autotext.set_weight('bold')
    ax1.set_title("CRP by Region")

    # -- CHART 2: Top 10 Customers horizontal bar ----------------------------
    by_cust = {}
    for r in filtered:
        c = str(r.get('customer', 'Unknown')).strip()
        if not c or c.lower() in ('nan', 'none', ''):
            continue
        by_cust[c] = by_cust.get(c, 0) + _val(r.get('crp_term_benefit'))

    c_sorted = sorted(by_cust.items(), key=lambda x: x[1], reverse=True)[:10]
    c_sorted.reverse()  # smallest at top for horizontal bar
    c_names = [x[0][:18] for x in c_sorted]
    c_vals = [x[1] for x in c_sorted]

    clean_ax(ax2)
    if sum(c_vals) > 0:
        bars_h = ax2.barh(c_names, c_vals, color=GREEN_HEX, alpha=0.9, height=0.6)
        for bar in bars_h:
            w = bar.get_width()
            ax2.annotate(f"GBP {w:,.1f}m",
                         xy=(w, bar.get_y() + bar.get_height() / 2),
                         xytext=(3, 0),
                         textcoords="offset points",
                         ha='left', va='center', fontsize=6, color=NAVY_HEX, weight='bold')
    ax2.set_title("Top 10 Customers (CRP)")
    ax2.set_xticks([])
    ax2.spines['bottom'].set_visible(False)

    # -- CHART 3: Year-over-year profit forecast bar (2026-2030) --------------
    years = ['2026', '2027', '2028', '2029', '2030']
    year_keys = [f'profit_{y}' for y in years]
    year_totals = []
    for yk in year_keys:
        total = sum(_val(r.get(yk)) for r in filtered)
        year_totals.append(total)

    clean_ax(ax3)
    bar_colors = [ACCENT_HEX, GREEN_HEX, AMBER_HEX, CYAN_HEX, '#6c5ce7']
    if sum(year_totals) > 0:
        bars = ax3.bar(years, year_totals, color=bar_colors[:len(years)], alpha=0.9, width=0.6)
        for bar in bars:
            h = bar.get_height()
            if h != 0:
                ax3.annotate(f"GBP {h:,.1f}m",
                             xy=(bar.get_x() + bar.get_width() / 2, h),
                             xytext=(0, 3),
                             textcoords="offset points",
                             ha='center', va='bottom', fontsize=7, color=NAVY_HEX, weight='bold')
    ax3.set_title("Profit Forecast by Year")
    ax3.set_yticks([])
    ax3.spines['left'].set_visible(False)

    plt.tight_layout(pad=2.0)
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=150)
    plt.close(fig)
    buf.seek(0)
    return buf


class HopperPDF(FPDF):
    """Custom PDF class for the Global Commercial Optimisation Hopper report."""

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
                  f"ROLLS-ROYCE CIVIL AEROSPACE  |  Global Hopper  |  "
                  f"Page {self.page_no()}  |  Internal use only", 0, 0, "C")

    # -- Drawing helpers -----------------------------------------------------

    def _title_bar(self, title, subtitle=""):
        """Full-width navy bar with title and right-hand badges."""
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
        # Right-hand badges
        self.set_font("Helvetica", "B", 9)
        self.set_text_color(*WHITE)
        self.set_xy(218, 8)
        self.set_fill_color(*ACCENT)
        self.cell(30, 7, "GLOBAL HOPPER", 0, 0, "C", True)
        self.set_xy(251, 8)
        self.set_fill_color(40, 40, 70)
        self.cell(34, 7, "ROLLS-ROYCE", 0, 0, "C", True)
        self.set_y(30)

    def _section_header(self, title, icon_char=""):
        """Styled section header with accent pill."""
        y = self.get_y()
        if y > 170:
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

        Alignment rule: right-align any cell whose stringified value starts
        with 'GBP', '-', or a digit (i.e. numeric columns); left-align the
        rest. This differs from OppPDF._table which always right-aligns only
        the final column.
        """
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
            if self.get_y() > 185:
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
                # Right-align numeric columns (those starting with GBP, -, or a digit)
                sv = str(cell_val).strip()
                align = "R" if (sv.startswith("GBP") or sv.startswith("-")
                                or (sv and sv[0].isdigit())) else "L"
                self.cell(col_widths[i], 6.5, _safe(str(cell_val)), 0, 0, align, True)
                x += col_widths[i]
            self.ln(6.5)
            count += 1

        if len(rows) > max_rows:
            self.set_font("Helvetica", "I", 7)
            self.set_text_color(*GREY_TXT)
            self.cell(0, 5, f"  ... and {len(rows) - max_rows} more rows", 0, 1)


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


def generate_hopper_pdf_report(
    parsed_data: dict,
    sections_to_include: list = None,
    filters: dict = None,
) -> bytes:
    """Generate a premium Global Hopper PDF report.

    Parameters
    ----------
    parsed_data : dict
        Output from the Global Hopper parser with keys: metadata,
        opportunities, summary, exec_report, detail_report, errors.
    sections_to_include : list, optional
        Subset of: "kpis", "pipeline", "top_opps", "exec_report",
        "customer_breakdown", "charts". Default: all sections.
    filters : dict, optional
        Optional filters with keys: region, customer, status,
        maturity, restructure_type, min_value.

    Returns
    -------
    bytes
        The rendered PDF as a byte string.
    """
    ALL_SECTIONS = ["kpis", "charts", "pipeline", "top_opps", "exec_report", "customer_breakdown"]
    if sections_to_include is None:
        sections_to_include = ALL_SECTIONS
    if filters is None:
        filters = {}

    pdf = HopperPDF()
    pdf.add_page()

    meta = parsed_data.get("metadata", {})
    summary = parsed_data.get("summary", {})
    opportunities = parsed_data.get("opportunities", [])

    # -- Apply filters -------------------------------------------------------
    filtered = _apply_hopper_filters(opportunities, filters)

    # -- Compute aggregates --------------------------------------------------
    total_crp   = sum(_val(r.get("crp_term_benefit")) for r in filtered)
    total_2026  = sum(_val(r.get("profit_2026")) for r in filtered)
    total_2027  = sum(_val(r.get("profit_2027")) for r in filtered)
    total_2028  = sum(_val(r.get("profit_2028")) for r in filtered)
    total_2029  = sum(_val(r.get("profit_2029")) for r in filtered)
    total_2030  = sum(_val(r.get("profit_2030")) for r in filtered)
    total_opps  = len(filtered)
    customers   = set(str(r.get("customer", "")).strip() for r in filtered if r.get("customer"))
    regions     = set(str(r.get("region", "")).strip() for r in filtered if r.get("region"))

    # =========================================================================
    # PAGE 1: Title + KPIs + Charts
    # =========================================================================

    date_str = datetime.now().strftime("%d %B %Y")
    subtitle = (
        f"Generated: {date_str}  |  {total_opps} Opportunities  |  "
        f"{len(customers)} Customers  |  {len(regions)} Regions  |  Currency: GBP"
    )
    if filters.get("region"):
        subtitle = f"Region: {filters['region']}  |  " + subtitle
    if filters.get("customer"):
        subtitle = f"Customer: {filters['customer']}  |  " + subtitle
    pdf._title_bar("COMMERCIAL OPTIMISATION OPPORTUNITY REPORT", subtitle)

    if total_opps == 0:
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

        pdf._kpi_card(x, y, card_w, 22, "CRP TERM BENEFIT",
                       _fmtM_gbp(total_crp), ACCENT,
                       f"{total_opps} opportunities")
        x += card_w + gap

        pdf._kpi_card(x, y, card_w, 22, "PROFIT 2026",
                       _fmtM_gbp(total_2026), NAVY)
        x += card_w + gap

        pdf._kpi_card(x, y, card_w, 22, "PROFIT 2027",
                       _fmtM_gbp(total_2027), GREEN)
        x += card_w + gap

        pdf._kpi_card(x, y, card_w, 22, "TOTAL OPPORTUNITIES",
                       str(total_opps), ACCENT,
                       f"{len(customers)} customers, {len(regions)} regions")
        pdf.set_y(y + 28)

        # Info badges row
        pdf.set_font("Helvetica", "", 7.5)
        pdf.set_text_color(*GREY_TXT)
        src_file = meta.get("source_file", "-")
        region_list = ", ".join(sorted(regions)[:5])
        if len(regions) > 5:
            region_list += f" +{len(regions) - 5} more"
        info_line = (
            f"Source: {src_file}   |   "
            f"Regions: {region_list}   |   "
            f"Currency: {meta.get('currency', 'GBP')}"
        )
        pdf.cell(0, 5, _safe(info_line), 0, 1, "L")
        pdf.ln(3)

    # -- Visual Charts -------------------------------------------------------
    if "charts" in sections_to_include:
        chart_data = [r for r in filtered if _val(r.get("crp_term_benefit")) > 0]
        if chart_data:
            chart_buf = _generate_hopper_charts(chart_data, summary)
            x_img = (297 - 280) / 2
            pdf.image(chart_buf, x=x_img, w=280)
            pdf.ln(5)

    # =========================================================================
    # PIPELINE TABLE
    # =========================================================================

    if "pipeline" in sections_to_include:
        pipeline_stages = summary.get("pipeline_stages", [])
        if not pipeline_stages:
            # Build from filtered data if not pre-computed
            by_status = {}
            for r in filtered:
                st = str(r.get("status", "Unknown")).strip()
                if not st or st.lower() in ('nan', 'none', ''):
                    st = "Unknown"
                if st not in by_status:
                    by_status[st] = {"count": 0, "value": 0.0}
                by_status[st]["count"] += 1
                by_status[st]["value"] += _val(r.get("crp_term_benefit"))
            pipeline_stages = [
                {"stage": k, "count": v["count"], "value": v["value"]}
                for k, v in sorted(by_status.items(), key=lambda x: x[1]["value"], reverse=True)
            ]

        if pipeline_stages:
            pdf._section_header("Pipeline by Status")
            headers = ["Status / Stage", "Count", "CRP Term Benefit (GBP m)"]
            col_widths = [120, 40, 60]
            rows = []
            for ps in pipeline_stages:
                rows.append([
                    _trunc(ps.get("stage", ""), 60),
                    str(ps.get("count", 0)),
                    _fmtM_gbp(_val(ps.get("value"))),
                ])
            # Totals row
            t_count = sum(ps.get("count", 0) for ps in pipeline_stages)
            t_value = sum(_val(ps.get("value")) for ps in pipeline_stages)
            rows.append([
                "TOTAL",
                str(t_count),
                _fmtM_gbp(t_value),
            ])
            pdf._table(headers, rows, col_widths, max_rows=30)

    # =========================================================================
    # TOP 25 OPPORTUNITIES TABLE
    # =========================================================================

    if "top_opps" in sections_to_include:
        pdf._section_header("Top 25 Opportunities by CRP Term Benefit")
        top_sorted = sorted(filtered, key=lambda r: _val(r.get("crp_term_benefit")), reverse=True)[:25]

        headers = ["#", "Region", "Customer", "EVS", "Restructure", "Status",
                    "CRP Term", "2026", "2027"]
        col_widths = [8, 30, 38, 40, 32, 28, 30, 30, 30]

        rows = []
        for i, r in enumerate(top_sorted, 1):
            rows.append([
                str(i),
                _trunc(r.get("region", ""), 14),
                _trunc(r.get("customer", ""), 18),
                _trunc(r.get("engine_value_stream", r.get("top_level_evs", "")), 20),
                _trunc(r.get("restructure_type", ""), 15),
                _trunc(r.get("status", ""), 12),
                _fmtM_short(_val(r.get("crp_term_benefit"))),
                _fmtM_short(_val(r.get("profit_2026"))),
                _fmtM_short(_val(r.get("profit_2027"))),
            ])
        pdf._table(headers, rows, col_widths, max_rows=25)

    # =========================================================================
    # EXECUTIVE REPORT TABLE
    # =========================================================================

    if "exec_report" in sections_to_include:
        exec_data = parsed_data.get("exec_report", [])
        if exec_data:
            pdf._section_header("Executive Report")
            headers = ["Customer", "CRP Term (GBP m)", "2026", "2027", "2028", "2029"]
            col_widths = [60, 40, 35, 35, 35, 35]

            rows = []
            for er in exec_data:
                rows.append([
                    _trunc(er.get("Customer", er.get("customer", "")), 30),
                    _fmtM_short(_val(er.get("Sum of CRP Term Benefit £m",
                                            er.get("crp_term_benefit", 0)))),
                    _fmtM_short(_val(er.get("Sum of Profit 2026 £m",
                                            er.get("profit_2026", 0)))),
                    _fmtM_short(_val(er.get("Sum of Profit 2027 £m",
                                            er.get("profit_2027", 0)))),
                    _fmtM_short(_val(er.get("Sum of Profit 2028 £m",
                                            er.get("profit_2028", 0)))),
                    _fmtM_short(_val(er.get("Sum of Profit 2029 £m",
                                            er.get("profit_2029", 0)))),
                ])
            pdf._table(headers, rows, col_widths, max_rows=40)

    # =========================================================================
    # CUSTOMER BREAKDOWN
    # =========================================================================

    if "customer_breakdown" in sections_to_include:
        by_cust = {}
        for r in filtered:
            c = str(r.get("customer", "Unknown")).strip()
            if not c or c.lower() in ('nan', 'none', ''):
                c = "Unknown"
            if c not in by_cust:
                by_cust[c] = {"count": 0, "crp": 0.0, "p2026": 0.0, "p2027": 0.0}
            by_cust[c]["count"] += 1
            by_cust[c]["crp"]   += _val(r.get("crp_term_benefit"))
            by_cust[c]["p2026"] += _val(r.get("profit_2026"))
            by_cust[c]["p2027"] += _val(r.get("profit_2027"))

        sorted_custs = sorted(by_cust.items(), key=lambda x: x[1]["crp"], reverse=True)

        pdf._section_header("Customer Breakdown")
        headers = ["Customer", "Opps", "CRP Term (GBP m)", "Profit 2026", "Profit 2027", "% of Total CRP"]
        col_widths = [60, 20, 40, 40, 40, 35]
        rows = []
        for cust, data in sorted_custs:
            pct = round(data["crp"] / max(total_crp, 0.001) * 100, 1)
            rows.append([
                _trunc(cust, 30),
                str(data["count"]),
                _fmtM_short(data["crp"]),
                _fmtM_short(data["p2026"]),
                _fmtM_short(data["p2027"]),
                f"{pct}%",
            ])
        pdf._table(headers, rows, col_widths, max_rows=30)

    return bytes(pdf.output())
