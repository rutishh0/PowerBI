/**
 * Parses the multi-LLM chat response from /api/chat.
 *
 * The Flask backend's `ai_chat.py` returns:
 *   { content: string, charts?: ChartFence[], emails?: EmailFence[] }
 *
 * The `content` string sometimes still contains fenced code blocks
 * (```chart …``` / ```email …```) that the backend did *not* strip.
 * We split the rendered content into an ordered list of segments so
 * the UI can interleave chart/email cards with prose.
 */

export type ChatSegment =
  | { kind: "text"; text: string }
  | { kind: "chart"; payload: unknown; raw: string }
  | { kind: "email"; payload: unknown; raw: string }
  | { kind: "code"; lang: string; text: string }

const FENCE_RE = /```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g

export function parseChatContent(content: string): ChatSegment[] {
  const segments: ChatSegment[] = []
  let lastEnd = 0

  // FENCE_RE has /g state across invocations — create a fresh one each call.
  const re = new RegExp(FENCE_RE.source, "g")
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    const [full, lang, body] = m
    const start = m.index
    if (start > lastEnd) {
      const text = content.slice(lastEnd, start).trim()
      if (text) segments.push({ kind: "text", text })
    }
    const langKey = (lang || "").toLowerCase()
    if (langKey === "chart") {
      try {
        segments.push({ kind: "chart", payload: JSON.parse(body), raw: body })
      } catch {
        segments.push({ kind: "code", lang: "chart", text: body.trim() })
      }
    } else if (langKey === "email") {
      try {
        segments.push({ kind: "email", payload: JSON.parse(body), raw: body })
      } catch {
        // Sometimes "email" fences are plain text, not JSON.
        segments.push({
          kind: "email",
          payload: { body: body.trim() },
          raw: body,
        })
      }
    } else {
      segments.push({ kind: "code", lang: langKey, text: body.trim() })
    }
    lastEnd = start + full.length
  }

  if (lastEnd < content.length) {
    const tail = content.slice(lastEnd).trim()
    if (tail) segments.push({ kind: "text", text: tail })
  }

  if (segments.length === 0) {
    segments.push({ kind: "text", text: content })
  }

  return segments
}
