import { buildLabelSheetHtml, type LabelProduct, type PrintMode } from './label-sheet'

/**
 * Sends barcode stickers to the printer.
 *
 * A dedicated top-level window is used rather than a hidden iframe: only a real
 * document gets its own @page box applied predictably, and the setup card in the
 * printed document stays visible behind the print dialog so staff can see why a
 * sticker came out wrong. An iframe is kept as the fallback for blocked popups.
 *
 * Note: the date / title / URL / "1/1" text around the sticker is drawn by
 * Chrome itself, not by this document. No web page can switch it off - it goes
 * away when the print dialog has Margins: None and "Headers and footers" is
 * unticked, which Chrome then remembers for that printer.
 */
export const printLabels = (items: LabelProduct[], mode: PrintMode = 'thermal'): boolean => {
  if (typeof window === 'undefined') return false

  const printable = items.filter(p => p && p.barcode)
  if (printable.length === 0) return false

  const html = buildLabelSheetHtml(printable, mode)

  const win = window.open('', '_blank', 'width=760,height=620')
  if (win) {
    win.document.open()
    win.document.write(html)
    win.document.close()

    let sent = false
    const send = () => {
      if (sent) return
      sent = true
      try {
        win.focus()
        win.print()
      } catch { /* window closed early */ }
    }
    win.onload = send
    // document.write windows do not always fire onload.
    setTimeout(send, 700)
    return true
  }

  return printViaIframe(html)
}

/** Popup-blocked fallback: same document, printed from an off-screen frame. */
const printViaIframe = (html: string): boolean => {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  // Off-screen rather than hidden: a frame with no layout box can print blank.
  frame.style.cssText =
    'position:fixed;left:-10000px;top:0;width:420px;height:600px;border:0;opacity:0;pointer-events:none;'

  let done = false
  const cleanup = () => {
    if (done) return
    done = true
    setTimeout(() => { try { frame.remove() } catch { /* already gone */ } }, 1000)
  }

  frame.onload = () => {
    const w = frame.contentWindow
    if (!w) { cleanup(); return }
    w.onafterprint = cleanup
    setTimeout(() => {
      try { w.focus(); w.print() } catch { /* torn down */ }
      setTimeout(cleanup, 60000)
    }, 120)
  }

  try {
    document.body.appendChild(frame)
    frame.srcdoc = html
    return true
  } catch {
    try { frame.remove() } catch { /* noop */ }
    return false
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
