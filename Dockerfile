# Multi-stage build: Node compiles the Next.js static export; Python serves it
# and renders the reports — including the AI "HTML" mode, whose WeasyPrint
# renderer needs Pango/Cairo/GDK-Pixbuf system libraries that Render's native
# Python runtime does not provide. Switch the Render service to the "Docker"
# runtime and point it at this file.

# ─────────────────────────────────────────────────────────────
# Stage 1: build the Next.js static export
# ─────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS frontend-builder
WORKDIR /build/NewFrontEndToBePorted

# Standalone pnpm@10 — corepack's bundled pnpm has a signature-key bug on
# Node 20.x, so we install pnpm directly instead of via corepack.
RUN npm install -g pnpm@10

# Install deps first (cached layer)
COPY NewFrontEndToBePorted/package.json NewFrontEndToBePorted/pnpm-lock.yaml ./
RUN pnpm install

# Build → /build/NewFrontEndToBePorted/out
COPY NewFrontEndToBePorted/ ./
RUN pnpm build


# ─────────────────────────────────────────────────────────────
# Stage 2: Python runtime + Flask + static-served Next.js export
# ─────────────────────────────────────────────────────────────
FROM python:3.11-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1

# System libraries:
#  - pandas / matplotlib / psycopg2 / boto3 : libpq5, libfreetype6, libjpeg62-turbo
#  - WeasyPrint (AI "HTML" report mode)      : Pango / Cairo / GDK-Pixbuf / ffi / harfbuzz
#  - fonts so WeasyPrint always has a usable fallback face
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    libfreetype6 \
    libjpeg62-turbo \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libpangoft2-1.0-0 \
    libcairo2 \
    libgdk-pixbuf-2.0-0 \
    libffi8 \
    libharfbuzz0b \
    fontconfig \
    libfontconfig1 \
    fonts-dejavu-core \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# All Python modules (server, parser, pdf_export, ai_chat, ai_report, storage, …)
COPY *.py ./
# Standalone HTML pages + seed data (e.g. /holidays editor)
COPY static_pages ./static_pages
# .env is injected via Render's environment variables, not COPYed.

# Bring in the static export from stage 1
COPY --from=frontend-builder /build/NewFrontEndToBePorted/out ./NewFrontEndToBePorted/out

# Render injects $PORT
ENV PORT=10000
EXPOSE 10000
# 1 worker (in-memory session / AI-report-job / multipart stores) + threads for
# concurrency. Long --timeout so synchronous chat and large PDF exports (which
# can run for minutes) are not killed; AI-report generation runs in a background
# thread and returns its job id immediately.
CMD ["sh", "-c", "gunicorn -w 1 --threads 8 -b 0.0.0.0:${PORT} --timeout 1800 server:app"]
