# Frontend Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the legacy vanilla-JS frontend, promote the Next.js frontend from `/beta` to root, and delete dead V1 Streamlit `app.py`. After this change, `elevatechecked1.info/` serves the Next.js dashboard directly (via Flask reverse-proxy to the Next.js Render service), the `/beta` URL space 301-redirects to root, and Flask is API-only plus catch-all proxy.

**Architecture:** Flask remains the public entry. Five routing changes in `server.py`: delete `/` and `/login` HTML routes, update `login_required` to return JSON 401, change `_proxy_to_next` to drop the `/beta` upstream prefix, replace `/beta` proxy routes with a single 301 redirect + a catch-all proxy at `/` and `/<path>`. Next.js drops `basePath: "/beta"` so it serves at root. Legacy `templates/`, `static/`, and `app.py` are deleted.

**Tech Stack:** Flask 3, Python 3.11+, Next.js 16, TypeScript. No new dependencies. Verification via `python -m py_compile`, `pnpm tsc --noEmit`, `pnpm build`, and manual curl checks.

**Note on commits:** V8 is not a git repo. Each task ends at a "leave the working tree clean and runnable" checkpoint instead of `git commit`. User snapshots when ready by copying V8 → PowerBI.

**Spec:** `V8/docs/superpowers/specs/2026-05-18-frontend-consolidation-design.md`

---

## Task 1: Rewrite the Flask routing layer in `server.py`

Single file, multiple coordinated edits. After this task, Flask is API-only plus a catch-all proxy and a /beta 301-redirect.

**Files:**
- Modify: `V8/server.py`

- [ ] **Step 1: Tighten the flask imports**

Find the existing flask import line near the top of `server.py` (currently around line 23):

```python
from flask import Flask, render_template, request, jsonify, send_file, session, redirect, url_for, Response
```

Replace it with:

```python
from flask import Flask, request, jsonify, send_file, session, redirect, Response
```

`render_template` and `url_for` are no longer used after this task. `redirect` stays — `/logout` still uses it (now with a literal path).

- [ ] **Step 2: Drop `template_folder` and `static_folder` from the Flask constructor**

Find (around line 90):

```python
app = Flask(__name__, static_folder="static", template_folder="templates")
```

Replace with:

```python
app = Flask(__name__)
```

The `templates/` and `static/` folders are being deleted in Task 4. Leaving the kwargs pointed at non-existent paths would log noisy warnings and 404 weird URLs.

- [ ] **Step 3: Update `login_required` to return JSON 401 instead of redirecting to a now-nonexistent endpoint**

Find (around line 144):

```python
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get("authenticated"):
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return decorated_function
```

Replace with:

```python
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get("authenticated"):
            # All login_required routes are /api/*; JSON 401 is what the
            # frontend expects (ApiError handler in lib/api.ts surfaces it).
            return jsonify({"error": "Unauthorized"}), 401
        return f(*args, **kwargs)
    return decorated_function
```

After this task `login_required` only decorates `/api/*` routes (since `/` is being deleted), so JSON 401 is the correct contract.

- [ ] **Step 4: Delete the legacy `/` route**

Find (around line 157):

```python
@app.route("/")
@login_required
def index():
    """Serve the main dashboard SPA."""
    return render_template("index.html", feature_flags=FEATURE_FLAGS)


```

Delete the entire block including the trailing blank line. The next route in the file (`/api/config`) becomes the first route after the section header.

- [ ] **Step 5: Delete the legacy `/login` HTML route**

Find (around line 171):

```python
@app.route("/login", methods=["GET", "POST"])
def login():
    """Handle login page and authentication."""
    if request.method == "POST":
        password = request.form.get("password")
        # In production, use a secure hash comparison and env var
        expected_password = os.environ.get("APP_PASSWORD", "rollsroyce")
        
        if password == expected_password:
            session["authenticated"] = True
            return redirect(url_for("index"))
        else:
            return render_template("login.html", error="Invalid access code")
    
    return render_template("login.html")


```

Delete the entire block including the trailing blank line. The Next.js `/login` route now handles UI; Flask's `/api/login` (unchanged) handles credential check.

- [ ] **Step 6: Update `/logout` so it has no `url_for` dependency**

Find (around line 188, now shifted up because of prior deletions):

```python
@app.route("/logout")
def logout():
    """Clear session and logout."""
    session.clear()
    # If the request came from a JSON client (Next frontend), return JSON;
    # else fall back to the legacy HTML redirect to /login.
    accept = request.headers.get("Accept", "")
    if request.is_json or "application/json" in accept:
        return jsonify({"ok": True})
    return redirect(url_for("login"))
```

Replace with:

```python
@app.route("/logout")
def logout():
    """Clear session and logout."""
    session.clear()
    accept = request.headers.get("Accept", "")
    if request.is_json or "application/json" in accept:
        return jsonify({"ok": True})
    # Direct browser hit (e.g. user typing /logout in URL bar): send them
    # to the Next.js login page, which the catch-all proxy now serves.
    return redirect("/login")
```

- [ ] **Step 7: Update `_proxy_to_next` to drop the `/beta` upstream prefix**

Find the function (around line 255):

```python
def _proxy_to_next(subpath: str):
    """Forward a request to the Next service, streaming the response back."""
    upstream = f"{NEXT_BACKEND_URL}/beta"
    if subpath:
        upstream += "/" + subpath
    if request.query_string:
        upstream += "?" + request.query_string.decode("utf-8", "ignore")
```

Replace the first three lines of the body so the function becomes:

```python
def _proxy_to_next(subpath: str):
    """Forward a request to the Next service, streaming the response back.

    Next.js no longer has a basePath, so we proxy / → upstream-root and
    /<subpath> → upstream/<subpath>. The catch-all routes below decide
    which path actually hits this function.
    """
    upstream = NEXT_BACKEND_URL
    if subpath:
        upstream += "/" + subpath
    if request.query_string:
        upstream += "?" + request.query_string.decode("utf-8", "ignore")
```

(`NEXT_BACKEND_URL` already has `.rstrip("/")` applied at module level, so `upstream` is safe.)

The rest of `_proxy_to_next` (header forwarding, Set-Cookie preservation, streaming response) is unchanged.

- [ ] **Step 8: Replace the three `/beta*` proxy routes with one 301-redirect route and a catch-all**

Find (around line 320):

```python
@app.route("/beta", methods=["GET", "HEAD"])
def beta_root():
    return _proxy_to_next("")


@app.route("/beta/", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])
def beta_root_slash():
    return _proxy_to_next("")


@app.route(
    "/beta/<path:subpath>",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
)
def beta_proxy(subpath):
    return _proxy_to_next(subpath)
```

Replace with:

```python
# /beta legacy redirects — preserve bookmarks from the previous frontend
# layout. 301 because the move is permanent.
@app.route("/beta", methods=["GET", "HEAD"])
@app.route("/beta/", methods=["GET", "HEAD"])
def beta_legacy_root():
    return redirect("/", code=301)


@app.route("/beta/<path:subpath>", methods=["GET", "HEAD"])
def beta_legacy_subpath(subpath):
    query = ("?" + request.query_string.decode("utf-8", "ignore")) if request.query_string else ""
    return redirect(f"/{subpath}{query}", code=301)


# Catch-all reverse proxy — every path not matched by a more-specific
# Flask route (i.e. anything outside /api/*, /logout, /beta*) is
# forwarded to the Next.js service. Flask routes by specificity, so
# explicit routes always win.
@app.route(
    "/",
    defaults={"subpath": ""},
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
)
@app.route(
    "/<path:subpath>",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
)
def next_catchall(subpath):
    return _proxy_to_next(subpath)
```

The 301 redirects only handle GET/HEAD intentionally — POST/PUT/etc. to a `/beta` URL is exotic enough to not warrant preserving (and a 301 on a POST is awkward anyway). If you ever need to handle non-GET to `/beta`, those would naturally fall through and 405, which is fine.

- [ ] **Step 9: Update the section comment above the proxy block**

Find (around line 231 before the proxy block, in `server.py`):

```python
# ─────────────────────────────────────────────────────────────
# /beta/* — Reverse proxy to the Next.js frontend service
#
# Lets us serve the new Next.js UI as a sub-path of this Flask
# domain (e.g. https://elevatechecked1.info/beta) without giving
# up the legacy /  + /api/* routes. Set NEXT_BACKEND_URL in env
# to the public URL of the Next service (no trailing slash).
# ─────────────────────────────────────────────────────────────
```

Replace with:

```python
# ─────────────────────────────────────────────────────────────
# Reverse proxy to the Next.js frontend service
#
# Flask serves the Next.js UI at root (elevatechecked1.info/...) by
# forwarding every non-/api/*, non-/logout path to the Next service.
# Set NEXT_BACKEND_URL in env to the public URL of the Next service
# (no trailing slash). /beta URLs are kept as 301 redirects to root
# so old bookmarks survive.
# ─────────────────────────────────────────────────────────────
```

- [ ] **Step 10: Syntax check the modified file**

```
python -m py_compile "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/server.py"
echo $?   # expect 0
```

If the compile fails, read the error, fix the offending line, re-run. Do not move on with a broken file.

- [ ] **Step 11: Sanity-check the routing table by listing every `@app.route` in the file**

```
grep -n "@app.route" "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/server.py"
```

Expected route inventory after this task:
- `/api/config` (login_required)
- `/logout`
- `/api/login` (POST)
- `/api/me`
- `/api/health`
- `/beta` and `/beta/` (GET/HEAD → 301)
- `/beta/<path:subpath>` (GET/HEAD → 301)
- `/` and `/<path:subpath>` (catch-all)
- All `/api/upload`, `/api/export-pdf`, `/api/files*`, `/api/r2/*`, `/api/chat*`, `/api/compare` routes (unchanged)
- `/api/parsed/<path:fname>` (DELETE)

No `/` index route. No `/login` HTML route. No three-route `/beta*` proxy block.

- [ ] **Step 12: Checkpoint**

`server.py` rewritten. Move to Task 2.

---

## Task 2: Remove `basePath` from `next.config.mjs`

Single one-line removal plus a small comment cleanup. After this task, Next.js serves at root.

**Files:**
- Modify: `V8/NewFrontEndToBePorted/next.config.mjs`

- [ ] **Step 1: Drop the basePath line and its comment**

Open `V8/NewFrontEndToBePorted/next.config.mjs`. Find:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Hosted as a sub-path of the Flask domain (elevatechecked1.info/beta).
  // basePath ensures all Next pages, links, and static assets are served
  // under /beta/* — Flask reverse-proxies that prefix to this service.
  basePath: "/beta",
  typescript: {
    ignoreBuildErrors: true,
  },
```

Replace with:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Served at root (elevatechecked1.info/...). Flask reverse-proxies
  // every non-/api/* request to this Next.js service.
  typescript: {
    ignoreBuildErrors: true,
  },
```

The dev-only `rewrites()` block with `basePath: false` lines stays — `basePath: false` becomes a no-op (there's no basePath to opt out of) but the rewrites themselves are still needed in local dev so that the Next dev server can call Flask `/api/*` directly when running on port 3000 against Flask on port 5000.

- [ ] **Step 2: Type-check**

```
cd "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/NewFrontEndToBePorted"
pnpm tsc --noEmit
echo $?   # expect 0
```

- [ ] **Step 3: Checkpoint**

Next.js now resolves all internal navigation against root. Move to Task 3.

---

## Task 3: Audit `app/login/actions.ts` for basePath assumptions

This task is **read-only**. The spec lists `actions.ts` as "audit only" because Next.js applies basePath internally to `redirect` targets — removing the basePath leaves the same string pointing at the same place. We verify by reading.

**Files:**
- Read: `V8/NewFrontEndToBePorted/app/login/actions.ts`

- [ ] **Step 1: Open the file and search for hard-coded `/beta` strings**

```
grep -n "/beta" "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/NewFrontEndToBePorted/app/login/actions.ts"
```
Expected: no matches. If there are matches, stop and report — that's a basePath assumption that needs to be removed; do not silently edit.

- [ ] **Step 2: Visually scan for `redirect("...")` and `Location:` headers**

```
grep -n "redirect\|Location" "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/NewFrontEndToBePorted/app/login/actions.ts"
```

Expected matches:
- `import { redirect } from "next/navigation"`
- `redirect("/")` (after successful login in `loginAction`)
- `redirect("/login")` (after logout in `logoutAction`)

Both are correct as-is. `next/navigation`'s `redirect` is basePath-aware, so the same string means "site root" before and after the basePath removal — only the resolved URL changes.

- [ ] **Step 3: Checkpoint**

No edit. Move to Task 4.

---

## Task 4: Delete the legacy frontend files and `app.py`

After this task, the legacy frontend is gone from disk. Folders go away cleanly.

**Files:**
- Delete: `V8/templates/index.html`
- Delete: `V8/templates/login.html`
- Delete: `V8/templates/` (empty after the two HTMLs)
- Delete: `V8/static/css/dashboard.css`
- Delete: `V8/static/css/login.css`
- Delete: `V8/static/css/tokens.css`
- Delete: `V8/static/js/app.js`
- Delete: `V8/static/js/dashboard.js`
- Delete: `V8/static/js/login.js`
- Delete: `V8/static/js/secret-chat.js`
- Delete: `V8/static/css/` (empty)
- Delete: `V8/static/js/` (empty)
- Delete: `V8/static/` (empty)
- Delete: `V8/app.py`

- [ ] **Step 1: Sanity-check that nothing in the live stack imports `app.py`**

```
grep -rn "from app import\|import app$\|from app\." "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/" --include="*.py" 2>&1 | grep -v "V8/app.py\|V8/_build_testexcel"
```

Expected: empty output (no import). If anything shows up, stop and surface it — that file would break.

- [ ] **Step 2: Sanity-check that no live code references the legacy templates or static assets**

```
grep -rn "render_template\|/static/css/dashboard\|/static/js/app\|/static/js/dashboard" "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/" --include="*.py" 2>&1 | grep -v "V8/_build_testexcel\|V8/docs/superpowers\|V8/Msc"
```

Expected: empty output (we removed both `render_template` calls in Task 1). If anything shows up, stop.

- [ ] **Step 3: Delete the legacy frontend files**

```
rm "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/templates/index.html"
rm "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/templates/login.html"
rmdir "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/templates"

rm "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/static/css/dashboard.css"
rm "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/static/css/login.css"
rm "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/static/css/tokens.css"
rm "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/static/js/app.js"
rm "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/static/js/dashboard.js"
rm "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/static/js/login.js"
rm "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/static/js/secret-chat.js"
rmdir "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/static/css"
rmdir "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/static/js"
rmdir "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/static"
```

- [ ] **Step 4: Delete `app.py`**

```
rm "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/app.py"
```

- [ ] **Step 5: Verify the folders are gone**

```
ls "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/" | grep -E "^(templates|static|app\.py)$"
```

Expected: empty output (the three names are gone).

- [ ] **Step 6: Checkpoint**

Move to Task 5 for final verification.

---

## Task 5: Final verification

No code changes. Runs the same battery of checks the spec lists in §7, then hands off browser verification to the user.

**Files:** none modified.

- [ ] **Step 1: Python syntax check**

```
python -m py_compile "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/server.py"
echo "py_compile exit: $?"
```
Expected: exit 0.

- [ ] **Step 2: TypeScript clean**

```
cd "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/NewFrontEndToBePorted"
pnpm tsc --noEmit
echo "tsc exit: $?"
```
Expected: exit 0.

- [ ] **Step 3: Next.js production build**

```
cd "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/NewFrontEndToBePorted"
pnpm build
echo "build exit: $?"
```
Expected: exit 0. The output should no longer mention `/beta` in route listings — pages should resolve as `/` and `/login`.

- [ ] **Step 4: Confirm the final `@app.route` inventory in `server.py`**

```
grep -n "@app.route" "C:/Users/Rutishkrishna/Desktop/RR/RR Powerbi/V8/server.py"
```

Cross-check against the inventory in Task 1 Step 11. Specifically confirm:
- NO `@app.route("/")` returning HTML (only the catch-all `/` with `defaults={"subpath": ""}`)
- NO `@app.route("/login", ...)`
- Three `/beta` routes (two short forms 301-redirect, one path-prefixed 301-redirect)
- Two catch-all routes (`/` with defaults, `/<path:subpath>`)
- All `/api/*` routes intact

- [ ] **Step 5: Hand off browser walkthrough**

Inform the user the implementation is complete and ready to copy into PowerBI. Surface the spec §7 manual walkthrough:

- **Golden path:** Open `localhost:5000/` (after `python server.py` and `pnpm dev` on port 3000 with `NEXT_BACKEND_URL=http://localhost:3000` on Flask, or directly against staged production). Anonymous user → redirected to `/login`. Submit credentials → dashboard. URL is `/` (no `/beta`).
- **Bookmarks:** Open `/beta` → 301 to `/`. Open `/beta/anything` → 301 to `/anything`.
- **API not swallowed:** `curl -i http://localhost:5000/api/health` → JSON `{"ok": true, ...}`, NOT Next.js HTML.
- **/logout:** Click logout in sidebar → password gate. Direct `localhost:5000/logout` GET in browser URL bar → 302 to `/login` → Next.js login page renders via catch-all.
- **/static and template paths:** `curl -i http://localhost:5000/static/css/dashboard.css` → 404 (no static folder).
- **Production smoke after push:** Open `https://elevatechecked1.info/` → dashboard. `/beta` → 301 to `/`. `/api/health` → JSON. `/static/css/dashboard.css` → 404 (or Next 404 if proxied; either is fine).

- [ ] **Step 6: Done**

All five tasks complete. User can copy `V8/` → `PowerBI/` and push when satisfied.

---

## Spec coverage check

Done after writing the plan. Every spec requirement maps to at least one task:

| Spec section | Task(s) |
|---|---|
| §2.1 Flask catch-all proxy | Task 1 (steps 7, 8) |
| §2.2 301 redirect `/beta/<path>` → `/<path>` | Task 1 (step 8) |
| §2.3 Delete `app.py` | Task 4 (step 4) |
| §2.4 Drop `basePath` from `next.config.mjs` | Task 2 |
| §2.5 Remove `template_folder` / `static_folder` kwargs + delete folders | Task 1 (step 2) + Task 4 (step 3) |
| §3 Modified: `server.py` | Task 1 (all steps) |
| §3 Modified: `next.config.mjs` | Task 2 |
| §3 Modified: `actions.ts` (audit) | Task 3 |
| §3 Deleted: templates/static/app.py | Task 4 |
| §4 Auth flow trace (anonymous + revisit + logout) | Validated by Task 5 step 5 (manual walkthrough) |
| §5 Edge cases | Validated by Task 5 step 5 (manual walkthrough), plus Task 4 sanity-greps |
| §6 Out of scope | No task touches them (implicit) |
| §7 Verification | Task 5 |
| §8 Risk: catch-all swallows future Flask route | Task 1 step 11 + Task 5 step 4 (route inventory check) |
| §8 Risk: `_proxy_to_next` path quirks | Task 5 step 3 (Next.js build), step 5 (browser walk) |
| §8 Risk: `redirect("/")` in actions.ts | Task 3 audit |
| §8 Risk: `NEXT_BACKEND_URL` env var not set on Flask service | Out of scope (user-owned ops); flagged in spec |
| §9 Ground rules (no new deps, single-file edits where possible) | Implicit; verified by reading the diff |
