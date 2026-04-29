"use client"

import { useActionState, useState } from "react"
import { Eye, EyeOff, Lock, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { loginAction } from "./actions"
import { Spinner } from "@/components/ui/spinner"

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null)
  const [show, setShow] = useState(false)

  return (
    <form action={action} className="flex flex-col gap-4">
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

      {state?.error ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/60 bg-destructive/15 px-3 py-2 text-sm text-destructive-foreground"
        >
          {state.error}
        </div>
      ) : null}

      <Button
        type="submit"
        disabled={pending}
        className="h-11 bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 font-medium"
      >
        {pending ? (
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

      <p className="text-[11px] text-sidebar-foreground/40 text-center">
        Default demo code: <span className="font-mono text-sidebar-foreground/60">rollsroyce</span>
      </p>
    </form>
  )
}
