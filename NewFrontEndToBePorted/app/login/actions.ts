"use server"

/**
 * Auth server actions.
 *
 * The actual credential check lives on the Flask backend (`/api/login`)
 * — we never compare passwords inside Next so the source of truth stays
 * in one place. The Flask session cookie is set on the Next origin via
 * the rewrite proxy in `next.config.mjs`, so subsequent requests carry
 * authentication automatically.
 *
 * `isAuthenticated` runs server-side from RSC (e.g. `app/page.tsx`) by
 * forwarding cookies to Flask `/api/me`.
 */

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

const FLASK_BACKEND = process.env.FLASK_BACKEND_URL || "http://localhost:5000"

function flaskUrl(path: string): string {
  return `${FLASK_BACKEND}${path}`
}

async function forwardCookies(): Promise<HeadersInit> {
  const jar = await cookies()
  const cookieHeader = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ")
  return cookieHeader ? { Cookie: cookieHeader } : {}
}

export async function isAuthenticated(): Promise<boolean> {
  try {
    const res = await fetch(flaskUrl("/api/me"), {
      headers: { ...(await forwardCookies()) },
      cache: "no-store",
    })
    if (!res.ok) return false
    const body = (await res.json()) as { authenticated?: boolean }
    return Boolean(body.authenticated)
  } catch {
    return false
  }
}

/**
 * Server-action variant of login. Used by `useActionState` in the
 * existing login form. We POST to Flask, parse any Set-Cookie header
 * coming back, and mirror it onto the Next response so the browser
 * stores the session cookie.
 */
export async function loginAction(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const password = String(formData.get("password") ?? "")
  if (!password) return { error: "Access code required" }

  let res: Response
  try {
    res = await fetch(flaskUrl("/api/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })
  } catch (err) {
    return { error: "Backend unreachable. Try again in a moment." }
  }

  if (!res.ok) {
    let detail = "Invalid access code"
    try {
      detail = ((await res.json()) as { error?: string }).error || detail
    } catch {
      /* ignore */
    }
    return { error: detail }
  }

  // Mirror Flask's Set-Cookie back onto the Next response.
  const setCookie = res.headers.get("set-cookie")
  if (setCookie) {
    const jar = await cookies()
    // setCookie may contain multiple cookies separated by ", " — naive
    // split is fine here because Flask only emits one.
    const [pair] = setCookie.split(";")
    const eq = pair.indexOf("=")
    if (eq > 0) {
      const name = pair.slice(0, eq).trim()
      const value = pair.slice(eq + 1).trim()
      jar.set(name, value, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 12,
      })
    }
  }

  redirect("/")
}

export async function logoutAction() {
  try {
    await fetch(flaskUrl("/logout"), {
      method: "GET",
      headers: { ...(await forwardCookies()), Accept: "application/json" },
    })
  } catch {
    /* swallow — we still want to clear local cookies */
  }
  const jar = await cookies()
  // Clear every cookie we know about; in practice this is just `session`.
  for (const c of jar.getAll()) jar.delete(c.name)
  redirect("/login")
}
