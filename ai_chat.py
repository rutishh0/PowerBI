"""
Rolls-Royce Civil Aerospace — AI Chat Module
=============================================
Handles AI chat with GPT-oss-120b via OpenRouter.
The AI is grounded in the uploaded Excel data and will not hallucinate.
"""

import json
import requests
from datetime import datetime


# ─────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────

OPENROUTER_API_KEY = "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"
OPENROUTER_MODEL = "openai/gpt-oss-120b:free"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

MAX_HISTORY_MESSAGES = 20  # Keep last N messages in context


# ─────────────────────────────────────────────────────────────
# SYSTEM PROMPT BUILDER
# ─────────────────────────────────────────────────────────────

def build_system_prompt(parsed_data_dict: dict) -> str:
    """
    Build a grounded system prompt with all parsed Excel data.
    parsed_data_dict is keyed by filename -> serialized parsed data.
    """
    prompt_parts = [
        "You are a professional financial data analyst AI assistant for Rolls-Royce Civil Aerospace.",
        "You are embedded in a Statement of Account (SOA) Dashboard.",
        "",
        "CRITICAL RULES — YOU MUST FOLLOW THESE EXACTLY:",
        "1. ONLY answer questions based on the data provided below. Do NOT use any external knowledge.",
        "2. If the answer is not in the provided data, say: 'This information is not available in the uploaded data.'",
        "3. Do NOT make up, infer, or hallucinate any numbers, dates, or facts not explicitly in the data.",
        "4. Always cite specific numbers from the data when answering financial questions.",
        "5. Be precise with currency amounts — always include the exact figures from the data.",
        "6. When asked to generate emails, reports, or summaries, base them ONLY on the actual data below.",
        "7. When computing totals or filtering, ALWAYS iterate through ALL line items. NEVER skip items.",
        "",
        "DATE FIELD DEFINITIONS — VERY IMPORTANT:",
        "- 'Document Date' = the date the invoice/document was CREATED or ISSUED.",
        "- 'Due Date' (also called 'Net Due Date') = the date by which PAYMENT IS DUE from the client.",
        "- When a user asks 'what is due in [month]' or 'what does the client owe in [month]',",
        "  they mean items where the DUE DATE (Net Due Date) falls in that month.",
        "- 'Days Late' = how many days past the Due Date the payment is overdue (0 = not yet due).",
        "- When computing amounts for a date range, you MUST check EVERY line item, not just the first few.",
        "",
        "YOUR CAPABILITIES:",
        "- Answer questions about the SOA data (totals, sections, invoices, aging, overdue amounts, etc.)",
        "- Generate professional email templates based on the data",
        "- Provide financial summaries and analysis",
        "- Create structured report text",
        "- Explain trends, patterns, and anomalies in the data",
        "",
        "RESPONSE FORMAT RULES:",
        "- For regular answers: respond in clear, professional language with markdown formatting.",
        "- For email templates: wrap the email in a code block with ```email``` markers.",
        "- For chart requests: respond with a JSON chart specification wrapped in ```chart``` markers.",
        "  The chart spec should follow this format:",
        '  {"type": "bar"|"donut"|"line", "title": "...", "labels": [...], "series": [{"name": "...", "data": [...]}]}',
        "- You can combine text explanations with charts or emails in the same response.",
        "",
        "═══════════════════════════════════════════════════════════",
        "UPLOADED SOA DATA (This is your ONLY source of truth):",
        "═══════════════════════════════════════════════════════════",
        "",
    ]

    for filename, data in parsed_data_dict.items():
        prompt_parts.append(f"── FILE: {filename} ──")
        prompt_parts.append("")

        # Metadata
        meta = data.get("metadata", {})
        if meta:
            prompt_parts.append("CUSTOMER METADATA:")
            for key, val in meta.items():
                if val is not None and val != "":
                    prompt_parts.append(f"  - {key}: {val}")
            prompt_parts.append("")

        # Grand totals
        gt = data.get("grand_totals", {})
        if gt:
            prompt_parts.append("GRAND TOTALS:")
            for key, val in gt.items():
                if isinstance(val, dict):
                    prompt_parts.append(f"  - {key}:")
                    for sk, sv in val.items():
                        prompt_parts.append(f"      {sk}: {sv}")
                else:
                    prompt_parts.append(f"  - {key}: {val}")
            prompt_parts.append("")

        # Sections — ALL items, no truncation
        sections = data.get("sections", {})
        if sections:
            prompt_parts.append("SECTIONS AND LINE ITEMS:")
            all_fields = [
                "Reference", "Document No", "Amount", "Currency",
                "Document Date", "Due Date", "Days Late", "Status",
                "Entry Type", "Text", "Section", "R-R Comments",
                "Action Owner", "Customer Comments", "Type",
                "Assignment", "PO Reference",
            ]

            for sec_name, sec_data in sections.items():
                totals = sec_data.get("totals", {})
                rows = sec_data.get("rows", [])
                prompt_parts.append(f"\n  [{sec_name}] — {len(rows)} items")
                for tk, tv in totals.items():
                    prompt_parts.append(f"    {tk}: {tv}")

                # ALL row-level data — no truncation
                if rows:
                    prompt_parts.append(f"    LINE ITEMS (all {len(rows)}):")
                    for i, row in enumerate(rows):
                        parts = []
                        for rk in all_fields:
                            rv = row.get(rk)
                            if rv is not None and rv != "" and rv != "Unknown":
                                parts.append(f"{rk}={rv}")
                        prompt_parts.append(f"      [{i+1}] {'; '.join(parts)}")

                prompt_parts.append("")

        # All items summary stats
        all_items = data.get("all_items", [])
        if all_items:
            charges = [i["Amount"] for i in all_items if i.get("Amount", 0) > 0]
            credits = [i["Amount"] for i in all_items if i.get("Amount", 0) < 0]
            overdue = [i for i in all_items if (i.get("Days Late") or 0) > 0]

            prompt_parts.append("SUMMARY STATISTICS:")
            prompt_parts.append(f"  Total line items: {len(all_items)}")
            prompt_parts.append(f"  Charge items: {len(charges)}, Total charges: {sum(charges):.2f}")
            prompt_parts.append(f"  Credit items: {len(credits)}, Total credits: {sum(credits):.2f}")
            prompt_parts.append(f"  Net balance: {sum(charges) + sum(credits):.2f}")
            prompt_parts.append(f"  Overdue items: {len(overdue)}")
            if overdue:
                overdue_amt = sum(i.get("Amount", 0) for i in overdue)
                avg_days = sum(i.get("Days Late", 0) for i in overdue) / len(overdue)
                prompt_parts.append(f"  Total overdue amount: {overdue_amt:.2f}")
                prompt_parts.append(f"  Average days late (overdue items): {avg_days:.1f}")

            # Aging breakdown
            aging = {}
            for item in all_items:
                dl = item.get("Days Late")
                if dl is None:
                    bucket = "Unknown"
                elif dl <= 0:
                    bucket = "Current"
                elif dl <= 30:
                    bucket = "1-30 Days"
                elif dl <= 60:
                    bucket = "31-60 Days"
                elif dl <= 90:
                    bucket = "61-90 Days"
                elif dl <= 180:
                    bucket = "91-180 Days"
                else:
                    bucket = "180+ Days"
                aging[bucket] = aging.get(bucket, 0) + (item.get("Amount", 0))

            prompt_parts.append("  AGING BREAKDOWN:")
            for bucket in ["Current", "1-30 Days", "31-60 Days", "61-90 Days",
                           "91-180 Days", "180+ Days", "Unknown"]:
                if bucket in aging:
                    prompt_parts.append(f"    {bucket}: {aging[bucket]:.2f}")

            prompt_parts.append("")

        prompt_parts.append("─" * 60)
        prompt_parts.append("")

    prompt_parts.append(f"Current date/time: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    prompt_parts.append("")
    prompt_parts.append("REMEMBER: ONLY use the data above. NEVER hallucinate. When filtering by date, check EVERY line item's Due Date field.")

    return "\n".join(prompt_parts)


# ─────────────────────────────────────────────────────────────
# OPENROUTER API CALL
# ─────────────────────────────────────────────────────────────

def call_openrouter(messages: list, system_prompt: str) -> dict:
    """
    Call OpenRouter API with the given messages and system prompt.
    Returns dict with 'content', 'charts', 'emails', 'error'.
    """
    api_messages = [{"role": "system", "content": system_prompt}]

    # Add conversation history (limited)
    for msg in messages[-MAX_HISTORY_MESSAGES:]:
        api_messages.append({
            "role": msg.get("role", "user"),
            "content": msg.get("content", ""),
        })

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5000",
        "X-Title": "RR SOA Dashboard AI",
    }

    payload = {
        "model": OPENROUTER_MODEL,
        "messages": api_messages,
        "max_tokens": 8192,
        "temperature": 0.3,  # Low temperature for factual accuracy
        "top_p": 0.9,
    }

    try:
        response = requests.post(
            OPENROUTER_URL,
            headers=headers,
            json=payload,
            timeout=120,
        )

        if response.status_code != 200:
            error_msg = f"OpenRouter API error ({response.status_code})"
            try:
                err_data = response.json()
                error_msg += f": {err_data.get('error', {}).get('message', response.text[:200])}"
            except Exception:
                error_msg += f": {response.text[:200]}"
            return {"content": None, "error": error_msg}

        data = response.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")

        if not content:
            return {"content": None, "error": "Empty response from AI model"}

        # Parse the response for special blocks
        result = parse_ai_response(content)
        return result

    except requests.exceptions.Timeout:
        return {"content": None, "error": "AI request timed out. Please try again."}
    except requests.exceptions.ConnectionError:
        return {"content": None, "error": "Could not connect to AI service. Check internet connection."}
    except Exception as e:
        return {"content": None, "error": f"Unexpected error: {str(e)}"}


# ─────────────────────────────────────────────────────────────
# RESPONSE PARSER
# ─────────────────────────────────────────────────────────────

def parse_ai_response(content: str) -> dict:
    """
    Parse AI response content for special blocks (charts, emails).
    Returns dict with 'content' (cleaned text), 'charts' (list), 'emails' (list).
    """
    import re

    charts = []
    emails = []

    # Extract chart blocks
    chart_pattern = r'```chart\s*\n(.*?)\n```'
    for match in re.finditer(chart_pattern, content, re.DOTALL):
        try:
            chart_spec = json.loads(match.group(1).strip())
            charts.append(chart_spec)
        except json.JSONDecodeError:
            pass  # If invalid JSON, skip

    # Extract email blocks
    email_pattern = r'```email\s*\n(.*?)\n```'
    for match in re.finditer(email_pattern, content, re.DOTALL):
        emails.append(match.group(1).strip())

    # Clean content — remove the special blocks for display
    cleaned = re.sub(r'```chart\s*\n.*?\n```', '[CHART_PLACEHOLDER]', content, flags=re.DOTALL)
    cleaned = re.sub(r'```email\s*\n.*?\n```', '[EMAIL_PLACEHOLDER]', cleaned, flags=re.DOTALL)

    return {
        "content": cleaned.strip(),
        "charts": charts,
        "emails": emails,
        "error": None,
    }
