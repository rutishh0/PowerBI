"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Lock, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { login as apiLogin, ApiError } from "@/lib/api"

/**
 * Login form — submits the access code straight to Flask `/api/login`.
 *
 * Was previously wired through a Next.js Server Action. Static export
 * forbids Server Actions, so we POST directly and then router.replace("/")
 * on success. The Flask session cookie is same-origin (Flask serves
 * everything), so no Set-Cookie mirroring is required.
 */
export function LoginForm() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await apiLogin(password)
      router.replace("/")
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Login failed"
      setError(msg)
      setBusy(false)
    }
    // On success we deliberately leave `busy` true — the navigation away
    // unmounts the form, no need to flicker the button back to idle.
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="sr-only" htmlFor="password">
        Access code
      </label>
      <div className="relative">
        <Lock
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sidebar-foreground/50"
          aria-hidden="true"
        />
        <input
          id="password"
          name="password"
          type={show ? "text" : "password"}
          placeholder="Access code"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-11 w-full rounded-md border border-sidebar-border bg-sidebar/60 pl-10 pr-10 text-sm text-sidebar-foreground placeholder:text-sidebar-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar-accent"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar/60 transition-colors"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/60 bg-destructive/15 px-3 py-2 text-sm text-destructive-foreground"
        >
          {error}
        </div>
      ) : null}

      <Button
        type="submit"
        disabled={busy}
        className="h-11 bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 font-medium"
      >
        {busy ? (
          <>
            <Spinner className="text-sidebar-primary-foreground" />
            Authenticating…
          </>
        ) : (
          <>
            Access Dashboard
            <ArrowRight className="ml-1 h-4 w-4" />
          </>
        )}
      </Button>
    </form>
  )
}
