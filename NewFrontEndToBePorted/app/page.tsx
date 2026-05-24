"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AppShell } from "@/components/shell/app-shell"
import { me } from "@/lib/api"

/**
 * Home page — auth-gated dashboard shell.
 *
 * Static export means we can't do server-side auth checks any more, so we
 * verify the session client-side on mount via /api/me and redirect to
 * /login if it isn't valid. While the check is in flight a minimal
 * "Loading…" splash is shown.
 */
export default function HomePage() {
  const router = useRouter()
  const [status, setStatus] = useState<"loading" | "authed">("loading")

  useEffect(() => {
    let cancelled = false
    me()
      .then((r) => {
        if (cancelled) return
        if (r.authenticated) {
          setStatus("authed")
        } else {
          router.replace("/login")
        }
      })
      .catch(() => {
        // Backend unreachable / 401 — push to login regardless.
        if (!cancelled) router.replace("/login")
      })
    return () => {
      cancelled = true
    }
  }, [router])

  if (status !== "authed") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sidebar text-sidebar-foreground/60 text-sm">
        Loading…
      </div>
    )
  }
  return <AppShell />
}
