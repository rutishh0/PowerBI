"use client"

export function DashboardHeader() {
  return (
    <header className="bg-gradient-to-r from-rr-navy to-rr-dark rounded-xl px-8 py-6 flex items-center justify-between shadow-[0_6px_24px_rgba(16,6,159,0.30)]">
      <div>
        <h1 className="text-card text-2xl font-bold tracking-wide">
          Statement of Account Dashboard
        </h1>
        <p className="text-rr-silver text-sm mt-1 font-normal">
          Rolls-Royce Civil Aerospace &mdash; Finance &amp; Receivables
        </p>
      </div>
      <div className="hidden sm:flex items-center gap-4">
        <div className="text-card text-sm font-bold tracking-[3px] uppercase border-2 border-card/60 px-4 py-1.5 rounded">
          ROLLS-ROYCE
        </div>
      </div>
    </header>
  )
}
