import { redirect } from "next/navigation"
import { isAuthenticated } from "./actions"
import { LoginForm } from "./login-form"
import { RRWordmark } from "@/components/brand/rr-wordmark"

export default async function LoginPage() {
  if (await isAuthenticated()) redirect("/")
  return (
    <main className="min-h-screen bg-sidebar text-sidebar-foreground flex items-center justify-center p-6 relative overflow-hidden">
      {/* Subtle aerospace backdrop: concentric rings evoking a turbine */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.08]" aria-hidden="true">
        <div className="absolute left-1/2 top-1/2 h-[140vmin] w-[140vmin] -translate-x-1/2 -translate-y-1/2 rounded-full border border-sidebar-primary" />
        <div className="absolute left-1/2 top-1/2 h-[110vmin] w-[110vmin] -translate-x-1/2 -translate-y-1/2 rounded-full border border-sidebar-primary" />
        <div className="absolute left-1/2 top-1/2 h-[80vmin] w-[80vmin] -translate-x-1/2 -translate-y-1/2 rounded-full border border-sidebar-primary" />
        <div className="absolute left-1/2 top-1/2 h-[50vmin] w-[50vmin] -translate-x-1/2 -translate-y-1/2 rounded-full border border-sidebar-primary" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3">
          <RRWordmark tone="light" className="items-center text-center" />
        </div>

        <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/60 backdrop-blur-sm p-8 shadow-2xl">
          <div className="mb-6">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-sidebar-foreground">
              Financial Dashboard
            </h1>
            <p className="mt-1 text-sm text-sidebar-foreground/70 text-pretty">
              Finance &amp; Receivables · Secure internal access
            </p>
          </div>

          <LoginForm />

          <p className="mt-8 text-center text-xs text-sidebar-foreground/50 text-balance">
            For authorized users only. Contact your Rolls-Royce representative for access.
          </p>
        </div>

        <p className="mt-6 text-center text-[10px] tracking-[0.2em] uppercase text-sidebar-foreground/40">
          ROLLS-ROYCE CIVIL AEROSPACE — For internal use only
        </p>
      </div>
    </main>
  )
}
