"use client"

import { useCallback, useEffect, useState } from "react"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"
import type { R2FileRecord, UploadedFile } from "@/lib/types"
import {
  listR2Files,
  parseR2File,
  deleteR2File,
  ApiError,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty"
import { StoragePasswordGate } from "./storage-password-gate"
import { StorageFilesTable } from "./storage-files-table"
import { StorageUploadZone } from "./storage-upload-zone"

const UNLOCK_KEY = "rr.storage.unlocked"

interface StoragePanelProps {
  onParsed: (files: UploadedFile[]) => void
}

export function StoragePanel({ onParsed }: StoragePanelProps) {
  const [unlocked, setUnlocked] = useState(false)

  const [files, setFiles] = useState<R2FileRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingActions, setPendingActions] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (typeof window === "undefined") return
    if (sessionStorage.getItem(UNLOCK_KEY) === "1") {
      setUnlocked(true)
    }
  }, [])

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await listR2Files()
      setFiles(list)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = "/login"
        return
      }
      setError(err instanceof Error ? err.message : "Failed to load storage")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (unlocked) void refetch()
  }, [unlocked, refetch])

  function markPending(key: string, on: boolean) {
    setPendingActions((prev) => {
      const next = new Set(prev)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })
  }

  async function handleParse(file: R2FileRecord) {
    markPending(file.r2_key, true)
    try {
      const parsed = await parseR2File(file.r2_key)
      onParsed(parsed)
      toast.success(`${file.filename} loaded to dashboard`)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        toast.error(`${file.filename} no longer in storage`)
        await refetch()
      } else {
        const msg = err instanceof Error ? err.message : "Parse failed"
        toast.error(`Parse failed: ${file.filename}`, { description: msg })
      }
    } finally {
      markPending(file.r2_key, false)
    }
  }

  async function handleDelete(file: R2FileRecord) {
    markPending(file.r2_key, true)
    try {
      await deleteR2File(file.r2_key)
      toast.success(`Removed ${file.filename}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delete failed"
      toast.error(`Couldn't remove ${file.filename}`, { description: msg })
    } finally {
      markPending(file.r2_key, false)
      await refetch()
    }
  }

  function handleUnlock() {
    sessionStorage.setItem(UNLOCK_KEY, "1")
    setUnlocked(true)
  }

  if (!unlocked) {
    return <StoragePasswordGate onUnlock={handleUnlock} />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Cloud archive</h2>
          <p className="text-xs text-muted-foreground">
            Files persisted to Cloudflare R2. Available across sessions.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
          disabled={loading}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <StorageUploadZone
        onUploaded={(parsed) => {
          onParsed(parsed)
          void refetch()
        }}
      />

      {loading && files.length === 0 ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : error ? (
        <Card className="p-4 border-destructive/40 bg-destructive/5">
          <p className="text-sm text-destructive">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            className="mt-3"
          >
            Retry
          </Button>
        </Card>
      ) : files.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No files in cloud storage yet</EmptyTitle>
            <EmptyDescription>
              Files uploaded here persist across sessions and can be reopened
              into the dashboard at any time.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <StorageFilesTable
          files={files}
          pendingActions={pendingActions}
          onParse={handleParse}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
