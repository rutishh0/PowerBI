"use client"

import type { UploadedFile } from "@/lib/types"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { SessionPanel } from "./session-panel"
import { StoragePanel } from "./storage-panel"

interface FilesViewProps {
  files: UploadedFile[]
  activeFile: string | null
  onSelectFile: (name: string) => void
  onParsed: (files: UploadedFile[]) => void
}

export function FilesView({
  files,
  activeFile,
  onSelectFile,
  onParsed,
}: FilesViewProps) {
  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground font-display">
          Document catalogue
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse files parsed in this session or stored in cloud archive.
        </p>
      </div>

      <Tabs defaultValue="session">
        <TabsList>
          <TabsTrigger value="session">Session</TabsTrigger>
          <TabsTrigger value="storage">Storage</TabsTrigger>
        </TabsList>

        <TabsContent value="session" forceMount className="pt-6 data-[state=inactive]:hidden">
          <SessionPanel files={files} activeFile={activeFile} onSelectFile={onSelectFile} />
        </TabsContent>

        <TabsContent value="storage" forceMount className="pt-6 data-[state=inactive]:hidden">
          <StoragePanel onParsed={onParsed} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
