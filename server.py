"""
Rolls-Royce Civil Aerospace — SOA Dashboard Server
====================================================
Flask API backend serving the premium dashboard frontend.
Handles file upload, Excel parsing, and PDF export.

Usage:
    python server.py
    Then open http://localhost:5000 in your browser.
"""

import io
import os
import uuid
import math
from datetime import datetime
from collections import OrderedDict

import numpy as np
import pandas as pd
from flask import Flask, render_template, request, jsonify, send_file, session
from flask_cors import CORS

from parser import parse_soa_workbook, serialize_parsed_data, aging_bucket, fmt_currency, AGING_ORDER, AGING_COLORS
from pdf_export import generate_pdf_report
from ai_chat import build_system_prompt, call_openrouter

# ─────────────────────────────────────────────────────────────
# APP SETUP
# ─────────────────────────────────────────────────────────────

app = Flask(__name__, static_folder="static", template_folder="templates")
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "rr-soa-dashboard-" + uuid.uuid4().hex[:8])
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50MB max upload

CORS(app)

# In-memory store for parsed data (keyed by session ID)
# In production, use Redis or similar
_parsed_store = {}

# In-memory store for chat history (keyed by session ID)
_chat_history = {}


def _get_session_id():
    """Get or create a session ID."""
    if "sid" not in session:
        session["sid"] = uuid.uuid4().hex
    return session["sid"]


# ─────────────────────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────────────────────

@app.route("/")
def index():
    """Serve the main dashboard SPA."""
    return render_template("index.html")


@app.route("/api/upload", methods=["POST"])
def upload_files():
    """Accept one or more .xlsx files, parse them, return JSON data."""
    if "files" not in request.files:
        return jsonify({"error": "No files provided"}), 400

    files = request.files.getlist("files")
    if not files or all(f.filename == "" for f in files):
        return jsonify({"error": "No files selected"}), 400

    sid = _get_session_id()
    results = {}
    errors = []

    for f in files:
        if not f.filename:
            continue
        if not f.filename.lower().endswith((".xlsx", ".xls")):
            errors.append({"file": f.filename, "error": "Unsupported file type. Only .xlsx files are accepted."})
            continue

        try:
            file_bytes = f.read()
            buf = io.BytesIO(file_bytes)
            parsed = parse_soa_workbook(buf)
            serialized = serialize_parsed_data(parsed)
            results[f.filename] = serialized

            # Store raw parsed data for PDF export
            if sid not in _parsed_store:
                _parsed_store[sid] = {}
            _parsed_store[sid][f.filename] = {
                "parsed": parsed,
                "file_bytes": file_bytes,
            }
        except Exception as e:
            errors.append({"file": f.filename, "error": str(e)})

    if not results and errors:
        return jsonify({"error": "All files failed to parse", "details": errors}), 400

    return jsonify({
        "files": results,
        "errors": errors if errors else None,
    })


@app.route("/api/export-pdf", methods=["POST"])
def export_pdf():
    """Generate a PDF report from the uploaded data."""
    sid = _get_session_id()
    stored = _parsed_store.get(sid, {})

    if not stored:
        return jsonify({"error": "No data available. Please upload files first."}), 400

    # Get request params
    data = request.get_json(silent=True) or {}
    currency_symbol = data.get("currency_symbol", "USD")
    selected_files = data.get("selected_files", list(stored.keys()))

    # Use first file's metadata
    first_key = selected_files[0] if selected_files else list(stored.keys())[0]
    first_parsed = stored[first_key]["parsed"]
    metadata = first_parsed["metadata"]
    grand_totals = first_parsed["grand_totals"]

    # Build sections summary
    sections_summary = {}
    all_items = first_parsed.get("all_items", [])

    # Convert all_items to DataFrame for PDF export
    if isinstance(all_items, list):
        filtered_df = pd.DataFrame(all_items)
    else:
        filtered_df = all_items

    for sec_name, sec_data in first_parsed["sections"].items():
        sec_rows = sec_data.get("rows", [])
        sec_charges = sum(r["Amount"] for r in sec_rows if r.get("Amount", 0) > 0)
        sec_credits = sum(r["Amount"] for r in sec_rows if r.get("Amount", 0) < 0)
        sections_summary[sec_name] = {
            "total": sec_data.get("totals", {}).get("total", sec_charges + sec_credits),
            "charges": sec_charges,
            "credits": sec_credits,
            "overdue": sec_data.get("totals", {}).get("overdue", 0),
            "items": len(sec_rows),
        }

    source_files = selected_files if len(selected_files) > 1 else None

    try:
        pdf_bytes = generate_pdf_report(
            metadata=metadata,
            grand_totals=grand_totals,
            filtered_df=filtered_df,
            sections_summary=sections_summary,
            source_files=source_files,
            currency_symbol=currency_symbol,
        )

        cust_name = metadata.get("customer_name", "Report").replace(" ", "_")
        filename = f"SOA_Report_{cust_name}.pdf"

        return send_file(
            io.BytesIO(pdf_bytes),
            mimetype="application/pdf",
            as_attachment=True,
            download_name=filename,
        )
    except Exception as e:
        return jsonify({"error": f"PDF generation failed: {str(e)}"}), 500


# ─────────────────────────────────────────────────────────────
# AI CHAT
# ─────────────────────────────────────────────────────────────

@app.route("/api/chat", methods=["POST"])
def chat():
    """Handle AI chat messages."""
    sid = _get_session_id()
    stored = _parsed_store.get(sid, {})

    if not stored:
        return jsonify({"error": "No data available. Please upload files first."}), 400

    data = request.get_json(silent=True) or {}
    user_message = data.get("message", "").strip()
    model_choice = data.get("model", None)

    if not user_message:
        return jsonify({"error": "No message provided"}), 400

    # Build serialized data dict for system prompt
    serialized_data = {}
    for fname, fstore in stored.items():
        serialized_data[fname] = serialize_parsed_data(fstore["parsed"])

    system_prompt = build_system_prompt(serialized_data)

    # Get/create chat history for this session
    if sid not in _chat_history:
        _chat_history[sid] = []

    # Add user message to history
    _chat_history[sid].append({"role": "user", "content": user_message})

    # Call OpenRouter
    result = call_openrouter(_chat_history[sid], system_prompt, model=model_choice)

    if result.get("error"):
        # Remove the user message from history on error
        _chat_history[sid].pop()
        return jsonify({"error": result["error"]}), 502

    # Add assistant response to history
    _chat_history[sid].append({"role": "assistant", "content": result.get("content", "")})

    return jsonify({
        "content": result.get("content", ""),
        "charts": result.get("charts", []),
        "emails": result.get("emails", []),
    })


@app.route("/api/chat/clear", methods=["POST"])
def clear_chat():
    """Clear chat history for current session."""
    sid = _get_session_id()
    _chat_history[sid] = []
    return jsonify({"status": "ok"})


# ─────────────────────────────────────────────────────────────
# RUN
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import webbrowser
    import threading

    port = int(os.environ.get("PORT", 5000))
    print(f"\n  Rolls-Royce SOA Dashboard")
    print(f"  http://localhost:{port}\n")

    # Auto-open browser after short delay
    def open_browser():
        import time
        time.sleep(1.5)
        webbrowser.open(f"http://localhost:{port}")

    threading.Thread(target=open_browser, daemon=True).start()

    app.run(host="0.0.0.0", port=port, debug=True, use_reloader=False)
