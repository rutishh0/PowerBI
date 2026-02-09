"""
PDF Export Module for Rolls-Royce SOA Dashboard
Generates branded PDF summary reports from SOA data.
"""

import pandas as pd
from datetime import datetime
from fpdf import FPDF


def _safe(text) -> str:
    """Sanitize text for fpdf2 Helvetica (replace Unicode chars with ASCII)."""
    s = str(text) if text is not None else "-"
    s = s.replace("\u2014", "-")   # em dash
    s = s.replace("\u2013", "-")   # en dash
    s = s.replace("\u2018", "'")   # left single quote
    s = s.replace("\u2019", "'")   # right single quote
    s = s.replace("\u201c", '"')   # left double quote
    s = s.replace("\u201d", '"')   # right double quote
    s = s.replace("\u2026", "...")  # ellipsis
    s = s.replace("\u00a0", " ")   # non-breaking space
    return s


def _hex_to_rgb(hex_str: str) -> tuple:
    """Convert hex color string to RGB tuple."""
    hex_str = hex_str.lstrip('#')
    return tuple(int(hex_str[i:i+2], 16) for i in (0, 2, 4))


def _fmt_currency(val, currency_symbol: str = "USD") -> str:
    """Format currency value for PDF display."""
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
    """Format date value for PDF display."""
    if val is None or pd.isna(val):
        return "-"
    if isinstance(val, pd.Timestamp):
        return val.strftime("%d/%m/%Y")
    if isinstance(val, str):
        return _safe(val)
    return _safe(str(val))


def _fmt_number(val) -> str:
    """Format number for PDF display."""
    if val is None or pd.isna(val):
        return "-"
    try:
        return f"{int(val):,}"
    except (ValueError, TypeError):
        return _safe(str(val))


class RRPDFReport(FPDF):
    """Custom PDF class with Rolls-Royce branding."""

    # Brand colors (RGB tuples)
    RR_NAVY = (16, 6, 159)
    RR_DARK = (12, 0, 51)
    RR_WHITE = (255, 255, 255)
    RR_RED = (211, 47, 47)
    RR_GREEN = (46, 125, 50)
    RR_LIGHT = (232, 232, 238)

    def __init__(self):
        super().__init__(orientation='L', unit='mm', format='A4')
        self.set_auto_page_break(auto=True, margin=15)
        self.add_page()

    def header(self):
        """Override header - leave empty as we'll add custom title bar."""
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
    Generate a branded PDF report and return the PDF as bytes.

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
        pdf.cell(60, 6, _safe(value), 0, 0)

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

        pdf.cell(col_widths[0], 6, _safe(section)[:35], 1, 0, 'L', fill=True)
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
            pdf.cell(inv_col_widths[0], 6, _safe(row.get("Section", "-"))[:22], 1, 0, 'L', fill=True)
            pdf.cell(inv_col_widths[1], 6, _safe(row.get("Reference", "-") or "-")[:15], 1, 0, 'L', fill=True)
            pdf.cell(inv_col_widths[2], 6, _fmt_date(row.get("Document Date")), 1, 0, 'C', fill=True)
            pdf.cell(inv_col_widths[3], 6, _fmt_date(row.get("Due Date")), 1, 0, 'C', fill=True)

            if amount_float < 0:
                pdf.set_text_color(*RRPDFReport.RR_RED)
            pdf.cell(inv_col_widths[4], 6, _fmt_currency(amount_float, currency_symbol), 1, 0, 'R', fill=True)
            pdf.set_text_color(0, 0, 0)

            pdf.cell(inv_col_widths[5], 6, _safe(row.get("Status", "-") or "-")[:15], 1, 0, 'L', fill=True)
            pdf.cell(inv_col_widths[6], 6, _safe(row.get("Entry Type", "-") or "-")[:12], 1, 0, 'L', fill=True)
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
            pdf.cell(0, 5, f'  - {_safe(fname)}', 0, 1)

    # Return PDF as bytes
    return bytes(pdf.output())
