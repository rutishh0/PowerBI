"use client"

import { FileSpreadsheet, Download, Play, Trash2, Loader2 } from "lucide-react"
import type { R2FileRecord } from "@/lib/types"
import { r2FileDownloadUrl } from "@/lib/api"
import { fmtBytes, fmtDateTime } from "@/lib/format"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface StorageFilesTableProps {
  files: R2FileRecord[]
  pendingActions: Set<number>
  onParse: (file: R2FileRecord) => void
  onDelete: (file: R2FileRecord) => void
}

export function StorageFilesTable({
  files,
  pendingActions,
  onParse,
  onDelete,
}: StorageFilesTableProps) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[55%]">File</TableHead>
            <TableHead>Uploaded</TableHead>
            <TableHead>Size</TableHead>
            <TableHead className="text-right pr-4">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {files.map((f) => {
            const pending = pendingActions.has(f.id)
            return (
              <TableRow key={f.id}>
                <TableCell>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm truncate">{f.filename}</span>
                    <Badge variant="outline" className="text-[9px] tracking-wider uppercase font-semibold shrink-0">
                      R2
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {fmtDateTime(f.upload_date)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {fmtBytes(f.file_size)}
                </TableCell>
                <TableCell className="text-right pr-4">
                  <div className="inline-flex items-center gap-1">
                    <Button
                      asChild
                      variant="ghost"
                      size="icon"
                      title="Download"
                      disabled={pending}
                    >
                      <a href={r2FileDownloadUrl(f.id)} download={f.filename}>
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      title="Parse & load to dashboard"
                      onClick={() => onParse(f)}
                      disabled={pending}
                    >
                      {pending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Delete from cloud storage"
                          disabled={pending}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete from cloud storage?</AlertDialogTitle>
                          <AlertDialogDescription>
                            <span className="font-medium">{f.filename}</span> will be
                            removed from Cloudflare R2 and its metadata row deleted.
                            This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onDelete(f)}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
