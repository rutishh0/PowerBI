# Multi-stage build: Node compiles the Next.js static export, Python serves it.
# Use this Dockerfile if Render's native Python runtime can't reliably build
# Next.js (e.g. Node not available, build cache mis-behaves). Switch the Render
# service to "Docker" runtime and point it at this file.

# ─────────────────────────────────────────────────────────────
# Stage 1: build the Next.js static export
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS frontend-builder
WORKDIR /build/NewFrontEndToBePorted

RUN corepack enable && corepack prepare pnpm@10 --activate

# Install deps first (cached layer)
COPY NewFrontEndToBePorted/package.json NewFrontEndToBePorted/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Build
COPY NewFrontEndToBePorted/ ./
RUN pnpm build
# After this stage /build/NewFrontEndToBePorted/out/ contains the deliverable.


# ─────────────────────────────────────────────────────────────
# Stage 2: Python runtime + Flask + static-served Next.js export
# ─────────────────────────────────────────────────────────────
FROM python:3.11-slim
WORKDIR /app

# System deps for pandas/openpyxl/matplotlib/psycopg2/boto3 etc.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    libfreetype6 \
    libjpeg62-turbo \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bring in the Python sources
COPY server.py parser.py pdf_export.py ai_chat.py storage.py ./
# .env is normally injected via Render's environment variables, not COPYed.

# Bring in the static export from stage 1
COPY --from=frontend-builder /build/NewFrontEndToBePorted/out ./NewFrontEndToBePorted/out

# Render injects $PORT
ENV PORT=10000
EXPOSE 10000
CMD ["sh", "-c", "gunicorn -w 1 --threads 4 -b 0.0.0.0:${PORT} server:app"]
