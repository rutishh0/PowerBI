"use client"

import { Plane, Zap, BarChart3, Link2, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

interface WelcomeStateProps {
  onUpload: () => void
}

export function WelcomeState({ onUpload }: WelcomeStateProps) {
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
          Upload customer Statements of Account, Invoice Lists, MEA Opportunity Trackers, Global Commercial
          Optimisation Hopper workbooks, Trent Shop Visit History, or SVRG Master files. The universal parser
          detects the format and renders the right KPIs, charts and registers.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button size="lg" onClick={onUpload} className="bg-primary text-primary-foreground hover:bg-primary/90">
          Upload Workbook(s)
          <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3 w-full mt-4">
        <FeatureCard
          icon={Zap}
          title="Smart Detection"
          description="Automatically identifies SOA, Invoice Lists, Opportunity Trackers, Shop Visits, SVRG and Global Hopper files."
        />
        <FeatureCard
          icon={BarChart3}
          title="Rich Analytics"
          description="Interactive charts, KPI cards, aging analysis, pipeline views and engine timelines at a glance."
        />
        <FeatureCard
          icon={Link2}
          title="Cross-File Linking"
          description="Upload multiple files to discover shared references, customers and invoice links across datasets."
        />
      </div>
    </div>
  )
}

function FeatureCard({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="group flex flex-col gap-2 rounded-lg border border-border bg-card p-5 text-left hover:border-accent/40 transition-colors">
      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/8 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <h3 className="font-display text-sm font-semibold tracking-tight mt-1">{title}</h3>
      <p className="text-xs text-muted-foreground leading-relaxed text-pretty">{description}</p>
    </div>
  )
}
