import type { Metadata, Viewport } from "next"
import { DM_Sans, Plus_Jakarta_Sans } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
})

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Rolls-Royce Civil Aerospace — Data Visualizer",
  description:
    "Internal finance and receivables dashboard for Rolls-Royce Civil Aerospace. Upload and analyse SOAs, Invoice Lists, MEA Opportunity Trackers, Global Hopper, Shop Visit History, and SVRG Master workbooks.",
  generator: "v0.app",
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: "#0B1836",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${jakarta.variable} bg-background`}>
      <body className="font-sans antialiased">
        {children}
        <Toaster richColors position="bottom-right" />
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  )
}
