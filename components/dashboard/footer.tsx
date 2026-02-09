"use client"

export function DashboardFooter() {
  return (
    <footer className="border-t border-border mt-10 pt-6 pb-8 text-center">
      <p className="text-[0.7rem] text-muted-foreground tracking-wide">
        <strong className="text-rr-dark">ROLLS-ROYCE</strong> CIVIL AEROSPACE
        &mdash; Statement of Account Dashboard
      </p>
      <p className="text-[0.65rem] text-muted-foreground mt-1">
        Data sourced from uploaded workbook(s) &bull; For internal use only
      </p>
    </footer>
  )
}
