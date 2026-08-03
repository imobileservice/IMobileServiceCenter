import { buildLabelSheetHtml, type LabelProduct, type PrintMode } from './label-sheet'

/**
 * Sends barcode stickers to the printer straight from the current page.
 *
 * The job is written into an off-screen same-origin iframe instead of a popup
 * window. A popup lives at about:blank, and Chrome stamps that URL - plus the
 * date, the tab title and "1/1" - into the print header/footer, which is the
 * junk text staff were seeing printed across the sticker roll. An iframe also
 * needs no popup permission and works under Chrome's --kiosk-printing flag,
 * so one click can go straight to the printer with no dialog at all.
 *
 * The label geometry itself lives in label-sheet.ts - this only handles delivery.
 */
export const printLabels = (items: LabelProduct[], mode: PrintMode = 'thermal'): boolean => {
  if (typeof window === 'undefined') return false

  const printable = items.filter(p => p && p.barcode)
  if (printable.length === 0) return false

  const html = buildLabelSheetHtml(printable, mode)

  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.setAttribute('title', 'Barcode labels')
  // Off-screen rather than hidden: a frame with no layout box can print blank.
  frame.style.cssText =
    'position:fixed;left:-10000px;top:0;width:420px;height:600px;border:0;opacity:0;pointer-events:none;'

  let done = false
  const cleanup = () => {
    if (done) return
    done = true
    // Give the spooler a moment before tearing the document down.
    setTimeout(() => {
      try { frame.remove() } catch { /* already gone */ }
    }, 1000)
  }

  frame.onload = () => {
    const win = frame.contentWindow
    if (!win) { cleanup(); return }

    win.onafterprint = cleanup

    // One frame of layout so the barcode SVGs are measured before printing.
    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          win.focus()
          win.print()
        } catch { /* window torn down mid-print */ }
        // Fallback for browsers that never fire afterprint (and for kiosk mode,
        // where print() returns immediately).
        setTimeout(cleanup, 60000)
      }, 60)
    })
  }

  try {
    document.body.appendChild(frame)
    frame.srcdoc = html
    return true
  } catch {
    try { frame.remove() } catch { /* noop */ }
    // Last resort: the old popup path.
    const win = window.open('', '_blank', 'width=800,height=600')
    if (!win) return false
    win.document.write(html)
    win.document.close()
    setTimeout(() => {
      try { win.focus(); win.print() } catch { /* noop */ }
    }, 400)
    return true
  }
}

/** Prints `copies` stickers for a single product. */
export const printLabelCopies = (
  product: LabelProduct,
  copies = 1,
  mode: PrintMode = 'thermal',
): boolean => {
  const n = Math.max(1, Math.min(200, Math.floor(copies) || 1))
  return printLabels(Array.from({ length: n }, () => product), mode)
}
