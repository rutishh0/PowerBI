/**
 * Typed fetch helpers for the Flask backend.
 *
 * All requests go through Next.js rewrites (configured in next.config.mjs)
 * so they are same-origin from the browser's perspective. The Flask
 * session cookie therefore lives on the Next origin and is included
 * automatically on every request without `credentials: "include"` gymnastics.
 */

import type { FileType, ParsedFile, UploadedFile } from "@/lib/types"

/* ---------- Server response shapes ---------- */

export interface UploadResponse {
  ok?: boolean
  files?: {
    filename: string
    file_type: FileType
    parsed: ParsedFile
    errors?: string[]
  }[]
  // Single-file legacy shape (pre-batch backend)
  filename?: string
  file_type?: FileType
  parsed?: ParsedFile
  error?: string
}

/** Flask's /api/upload returns {files: {filename: parsedPayload}} — a map,
 * not an array. We accept both shapes via this union for forward compat. */
export type UploadAnyResponse = UploadResponse & {
  files?:
    | UploadResponse["files"]
    | Record<string, ParsedFile>
}

export interface ChatChartFence {
  type: string
  title?: string
  data?: unknown
  options?: unknown
}

export interface ChatEmailFence {
  to?: string
  subject?: string
  body?: string
}

export interface ChatResponse {
  content: string
  charts?: ChatChartFence[]
  emails?: ChatEmailFence[]
  error?: string
}

export interface ConfigResponse {
  show_ai: boolean
  show_files: boolean
  show_compare: boolean
  show_secret_chat: boolean
}

export interface MeResponse {
  authenticated: boolean
}

/* ---------- Errors ---------- */

export class ApiError extends Error {
  constructor(public status: number, message: string, public payload?: unknown) {
    super(message)
    this.name = "ApiError"
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let payload: unknown = undefined
    try {
      payload = await res.json()
    } catch {
      /* non-JSON error body */
    }
    const msg =
      (payload && typeof payload === "object" && "error" in (payload as Record<string, unknown>) &&
        String((payload as Record<string, unknown>).error)) ||
      `Request failed (${res.status})`
    throw new ApiError(res.status, msg, payload)
  }
  return (await res.json()) as T
}

/* ---------- Auth ---------- */

export async function login(password: string): Promise<void> {
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  })
  await handle<{ ok: true }>(res)
}

export async function me(): Promise<MeResponse> {
  const res = await fetch("/api/me", { cache: "no-store" })
  return handle<MeResponse>(res)
}

export async function logout(): Promise<void> {
  await fetch("/api/me", { method: "GET" }) // touch session
  // The Flask /logout HTML route also clears the session and accepts
  // an Accept: application/json hint to return JSON instead of redirecting.
  await fetch("/logout", { headers: { Accept: "application/json" } })
}

export async function getConfig(): Promise<ConfigResponse> {
  const res = await fetch("/api/config", { cache: "no-store" })
  return handle<ConfigResponse>(res)
}

/* ---------- Files / parsing ---------- */

/**
 * Upload one file via multipart/form-data. Maps the Flask response
 * shape into the frontend's UploadedFile[] (always a list, even for one
 * file, to keep callers uniform).
 */
export async function uploadFile(file: File): Promise<UploadedFile[]> {
  const fd = new FormData()
  // Field name MUST be "files" — Flask /api/upload reads request.files.getlist("files")
  fd.append("files", file)

  const res = await fetch("/api/upload", { method: "POST", body: fd })
  const body = await handle<UploadAnyResponse>(res)

  // Flask's /api/upload returns:
  //   { files: { "<filename>": <parsed>, ... }, errors: [...] }
  // Different from our ChunkUpload's UploadResponse — handle both shapes.
  if (body && typeof body.files === "object" && !Array.isArray(body.files) && body.files) {
    return Object.entries(body.files).map(([name, parsed]) => ({
      name,
      file_type: (parsed as { file_type?: FileType }).file_type ?? "UNKNOWN",
      parsed: parsed as ParsedFile,
    }))
  }
  if (Array.isArray(body.files)) {
    return body.files.map((f) => ({
      name: f.filename,
      file_type: f.file_type,
      parsed: f.parsed,
    }))
  }
  if (body.filename && body.file_type && body.parsed) {
    return [
      {
        name: body.filename,
        file_type: body.file_type,
        parsed: body.parsed,
      },
    ]
  }
  return []
}

/* ---------- R2 chunked upload (large files) ---------- */

// Server's MAX_CONTENT_LENGTH is 50MB and base64 inflates by 33%, so cap
// each raw chunk at 8 MB → ~10.7 MB after base64. Threshold for falling
// back to chunked upload is 40 MB raw to leave headroom on the simple
// /api/upload path.
const CHUNK_SIZE_BYTES = 8 * 1024 * 1024
const SIMPLE_UPLOAD_THRESHOLD = 40 * 1024 * 1024

interface ChunkInitResponse {
  upload_id: string
}

interface ChunkFinalizeResponse {
  id: number
  filename: string
  r2_key: string
  public_url: string | null
  file_size: number
}

interface R2ParseResponse {
  files: Record<string, ParsedFile>
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  // Process in 32 KB slices so we don't blow the JS arg-count limit.
  const slice = 0x8000
  for (let i = 0; i < bytes.length; i += slice) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, Math.min(i + slice, bytes.length)) as unknown as number[],
    )
  }
  return btoa(binary)
}

export interface UploadProgress {
  /** 0..1 — progress through the chunk upload phase only. Parse is a final 0→1 jump. */
  ratio: number
  /** Human-readable phase label for the UI. */
  phase: "uploading" | "finalizing" | "parsing"
}

export async function uploadFileChunked(
  file: File,
  onProgress?: (p: UploadProgress) => void,
): Promise<UploadedFile[]> {
  const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE_BYTES))

  // 1. init
  const initRes = await fetch("/api/r2/chunk-init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, total_chunks: totalChunks }),
  })
  const init = await handle<ChunkInitResponse>(initRes)

  // 2. upload chunks sequentially
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE_BYTES
    const end = Math.min(start + CHUNK_SIZE_BYTES, file.size)
    const blob = file.slice(start, end)
    const buf = await blob.arrayBuffer()
    const b64 = arrayBufferToBase64(buf)

    const res = await fetch("/api/r2/chunk-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        upload_id: init.upload_id,
        chunk_index: i,
        data: b64,
      }),
    })
    await handle(res)

    onProgress?.({ ratio: (i + 1) / totalChunks, phase: "uploading" })
  }

  // 3. finalize → file is assembled in R2 and metadata persisted
  onProgress?.({ ratio: 1, phase: "finalizing" })
  const finalizeRes = await fetch("/api/r2/chunk-finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ upload_id: init.upload_id }),
  })
  const finalized = await handle<ChunkFinalizeResponse>(finalizeRes)

  // 4. parse — pulls file from R2 server-side and returns the parsed payload
  onProgress?.({ ratio: 1, phase: "parsing" })
  const parseRes = await fetch(`/api/r2/files/${finalized.id}/parse`, {
    method: "POST",
  })
  const parseBody = await handle<R2ParseResponse>(parseRes)

  const out: UploadedFile[] = []
  for (const [name, parsed] of Object.entries(parseBody.files ?? {})) {
    out.push({
      name,
      file_type: (parsed as { file_type?: FileType }).file_type ?? "UNKNOWN",
      parsed: parsed as ParsedFile,
    })
  }
  return out
}

/**
 * Smart picker: small files go through the simple /api/upload path,
 * large files (>40 MB) fall back to R2 chunked upload. Returns the same
 * UploadedFile[] shape either way.
 */
export async function uploadFileSmart(
  file: File,
  onProgress?: (p: UploadProgress) => void,
): Promise<UploadedFile[]> {
  if (file.size <= SIMPLE_UPLOAD_THRESHOLD) {
    return await uploadFile(file)
  }
  return await uploadFileChunked(file, onProgress)
}

export async function deleteParsed(name: string): Promise<void> {
  const res = await fetch(`/api/parsed/${encodeURIComponent(name)}`, {
    method: "DELETE",
  })
  if (!res.ok && res.status !== 404) {
    // 404 is fine — the server simply doesn't have it any more.
    await handle(res)
  }
}

/* ---------- AI chat ---------- */

export async function chat(message: string, model?: string): Promise<ChatResponse> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, model }),
  })
  return handle<ChatResponse>(res)
}

export async function clearChat(): Promise<void> {
  const res = await fetch("/api/chat/clear", { method: "POST" })
  await handle(res)
}

/* ---------- Compare ---------- */

export async function compareFiles(payload: {
  file_a: string
  file_b: string
}): Promise<{ summary: string; deltas?: Record<string, unknown> }> {
  const res = await fetch("/api/compare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  return handle(res)
}

/* ---------- PDF / report export ---------- */

export interface ExportPayload {
  filename: string
  file_type: FileType
  format: "pdf" | "pptx" | "png"
  sections: {
    summary?: boolean
    charts?: boolean
    tables?: boolean
    insights?: boolean
  }
}

/**
 * Triggers a PDF export. Returns a Blob ready for `URL.createObjectURL`.
 * Uses the Flask /api/export-pdf route — the legacy 3-variant generator
 * (SOA / Opportunity / Hopper) is still in place backend-side.
 */
export async function exportReport(payload: ExportPayload): Promise<Blob> {
  const res = await fetch("/api/export-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    let detail = ""
    try {
      detail = (await res.json()).error || ""
    } catch {
      detail = await res.text()
    }
    throw new ApiError(res.status, `Export failed: ${detail || res.statusText}`)
  }
  return await res.blob()
}
