import { useRef, useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Printer, Minus, Plus, Tag, ScrollText, FileText, Smartphone, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import Barcode from 'react-barcode'
import { printLabels } from '@/lib/labels/print-labels'
import {
  LABEL_W_MM,
  LABEL_H_MM,
  BARCODE_W_MM,
  BARCODE_H_MM,
  composeModelLabelName,
  nameSizeClass,
  NAME_ONE_LINE_MAX,
  type LabelProduct,
} from '@/lib/labels/label-sheet'
import { phoneModelsService, type PhoneModel } from '@/lib/supabase/services/phone-models'

export type { LabelProduct }

/**
 * The preview is drawn at 5px per mm, but the print stylesheet in label-sheet.ts
 * sizes its type in pt. These convert, so the two stay honest about each other:
 * change a size in the stylesheet and mirror the same number here.
 */
const PREVIEW_PX_PER_MM = 5
const MM_PER_PT = 0.3528
const mm = (value: number) => value * PREVIEW_PX_PER_MM
const pt = (value: number) => value * MM_PER_PT * PREVIEW_PX_PER_MM

interface BarcodeLabelModalProps {
  isOpen: boolean
  onClose: () => void
  products: LabelProduct[] | null
}

/** Stable key for a product in the print queue. */
const keyOf = (p: LabelProduct) => p.id || p.barcode || ''

export default function BarcodeLabelModal({ isOpen, onClose, products }: BarcodeLabelModalProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  // Copies per compatible phone model: { productId: { phoneModelId: copies } }.
  // Each of those stickers carries the SAME barcode as the product - only the
  // printed model name differs, so stock stays one pool.
  const [modelQuantities, setModelQuantities] = useState<Record<string, Record<string, number>>>({})
  const [compatibility, setCompatibility] = useState<Record<string, PhoneModel[]>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [printMode, setPrintMode] = useState<'thermal' | 'a4'>('thermal')
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (products?.length) {
      const initial: Record<string, number> = {}
      products.forEach(p => {
        initial[keyOf(p)] = 1
      })
      setQuantities(initial)
      setModelQuantities({})
      setExpanded({})
    }
  }, [products])

  // Compatible models for every product in the queue, in one request.
  useEffect(() => {
    if (!isOpen || !products?.length) return

    const ids = products.map(p => p.id).filter(Boolean) as string[]
    if (ids.length === 0) return

    let cancelled = false
    phoneModelsService.getForProducts(ids).then(map => {
      if (cancelled) return
      setCompatibility(map)
      // Left collapsed on purpose. The shop pre-prints ONE sticker per box with
      // the internal name; per-phone stickers are the exception, not the
      // default, so the admin has to ask for them.
    })

    return () => { cancelled = true }
  }, [isOpen, products])

  if (!products || products.length === 0) return null

  const updateQuantity = (id: string, delta: number) => {
    setQuantities(prev => ({
      ...prev,
      [id]: Math.max(0, Math.min(200, (prev[id] || 0) + delta))
    }))
  }

  const setModelQuantity = (productId: string, modelId: string, value: number) => {
    setModelQuantities(prev => ({
      ...prev,
      [productId]: {
        ...(prev[productId] || {}),
        [modelId]: Math.max(0, Math.min(200, value)),
      },
    }))
  }

  const updateModelQuantity = (productId: string, modelId: string, delta: number) => {
    setModelQuantity(productId, modelId, (modelQuantities[productId]?.[modelId] || 0) + delta)
  }

  /** One sticker for every phone this product fits. */
  const setOnePerModel = (productId: string, models: PhoneModel[], value: number) => {
    const next: Record<string, number> = {}
    models.forEach(m => { next[m.id] = value })
    setModelQuantities(prev => ({ ...prev, [productId]: next }))
  }

  // Flatten the array of copies to spool to the printer. Generic stickers keep
  // the product name; per-model stickers swap in that phone's name.
  const printItems = products.flatMap(p => {
    const id = keyOf(p)

    const generic = Array.from({ length: quantities[id] || 0 }).fill(p) as LabelProduct[]

    const perModel = (compatibility[p.id || ''] || []).flatMap(model => {
      const copies = modelQuantities[id]?.[model.id] || 0
      if (copies === 0) return [] as LabelProduct[]

      const named: LabelProduct = { ...p, name: composeModelLabelName(p, model.name) }
      return Array.from({ length: copies }).fill(named) as LabelProduct[]
    })

    return [...generic, ...perModel]
  })

  const totalLabels = printItems.length

  // Preview whatever is first in the queue, so a per-model sticker is visible
  // before it is printed.
  const previewProduct = printItems[0] || products[0] || null

  const handlePrint = () => {
    if (printItems.length === 0) return
    printLabels(printItems, printMode)
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
                        <p style={{ fontSize: `${pt(isDisplay ? 7 : 5.5)}px`, fontWeight: 800, margin: 0, lineHeight: 1.15, letterSpacing: isDisplay ? 0 : '-0.01em', textAlign: 'center', width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {isDisplay ? 'imobileservicecenter.lk' : 'IMobile Service & Repair Center'}
                        </p>

                        {/* Same physical footprint as the printed bar block, at 5px/mm */}
                        <div
                          className="[&_svg]:block [&_svg]:!w-full [&_svg]:!h-full"
                          style={{
                            width: `${BARCODE_W_MM * 5}px`,
                            height: `${BARCODE_H_MM * 5}px`,
                            margin: `${mm(0.7)}px 0 0`,
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

                        <p style={{ fontSize: `${pt(8)}px`, fontWeight: 900, letterSpacing: '0.12em', fontFamily: '"Courier New", monospace', textAlign: 'center', margin: `${mm(0.5)}px 0 0`, lineHeight: 1 }}>
                          {previewProduct.barcode}
                        </p>

                        {(() => {
                          // Mirrors .name / .name.sm / .name.wrap in label-sheet.ts
                          const cls = nameSizeClass(previewProduct.name || '')
                          const wraps = cls.includes('wrap')
                          return (
                            <p style={{
                              fontSize: `${pt(cls ? 5.5 : 6.5)}px`,
                              fontWeight: 700,
                              textAlign: 'center',
                              margin: `${mm(0.6)}px 0 0`,
                              lineHeight: 1.15,
                              maxWidth: '100%',
                              overflow: 'hidden',
                              textOverflow: wraps ? 'clip' : 'ellipsis',
                              whiteSpace: wraps ? 'normal' : 'nowrap',
                              overflowWrap: wraps ? 'anywhere' : 'normal',
                              maxHeight: wraps ? `${mm(5)}px` : undefined,
                            }}>
                              {previewProduct.name}
                            </p>
                          )
                        })()}
                        {!isDisplay && previewProduct.price !== undefined && (
                          <p style={{ fontSize: `${pt(7)}px`, fontWeight: 800, textAlign: 'center', margin: `${mm(0.4)}px 0 0`, lineHeight: 1.1 }}>
                            Rs. {previewProduct.price.toLocaleString()}
                          </p>
                        )}
                        {isDisplay && (
                          <p style={{ fontSize: `${pt(5.5)}px`, fontWeight: 700, textAlign: 'center', margin: `${mm(0.4)}px 0 0`, lineHeight: 1.1 }}>
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

                {/* One-time printer setup. A wrong paper size is what prints the date /
                    web address / 1-1 text and spreads one label across several stickers. */}
                {printMode === 'thermal' && (
                  <details className="w-full text-xs border border-amber-500/40 bg-amber-500/5 rounded-lg flex-shrink-0">
                    <summary className="cursor-pointer select-none px-3 py-2 font-semibold text-amber-600">
                      Sticker printing wrong? Set the printer up once →
                    </summary>
                    <div className="px-3 pb-3 pt-1 text-muted-foreground leading-relaxed space-y-2">
                      <p>
                        Extra text around the sticker (date, web address, <b>1/1</b>) or one label
                        spread over several stickers always means the <b>paper size is wrong</b>.
                        Chrome draws that text itself — the app cannot remove it, these settings can.
                      </p>
                      <p className="font-semibold text-foreground">In the print dialog</p>
                      <ol className="list-decimal ml-4 space-y-0.5">
                        <li><b>Destination:</b> Xprinter XP-365B</li>
                        <li>Click <b>More settings</b></li>
                        <li><b>Paper size:</b> {LABEL_W_MM} × {LABEL_H_MM} mm label</li>
                        <li><b>Margins: None</b> · <b>Scale:</b> Default</li>
                        <li>Untick <b>Headers and footers</b></li>
                      </ol>
                      <p className="font-semibold text-foreground">
                        No {LABEL_W_MM} × {LABEL_H_MM} mm in that list? Add it in Windows first
                      </p>
                      <p>
                        Settings › Printers &amp; scanners › <b>Xprinter XP-365B</b> › Printing
                        preferences › Page Setup › Paper Size › <b>New / Custom</b> — width{' '}
                        {LABEL_W_MM} mm, height {LABEL_H_MM} mm — save it and set it as the default.
                      </p>
                      <p className="text-[11px]">Chrome remembers this for the XP-365B afterwards.</p>
                    </div>
                  </details>
                )}

                {/* Quantity List */}
                <div className="w-full bg-muted/30 border border-border rounded-xl p-3 flex-shrink-0">
                  <p className="font-bold text-xs uppercase text-muted-foreground mb-3 px-2">Label Copies Per Product</p>
                  <div className="w-full flex flex-col gap-1 max-h-[220px] overflow-y-auto px-2">
                    {products.map(p => {
                      const id = p.id || p.barcode || '';
                      if (!id) return null;
                      const isDisplay = p.name?.toLowerCase().includes('display');
                      const models = compatibility[p.id || ''] || []
                      const modelCopies = modelQuantities[id] || {}
                      const modelTotal = Object.values(modelCopies).reduce((a, b) => a + b, 0)
                      const isExpanded = expanded[id]

                      return (
                        <div key={id} className="border-b border-border/50 last:border-0 pb-3 mb-3 last:pb-0 last:mb-0">
                        <div className="flex items-center justify-between">
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

                        {/* Per phone model stickers. Same barcode on every one:
                            the model changes the printed text, never the SKU. */}
                        {models.length > 0 && (
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))}
                              className="w-full flex items-center gap-1.5 text-[11px] font-bold text-primary hover:underline"
                            >
                              <Smartphone className="w-3.5 h-3.5" />
                              Print per phone model ({models.length})
                              {modelTotal > 0 && (
                                <span className="text-[10px] bg-primary/10 px-1.5 py-0.5 rounded font-bold">
                                  {modelTotal} label{modelTotal === 1 ? '' : 's'}
                                </span>
                              )}
                              <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>

                            {isExpanded && (
                              <div className="mt-2 rounded-lg border border-border bg-background p-2">
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <p className="text-[10px] text-muted-foreground leading-tight">
                                    Every sticker below carries barcode{' '}
                                    <b className="font-mono">{p.barcode}</b> — one stock pool, one SKU.
                                  </p>
                                  <div className="flex gap-1 flex-shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => setOnePerModel(id, models, 1)}
                                      className="px-2 py-1 rounded border border-border text-[10px] font-bold hover:bg-muted"
                                    >
                                      ×1 each
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setOnePerModel(id, models, 0)}
                                      className="px-2 py-1 rounded border border-border text-[10px] font-bold hover:bg-muted"
                                    >
                                      Clear
                                    </button>
                                  </div>
                                </div>

                                <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                                  {models.map(model => {
                                    const labelText = composeModelLabelName(p, model.name)
                                    const copies = modelCopies[model.id] || 0
                                    return (
                                      <div key={model.id} className="flex items-center justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                          <p className="text-[11px] font-semibold truncate leading-tight">{model.label}</p>
                                          <p className="text-[9px] text-muted-foreground truncate leading-tight">
                                            prints: {labelText}
                                            {labelText.length > NAME_ONE_LINE_MAX && ' · small type'}
                                          </p>
                                        </div>
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                          <button
                                            type="button"
                                            onClick={() => updateModelQuantity(id, model.id, -1)}
                                            className="w-6 h-6 rounded bg-background border border-border flex justify-center items-center hover:bg-muted"
                                          >
                                            <Minus className="w-3 h-3" />
                                          </button>
                                          <input
                                            type="number"
                                            min="0"
                                            max="200"
                                            value={copies}
                                            onChange={(e) => setModelQuantity(id, model.id, parseInt(e.target.value) || 0)}
                                            className="w-10 h-6 text-center font-bold text-xs border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => updateModelQuantity(id, model.id, 1)}
                                            className="w-6 h-6 rounded bg-background border border-border flex justify-center items-center hover:bg-muted"
                                          >
                                            <Plus className="w-3 h-3" />
                                          </button>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
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
