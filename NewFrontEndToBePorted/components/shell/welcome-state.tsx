"use client"

import { useRef } from "react"
import { Plane, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

interface WelcomeStateProps {
  /** Receives the files the user picked. Same shape as the sidebar's upload handler. */
  onUpload: (files: FileList | null) => void | Promise<void>
}

export function WelcomeState({ onUpload }: WelcomeStateProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  function openPicker() {
    inputRef.current?.click()
  }

  return (
    <div className="flex flex-col items-center text-center gap-10 py-16 px-6 max-w-5xl mx-auto">
      <div className="relative">
        <div className="flex h-32 w-32 items-center justify-center rounded-full bg-primary/8 border border-primary/15 ring-8 ring-primary/5">
          <Plane className="h-14 w-14 text-primary" aria-hidden="true" />
        </div>
        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-accent animate-pulse" aria-hidden="true" />
      </div>

      <div className="flex flex-col gap-3 max-w-2xl">
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-foreground/80">
          Rolls-Royce Civil Aerospace
        </span>
        <h1 className="font-display text-4xl font-semibold tracking-tight text-balance">
          Welcome to the Data Visualizer
        </h1>
        <p className="text-base text-muted-foreground leading-relaxed text-pretty">
          Upload the necessary documents.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button
          size="lg"
          onClick={openPicker}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Upload Workbook(s)
          <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xlsx,.xls,.xlsb,.xlsm,.pptx"
          className="hidden"
          onChange={(e) => {
            const picked = e.currentTarget.files
            if (picked && picked.length > 0) {
              void onUpload(picked)
            }
            // Reset so picking the same file again still fires onChange.
            if (inputRef.current) inputRef.current.value = ""
          }}
        />
      </div>
    </div>
  )
}
