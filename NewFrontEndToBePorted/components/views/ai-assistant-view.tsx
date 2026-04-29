"use client"

import { useMemo, useState, useRef, useEffect } from "react"
import { Send, Sparkles, User, Bot, FileText, Lightbulb, AlertTriangle } from "lucide-react"
import type { UploadedFile, FileType } from "@/lib/types"
import { FILE_TYPE_LABELS, FILE_TYPE_BADGES } from "@/lib/file-type-meta"
import { chat, ApiError } from "@/lib/api"
import { parseChatContent, type ChatSegment } from "@/lib/parse-chat-fences"
import { ChartFence } from "@/components/shared/chart-fence"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty"

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  segments?: ChatSegment[]
  citation?: { label: string; filename: string }
  error?: boolean
}

const SUGGESTIONS_BY_TYPE: Record<FileType, string[]> = {
  SOA: [
    "Which sections are driving the most overdue balance?",
    "What share of the portfolio sits in the 90+ days bucket?",
    "Summarise aging and point out concentration risks.",
  ],
  INVOICE_LIST: [
    "What's the split between charges and credits?",
    "Are there any unusually large invoices we should flag?",
    "Summarise the currency mix and total invoiced.",
  ],
  OPPORTUNITY_TRACKER: [
    "Which programme holds the largest term benefit?",
    "What's in Hopper vs ICT vs Contract right now?",
    "Which customer has the biggest pipeline?",
  ],
  GLOBAL_HOPPER: [
    "Which region has the biggest CRP term benefit?",
    "Which pipeline stage holds the most value?",
    "Top 3 initiatives by 2026 profit.",
  ],
  SHOP_VISIT_HISTORY: [
    "Which operator has the most shop visits?",
    "Break down visits by SV type and location.",
    "How many engines are currently tracked?",
  ],
  SVRG_MASTER: [
    "How many events are qualified vs pending?",
    "What's the total credit value across all claims?",
    "Summarise the guarantee coverage mix.",
  ],
  COMMERCIAL_PLAN: [
    "Summarise total revenue and margin by region.",
    "What's the largest line item in the plan?",
    "Compare current quarter actuals to plan.",
  ],
  EMPLOYEE_WHEREABOUTS: [
    "Who's out of office today?",
    "Show coverage gaps by country.",
    "Summarise upcoming holidays this month.",
  ],
  UNKNOWN: ["Describe what this file appears to contain."],
  ERROR: ["Show me any parse errors on this file."],
}

type Props = { activeFile: UploadedFile | null }

export function AiAssistantView({ activeFile }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [thinking, setThinking] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const suggestions = useMemo(() => {
    if (!activeFile) return []
    return SUGGESTIONS_BY_TYPE[activeFile.file_type] ?? []
  }, [activeFile])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, thinking])

  async function ask(text: string) {
    const trimmed = text.trim()
    if (!trimmed || !activeFile) return
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
    }
    setMessages((m) => [...m, userMsg])
    setInput("")
    setThinking(true)

    try {
      const res = await chat(trimmed)
      const segments = parseChatContent(res.content || "")
      const extra: ChatSegment[] = []
      for (const c of res.charts ?? []) {
        extra.push({ kind: "chart", payload: c, raw: JSON.stringify(c) })
      }
      for (const e of res.emails ?? []) {
        extra.push({ kind: "email", payload: e, raw: JSON.stringify(e) })
      }
      setMessages((m) => [
        ...m,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: res.content || "",
          segments: [...segments, ...extra],
          citation: { label: FILE_TYPE_BADGES[activeFile.file_type], filename: activeFile.name },
        },
      ])
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.status === 400
            ? "No file is loaded on the backend yet — upload a workbook first."
            : err.message
          : err instanceof Error
            ? err.message
            : "Chat failed"
      setMessages((m) => [
        ...m,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: msg,
          segments: [{ kind: "text", text: msg }],
          error: true,
          citation: { label: FILE_TYPE_BADGES[activeFile.file_type], filename: activeFile.name },
        },
      ])
    } finally {
      setThinking(false)
    }
  }

  if (!activeFile) {
    return (
      <div className="p-6 lg:p-8">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No file loaded</EmptyTitle>
            <EmptyDescription>
              The assistant analyses the currently selected workbook. Upload a file
              from the sidebar to start a conversation.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <div className="px-6 lg:px-8 pt-6 pb-3 border-b border-border bg-muted/30 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground font-display">
              AI Assistant
            </h1>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider gap-1">
              <Sparkles className="h-3 w-3" />
              Beta
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Analysing{" "}
            <span className="font-medium text-foreground">{activeFile.name}</span>
            <span className="ml-2 text-xs uppercase tracking-wider text-muted-foreground">
              {FILE_TYPE_LABELS[activeFile.file_type]}
            </span>
          </p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 lg:px-8 py-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {messages.length === 0 && (
            <Card className="p-6 border-border bg-card">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Lightbulb className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-foreground">
                    Ask anything about this file
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground text-pretty">
                    The assistant has the parsed contents of your workbook in context.
                    Try one of the prompts tailored to this file type below.
                  </p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-1">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => ask(s)}
                        className="text-left rounded-md border border-border bg-background px-3.5 py-2.5 text-sm text-foreground hover:border-ring hover:bg-muted/50 transition"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {messages.map((m) => (
            <div key={m.id} className="flex gap-3">
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                  m.role === "user"
                    ? "bg-muted text-foreground"
                    : m.error
                      ? "bg-destructive/15 text-destructive"
                      : "bg-primary/10 text-primary"
                }`}
              >
                {m.role === "user" ? (
                  <User className="h-4 w-4" />
                ) : m.error ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {m.role === "user" ? "You" : m.error ? "Assistant · Error" : "Assistant"}
                </div>
                <div className="mt-1 space-y-3 text-sm text-foreground leading-relaxed">
                  {(m.segments ?? [{ kind: "text", text: m.content } as ChatSegment]).map((seg, i) => {
                    if (seg.kind === "text") {
                      return (
                        <p key={i} className="whitespace-pre-wrap">
                          {seg.text}
                        </p>
                      )
                    }
                    if (seg.kind === "chart") {
                      return (
                        <ChartFence
                          key={i}
                          payload={seg.payload}
                          filenameHint={activeFile.name.replace(/\.[^.]+$/, "")}
                        />
                      )
                    }
                    if (seg.kind === "email") {
                      const p = seg.payload as { to?: string; subject?: string; body?: string }
                      return (
                        <div
                          key={i}
                          className="rounded-md border border-accent/40 bg-accent/5 p-3 space-y-1"
                        >
                          <div className="text-[11px] uppercase tracking-wider text-accent-foreground font-semibold">
                            Drafted email
                          </div>
                          {p.to && (
                            <div className="text-xs">
                              <span className="text-muted-foreground">To: </span>
                              {p.to}
                            </div>
                          )}
                          {p.subject && (
                            <div className="text-xs">
                              <span className="text-muted-foreground">Subject: </span>
                              {p.subject}
                            </div>
                          )}
                          {p.body && (
                            <pre className="whitespace-pre-wrap text-xs text-foreground/85">
                              {p.body}
                            </pre>
                          )}
                        </div>
                      )
                    }
                    return (
                      <pre
                        key={i}
                        className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-[11px]"
                      >
                        {seg.text}
                      </pre>
                    )
                  })}
                </div>
                {m.citation && (
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground">
                    <FileText className="h-3 w-3" />
                    <span className="font-medium text-foreground">{m.citation.filename}</span>
                    <span>·</span>
                    <span>{m.citation.label}</span>
                  </div>
                )}
              </div>
            </div>
          ))}

          {thinking && (
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 bg-primary/10 text-primary">
                <Bot className="h-4 w-4" />
              </div>
              <div className="flex items-center gap-2 pt-1.5 text-sm text-muted-foreground">
                <Spinner className="h-3.5 w-3.5" />
                Analysing workbook…
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border bg-muted/30 px-6 lg:px-8 py-4">
        <div className="mx-auto max-w-3xl">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              ask(input)
            }}
            className="relative"
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about figures, trends or specific rows…"
              rows={2}
              className="resize-none pr-14 bg-background"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  ask(input)
                }
              }}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || thinking}
              className="absolute right-2 bottom-2 h-9 w-9"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Enter to send, Shift+Enter for a new line. Responses reference the currently
            loaded workbook only.
          </p>
        </div>
      </div>
    </div>
  )
}
