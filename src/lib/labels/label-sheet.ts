import JsBarcode from 'jsbarcode'

export interface LabelProduct {
  id: string
  name: string
  barcode: string | null
  price?: number
  /**
   * Brand and the model already baked into `name`. Both are needed to swap in a
   * different compatible model when a sticker is printed for one specific phone
   * ("Redmi Note 8 Display" -> "Redmi Note 9S Display"). The BARCODE never
   * changes with the model - it identifies the physical product, so all of those
   * stickers scan to the same SKU and the same single stock pool.
   */
  brand?: string
  model?: string
}

/**
 * The sticker text for one compatible phone model.
 *
 * Mirrors how the product form auto-generates a name (brand + model + part), so
 * a per-model sticker reads exactly like a normal one:
 *
 *   name "Redmi Note 8 Display", brand "Redmi", model "Note 8"
 *     + "Note 9S"  ->  "Redmi Note 9S Display"
 *
 * The part word is whatever remains after the brand and the current model are
 * removed, which keeps qualifiers like "Incell" or "W/F" on the label.
 */
export const composeModelLabelName = (product: LabelProduct, modelName: string): string => {
  const model = (modelName || '').trim()
  if (!model) return product.name

  const brand = (product.brand || '').trim()
  let part = (product.name || '').trim()

  // Strip a leading brand ("Redmi Note 8 Display" -> "Note 8 Display")
  if (brand && part.toLowerCase().startsWith(brand.toLowerCase())) {
    part = part.slice(brand.length).trim()
  }

  // Strip the model this product was named after, wherever it sits
  const baseModel = (product.model || '').trim()
  if (baseModel) {
    const index = part.toLowerCase().indexOf(baseModel.toLowerCase())
    if (index !== -1) {
      part = (part.slice(0, index) + part.slice(index + baseModel.length)).trim()
    }
  }

  part = part.replace(/\s+/g, ' ').trim()

  // A model name that already carries its brand ("Xiaomi Redmi Note 8") must not
  // get the brand a second time.
  const modelHasBrand = brand && model.toLowerCase().startsWith(brand.toLowerCase())
  const prefix = modelHasBrand ? model : [brand, model].filter(Boolean).join(' ')

  return [prefix, part].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * Type size for the name line, chosen from its length.
 *
 * The line is 37.4mm wide: about 31 characters at 6.5pt and 37 at 5.5pt. Past
 * that the name wraps to two lines instead of being silently cut off with an
 * ellipsis, which is what used to happen to the longer multi-model names.
 * Two 5.5pt lines add ~1.8mm and the layout has ~2.8mm of headroom.
 */
export const NAME_ONE_LINE_MAX = 30
export const NAME_SMALL_MAX = 36

export const nameSizeClass = (name: string): string => {
  const length = (name || '').length
  if (length <= NAME_ONE_LINE_MAX) return ''
  if (length <= NAME_SMALL_MAX) return ' sm'
  return ' sm wrap'
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

/**
 * Bounding box for the bar block, kept inside the safe area.
 *
 * 9mm rather than 10: the extra millimetre goes to the shop name and product
 * name, which were too small to read once printed. CODE128 scans reliably well
 * below this height - the bar WIDTH is what a scanner needs, not the height.
 */
export const BARCODE_W_MM = 31
export const BARCODE_H_MM = 9

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
      `<p class="shop${isDisplay ? '' : ' long'}">${isDisplay ? 'imobileservicecenter.lk' : 'IMobile Service &amp; Repair Center'}</p>` +
      `<div class="bars">${svgCache[prod.barcode || ''] || ''}</div>` +
      `<p class="code">${esc(prod.barcode || '')}</p>` +
      `<p class="name${nameSizeClass(prod.name || '')}">${esc(prod.name || '')}</p>` +
      priceHtml + taglineHtml +
      `</div></div>`
  }).join('')

  const gridStyle = isA4
    ? `display:flex;flex-wrap:wrap;align-items:flex-start;align-content:flex-start;gap:0;padding:0;margin:0;`
    : `display:block;`

  // Shown only on screen (never printed) so staff who cancel the dialog see why.
  const setupHtml = isA4 ? '' : `<div class="setup">
<b>One sticker per label? Set these in the print dialog once.</b>
<p class="why">A date, a title, a web address or <i>1/1</i> around the sticker, or one label
spread over several stickers, always means the <b>paper size is still wrong</b>. Chrome draws
that text itself - the app cannot remove it, but the two settings below do.</p>
<ol>
<li><b>Destination:</b> XP-365B (not Save as PDF)</li>
<li>Click <b>More settings</b> to open the rest of this list</li>
<li><b>Paper size:</b> the ${LABEL_W_MM} x ${LABEL_H_MM} mm label stock</li>
<li><b>Margins:</b> None &nbsp; &nbsp; <b>Scale:</b> Default / 100%</li>
<li><b>Headers and footers:</b> untick it</li>
</ol>
<p class="win"><b>No ${LABEL_W_MM} x ${LABEL_H_MM} mm in the paper size list?</b> Add it in Windows first:
Settings &rsaquo; Printers &amp; scanners &rsaquo; <b>Xprinter XP-365B</b> &rsaquo; Printing preferences
&rsaquo; Page Setup &rsaquo; Paper Size &rsaquo; <b>New / Custom</b> - width ${LABEL_W_MM} mm, height
${LABEL_H_MM} mm - save it, set it as the default, then reopen this print window.</p>
<p class="keep">Chrome remembers all of this for the XP-365B, so it is a one-time job.</p>
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
  font-size: 13px; line-height: 1.55; color: #111;
  border: 2px solid #d33; border-radius: 8px;
  padding: 12px 16px; margin: 0 0 14px; max-width: 520px;
  font-family: Arial, Helvetica, sans-serif;
}
.setup > b { font-size: 14px; }
.setup ol { margin: 8px 0 8px 18px; }
.setup li { margin: 2px 0; }
.setup p { margin-top: 8px; color: #333; }
.setup .why { color: #a11; }
.setup .keep { color: #666; font-size: 12px; }
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
/* Type sizes below are set for a 203 dpi thermal head. Anything under ~6pt
   lands on too few dots to form a readable letter and prints as a smudge,
   which is why these are not smaller. Everything is pure black and bold:
   the head is 1-bit, so grey is dithered away to almost nothing. */
.shop {
  font-size: 7pt; font-weight: 800; line-height: 1.15; color: #000;
  text-align: center; width: 100%;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
/* "IMobile Service & Repair Center" fills the full 37.4mm at 6pt with nothing
   to spare, so it would ellipsise the moment Arial is substituted. 5.5pt keeps
   roughly a tenth of the width in hand. The short .lk variant has no such
   problem and stays at 7pt. */
.shop.long { font-size: 5.5pt; letter-spacing: -0.01em; }
.bars { line-height: 0; margin: 0.7mm 0 0; }
/* Bounding box for the bars. JsBarcode emits a viewBox, so the SVG scales to
   fit this box without distortion no matter how long the code is. */
.bars svg {
  display: block;
  width: ${BARCODE_W_MM}mm !important;
  height: ${BARCODE_H_MM}mm !important;
}
.code {
  font-size: 8pt; font-weight: 900; letter-spacing: 0.12em; color: #000;
  font-family: "Courier New", monospace;
  line-height: 1; margin: 0.5mm 0 0; text-align: center;
}
.name {
  font-size: 6.5pt; font-weight: 700; line-height: 1.15; color: #000;
  margin: 0.6mm 0 0; text-align: center;
  max-width: 100%;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
/* Long names step down a size, then wrap to two lines, rather than losing their
   tail to an ellipsis. A model name is the whole point of the sticker, so it
   must never be the part that gets cut. */
.name.sm { font-size: 5.5pt; }
.name.wrap { white-space: normal; overflow-wrap: anywhere; max-height: 5mm; }
.price { font-size: 7pt; font-weight: 800; line-height: 1.1; margin: 0.4mm 0 0; color: #000; }
/* Was 4pt grey, which the thermal head dropped almost entirely. */
.tagline { font-size: 5.5pt; font-weight: 700; line-height: 1.1; margin: 0.4mm 0 0; color: #000; }
</style>
</head>
<body>${setupHtml}<div class="grid">${labelsHtml}</div></body>
</html>`
}
