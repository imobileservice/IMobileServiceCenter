/**
 * QR codes, generated in the browser.
 *
 * No API and no image service: qrcode-generator is a zero-dependency encoder,
 * so a code costs nothing, works offline, and never sends the thing being
 * encoded to somebody else's server - which matters when what we encode is a
 * login link.
 *
 * It hands back a grid of dark/light modules. Everything below turns that one
 * grid into either an SVG path (for the screen) or canvas rectangles (for the
 * downloadable image), so both come out of exactly the same code.
 */

import qrcode from "qrcode-generator"

export interface QrMatrix {
  /** Modules per side, including the quiet zone we add ourselves. */
  size: number
  isDark: (row: number, col: number) => boolean
}

/**
 * @param errorCorrection Higher levels survive more damage at the cost of a
 * denser code. "M" is the usual choice for a link printed on paper.
 */
export const makeQr = (text: string, errorCorrection: "L" | "M" | "Q" | "H" = "M"): QrMatrix => {
  // Type 0 asks the encoder to pick the smallest version the text fits into.
  const qr = qrcode(0, errorCorrection)
  qr.addData(text)
  qr.make()

  const size = qr.getModuleCount()
  return { size, isDark: (row, col) => qr.isDark(row, col) }
}

/**
 * The dark modules as one SVG path, in a viewBox of `size + 2 * margin` units.
 *
 * One path rather than a rect per module: a code is often 30+ modules a side,
 * which is nearly a thousand DOM nodes drawn a dozen times a page otherwise.
 */
export const qrToPath = (qr: QrMatrix, margin = 2): string => {
  const parts: string[] = []
  for (let row = 0; row < qr.size; row++) {
    for (let col = 0; col < qr.size; col++) {
      if (qr.isDark(row, col)) parts.push(`M${col + margin} ${row + margin}h1v1h-1z`)
    }
  }
  return parts.join("")
}

export const qrViewBox = (qr: QrMatrix, margin = 2) => `0 0 ${qr.size + margin * 2} ${qr.size + margin * 2}`

/**
 * Paints the code into `size` pixels at (x, y), quiet zone included.
 *
 * Module edges are rounded to whole pixels: a scanner reads contrast, and a
 * half-pixel of grey along every edge is exactly what it struggles with.
 */
export const drawQrOnCanvas = (
  ctx: CanvasRenderingContext2D,
  qr: QrMatrix,
  x: number,
  y: number,
  size: number,
  { margin = 2, color = "#000000" }: { margin?: number; color?: string } = {}
) => {
  const units = qr.size + margin * 2
  const unit = size / units

  ctx.fillStyle = color
  for (let row = 0; row < qr.size; row++) {
    for (let col = 0; col < qr.size; col++) {
      if (!qr.isDark(row, col)) continue
      const left = Math.round(x + (col + margin) * unit)
      const top = Math.round(y + (row + margin) * unit)
      const right = Math.round(x + (col + margin + 1) * unit)
      const bottom = Math.round(y + (row + margin + 1) * unit)
      ctx.fillRect(left, top, right - left, bottom - top)
    }
  }
}
