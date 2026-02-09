"use client"

import { Upload, BarChart3, Shield, Plane } from "lucide-react"

export function WelcomeScreen() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="bg-card rounded-2xl p-10 text-center max-w-xl shadow-sm border border-border">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-rr-navy/10 flex items-center justify-center mb-6">
          <Plane className="h-8 w-8 text-rr-navy" />
        </div>
        <h2 className="text-rr-navy text-xl font-bold mb-2 text-balance">
          Welcome to the RR SOA Dashboard
        </h2>
        <p className="text-muted-foreground text-sm leading-relaxed mb-8 text-pretty">
          Upload any Rolls-Royce Statement of Account workbook. The dashboard
          automatically detects sections like <strong>TotalCare</strong>,{" "}
          <strong>CRC Payments</strong>, <strong>Spare Parts</strong>,{" "}
          <strong>Late Payment Interest</strong>, and more &mdash; regardless
          of layout variations.
        </p>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="space-y-2">
            <div className="mx-auto h-10 w-10 rounded-xl bg-rr-navy/5 flex items-center justify-center">
              <Upload className="h-5 w-5 text-rr-navy" />
            </div>
            <p className="text-[0.7rem] font-medium text-muted-foreground">
              Upload .xlsx files
            </p>
          </div>
          <div className="space-y-2">
            <div className="mx-auto h-10 w-10 rounded-xl bg-rr-navy/5 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-rr-navy" />
            </div>
            <p className="text-[0.7rem] font-medium text-muted-foreground">
              Instant analytics
            </p>
          </div>
          <div className="space-y-2">
            <div className="mx-auto h-10 w-10 rounded-xl bg-rr-navy/5 flex items-center justify-center">
              <Shield className="h-5 w-5 text-rr-navy" />
            </div>
            <p className="text-[0.7rem] font-medium text-muted-foreground">
              Multi-file comparison
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
