/**
 * Per-chart download utility.
 *
 * Captures a DOM node (typically a ChartCard's root element) as a PNG
 * data URL using html-to-image, then either downloads it directly or
 * embeds it into a single-page PDF via jsPDF.
 *
 * Uses dynamic imports so the html-to-image and jspdf bundles are only
 * pulled in when the user actually clicks a download menu item.
 */

const SAFE_FILENAME_RE = /[^a-z0-9_\-\.]+/gi

function safeFilename(input: string, ext: string): string {
  const base = (input || "chart").replace(SAFE_FILENAME_RE, "_").replace(/_+/g, "_")
  const trimmed = base.replace(/^_+|_+$/g, "") || "chart"
  return `${trimmed}.${ext}`
}

function triggerDownload(href: string, filename: string) {
  const a = document.createElement("a")
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

interface CaptureOptions {
  /** Background colour for the captured image. Default: read --card from CSS. */
  background?: string
  /** Pixel ratio. Default 2 for retina-quality export. */
  pixelRatio?: number
}

async function captureNodeToDataUrl(
  node: HTMLElement,
  opts: CaptureOptions = {},
): Promise<string> {
  const { toPng } = await import("html-to-image")
  const bg =
    opts.background ??
    getComputedStyle(document.documentElement).getPropertyValue("--card") ??
    "#ffffff"
  return await toPng(node, {
    pixelRatio: opts.pixelRatio ?? 2,
    backgroundColor: bg.trim() || "#ffffff",
    cacheBust: true,
    // Skip any element marked data-ignore-export — used for the download
    // menu itself so it doesn't leak into the screenshot.
    filter: (n) => {
      if (!(n instanceof HTMLElement)) return true
      return n.dataset.ignoreExport !== "true"
    },
  })
}

export async function exportChartAsPng(
  node: HTMLElement | null,
  filename: string,
): Promise<void> {
  if (!node) throw new Error("No chart node to export")
  const dataUrl = await captureNodeToDataUrl(node)
  triggerDownload(dataUrl, safeFilename(filename, "png"))
}

export async function exportChartAsPdf(
  node: HTMLElement | null,
  filename: string,
): Promise<void> {
  if (!node) throw new Error("No chart node to export")
  const dataUrl = await captureNodeToDataUrl(node)

  const { jsPDF } = await import("jspdf")

  // Probe the captured image's intrinsic size so we can size the PDF to it.
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = (e) => reject(e instanceof Error ? e : new Error("Image load failed"))
    img.src = dataUrl
  })

  // jsPDF works in points by default. We map captured pixels to points
  // 1:1 because the captured pixelRatio=2 already gives us crisp output;
  // PDF readers will scale this comfortably.
  const widthPt = img.width / 2
  const heightPt = img.height / 2
  const pdf = new jsPDF({
    orientation: widthPt >= heightPt ? "landscape" : "portrait",
    unit: "pt",
    format: [widthPt, heightPt],
  })
  pdf.addImage(dataUrl, "PNG", 0, 0, widthPt, heightPt)
  pdf.save(safeFilename(filename, "pdf"))
}
