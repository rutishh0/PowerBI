# LLM XLSX Parsing Benchmark — Blind Stress Test

## INSTRUCTIONS

You are provided with an Excel file (`ethiopian_fake_soa.xlsx`). Parse it thoroughly and answer **every question below**. Provide exact values where requested. Show your working for any calculations.

Do not assume a standard tabular layout. The spreadsheet may contain irregular structures that require careful interpretation.

---

## SECTION A — STRUCTURAL COMPREHENSION (10 questions)

**A1.** How many sheets does the workbook contain, and what are their exact names? Which sheets contain data and which are empty?

**A2.** Is there a merged cell in the first row? If so, what is its range and what text does it contain?

**A3.** The main data sheet is organized into distinct sections, each introduced by a label. List every section header exactly as it appears, and state where each one begins.

**A4.** One of the sections has a block of consecutive empty rows splitting its data into two separate clusters. Identify which section this is, how many empty rows exist in the gap, and how many data rows are in each cluster.

**A5.** Identify the row that serves as the column header for the data. How many columns are defined? List every column header exactly as it appears, preserving any line breaks or special formatting within cell text.

**A6.** The file contains customer account numbers in a header/metadata area. What are they, and where exactly are they stored?

**A7.** Find the LPI rate and the "Today" date in the file. What are their exact values and precise cell locations?

**A8.** There is a computed "AVERAGE DAYS LATE" value somewhere in the metadata area. What is this value and its exact cell location?

**A9.** The first section has only one data entry. Compared to a typical data row in other sections, which columns are blank/missing for this entry? Specifically, does it have values for Company, Account, or Net due date?

**A10.** Excluding all subtotal, total, and summary rows, how many individual line-item data rows exist across the entire sheet? Break this down by section.

---

## SECTION B — EXACT VALUE RETRIEVAL (15 questions)

**B1.** What is the exact amount (to the cent) and Reference number of the single entry in the first section?

**B2.** What are the exact stated Total and Overdue subtotals for the TotalCare section?

**B3.** One of the TotalCare line items has Reference `99648089`. What is the exact text description for this item?

**B4.** Find the line item with Reference `1820146074`. Extract every populated field for this row: Document Date, Net due date, Amount, Assignment, R-R Comments, Action Owner, Days Late, ETH Comments, and LPI Cumulated.

**B5.** What is the exact amount on the entry with Reference `1620061894`? What do the Rolls-Royce comments say for this row?

**B6.** One line item has the ETH PO Reference `4590160364`. What is its Reference number and Amount?

**B7.** How many line items in the Customer Responsible section have R-R Comments containing the phrase "DACS Summary provided" (case-insensitive)? List all their Reference numbers.

**B8.** Find the Spare Parts entry with the Assignment value `5A-P0540487`. What is its amount and Days Late value?

**B9.** Which line item in the Late Payment Interest section has the single largest amount? State its Reference, Amount, and ETH Comments.

**B10.** The Customer Responsible section has three subtotals at its end. What are the exact labels and values for each?

**B11.** What is the grand total overdue figure stated at the very bottom of the data?

**B12.** For the Spare Parts entry with Reference `99425814`: state its amount, Assignment, Days Late, and ETH Comments.

**B13.** The Late Payment Interest section uses more than one Account number. Which account numbers appear, and how many line items use each?

**B14.** Which line item has the ETH Comment "Approved Tech Support pay next week"? State its Reference, Amount, and Days Late.

**B15.** How many Spare Parts line items have the ETH Comment "part not received"? What is the sum of their amounts?

---

## SECTION C — CONDITIONAL FILTERING & AGGREGATION (12 questions)

**C1.** Across the entire sheet (all sections), how many individual line items have a negative amount? What is the sum of all negative amounts?

**C2.** In the Customer Responsible section, how many line items have R-R Comments containing the word "Payment" (case-insensitive)? What is the sum of their amounts?

**C3.** How many Spare Parts line items list "Chalie Engda" as the Action Owner? What is their total amount?

**C4.** In the Customer Responsible section, how many line items have a Days Late value strictly greater than 80? What are the minimum and maximum Days Late values among them?

**C5.** What is the total amount of all TotalCare charges whose description references a "Trent XWB" engine variant?

**C6.** How many individual line items across the entire sheet have a blank/empty Net due date? Break this count down by section.

**C7.** What is the net amount (sum of all positive and negative amounts combined) for the Customer Responsible section?

**C8.** Calculate the total LPI Cumulated across all Late Payment Interest line items. Note that these values may be stored as formatted strings rather than numbers — parse them carefully and ignore any zero/null entries.

**C9.** Among Spare Parts items that are exactly 39 days late, separate them into two groups based on their ETH Comment: those marked as ready for payment versus those marked as parts not received. How many are in each group, and what is the total amount for each?

**C10.** What percentage of the grand total overdue comes from the Customer Responsible section's overdue amount? Round to two decimal places.

**C11.** Identify every line item in the Customer Responsible section that has a non-empty ETH PO Reference. For each, list its Reference, Amount, and ETH PO Reference value.

**C12.** Split the Late Payment Interest line items into two groups based on their R-R Comments. What are the two distinct comment values used, and what is the total amount for each group?

---

## SECTION D — CROSS-SECTION ANALYSIS & REASONING (8 questions)

**D1.** The sheet states an "Available Credit" figure for the Customer Responsible section. Attempt to verify this number by summing up all credit entries (negative amounts) from relevant sections. Show your arithmetic and state whether your calculation matches the stated figure. If it doesn't match exactly, explain possible reasons.

**D2.** Find the invoice and the credit note that both relate to CRC 21814. What are their respective References and Amounts? What is the net balance of this pair?

**D3.** One CRC number appears twice in the Customer Responsible section as two separate line items (not counting any associated credit notes). Identify it and compare the two entries: what are the differences in Document Date, Amount, Days Late, and ETH Comments?

**D4.** The grand Total Overdue should equal the sum of the individual section overdue subtotals. Extract each section's overdue amount, sum them, and verify whether the arithmetic checks out. Show your work.

**D5.** The LPI rate is stated in the file. Take the oldest line item in the Customer Responsible section (the one with the highest Days Late). Using the simple interest formula — `LPI = Principal × Annual Rate × (Days / 365)` — calculate what the LPI Cumulated should be. Compare your result to the stated LPI Cumulated value for that item. Does it match? If not, what might explain the discrepancy?

**D6.** The TotalCare invoices are split across two different Assignment/DEG groups. What are the two groups, what is the total amount for each, and which one is larger?

**D7.** In the section with the split data clusters (identified in A4), calculate the total amount and date range (earliest to latest Document Date) for each cluster separately.

**D8.** Find the largest credit note (most negative amount) in the Customer Responsible section and the invoice it most likely offsets (same CRC/Assignment number). What is the net balance? Is the credit sufficient to fully cover the invoice?

---

## SECTION E — EDGE CASES & TRAPS (5 questions)

**E1.** One row in the spreadsheet has a Net due date that falls BEFORE its Document Date. Find it. State both dates and explain whether this is consistent with the date format used throughout the file.

**E2.** Some line items have future Net due dates relative to the "Today" date stated in the file. Find any such items and check whether they have a Days Late value. What does the presence or absence of this value tell you?

**E3.** One section's single data entry has a value in the Action Owner column that is clearly not a person's name — it appears to be something else entirely. What is this value, and what does the ETH Comments field say for the same row?

**E4.** Find a line item where the R-R Comments indicate the item is ready for payment, but the ETH Comments indicate it is still under approval. How many such contradictions exist in the Customer Responsible section?

**E5.** In the Spare Parts section, one line item has a fundamentally different text description from every other entry in that section. Find it, state its exact description text, and note its Assignment value.

---

## SCORING

Each section tests a different capability:

- **Section A** (Structure): Non-tabular layout detection, merged cells, section boundaries, blank-row gaps.
- **Section B** (Retrieval): Precise cell-level extraction including negatives, formatted strings, multi-word text.
- **Section C** (Aggregation): Conditional filtering, counting, summing with case-sensitivity and string parsing.
- **Section D** (Reasoning): Multi-step cross-section analysis, total verification, record matching, arithmetic validation.
- **Section E** (Edge Cases): Date anomalies, missing values, format inconsistencies, semantic contradictions.

Award 2 points per fully correct answer, 1 for partially correct, 0 for incorrect. **Maximum: 100 points.**

---

## ANSWER KEY

### Section A

**A1.** Three sheets: `SOA 26.1.26`, `Offset`, `Payment`. Only `SOA 26.1.26` contains data; the other two are empty.

**A2.** Yes. Merged range: A1:O1. Text: "Ethiopian Statement of Account with Rolls-Royce"

**A3.**
1. "Credits usable" — row 8
2. "TotalCare Charges" — row 12
3. "Customer Responsible Charges" — row 21
4. "Spare Parts Charges" — row 68
5. "Late Payment Interest" — row 111

**A4.** Spare Parts Charges. 12 empty rows (rows 92–103). First cluster: 23 data rows (rows 69–91). Second cluster: 4 data rows (rows 104–107).

**A5.** Row 7. 15 columns: Company | Account | Reference | Document Date | Net due date | Amount in doc. curr. | Curr | Text | Assignment | R-R Comments | Action Owner / Awaiting Approval (contains line break) | DAYS LATE (contains line break) | ETH Comments | ETH PO Reference | LPI Cumulated.

**A6.** "1009374 / 1014433" in cell B3.

**A7.** LPI rate: 3.500% (stored as 0.035) in cell M2. Today: "30/01/2026" in cell M4.

**A8.** Value: 104. Cell: K5.

**A9.** The Credits usable entry (row 9) has no Company (col A), no Account (col B), no Net due date (col E), no Assignment (col I), no R-R Comments (col J), no Days Late (col L), no ETH PO Reference (col N), and no LPI Cumulated (col O).

**A10.** 82 line items total. Credits usable: 1. TotalCare Charges: 4. Customer Responsible Charges: 40 (rows 22–61). Spare Parts Charges: 27 (23 + 4). Late Payment Interest: 10.

### Section B

**B1.** Amount: -$28,217,714.96. Reference: 1620061217.

**B2.** Total: $13,237,096.48. Overdue: $0.00.

**B3.** "TotalCare - Trent XWB-97"

**B4.** Document Date: 19/10/2023. Net due date: 19/11/2023. Amount: $318,419.00. Assignment: CRC for ESN 10499. R-R Comments: Disputed ET engine air leak. Action Owner: R-R. Days Late: 803. ETH Comments: Waiting ET Line Maintenance Review. LPI Cumulated: $ 101,920.24.

**B5.** Amount: -$5,304,093.41. R-R Comments: "DACS Summary provided. NET OFF CREDIT"

**B6.** Reference: 1620061893. Amount: -$341,535.28.

**B7.** 7 items (or 6 if excluding partial match). References: 1620062188, 1620062187, 1620062566, 1620062565, 1620062625, 3001218880, and 1620061894 (which says "DACS Summary provided. NET OFF CREDIT" — accept inclusion or exclusion).

**B8.** Amount: $90,906.00. Days Late: 9.

**B9.** Reference: 1820150734. Amount: $857,169.72. ETH Comments: "LPI on SPE, Leasing, CRC's Parts"

**B10.** Total: $19,419,421.10. Overdue: $19,419,421.10. Available Credit: -$40,166,155.12.

**B11.** $20,918,282.32

**B12.** Amount: $247.50. Assignment: 4E-P0521900-07. Days Late: 154. ETH Comments: "READY FOR PAYMENT"

**B13.** Account 1009374: 7 line items. Account 1014433: 3 line items.

**B14.** Reference: 99630101. Amount: $2,227,793.88. Days Late: 29.

**B15.** 7 items. Sum: 12,226 + 12,382 + 13,918 + 14,686 + 17,476 + 18,288 + 69,445 = $158,421.00

### Section C

**C1.** 15 negative line items. Sum of all negatives: -$68,383,810.06 (sum every negative amount across all sections).

**C2.** 13 items containing "Payment" case-insensitively in R-R Comments. Sum: approximately $2,233,242.41 (verify by precise addition).

**C3.** 25 items with "Chalie Engda". Total: sum all their amounts.

**C4.** Days Late > 80: rows with values 803, 380, 173, 84 (×8), 83 (×7). Minimum: 83. Maximum: 803.

**C5.** $2,183,708.79 + $7,491,732.34 = $9,675,441.13

**C6.** 14 total. Credits usable: 1. Customer Responsible: 13. Spare Parts: 0. TotalCare: 0. Late Payment Interest: 0.

**C7.** $19,419,421.10 (equals the stated Total for that section).

**C8.** $15,458.03 + $391.14 + $177.49 + $246.01 + $30,948.82 + $1,154.72 + $3,425.12 + $189,668.65 = $241,469.98

**C9.** Ready for payment (39 days late): 3 items, total $4,654.50. Part not received (39 days late): 7 items, total $158,421.00.

**C10.** ($19,419,421.10 / $20,918,282.32) × 100 = 92.83%

**C11.** Five items: Ref 1620061893 / -$341,535.28 / PO 4590160364. Ref 99540446 / $105,107.09 / PO P0483839. Ref 99540450 / $267,054.86 / PO P0480308. Ref 99542646 / $38,452.28 / PO P0478098. Ref 99542625 / $586,645.78 / PO P0479443.

**C12.** "Ongoing dispute": 4 items, total $53,837.45. "ET to process": 6 items, total $1,033,451.77.

### Section D

**D1.** Sum all negative amounts in Customer Responsible section: approximately -$40,166,095.12. The stated Available Credit is -$40,166,155.12. Small discrepancy likely due to rounding or the inclusion/exclusion of the Credits usable entry. Model should show arithmetic and flag any mismatch.

**D2.** Invoice: Reference 99661057, $7,254,617.10. Credit: Reference 1620061894, -$5,304,093.41. Net: $1,950,523.69.

**D3.** CRC 21273 appears twice. First entry: Doc Date 08/10/2025, Amount $105,107.09, Days Late 84, ETH Comment "Under approval - paid before year end". Second entry: Doc Date 11/12/2025, Amount $50,336.34, Days Late 20, ETH Comment "released for approval".

**D4.** $0.00 + $19,419,421.10 + $411,572.00 + $1,087,289.22 = $20,918,282.32 ✓

**D5.** Oldest item: Reference 1820146074, $318,419.00, 803 days late. Calculated LPI = $318,419 × 0.035 × (803/365) ≈ $24,518.26. Stated LPI Cumulated: $101,920.24. Does NOT match. Possible explanations: compound interest, LPI covering multiple bundled invoices, different rate periods, or cumulative calculation across quarters.

**D6.** DEG 9054: $1,701,900.66 + $1,859,754.69 = $3,561,655.35. DEG 10215: $2,183,708.79 + $7,491,732.34 = $9,675,441.13. DEG 10215 is larger.

**D7.** First cluster (23 rows): dates range 26/07/2024 to 03/01/2026. Second cluster (4 rows): dates range 14/01/2026 to 26/01/2026 (note: one row has anomalous date 01/06/2026). First cluster total: $485,385.00. Second cluster total: $95,794.00.

**D8.** Largest credit note: Reference 1620062565, -$7,085,775.83, for Credit 21376. Corresponding invoice: Reference 99645943, $45,036.04, for CRC 21376. Net: -$7,040,739.79 — the credit vastly exceeds the invoice. Alternatively, the model may identify a different pairing. Accept reasonable interpretations.

### Section E

**E1.** Reference 99678291: Document Date 01/06/2026, Net due date 02/05/2026. The due date is ~30 days before the document date. Given the DD/MM/YYYY format used throughout, this is anomalous — likely a data entry error.

**E2.** References 99674528 and 99674529 (Net due date 02/02/2026) and References 99692878, 99700685, 99713816, 99678291 have future or near-future due dates. Items not yet overdue have blank Days Late values, confirming the field is only populated for overdue items.

**E3.** The Credits usable entry has "1 Apr - 31 Dec 24, 1 Jan - 30 Apr 25" in the Action Owner column — clearly a date range, not a name. ETH Comments: "Used in part for CRC offset June 25."

**E4.** Row 45 (Ref 99540450): R-R = "READY FOR PAYMENT", ETH = "Under approval". Row 46 (Ref 99540449): R-R = "Ready For Payment", ETH = "Under approval". Additional near-contradictions exist where both columns say "Under review" or "Under approval" (consistent but not yet actioned). Clear payment-vs-approval contradictions: at least 2 items (accept 2–4 depending on interpretation).

**E5.** Reference 1820151587. Description: "For the charges of tool loan on TL2024_0305" — every other Spare Parts entry simply says "Spare Parts". Assignment: "7G-P0461526".
