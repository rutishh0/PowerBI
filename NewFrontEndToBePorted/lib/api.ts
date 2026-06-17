/**
 * Typed fetch helpers for the Flask backend.
 *
 * All requests go through Next.js rewrites (configured in next.config.mjs)
 * so they are same-origin from the browser's perspective. The Flask
 * session cookie therefore lives on the Next origin and is included
 * automatically on every request without `credentials: "include"` gymnastics.
 */

import type { FileType, ParsedFile, R2FileRecord, UploadedFile } from "@/lib/types"

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
      ((payload && typeof payload === "object" && "error" in (payload as Record<string, unknown>) &&
        String((payload as Record<string, unknown>).error)) ||
        `Request failed (${res.status})`) as string
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
/**
 * Read a File as a base64 data URL (`data:<mime>;base64,<...>`). Used by
 * the NetSkope-safe upload path so the body is JSON instead of multipart.
 */
function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"))
    reader.readAsDataURL(file)
  })
}

/**
 * Upload one workbook to Flask `/api/upload` as JSON-encoded base64.
 *
 * IMPORTANT: this path is intentionally JSON, not multipart/form-data.
 * Corporate web proxies (NetSkope etc.) inspect multipart .xlsx POSTs
 * and frequently block or strip them. The Flask backend has a matching
 * `if request.is_json: ... # NetSkope bypass` branch that decodes this
 * format. Multipart still works as a backend fallback but should not be
 * used from the new frontend.
 */
export async function uploadFile(file: File): Promise<UploadedFile[]> {
  const dataUrl = await fileToDataURL(file)

  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      files: [{ name: file.name, data: dataUrl }],
    }),
  })
  const body = await handle<UploadAnyResponse>(res)

  // Flask returns { files: { "<filename>": <parsed>, ... }, errors: [...] }
  // — accept both that shape and the legacy array shape just in case.
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

// Server's MAX_CONTENT_LENGTH is 50 MB and base64 inflates by 33%, so cap
// each raw chunk at 8 MB → ~10.7 MB after base64. The simple JSON-base64
// `/api/upload` path is also subject to the same 50 MB cap, so cut over
// to chunked once the raw file is over ~32 MB (≈ 42.7 MB after base64).
const CHUNK_SIZE_BYTES = 8 * 1024 * 1024
const SIMPLE_UPLOAD_THRESHOLD = 32 * 1024 * 1024

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
  /** Filters mirroring the on-screen filter bar (omitted keys = no filter
   * on that dimension). Optional — generators that don't recognise a key
   * silently ignore it. The report is always the full executive briefing;
   * section selection was removed. */
  filters?: Record<string, string>
  /** When true, generate the long-form Detailed report (every analysis as a
   * chart + table). Applies to the Global Hopper report. */
  detailed?: boolean
  /** When true, generate the Ultra-detailed report — the Detailed report plus
   * the full opportunity register and VP/region breakdown appendix. Implies
   * `detailed`. Applies to the Global Hopper report. */
  ultra?: boolean
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

/* ---------- AI report (Kimi K2.6, background job) ---------- */

export type AiReportMode = "catalog" | "charts" | "html"
/** LLM provider: Kimi K2.6 via NVIDIA, or Gemma 4 31B via Google AI Studio. */
export type AiReportProvider = "nvidia" | "aistudio"

export interface AiReportStartPayload {
  filename: string
  file_type: FileType
  /** Active dashboard filters (omitted keys = no filter on that dimension). */
  filters?: Record<string, string>
  /** Render architecture: AI Vega-Lite charts | AI full HTML | curated catalog. */
  mode: AiReportMode
  /** Which LLM designs the report. */
  provider: AiReportProvider
}

export interface AiReportStatus {
  status: "queued" | "running" | "done" | "failed"
  progress: string
  error: string | null
  /** Non-null when the deterministic fallback report was produced instead. */
  note: string | null
  filename: string | null
  mode: AiReportMode
  provider?: AiReportProvider
}

/** POST /api/ai-report — start a background AI report job. */
export async function startAiReport(
  payload: AiReportStartPayload,
): Promise<{ job_id: string; mode: AiReportMode }> {
  const res = await fetch("/api/ai-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  return handle<{ job_id: string; mode: AiReportMode }>(res)
}

/** GET /api/ai-report/{id} — poll job status/progress. */
export async function getAiReportStatus(jobId: string): Promise<AiReportStatus> {
  const res = await fetch(`/api/ai-report/${jobId}`, { cache: "no-store" })
  return handle<AiReportStatus>(res)
}

/** GET /api/ai-report/{id}/download — fetch the finished PDF (evicts the job). */
export async function downloadAiReport(jobId: string): Promise<Blob> {
  const res = await fetch(`/api/ai-report/${jobId}/download`)
  if (!res.ok) {
    let detail = ""
    try {
      detail = (await res.json()).error || ""
    } catch {
      detail = await res.text()
    }
    throw new ApiError(res.status, `Download failed: ${detail || res.statusText}`)
  }
  return await res.blob()
}

/* ---------- R2 archive (persistent file storage) ---------- */

/** GET /api/r2/files — list everything in the R2 archive. */
export async function listR2Files(): Promise<R2FileRecord[]> {
  const res = await fetch("/api/r2/files", { cache: "no-store" })
  return handle<R2FileRecord[]>(res)
}

/** DELETE /api/r2/files/{id} — remove from R2 AND the metadata row.
 * Tolerates 404 (already gone). */
export async function deleteR2File(id: number): Promise<void> {
  const res = await fetch(`/api/r2/files/${id}`, { method: "DELETE" })
  if (!res.ok && res.status !== 404) {
    await handle(res)
  }
}

/** POST /api/r2/files/{id}/parse — re-parse a stored workbook on the
 * server and return it in the same UploadedFile[] shape uploads produce,
 * so callers can feed it straight into AppShell's `setFiles`. */
export async function parseR2File(id: number): Promise<UploadedFile[]> {
  const res = await fetch(`/api/r2/files/${id}/parse`, { method: "POST" })
  const body = await handle<{ files: Record<string, ParsedFile> }>(res)
  const out: UploadedFile[] = []
  for (const [name, parsed] of Object.entries(body.files ?? {})) {
    out.push({
      name,
      file_type: (parsed as { file_type?: FileType }).file_type ?? "UNKNOWN",
      parsed: parsed as ParsedFile,
    })
  }
  return out
}

/** Pure helper — the URL a browser uses to download a stored file. */
export function r2FileDownloadUrl(id: number): string {
  return `/api/r2/files/${id}`
}
