"use client"

export function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-gradient-to-r from-rr-navy to-rr-blue2 text-card px-5 py-2.5 rounded-lg font-bold text-sm tracking-wide shadow-sm mt-8 mb-4">
      {children}
    </div>
  )
}
