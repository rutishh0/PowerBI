# Frontend Consolidation — Design

**Date:** 2026-05-18
**Scope:** `V8/` (Flask `server.py`, legacy templates/static, Next.js `NewFrontEndToBePorted/`, `app.py`)
**Status:** Approved, pending implementation plan

## 1. Context

The Flask backend currently serves two coexisting frontends: the legacy vanilla-JS SPA at `elevatechecked1.info/` (rendered from `templates/index.html` + 533 KB of `static/js/*`), and the Next.js frontend at `elevatechecked1.info/beta` (reverse-proxied to a separate Render service `powerbi-1-ulbm.onrender.com`).

This spec covers removing the legacy frontend entirely, promoting the Next.js frontend from `/beta` to root, and tidying the dead V1 Streamlit `app.py` that has no live importers.

The Render deployment topology does not change: Flask remains the public service, Next.js remains a private service that Flask proxies to. The change is bounded to four files (`server.py`, `next.config.mjs`, plus deletions) and one config line (`basePath`).

## 2. Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Flask catch-all proxy** at `/` and `/<path>` forwarding to the Next.js service | Generalises the existing `/beta/*` proxy which already handles cookies, Set-Cookie preservation, X-Forwarded-Host for Server Action CSRF, and hop-by-hop stripping. Lowest-change path to the goal. |
| 2 | **301 redirect** for legacy `/beta/<path>` → `/<path>` | Preserves existing bookmarks. Two-line Flask route. Search engines update naturally. |
| 3 | **Delete `app.py`** (dead Streamlit code from V1) | Live stack does not import it. `requirements.txt` already has no Streamlit dep. Confusion-removal. |
| 4 | **Drop `basePath: "/beta"`** from `next.config.mjs` | Next.js now serves at root. `allowedOrigins` whitelist for Server Action CSRF already includes the public domain. |
| 5 | **Remove `template_folder` / `static_folder` kwargs** from `Flask(...)` and delete the `templates/` and `static/` folders entirely | No code path renders templates or serves static after the legacy routes go. Avoids dangling references. |

## 3. File changes

### Modified

| File | Change |
|---|---|
| `V8/server.py` | Delete routes: `/`, `/login` (GET/POST), `/beta`, `/beta/`, `/beta/<path:subpath>`. Drop the `template_folder` and `static_folder` kwargs from `Flask(...)`. Drop now-unused imports (`render_template`, `url_for`, `redirect` from flask). Update `_proxy_to_next(subpath)` to **not** prepend `/beta` to the upstream URL (it currently does `upstream = f"{NEXT_BACKEND_URL}/beta"` — becomes `upstream = NEXT_BACKEND_URL.rstrip("/")` then append `/<subpath>` only if non-empty). Add a new `@app.route("/beta/<path:subpath>")` that returns `Response(status=301, headers={"Location": f"/{subpath}"})`. Add catch-all `@app.route("/", defaults={"subpath": ""}) / @app.route("/<path:subpath>")` for the proxy. Flask routes by specificity, so all explicit `/api/*` and `/logout` routes still match before the catch-all. |
| `V8/NewFrontEndToBePorted/next.config.mjs` | Remove the `basePath: "/beta"` line (and its surrounding comment). The dev-only `rewrites()` block with `basePath: false` stays — `basePath: false` is now a no-op rather than a load-bearing opt-out, but it's harmless. |
| `V8/NewFrontEndToBePorted/app/login/actions.ts` | **Audit only** — verify `redirect("/")` calls. Next.js applies basePath internally to `redirect` targets, so removing the basePath leaves the same string pointing at the same place (now root). No edit expected. Listed here so it's not silently overlooked. |

### Deleted

- `V8/templates/index.html`
- `V8/templates/login.html`
- `V8/templates/` (empty folder)
- `V8/static/css/dashboard.css`
- `V8/static/css/login.css`
- `V8/static/css/tokens.css`
- `V8/static/js/app.js`
- `V8/static/js/dashboard.js`
- `V8/static/js/login.js`
- `V8/static/js/secret-chat.js`
- `V8/static/css/` (empty)
- `V8/static/js/` (empty)
- `V8/static/` (empty)
- `V8/app.py` (dead V1 Streamlit code)

### Untouched

- All `NewFrontEndToBePorted/components/`, `lib/`, `app/page.tsx`, `app/layout.tsx`, `app/login/page.tsx`, `app/login/login-form.tsx` — internal navigation uses relative paths and Next handles basePath transparently.
- All `/api/*` routes in `server.py`.
- `/logout` route — kept; Next.js `logoutAction` calls it with `Accept: application/json`.
- `parser.py`, `pdf_export.py`, `ai_chat.py`, `storage.py`.
- `requirements.txt`, `.env`, `run.bat`.
- `_build_testexcel_*.py`, `TESTEXCEL/`, `New info/`, `Msc/`, `V6_SPEC.md`, `docs/`.
- Render service configuration, env vars, and the Next.js Render service itself.

## 4. Post-change auth flow trace

### Anonymous visitor

```
1. Browser → GET https://elevatechecked1.info/
2. Flask catch-all matches → _proxy_to_next("")
3. Upstream call → GET https://powerbi-1-ulbm.onrender.com/
4. Next.js HomePage RSC runs isAuthenticated() →
     fetch(FLASK_BACKEND_URL + "/api/me", { headers: forwardCookies() })
   (no cookies forwarded; user is anon)
5. /api/me returns { authenticated: false }
6. HomePage calls redirect("/login")
7. Next.js returns 307 with Location: /login → Flask proxy forwards to browser
8. Browser → GET /login → Flask catch-all → proxy → Next.js renders LoginForm
9. User submits → POST / (Server Action) → Flask catch-all → proxy → Next.js
10. Server Action loginAction runs:
      fetch(FLASK_BACKEND_URL + "/api/login", { body: {password} })
    Flask returns 200 + Set-Cookie: session=xxx
11. Next.js mirrors the cookie via cookies().set() onto its own response
12. Server Action calls redirect("/")
13. Response flows back: Next.js → Flask proxy → Browser
    Browser receives 303/307 with Set-Cookie + Location: / on elevatechecked1.info domain
14. Browser → GET / with session cookie → Flask catch-all → proxy → Next.js
15. HomePage RSC: isAuthenticated() → /api/me with cookie → authed → AppShell renders
```

### Authenticated revisit

```
1. Browser → GET / with session cookie → Flask catch-all → proxy → Next.js
2. isAuthenticated() → /api/me with cookie → authed → AppShell renders
```

### Logout

```
1. User clicks logout → Server Action logoutAction
2. Server Action calls Flask /logout (server-to-server) with Accept: application/json
3. Flask clears session, returns { ok: true }
4. Server Action clears local cookies via cookies().delete(...)
5. redirect("/login") → browser navigates → password gate
```

**Invariants preserved:**

- One cookie domain — `elevatechecked1.info` — for both Flask-set and Next-mirrored cookies.
- `_proxy_to_next` already preserves multi-valued `Set-Cookie` via `getlist`.
- `X-Forwarded-Host` already set to the public host; Server Action CSRF passes because `allowedOrigins` whitelist already includes the public host.

## 5. Edge cases

| Case | Behavior |
|---|---|
| Existing logged-in user across the migration | Session cookie still valid; `/api/me` returns authed; no re-login. |
| Old `/beta` bookmarks | 301 → `/`. Permanent. Browsers cache and rewrite. |
| Old `/beta/login` bookmarks | 301 → `/login`. |
| `/static/<anything>` after deletion | Flask 404 (no `static_folder`). Acceptable; nothing depends on this URL space. |
| `/_next/static/...` chunk requests | Catch-all proxies to Next. Next serves the chunk. Same as today via `/beta/_next/...` minus the prefix. |
| `/favicon.ico` | Catch-all proxies to Next. Next serves from `app/favicon.ico` if present (currently none → 404 from Next). Harmless. |
| Large file upload (R2 chunked) | Direct to `/api/r2/chunk-upload`. Flask handles. No proxy involved. |
| PDF export | `/api/export-pdf` direct to Flask. No proxy. |
| Anonymous hit on `/api/...` | Existing `@login_required` returns 401/redirect. Unchanged. |
| Anonymous hit on `/` | Catch-all proxies → Next HomePage → redirect to `/login`. Same as `/beta` is today. |
| Proxy fails (Next.js service down) | Existing `except _requests.RequestException` returns 502 JSON. Unchanged. |
| Server Action CSRF mismatch | `allowedOrigins` whitelist in `next.config.mjs` already covers `elevatechecked1.info`. Verify list includes the host before deploy. |

## 6. Out of scope

| Area | Reason |
|---|---|
| Render service config / dashboard | Same two services, same env vars (`NEXT_BACKEND_URL`, `FLASK_BACKEND_URL`, `APP_PASSWORD`, R2 creds, etc.). |
| Database schema, R2 bucket | Untouched. |
| `_build_testexcel_*.py` scripts | Test data builders, unrelated. |
| `TESTEXCEL/`, `New info/`, `Msc/` folders | Reference workbooks, sample HTMLs, misc notes. |
| Test infrastructure | None exists in either project; not adding. |
| `requirements.txt` cleanup | Streamlit already removed in a prior pass; `matplotlib` is used by `pdf_export.py` and stays. |
| Secret Chat feature | Already gated behind `show_secret_chat` flag in `/api/config`; not yet ported to Next.js. Separate work. |
| Storage Files section (the work from earlier today) | Already in place; this change leaves it intact. |

## 7. Verification

| Step | How | Who |
|---|---|---|
| Python syntax | `python -m py_compile server.py` | Implementer |
| TypeScript clean | `pnpm tsc --noEmit` from `NewFrontEndToBePorted/` | Implementer |
| Next.js production build | `pnpm build` | Implementer |
| API not swallowed by catch-all | `curl http://localhost:5000/api/health` returns `{"ok": true, ...}` (not Next.js HTML) | Implementer |
| /beta redirect works | `curl -I http://localhost:5000/beta/anything` returns `301 Location: /anything` | Implementer |
| Manual: anon visitor login | Open `localhost:5000/` (or production URL) → redirected to `/login` → submit credentials → dashboard renders → URL is `/` (not `/beta`) | User |
| Manual: logged-in revisit | Reload → no re-login | User |
| Manual: legacy bookmark | Open `/beta` → land on `/`. Open `/beta/anything` → land on `/anything`. | User |
| Production smoke after push | Open `https://elevatechecked1.info/` → dashboard. Confirm `/static/anything` returns 404 (legacy URL gone). | User |

## 8. Risks

| Risk | Mitigation |
|---|---|
| Catch-all swallows a future Flask route I didn't notice | Flask is specificity-first; explicit routes always win. After implementation, grep `@app.route` in `server.py` and confirm every existing route still resolves locally. |
| `_proxy_to_next` was tested only with the `/beta` prefix; some path-quirks could surface | The proxy is a stream-through with header forwarding; the prefix change is one line. Test the four asset types in verification (HTML page, JS chunk under `/_next/static/`, image, Server Action POST). |
| `redirect("/")` in Server Actions resolves wrong with basePath removed | Read `app/login/actions.ts` and `app/page.tsx` during implementation; Next applies basePath to `redirect` automatically so removing basePath just removes the prefix — same string `redirect("/")` continues to mean root. Visual confirmation only. |
| Render env var `NEXT_BACKEND_URL` not set on the Flask service after rename | Not a code change; user owns env var ops. Spec calls it out so the user verifies before deploy. |
| Stale `Set-Cookie` from old `/beta` flow lingers in browser | One existing session cookie at `elevatechecked1.info` survives. No new cookie domain. No issue. |

## 9. Ground rules

- No file edited outside `V8/server.py` and `V8/NewFrontEndToBePorted/next.config.mjs` and possibly `V8/NewFrontEndToBePorted/app/login/actions.ts` (audit only).
- No new dependencies (Python or Node).
- No Render dashboard changes required.
- No db migration required.
- One PR-shaped diff per file plus deletions.
