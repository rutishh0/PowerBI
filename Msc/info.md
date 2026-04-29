# Rolls-Royce Civil Aerospace — Statement of Account (SOA) Dashboard
## Project Documentation & Architecture Guide

### 1. Executive Summary
This project is a high-fidelity, interactive financial dashboard designed to visualize, analyze, and chat with Rolls-Royce Statement of Account (SOA) data. It transforms static Excel/PDF reports into a dynamic web application with advanced analytics and AI capabilities.

**Core Capabilities:**
*   **Universal Parsing:** Intelligently ingests non-standard Excel SOA files using heuristic pattern matching (not fixed column indices).
*   **Interactive Visualizations:** Aging analysis, bilateral positions (Customer vs RR), and debt decomposition.
*   **AI Assistant:** A grounded RAG (Retrieval-Augmented Generation) system that answers financial questions based *strictly* on uploaded data. Supports models from OpenAI (via DigitalOcean), Qwen (via OpenRouter), Kimi (via NVIDIA), and Gemini (via Google Vertex).
*   **Dual-State Frontend:** Standard user mode for viewing/reporting, and a hidden "Secret Admin" mode for unrestricted AI model testing.
*   **Reporting:** Generates branded, pixel-perfect PDF reports for executive review.

---

### 2. Architecture Overview

 The application follows a **Client-Server** architecture:

*   **Backend (Python/Flask)**: Handles data processing, session management, AI orchestration, and file serving.
*   **Frontend (Vanilla JS + GSAP)**: A Single Page Application (SPA) feel, using direct DOM manipulation for maximum performance and custom animation control.
*   **Data Store**: In-memory (Session-based). Data is parsed once per session and stored in RAM for fast retrieval during chat or view switching.

#### Data Flow
1.  **Ingest**: User drags `.xlsx` to UI -> `app.js` sends to `/api/upload`.
2.  **Process**: `server.py` invokes `parser.py` -> Extracts Metadata, Sections, Line Items, Totals.
3.  **Store**: Parsed JSON is saved in `flask.session` (server-side memory).
4.  **Render**: `app.js` receives JSON -> Calls `components.js` & `charts.js` to build the DOM.
5.  **Interact**: User asks specific question -> `ai-chat.js` sends text to `/api/chat` -> `server.py` retrieves session data -> `ai_chat.py` builds prompt -> LLM responds.

---

### 3. Feature Deep Dive: The AI Engine (`ai_chat.py`)

The AI module is designed to prevent "hallucinations" by strictly grounding the Large Language Model (LLM) in the parsed data. It does not rely on the LLM's training data for financial facts.

#### A. System Prompt Engineering (`build_system_prompt`)
Every time a user asks a question, the backend constructs a massive, deterministic "Context Window" containing the entire state of the uploaded file(s).
*   **Structure**:
    1.  **Role Definition**: "You are a professional financial data analyst..."
    2.  **Rules**: "Rules 1-7" strictly forbid using external knowledge.
    3.  **Metadata Block**: Customer Name, LPI Rate, Report Date.
    4.  **Grand Totals**: High-level sums (Total Charges, Credits, Net Balance).
    5.  **Section Details**: Iterates through every section (e.g., "OVERDUE").
    6.  **Line Items**: **CRITICAL:** The prompt includes *every single line item* (Invoice #, Amount, Days Late, Status). It is **not** truncated (unless token limits are hit, though current limits are high). This allows the AI to answer "Which specific invoice is oldest?" accurately.
    7.  **Computed Stats**: Pre-calculated "Aging Buckets" are injected so the AI doesn't have to do complex math.

#### B. Model Abstraction & Dispatch
The system supports multiple providers, routed via `call_openrouter` based on the model ID prefix:
*   **`digitalocean/`**: Routes to DigitalOcean's GenAI endpoint (typically Llama 3 or similar open models).
*   **`nvidia/`**: Routes to NVIDIA's API (specifically for **Kimi K2.5**, a strong Chinese/English model).
*   **`google/`**: Routes to Google Vertex AI (for **GLM-5**), using Google Service Account credentials (`google.auth`).
*   **Default**: Routes to OpenRouter (for **Qwen 3 VL**, **GPT-4o**, etc.).

#### C. Multimodal & Response Parsing
*   **Images**: If an image is uploaded, it is converted to Base64 and sent to compatible models (like Qwen 3 VL) as part of the message payload.
*   **Response Parsing**: The `parse_ai_response()` function scans the raw text from the LLM for special blocks:
    *   ` ```chart ... ``` `: Extracted as JSON and rendered by `ai-chat.js` using ApexCharts.
    *   ` ```email ... ``` `: Extracted as text and placed into a "Copy to Clipboard" email draft UI.

---

### 4. Feature Deep Dive: Intelligent Ingestion (`parser.py` & `server.py`)

The project uses a custom-built "Heuristic Parsing Engine" rather than standard library calls, allowing it to handle the messy, inconsistent formatting of real-world Statement of Account files.

#### A. Frontend Upload (`app.js`)
*   **Method**: Uses `FileReader` to read files as **Base64 encoded strings**.
*   **Transport**: Sends a JSON payload `{ "files": [ { "name": "...", "data": "base64..." } ] }` to `/api/upload`.
    *   *Why?* This often bypasses strict corporate firewalls (WAFs) that might block Multipart/Form-Data uploads containing binary Excel files.
*   **Validation**: Client-side checks for extensions (`.xlsx`, `.pdf`, `.png`).

#### B. The Heuristic Parser (`parser.py`)
Standard parsers fail because the "Header Row" isn't always Row 1. The custom parser uses a **3-Pass Algorithm**:
1.  **Metadata Scan (Row 1-15)**: Scans the top rows for keywords like "Customer Name:", "LPI Rate:", "Date:". It extracts these values regardless of which cell they are in.
2.  **Section Detection**: Scans the entire file for "Section Headers" (rows containing specific keywords like "Charges", "Credits", "TotalCare" *and* appearing in a specific visual hierarchy). It records the start/end row indices of each section.
3.  **Dynamic Column Mapping (`_map_columns`)**:
    *   For each section, it looks for a header row (e.g., "Doc Date", "Amount").
    *   It does **not** assume "Amount" is Column F. It searches the row for the word "Amount" and records that index.
    *   This allows the parser to work even if columns are reordered.
4.  **Normalization**:
    *   **Currency**: Cleans `$` and `,` from strings to float.
    *   **Dates**: Tries 5 different date formats (`DD/MM/YYYY`, `MM/DD/YYYY`, etc.).
    *   **Days Late**: If missing, it computes `(Today - Due Date)`.

---

### 5. Backend Module Breakdown

#### `server.py` (The Controller)
*   **Entry Point**: Initialises the Flask app and routes.
*   **Authentication**: Simple password protection (`/login`) for the main dashboard.
*   **Endpoints**:
    *   `POST /api/upload`: Accepts files, runs parser, returns JSON.
    *   `POST /api/chat`: Orchestrates the AI conversation. Handles model selection and prompt construction.
    *   `POST /api/export`: Generates and serves the PDF report.
*   **Session Management**: Uses `Flask-Session` to isolate data between different users/browser tabs.

#### `pdf_export.py` (The Reporter)
*   **Library**: `fpdf2` for precise layout control.
*   **Design**: Draws Rolls-Royce headers, footers, and legal disclaimers.
*   **Logic**: Iterates through the session data to build dynamic tables for "Invoice Register" and "KPI Summary".

---

### 6. Frontend Module Breakdown (`static/js/`)

#### `app.js` (The Conductor)
*   **Responsibility**: Main entry point. Initializes all other modules.
*   **State**: Tracks `_filesData` (the raw JSON from server) and `_currentView`.
*   **Routing**: Swaps "Views" (Standard/Executive/AI) without reloading.

#### `components.js` (The Builder)
*   **Responsibility**: Generates HTML strings for non-chart UI elements (KPI Cards, Tables, Sidebar Filters).

#### `charts.js` (The Artist)
*   **Library**: `ApexCharts.js`.
*   **Theme**: Enforces Rolls-Royce colors (`#10069F`) and typography.

#### `secret-chat.js` (The Admin Console)
*   **Trigger**: Hidden "Alert" icon + Password (`ChickenMan123`).
*   **Purpose**: A raw "Playground" for testing new models (like GLM-5 or Kimi) without the restrictions of the main dashboard prompts.

### 7. Directory Map
```text
/
├── server.py              # START HERE. Main Flask App.
├── parser.py              # Parsing Logic.
├── ai_chat.py             # AI Logic & Prompt Construction.
├── requirements.txt       # Dependencies.
├── static/
│   ├── css/
│   │   └── dashboard.css  # 2000+ lines of custom styling.
│   └── js/
│       ├── app.js         # Main UI Controller.
│       ├── components.js  # HTML Generators.
│       ├── charts.js      # ApexCharts Config.
│       ├── ai-chat.js     # Public AI Chat.
│       ├── secret-chat.js # Hidden Admin Chat.
└── templates/
    └── index.html         # Main HTML Skeleton.
```
