"use client"

import { useState, type FormEvent } from "react"
import { Lock } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface StoragePasswordGateProps {
  onUnlock: () => void
}

export function StoragePasswordGate({ onUnlock }: StoragePasswordGateProps) {
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)

  // Soft hide, not real auth. Same string the legacy Files module and Secret
  // Chat used. The main Flask login already gated everything.
  const STORAGE_GATE_PASSWORD = "ChickenMan123"

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (value === STORAGE_GATE_PASSWORD) {
      setError(null)
      onUnlock()
    } else {
      setError("Incorrect access code")
      setValue("")
    }
  }

  return (
    <div className="flex justify-center py-10">
      <Card className="w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
            <Lock className="h-4 w-4 text-muted-foreground" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Cloud archive</h2>
            <p className="text-xs text-muted-foreground">Enter access code to view persistent storage.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            type="password"
            placeholder="Access code"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={error ? "true" : undefined}
            aria-describedby={error ? "storage-gate-error" : undefined}
          />
          {error ? (
            <p id="storage-gate-error" className="text-xs text-destructive">{error}</p>
          ) : null}
          <Button type="submit" className="w-full" disabled={value.length === 0}>
            Unlock
          </Button>
        </form>
      </Card>
    </div>
  )
}
