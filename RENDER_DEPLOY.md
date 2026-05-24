# Render Deployment — Single Service

The project now runs as **one** Render web service. Flask serves the API
plus the Next.js static export from `NewFrontEndToBePorted/out/`. The
second service (`PowerBI-1`) can be deleted.

## Recommended path — keep the existing Python service, update the Build Command

The current `PowerBI` Python service stays. Two settings change in the
Render dashboard:

**Settings → Build & Deploy → Build Command** — replace whatever is there
with:

```bash
cd NewFrontEndToBePorted \
  && corepack enable \
  && corepack prepare pnpm@10 --activate \
  && pnpm install --frozen-lockfile \
  && pnpm build \
  && cd .. \
  && pip install -r requirements.txt
```

**Settings → Build & Deploy → Start Command** — stays the same:

```bash
gunicorn -w 1 --threads 4 -b 0.0.0.0:$PORT server:app
```

Render's native Python runtime ships with Node 18+ and `corepack`, so
the build above works out of the box. If a build fails because Node
isn't available, switch to the Docker path below.

### Environment variables to remove

These are no longer used after consolidation — they can be deleted from
the service's Environment tab:

- `NEXT_BACKEND_URL` (was the URL of the second service)
- `CORS_ORIGINS` (everything is now same-origin)

These stay:

- `APP_PASSWORD`
- `DATABASE_URL`
- `R2_ENDPOINT_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
- `FLASK_SECRET_KEY` (recommended — set explicitly so sessions survive restarts)
- `OPENROUTER_API_KEY` (or whichever AI key you use, if AI chat is on)

### Then: delete the second service

After the new deploy succeeds and `elevatechecked1.info/` serves the
dashboard, delete the `PowerBI-1` service from Render. The free tier
suspension is irrelevant — it's no longer reachable from the public
domain and no traffic hits it.

## Fallback path — switch to a Docker service

If the Python+Node build above doesn't work on Render's runtime, use
the included `Dockerfile`:

1. Render dashboard → service → Settings → Environment → **Runtime**
2. Switch from `Python 3` to `Docker`
3. Save. The next deploy will use `Dockerfile` automatically.

The Dockerfile is a two-stage build: Node 22 compiles the Next.js
export, then a slim Python 3.11 image takes over and runs gunicorn.
First build takes ~3–4 min; cached subsequent builds ~1 min.

## Local development

Two options.

**Option A — single-process (matches production):**

```bash
# Build the static export once (or after frontend changes)
cd NewFrontEndToBePorted && pnpm install && pnpm build && cd ..

# Run Flask — serves API + static frontend on :5000
python server.py
```

**Option B — dual process with hot reload (for frontend work):**

```bash
# Terminal 1
python server.py

# Terminal 2
cd NewFrontEndToBePorted && pnpm dev
# Browse http://localhost:3000 — Next dev rewrites /api/* and /logout to Flask.
```

## What changed in the code

| Area | Change |
|---|---|
| `next.config.mjs` | Added `output: "export"`; removed `experimental.serverActions` (no longer applicable for static export). |
| `app/page.tsx` | Was an RSC that ran `await isAuthenticated()` server-side. Now a Client Component that fetches `/api/me` on mount and routes to `/login` if not authed. |
| `app/login/page.tsx` | Same conversion — Client Component, client-side auth check, redirect to `/` if already signed in. |
| `app/login/login-form.tsx` | Dropped `useActionState(loginAction)`. Plain submit handler POSTs to `/api/login` and `router.replace("/")` on success. |
| `app/login/actions.ts` | Deleted. Server Actions aren't supported with static export. |
| `components/shell/sidebar.tsx` | Logout `<form action={logoutAction}>` replaced with a button that fetches `/logout` and routes. |
| `server.py` | `_proxy_to_next`, the hop-by-hop header handling, the `NEXT_BACKEND_URL` constant, and the catch-all proxy route are all gone. Replaced with `_serve_static_export()` that resolves paths against `NewFrontEndToBePorted/out/` (exact file → `.html` → `/index.html` → SPA fallback). `/beta` 301 redirects stay for bookmark preservation. |
| `Dockerfile`, `.dockerignore` | Added as the fallback deploy path. |
