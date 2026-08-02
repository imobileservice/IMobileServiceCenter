import { useRef, useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Printer, Minus, Plus, Tag, ScrollText, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import Barcode from 'react-barcode'
import JsBarcode from 'jsbarcode'

export interface LabelProduct {
  id: string
  name: string
  barcode: string | null
  price?: number
}

/** Physical sticker size on the thermal roll (Xprinter XP-365B, 203 dpi). */
const LABEL_W_MM = 38
const LABEL_H_MM = 25
/** Bar block is kept a couple of mm inside the sticker so the gap sensor drift never clips it. */
const BARCODE_W_MM = 32
const BARCODE_H_MM = 10

/** Renders a real, scannable CODE128 bar block as standalone SVG markup for the print window. */
const buildBarcodeSvg = (value: string): string => {
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

interface BarcodeLabelModalProps {
  isOpen: boolean
  onClose: () => void
  products: LabelProduct[] | null
}

export default function BarcodeLabelModal({ isOpen, onClose, products }: BarcodeLabelModalProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [printMode, setPrintMode] = useState<'thermal' | 'a4'>('thermal')
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (products?.length) {
      const initial: Record<string, number> = {}
      products.forEach(p => {
        initial[p.id || p.barcode || ''] = 1
      })
      setQuantities(initial)
    }
  }, [products])

  if (!products || products.length === 0) return null

  const updateQuantity = (id: string, delta: number) => {
    setQuantities(prev => ({
      ...prev,
      [id]: Math.max(0, Math.min(200, (prev[id] || 0) + delta))
    }))
  }

  // Flatten the array of copies to spool to the printer
  const printItems = products.flatMap(p => {
    const q = quantities[p.id || p.barcode || ''] || 0
    return Array.from({ length: q }).fill(p) as LabelProduct[]
  })

  const totalLabels = printItems.length

  // Preview the first product for visual representation
  const previewProduct = products[0] || null

  const handlePrint = () => {
    if (printItems.length === 0) return

    const isA4 = printMode === 'a4'
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    // Build each distinct bar block once, then reuse it for every copy.
    const svgCache: Record<string, string> = {}
    printItems.forEach(p => {
      const code = p.barcode || ''
      if (code && svgCache[code] === undefined) svgCache[code] = buildBarcodeSvg(code)
    })

    const pageStyle = isA4
      ? `@page { size: A4 portrait; margin: 5mm; }`
      : `@page { size: ${LABEL_W_MM}mm ${LABEL_H_MM}mm; margin: 0; }`

    const labelsHtml = printItems.map((prod, i) => {
      const isDisplay = prod.name?.toLowerCase().includes('display')
      // Thermal: every sticker is its own page so the printer feeds them one by one.
      const pageBreak = !isA4 && i < printItems.length - 1
        ? 'page-break-after: always; break-after: page;'
        : ''

      return `
        <div class="label" style="${pageBreak}${isA4 ? 'border:0.1mm dashed #ccc;' : ''}">
          <p class="shop">
            ${isDisplay ? 'imobileservicecenter.lk' : 'IMobile Service &amp; Repair Center'}
          </p>

          <div class="bars">${svgCache[prod.barcode || ''] || ''}</div>

          <p class="code">${esc(prod.barcode || '')}</p>

          <p class="name">${esc(prod.name || '')}</p>

          ${!isDisplay && prod.price !== undefined
            ? `<p class="price">Rs. ${prod.price.toLocaleString()}</p>`
            : ''
          }
          ${isDisplay
            ? `<p class="tagline">Display Part</p>`
            : ''
          }
        </div>
      `
    }).join('')

    const gridStyle = isA4
      ? `display:flex;flex-wrap:wrap;align-items:flex-start;align-content:flex-start;gap:0;padding:0;margin:0;`
      : `display:block;`

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Barcode Labels — IMobile</title>
  <style>
    ${pageStyle}
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      background: #fff;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .grid { ${gridStyle} }
    .label {
      width: ${LABEL_W_MM}mm;
      height: ${LABEL_H_MM}mm;
      background: #fff;
      color: #000;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1mm 1.5mm;
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
      max-width: ${LABEL_W_MM - 3}mm;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .price { font-size: 5.5pt; font-weight: 800; line-height: 1; margin: 0.5mm 0 0; }
    .tagline { font-size: 4pt; font-weight: 600; line-height: 1; margin: 0.5mm 0 0; color: #555; }
  </style>
</head>
<body>
  <div class="grid">${labelsHtml}</div>
</body>
</html>`

    const win = window.open('', '_blank', 'width=800,height=600')
    if (!win) {
      alert('Please allow popups for this site to print labels.')
      return
    }
    win.document.write(html)
    win.document.close()

    let sent = false
    const send = () => {
      if (sent) return
      sent = true
      try {
        win.focus()
        win.print()
      } catch (_) { /* window already gone */ }
      setTimeout(() => { try { win.close() } catch (_) {} }, 1200)
    }
    win.onload = send
    // Fallback if onload doesn't fire (document.write windows sometimes skip it)
    setTimeout(send, 900)
  }

  return (
    <>
      {/* ── Screen Modal ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={onClose}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Tag className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">Print Bulk Barcode Labels</h2>
                    <p className="text-xs text-muted-foreground">Opens a clean print window</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Area */}
              <div className="px-6 py-6 flex flex-col items-center gap-6 overflow-y-auto">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Label Preview Size ({LABEL_W_MM}mm × {LABEL_H_MM}mm)
                </div>

                {/* The label preview */}
                {previewProduct && previewProduct.barcode && (() => {
                  const isDisplay = previewProduct.name?.toLowerCase().includes('display');
                  return (
                    <div className="bg-white border-2 border-dashed border-border rounded-xl p-6 flex items-center justify-center shadow-inner w-full flex-shrink-0">
                      <div
                        className="bg-white text-black border border-gray-400 shadow-sm"
                        style={{
                          /* 5px per mm, so the preview keeps the real sticker's proportions */
                          width: `${LABEL_W_MM * 5}px`,
                          height: `${LABEL_H_MM * 5}px`,
                          padding: '4px 6px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxSizing: 'border-box'
                        }}
                      >
                        <p style={{ fontSize: '8px', fontWeight: 800, margin: 0, lineHeight: 1.1, letterSpacing: '0.01em', textAlign: 'center', width: '100%' }}>
                          {isDisplay ? 'imobileservicecenter.lk' : 'IMobile Service & Repair Center'}
                        </p>

                        {/* Same physical footprint as the printed bar block (32mm × 8.5mm at 5px/mm) */}
                        <div
                          className="[&_svg]:block [&_svg]:!w-full [&_svg]:!h-full"
                          style={{
                            width: `${BARCODE_W_MM * 5}px`,
                            height: `${BARCODE_H_MM * 5}px`,
                            margin: '4px 0 0',
                            padding: 0,
                            lineHeight: 0,
                          }}
                        >
                          <Barcode
                            value={previewProduct.barcode}
                            displayValue={false}
                            height={60}
                            width={2}
                            margin={0}
                            background="#ffffff"
                            lineColor="#000000"
                          />
                        </div>

                        <p style={{ fontSize: '13px', fontWeight: 900, letterSpacing: '0.12em', textAlign: 'center', margin: '1px 0 0', lineHeight: 1 }}>
                          {previewProduct.barcode}
                        </p>

                        <p style={{ fontSize: '7.5px', fontWeight: 700, textAlign: 'center', margin: '2px 0 0', lineHeight: 1.1, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {previewProduct.name}
                        </p>
                        {!isDisplay && previewProduct.price !== undefined && (
                          <p style={{ fontSize: '7px', fontWeight: 800, textAlign: 'center', margin: '1px 0 0', lineHeight: 1 }}>
                            Rs. {previewProduct.price.toLocaleString()}
                          </p>
                        )}
                        {isDisplay && (
                          <p style={{ fontSize: '6px', fontWeight: 600, textAlign: 'center', margin: '1px 0 0', lineHeight: 1, color: '#666' }}>
                            Display Part
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Print Mode Selector */}
                <div className="w-full flex gap-3 flex-shrink-0">
                  <button
                    onClick={() => setPrintMode('thermal')}
                    className={`flex-1 flex flex-col items-center gap-2 p-3 border-2 rounded-xl transition-all ${
                      printMode === 'thermal'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border bg-transparent text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <ScrollText className="w-6 h-6" />
                    <div className="text-center">
                      <p className="font-bold text-sm leading-tight">Thermal Roll</p>
                      <p className="text-[10px] leading-tight mt-0.5 opacity-80">{LABEL_W_MM} × {LABEL_H_MM} mm · one per sticker</p>
                    </div>
                  </button>
                  <button
                    onClick={() => setPrintMode('a4')}
                    className={`flex-1 flex flex-col items-center gap-2 p-3 border-2 rounded-xl transition-all ${
                      printMode === 'a4'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border bg-transparent text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <FileText className="w-6 h-6" />
                    <div className="text-center">
                      <p className="font-bold text-sm leading-tight">A4 Sticker Sheet</p>
                      <p className="text-[10px] leading-tight mt-0.5 opacity-80">Grid of labels</p>
                    </div>
                  </button>
                </div>

                {/* Quantity List */}
                <div className="w-full bg-muted/30 border border-border rounded-xl p-3 flex-shrink-0">
                  <p className="font-bold text-xs uppercase text-muted-foreground mb-3 px-2">Label Copies Per Product</p>
                  <div className="w-full flex flex-col gap-1 max-h-[220px] overflow-y-auto px-2">
                    {products.map(p => {
                      const id = p.id || p.barcode || '';
                      if (!id) return null;
                      const isDisplay = p.name?.toLowerCase().includes('display');
                      return (
                        <div key={id} className="flex items-center justify-between border-b border-border/50 last:border-0 pb-3 mb-3 last:pb-0 last:mb-0">
                          <div className="flex-1 min-w-0 pr-4">
                            <p className="font-semibold text-xs truncate leading-tight">{p.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <p className="text-[10px] text-muted-foreground font-mono truncate">{p.barcode}</p>
                              {isDisplay && (
                                <span className="text-[9px] bg-amber-500/15 text-amber-600 font-bold px-1.5 py-0.5 rounded">NO PRICE</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button onClick={() => updateQuantity(id, -10)} className="w-7 h-7 rounded bg-background border border-border shadow-sm flex justify-center items-center hover:bg-muted text-[10px] font-bold">-10</button>
                            <button onClick={() => updateQuantity(id, -1)} className="w-7 h-7 rounded bg-background border border-border shadow-sm flex justify-center items-center hover:bg-muted"><Minus className="w-3 h-3"/></button>
                            <input
                              type="number"
                              min="0"
                              max="200"
                              value={quantities[id] || 0}
                              onChange={(e) => setQuantities(prev => ({ ...prev, [id]: Math.max(0, Math.min(200, parseInt(e.target.value) || 0)) }))}
                              className="w-12 h-7 text-center font-bold text-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <button onClick={() => updateQuantity(id, 1)} className="w-7 h-7 rounded bg-background border border-border shadow-sm flex justify-center items-center hover:bg-muted"><Plus className="w-3 h-3"/></button>
                            <button onClick={() => updateQuantity(id, 10)} className="w-7 h-7 rounded bg-background border border-border shadow-sm flex justify-center items-center hover:bg-muted text-[10px] font-bold">+10</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {/* Quick Set Buttons */}
                  {products.length === 1 && (
                    <div className="mt-3 px-2 flex gap-2">
                      {[5, 10, 25, 50, 100].map(n => (
                        <button
                          key={n}
                          onClick={() => {
                            const id = products[0].id || products[0].barcode || '';
                            setQuantities(prev => ({ ...prev, [id]: n }));
                          }}
                          className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                            quantities[products[0].id || products[0].barcode || ''] === n
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border bg-background text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          ×{n}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-border bg-muted/20 flex gap-3 justify-end flex-shrink-0">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button onClick={handlePrint} className="gap-2 px-6" disabled={totalLabels === 0}>
                  <Printer className="w-4 h-4" />
                  Print Queue ({totalLabels})
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={printRef} style={{ display: 'none' }} />
    </>
  )
}
