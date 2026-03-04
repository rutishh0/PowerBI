# Rolls-Royce Civil Aerospace: Data Visualizer

## 1. Project Overview & Primary Use Case

The **Data Visualizer** is a secure, interactive web application built for the Finance & Receivables division at Rolls-Royce Civil Aerospace. Its primary use case is to transform raw, complex Excel data files into dynamic, easy-to-digest visual dashboards—eliminating the need for manual data manipulation in Excel. 

Users can upload various financial and operational workbooks (e.g., Statement of Account, Invoice Lists, Profit Opportunity Trackers, Shop Visit plans) directly into the app. The system automatically detects the file type, parses the relevant sheets and tables, and dynamically generates a bespoke dashboard featuring Key Performance Indicators (KPIs), interactive charts (ApexCharts), and data tables.

## 2. Key Features

- **Smart File Detection & Universal Parser:** Once an Excel file is uploaded, the backend intelligent parser analyzes the column headers and sheet names to determine the exact file type (e.g., [SOA](file:///c:/Users/Rutishkrishna/Desktop/RR/RR%20Powerbi/V5/static/js/visualizer.js#245-330), `INVOICE_LIST`, `OPPORTUNITY_TRACKER`). It cleans and structures the data into a standardized JSON payload.
- **Dynamic Visualizations:** Depending on the detected file type, the frontend dynamically mounts the correct visual components. For instance:
  - *Opportunity Trackers* show financial forecasts (Term Impact, 2026/2027 values), pipeline donut charts, and Gantt-style project timelines.
  - *Statements of Account (SOA)* emphasize debt decomposition, charges vs. credits, aging analysis, and section breakdowns.
- **Multiple View Modes:**
  - *Standard View:* The full, detailed dashboard.
  - *Presentation (Slides) View:* A paginated, slide-show style view optimized for meetings and executive summaries.
- **AI Data Assistant (Experimental):** Users can interact with a conversational AI agent (powered by models like Gemini 3 Pro, Google GLM-5, or large OSS models via OpenRouter). The parsed JSON data is passed to the AI as context, allowing users to ask natural language questions about their specific data (e.g., "What are the biggest overdue invoices for Customer X?").
- **Secure File Archiving:** An admin-only feature powered by PostgreSQL to archive and manage critical files.
- **PDF Export:** Allows users to export their current dashboard view into a formatted PDF report.

## 3. Architecture & File Structure

The project follows a classic client-server architecture. The backend is built in Python (handling data processing, API routing, and AI integration), while the frontend is a vanilla HTML/JS/CSS Single Page Application (SPA).

### Backend (Python)
- **[app.py](file:///c:/Users/Rutishkrishna/Desktop/RR/RR%20Powerbi/V5/app.py)**: The main entry point and web server. Handles routing, file upload endpoints, and serves the frontend templates.
- **[parser_universal.py](file:///c:/Users/Rutishkrishna/Desktop/RR/RR%20Powerbi/V5/parser_universal.py) & [parser.py](file:///c:/Users/Rutishkrishna/Desktop/RR/RR%20Powerbi/V5/parser.py)**: The core data extraction engines. These scripts use `pandas` / `openpyxl` to read uploaded Excel files, apply heuristic rules to classify the file, extract relevant numerical data, handle missing values, and serialize the output into JSON dictionaries.
- **[ai_chat.py](file:///c:/Users/Rutishkrishna/Desktop/RR/RR%20Powerbi/V5/ai_chat.py)**: Manages the integration with Large Language Models (LLMs). It handles authentication, sets system prompts, processes streaming responses, and passes the parsed Excel data context to the selected AI model.
- **[db.py](file:///c:/Users/Rutishkrishna/Desktop/RR/RR%20Powerbi/V5/db.py)**: Manages the PostgreSQL database connection pool. Used specifically for the "Archived Files" feature (storing and retrieving file metadata).
- **[pdf_export.py](file:///c:/Users/Rutishkrishna/Desktop/RR/RR%20Powerbi/V5/pdf_export.py)**: Contains the logic to generate PDF reports from the structured dashboard data.

### Frontend (`/static` & `/templates`)
- **`templates/index.html`**: The main Single Page Application HTML shell. Contains the layout for the sidebar, main dashboard area, presentation mode container, and the sliding AI chat panel.
- **`static/css/dashboard.css`**: The core stylesheet. It uses modern CSS variables for a premium, hyper-futuristic "glassmorphism" aesthetic with a deep dark-theme palette (navy blues, neon accents). It includes fully responsive layouts and custom scrollbars.
- **`static/js/app.js`**: The main frontend controller. Sets up event listeners, handles the file upload UI flow, manages view switching (Standard vs. Slides), and initializes UI animations with GSAP (GreenSock).
- **`static/js/visualizer.js`**: The most critical frontend rendering script. It receives the parsed JSON payload, checks the `file_type`, and constructs the HTML for the dashboard dynamically. It holds specific render functions like `_renderOpportunityTracker()` and `_renderSOA()`.
- **`static/js/charts.js`**: A helper script dedicated to configuring and mounting ApexCharts based on the aggregated data.
- **`static/js/components.js`**: A library of reusable UI components (e.g., rendering standard KPI cards, data tables, filter pills, collapsible accordions).
- **`static/js/ai-chat.js`**: Powers the sliding AI assistant panel. Handles UI logic for sending messages, rendering AI markdown responses, typing indicators, and model selection.
- **`static/js/secret-chat.js`**: Handles the UI logic for the restricted, password-protected admin command center.
- **`static/js/files.js`**: Manages the frontend interaction with the PostgreSQL archived files endpoints (triggering uploads to DB, fetching the file list, etc.).

## 4. Typical User Flow

1. **Upload:** User hits the dashboard, drags and drops an Excel file into the upload dropzone.
2. **Parse (Backend):** The file is sent to the server. `parser_universal.py` reads it, detects the format, and extracts all rows, summaries, and metadata, returning a standardized JSON response.
3. **Render (Frontend):** `app.js` receives the JSON and passes it to `visualizer.js`. The engine wipes the slate clean and builds the relevant KPI grids, charts, and tables. 
4. **Interact:** The user can hover over charts for tooltips, collapse sections, or switch to "Slides View" for a cleaner presentation format.
5. **AI Consultation:** The user can open the AI sidebar and ask, "Summarize the top 3 biggest risks in this dataset," leveraging the currently uploaded file as the LLM's context.
