import { useRef, useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Printer, Minus, Plus, Tag, ScrollText, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import Barcode from 'react-barcode'

export interface LabelProduct {
  id: string
  name: string
  barcode: string | null
  price?: number
}

interface BarcodeLabelModalProps {
  isOpen: boolean
  onClose: () => void
  products: LabelProduct[] | null
}

export default function BarcodeLabelModal({ isOpen, onClose, products }: BarcodeLabelModalProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [printMode, setPrintMode] = useState<'thermal' | 'a4'>('a4')
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

    const pageStyle = isA4
      ? `@page { size: A4 portrait; margin: 5mm; }`
      : `@page { size: 50mm 25mm; margin: 0; }`

    const labelsHtml = printItems.map((prod, i) => {
      const isDisplay = prod.name?.toLowerCase().includes('display')
      const pageBreak = !isA4 && i < printItems.length - 1
        ? 'page-break-after: always;'
        : ''

      return `
        <div style="
          width:50mm; height:25mm;
          background:#fff; color:#000;
          display:flex; flex-direction:column;
          align-items:center; justify-content:center;
          padding:1mm 2mm; box-sizing:border-box;
          overflow:hidden;
          font-family: Arial, sans-serif;
          ${isA4 ? 'border:0.1mm dashed #ccc;' : ''}
          ${pageBreak}
        ">
          <p style="font-size:5.5pt;font-weight:800;margin:0;text-align:center;line-height:1.1;letter-spacing:0.01em;width:100%;">
            ${isDisplay ? 'imobileservicecenter.lk' : 'IMobile Service &amp; Repair Center'}
          </p>

          <p style="font-size:9pt;font-weight:900;letter-spacing:0.15em;margin:1.5mm 0 0;text-align:center;line-height:1;font-family:monospace;">
            ${prod.barcode || ''}
          </p>

          <p style="font-size:5pt;font-weight:700;margin:1mm 0 0;line-height:1.1;max-width:46mm;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;">
            ${(prod.name || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
          </p>

          ${!isDisplay && prod.price !== undefined
            ? `<p style="font-size:4.5pt;font-weight:800;margin:0.5mm 0 0;line-height:1;">Rs. ${prod.price.toLocaleString()}</p>`
            : ''
          }
          ${isDisplay
            ? `<p style="font-size:4pt;font-weight:600;margin:0.5mm 0 0;line-height:1;color:#555;">Display Part</p>`
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
    body { background: #fff; font-family: Arial, sans-serif; }
    .grid { ${gridStyle} }
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
    win.onload = () => {
      win.focus()
      win.print()
      setTimeout(() => win.close(), 500)
    }
    // Fallback if onload doesn't fire
    setTimeout(() => {
      try { win.focus(); win.print(); setTimeout(() => win.close(), 500) } catch (_) {}
    }, 900)
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
                  Label Preview Size (50mm × 25mm)
                </div>

                {/* The label preview */}
                {previewProduct && previewProduct.barcode && (() => {
                  const isDisplay = previewProduct.name?.toLowerCase().includes('display');
                  return (
                    <div className="bg-white border-2 border-dashed border-border rounded-xl p-6 flex items-center justify-center shadow-inner w-full flex-shrink-0">
                      <div
                        className="bg-white text-black border border-gray-400 shadow-sm"
                        style={{
                          width: '188px',
                          height: '94px',
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

                        <div style={{ margin: '0', padding: 0, lineHeight: 0, transform: 'scale(0.95)', transformOrigin: 'center' }}>
                          <Barcode
                            value={previewProduct.barcode}
                            displayValue={false}
                            height={26}
                            width={1.3}
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
                      <p className="text-[10px] leading-tight mt-0.5 opacity-80">Label Printer</p>
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
