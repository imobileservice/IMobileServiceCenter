/**
 * The shop-portal login card, drawn as an image.
 *
 * Drawn on a canvas rather than screenshotted from the page: the admin screen
 * follows whatever theme the office is in, and a shop should not be handed a
 * dark-mode picture of their own password. This always comes out the same.
 */

import { drawQrOnCanvas, makeQr } from "./qr-code"

export interface LoginCardInput {
  shopName: string
  portalUrl: string
  email: string
  password: string | null
}

/**
 * What the QR carries: the login address, and nothing else.
 *
 * Do not put the email or password in here. It was tried, and scanners treat a
 * URL followed by any other text as one long URL - the code resolved to
 * ".../supplier/login Email: ... Password: ...", which opens nothing. A QR is a
 * door, not a note; the credentials are printed underneath it for reading.
 */
export const buildLoginQrPayload = ({ portalUrl }: { portalUrl: string }) => portalUrl

const WIDTH = 720
const PADDING = 48
const INK = "#0f172a"
const MUTED = "#64748b"
const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

/** Wraps `text` to `maxWidth`, breaking on spaces and then, if it must, mid-word. */
export const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
  const lines: string[] = []
  let line = ""

  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (ctx.measureText(word).width <= maxWidth) {
      if (!line) line = word
      else if (ctx.measureText(`${line} ${word}`).width <= maxWidth) line = `${line} ${word}`
      else {
        lines.push(line)
        line = word
      }
      continue
    }

    // A URL has no spaces to break on and still has to fit the card.
    if (line) {
      lines.push(line)
      line = ""
    }
    let piece = ""
    for (const char of word) {
      if (piece && ctx.measureText(piece + char).width > maxWidth) {
        lines.push(piece)
        piece = char
      } else {
        piece += char
      }
    }
    line = piece
  }

  if (line) lines.push(line)
  return lines
}

/**
 * A value on one line, shrunk to fit rather than wrapped - an email split over
 * two lines is an email somebody retypes wrong.
 */
const drawFittedValue = (ctx: CanvasRenderingContext2D, value: string, x: number, y: number, maxWidth: number) => {
  let size = 26
  ctx.font = `700 ${size}px ${MONO}`
  while (size > 13 && ctx.measureText(value).width > maxWidth) {
    size -= 1
    ctx.font = `700 ${size}px ${MONO}`
  }
  ctx.fillText(value, x, y)
}

/** Renders the card and hands back a PNG blob ready to save. */
export const buildLoginCardBlob = async (input: LoginCardInput): Promise<Blob> => {
  const measure = document.createElement("canvas").getContext("2d")
  if (!measure) throw new Error("This browser cannot draw the card")

  const contentWidth = WIDTH - PADDING * 2
  const qrSize = 340
  const qr = makeQr(buildLoginQrPayload(input), "M")

  measure.font = `700 30px ${SANS}`
  const nameLines = wrapText(measure, input.shopName || "Shop", contentWidth).slice(0, 2)
  measure.font = `600 19px ${SANS}`
  const urlLines = wrapText(measure, input.portalUrl, contentWidth)

  const headerHeight = 116
  const nameBlock = nameLines.length * 40
  const urlBlock = urlLines.length * 26
  const fieldsBlock = 170
  const height = headerHeight + 30 + nameBlock + 20 + qrSize + 30 + urlBlock + 34 + fieldsBlock + 44

  const scale = 2
  const canvas = document.createElement("canvas")
  canvas.width = WIDTH * scale
  canvas.height = height * scale
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("This browser cannot draw the card")
  ctx.scale(scale, scale)

  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, WIDTH, height)

  ctx.fillStyle = INK
  ctx.fillRect(0, 0, WIDTH, headerHeight)
  ctx.textAlign = "center"
  ctx.fillStyle = "#ffffff"
  ctx.font = `800 30px ${SANS}`
  ctx.fillText("IMobile Service Center", WIDTH / 2, 52)
  ctx.fillStyle = "#94a3b8"
  ctx.font = `600 17px ${SANS}`
  ctx.fillText("Shop portal login", WIDTH / 2, 84)

  let y = headerHeight + 30

  ctx.fillStyle = INK
  ctx.font = `700 30px ${SANS}`
  for (const line of nameLines) {
    y += 32
    ctx.fillText(line, WIDTH / 2, y)
    y += 8
  }

  y += 20
  drawQrOnCanvas(ctx, qr, (WIDTH - qrSize) / 2, y, qrSize, { color: INK })
  y += qrSize + 10

  ctx.fillStyle = MUTED
  ctx.font = `600 15px ${SANS}`
  ctx.fillText("Scan to open the portal", WIDTH / 2, y)
  y += 20

  ctx.fillStyle = INK
  ctx.font = `600 19px ${SANS}`
  for (const line of urlLines) {
    y += 20
    ctx.fillText(line, WIDTH / 2, y)
    y += 6
  }

  y += 28
  ctx.strokeStyle = "#e2e8f0"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PADDING, y + 0.5)
  ctx.lineTo(WIDTH - PADDING, y + 0.5)
  ctx.stroke()

  ctx.textAlign = "left"
  const field = (label: string, value: string, top: number) => {
    ctx.fillStyle = MUTED
    ctx.font = `700 13px ${SANS}`
    ctx.fillText(label.toUpperCase(), PADDING, top)
    ctx.fillStyle = INK
    drawFittedValue(ctx, value, PADDING, top + 34, contentWidth)
  }

  field("Email", input.email || "—", y + 38)
  field("Password", input.password || "ask us for your password", y + 116)

  ctx.textAlign = "center"
  ctx.fillStyle = MUTED
  ctx.font = `500 14px ${SANS}`
  ctx.fillText("Please keep this password private.", WIDTH / 2, height - 20)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
  if (!blob) throw new Error("Could not build the image")
  return blob
}

/**
 * Puts an image on the clipboard, so it can be pasted straight into a chat.
 *
 * The desktop route for sending the card: WhatsApp Web takes a Ctrl+V. False
 * when the browser has no clipboard-image support, when the page is not the
 * focused document, or when the user has refused permission - all of which the
 * caller handles by saving the file instead.
 */
export const copyImageToClipboard = async (blob: Blob): Promise<boolean> => {
  try {
    if (!navigator.clipboard || typeof ClipboardItem === "undefined") return false

    /*
     * Raced against a clock because the write does not always settle: a browser
     * waiting on a clipboard permission the user never answers leaves the
     * promise pending forever, and the button that called this would sit on
     * "Preparing..." with no way out. Giving up hands the caller its own
     * fallback instead.
     */
    const write = navigator.clipboard
      .write([new ClipboardItem({ [blob.type || "image/png"]: blob })])
      .then(() => true)
      .catch(() => false)

    return await Promise.race([
      write,
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2500)),
    ])
  } catch {
    return false
  }
}

/** Saves a blob under `filename` using a link the page clicks for the user. */
export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoked a beat later: Safari cancels the save if the URL dies immediately.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
