import JsBarcode from 'jsbarcode'

export interface LabelProduct {
  id: string
  name: string
  barcode: string | null
  price?: number
}

export type PrintMode = 'thermal' | 'a4'

/** Physical sticker size on the thermal roll (Xprinter XP-365B, 203 dpi). */
export const LABEL_W_MM = 38
export const LABEL_H_MM = 25

/**
 * The drawn content is kept a hair inside the physical sticker so that normal
 * feed/alignment drift on the thermal printer cannot clip the bars at an edge.
 * (This is tolerance only - it is not what causes blank stickers; a page-sized
 * block does not emit extra pages. See scripts/label-check.)
 */
export const LABEL_SAFE_W_MM = 37.4
export const LABEL_SAFE_H_MM = 24.4

/** Bounding box for the bar block, kept inside the safe area. */
export const BARCODE_W_MM = 31
export const BARCODE_H_MM = 10

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Renders a real, scannable CODE128 bar block as standalone SVG markup. */
export const buildBarcodeSvg = (value: string): string => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  try {
    JsBarcode(svg, value, {
      format: 'CODE128',
      displayValue: false,
      width: 2,
      height: 60,
      margin: 0,
      background: '#ffffff',
      lineColor: '#000000',
      xmlDocument: document,
    })
  } catch {
    return ''
  }
  return new XMLSerializer().serializeToString(svg)
}

/**
 * Builds the complete print document. One sticker per page in thermal mode.
 *
 * Whitespace between the label elements is deliberately absent: stray text nodes
 * between page-sized blocks can add a line box and push an empty page out.
 */
export const buildLabelSheetHtml = (items: LabelProduct[], mode: PrintMode): string => {
  const isA4 = mode === 'a4'

  // Build each distinct bar block once, then reuse it for every copy.
  const svgCache: Record<string, string> = {}
  items.forEach(p => {
    const code = p.barcode || ''
    if (code && svgCache[code] === undefined) svgCache[code] = buildBarcodeSvg(code)
  })

  const pageStyle = isA4
    ? `@page { size: A4 portrait; margin: 5mm; }`
    : `@page { size: ${LABEL_W_MM}mm ${LABEL_H_MM}mm; margin: 0; }`

  const labelsHtml = items.map((prod, i) => {
    const isDisplay = prod.name?.toLowerCase().includes('display')
    // Thermal: every sticker is its own page so the printer feeds them one by one.
    // The break goes on all but the last label, otherwise the job ends with a blank page.
    const cls = `label${!isA4 && i < items.length - 1 ? ' brk' : ''}${isA4 ? ' cut' : ''}`

    const priceHtml = !isDisplay && prod.price !== undefined
      ? `<p class="price">Rs. ${prod.price.toLocaleString()}</p>`
      : ''
    const taglineHtml = isDisplay ? `<p class="tagline">Display Part</p>` : ''

    return `<div class="${cls}"><div class="inner">` +
      `<p class="shop">${isDisplay ? 'imobileservicecenter.lk' : 'IMobile Service &amp; Repair Center'}</p>` +
      `<div class="bars">${svgCache[prod.barcode || ''] || ''}</div>` +
      `<p class="code">${esc(prod.barcode || '')}</p>` +
      `<p class="name">${esc(prod.name || '')}</p>` +
      priceHtml + taglineHtml +
      `</div></div>`
  }).join('')

  const gridStyle = isA4
    ? `display:flex;flex-wrap:wrap;align-items:flex-start;align-content:flex-start;gap:0;padding:0;margin:0;`
    : `display:block;`

  // Shown only on screen (never printed) so staff who cancel the dialog see why.
  const setupHtml = isA4 ? '' : `<div class="setup">
<b>Printer settings for these stickers</b>
<ol>
<li><b>Destination:</b> XP-365B (not Save as PDF)</li>
<li><b>Paper size:</b> the ${LABEL_W_MM} x ${LABEL_H_MM} mm label stock</li>
<li><b>Margins:</b> None &nbsp; <b>Scale:</b> Default / 100%</li>
</ol>
<p>If the preview shows a big page with a date, a title, <i>about:blank</i> or <i>1/1</i>
around the sticker, the paper size above is still wrong - fix it and those disappear.</p>
</div>`

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Barcode Labels — IMobile</title>
<style>
${pageStyle}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  width: 100%;
  background: #fff;
  font-family: Arial, Helvetica, sans-serif;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
/* Screen-only helper. @media print keeps it out of the printed sticker entirely. */
.setup {
  font-size: 13px; line-height: 1.5; color: #111;
  border: 1px solid #bbb; border-radius: 6px;
  padding: 10px 14px; margin: 0 0 14px; max-width: 460px;
  font-family: Arial, Helvetica, sans-serif;
}
.setup ol { margin: 6px 0 6px 18px; }
.setup p { margin-top: 6px; color: #444; }
@media print { .setup { display: none !important; } }
.grid { ${gridStyle} }
.label {
  width: ${LABEL_W_MM}mm;
  height: ${LABEL_H_MM}mm;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
/* Forces the page break without letting the break itself create an extra sheet. */
.brk { page-break-after: always; break-after: page; }
.cut { border: 0.1mm dashed #ccc; }
.inner {
  width: ${LABEL_SAFE_W_MM}mm;
  height: ${LABEL_SAFE_H_MM}mm;
  background: #fff;
  color: #000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.shop {
  font-size: 5pt; font-weight: 800; line-height: 1.1;
  text-align: center; width: 100%;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.bars { line-height: 0; margin: 0.8mm 0 0; }
/* Bounding box for the bars. JsBarcode emits a viewBox, so the SVG scales to
   fit this box without distortion no matter how long the code is. */
.bars svg {
  display: block;
  width: ${BARCODE_W_MM}mm !important;
  height: ${BARCODE_H_MM}mm !important;
}
.code {
  font-size: 7.5pt; font-weight: 900; letter-spacing: 0.12em;
  font-family: "Courier New", monospace;
  line-height: 1; margin: 0.6mm 0 0; text-align: center;
}
.name {
  font-size: 5pt; font-weight: 700; line-height: 1.1;
  margin: 0.8mm 0 0; text-align: center;
  max-width: 100%;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.price { font-size: 5.5pt; font-weight: 800; line-height: 1; margin: 0.5mm 0 0; }
.tagline { font-size: 4pt; font-weight: 600; line-height: 1; margin: 0.5mm 0 0; color: #555; }
</style>
</head>
<body>${setupHtml}<div class="grid">${labelsHtml}</div></body>
</html>`
}
