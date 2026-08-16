"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  AlertCircle,
  Banknote,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Loader2,
  Printer,
  Receipt,
  ScanBarcode,
  Search,
  ShoppingBag,
  User,
  X,
} from "lucide-react"
import CashierLayout from "@/components/cashier-layout"
import PosReceipt, { formatPaymentMethod } from "@/components/cashier/pos-receipt"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useCashierStore } from "@/lib/cashier-store"
import { formatCurrency } from "@/lib/utils/currency"
import { inventorySalesService } from "@/lib/services/inventory.service"
import { toast } from "sonner"

type RangeKey = "today" | "7" | "30" | "all"

const RANGE_LABELS: Record<RangeKey, string> = {
  today: "Today",
  "7": "Last 7 days",
  "30": "Last 30 days",
  all: "All time",
}

const PAGE_SIZE = 15

/** Start of the window a range key covers, or null for "everything". */
const rangeStart = (range: RangeKey) => {
  if (range === "all") return null
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  if (range !== "today") start.setDate(start.getDate() - Number(range) + 1)
  return start.toISOString()
}

const formatDateTime = (value?: string) => {
  if (!value) return "—"
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString()
}

/**
 * Order History for the till.
 *
 * Two jobs. It lists what this cashier has sold, so they can answer "did that
 * go through?" without calling the office. And it reads a receipt barcode:
 * scan the slip a customer brings back and the exact order opens, instead of
 * hunting for an invoice number by eye.
 */
export default function CashierOrderHistory() {
  const navigate = useNavigate()
  const { cashier, tillSession } = useCashierStore()
  const [searchParams, setSearchParams] = useSearchParams()

  const [sales, setSales] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [range, setRange] = useState<RangeKey>("7")
  const [search, setSearch] = useState("")
  const [minePerCashier, setMinePerCashier] = useState(true)
  const [page, setPage] = useState(1)

  const [selectedSale, setSelectedSale] = useState<any>(null)
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [showReceipt, setShowReceipt] = useState(false)

  const [scanValue, setScanValue] = useState("")
  const scanInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const cashierEmail = cashier?.email || ""

  const loadSales = useCallback(async () => {
    setIsLoading(true)
    try {
      const from = rangeStart(range)
      const res = await inventorySalesService.getAll({
        shop: cashier?.shop || "Meegoda",
        created_by: minePerCashier && cashierEmail ? cashierEmail : undefined,
        search: search.trim() || undefined,
        from_date: from || undefined,
        limit: 500,
      })
      setSales(res.data || [])
    } catch (err: any) {
      toast.error(err.message || "Could not load your order history")
    } finally {
      setIsLoading(false)
    }
  }, [cashier?.shop, cashierEmail, minePerCashier, range, search])

  useEffect(() => {
    const timer = setTimeout(loadSales, search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [loadSales, search])

  useEffect(() => {
    setPage(1)
  }, [range, search, minePerCashier])

  const pageCount = Math.max(1, Math.ceil(sales.length / PAGE_SIZE))
  const pageSales = useMemo(
    () => sales.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sales, page]
  )

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount))
  }, [pageCount])

  const totals = useMemo(() => {
    const revenue = sales.reduce((sum, sale) => sum + Number(sale.net_amount || 0), 0)
    const cash = sales
      .filter((sale) => sale.payment_method === "cash")
      .reduce((sum, sale) => sum + Number(sale.net_amount || 0), 0)
    const card = sales
      .filter((sale) => sale.payment_method === "card")
      .reduce((sum, sale) => sum + Number(sale.net_amount || 0), 0)
    return { orders: sales.length, revenue, cash, card }
  }, [sales])

  /**
   * Opens the order a barcode belongs to.
   *
   * The scanned code IS the invoice number printed under the barcode on the
   * receipt, so this is a direct lookup rather than a search. The order opens
   * even when it sits outside the current filters - a customer walking in with
   * an old slip should not have to be told to change a date range first.
   */
  const openInvoice = useCallback(
    async (rawCode: string, options: { quiet?: boolean } = {}) => {
      const code = rawCode.trim().toUpperCase()
      if (!code) return

      setIsLookingUp(true)
      try {
        const res = await inventorySalesService.getByInvoiceNumber(code)
        if (!res.data) throw new Error(`No order found for ${code}`)

        setSelectedSale(res.data)
        setHighlightId(res.data.id)
        setScanValue("")

        // Scroll the matching row into view behind the detail panel, so closing
        // it leaves the cashier looking at the right place in the list.
        requestAnimationFrame(() => {
          listRef.current
            ?.querySelector(`[data-sale-id="${res.data.id}"]`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" })
        })
      } catch (err: any) {
        if (!options.quiet) toast.error(err.message || `No order found for ${code}`)
        setScanValue("")
      } finally {
        setIsLookingUp(false)
      }
    },
    []
  )

  // Deep link from the POS terminal: /cashier/orders?invoice=INV-xxxx opens
  // straight onto that order. The parameter is dropped once used so a refresh
  // does not keep reopening it.
  useEffect(() => {
    const invoice = searchParams.get("invoice")
    if (!invoice) return
    openInvoice(invoice)
    searchParams.delete("invoice")
    setSearchParams(searchParams, { replace: true })
  }, [searchParams, setSearchParams, openInvoice])

  // Hand-held scanners type into whatever has focus and finish with Enter, so
  // the scan box is kept focused whenever the cashier is not typing elsewhere.
  useEffect(() => {
    if (selectedSale || showReceipt) return
    const timer = setInterval(() => {
      const active = document.activeElement
      if (active?.tagName !== "INPUT" && active?.tagName !== "TEXTAREA") {
        scanInputRef.current?.focus()
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [selectedSale, showReceipt])

  const closeDetail = () => {
    setSelectedSale(null)
    setShowReceipt(false)
  }

  const isMine = (sale: any) =>
    !cashierEmail || String(sale?.created_by || "").toLowerCase() === cashierEmail.toLowerCase()

  return (
    <CashierLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Order History</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {minePerCashier ? `Sales rang up by ${cashier?.name || "you"}` : `All sales at ${cashier?.shop || "this shop"}`}
              {" · "}
              {RANGE_LABELS[range]}
            </p>
          </div>
          <Badge variant="outline" className="text-sm px-3 py-1 font-bold text-primary border-primary/50">
            {cashier?.shop || "Meegoda"} · {tillSession?.till?.code || "Till"}
          </Badge>
        </div>

        {/* Scan a receipt to jump straight to its order */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-2">
            <ScanBarcode className="w-4 h-4" /> Scan receipt barcode
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                ref={scanInputRef}
                autoFocus
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    openInvoice(scanValue)
                  }
                }}
                placeholder="Scan the barcode on a receipt, or type an invoice number..."
                className="pl-10 h-12 font-mono"
              />
            </div>
            <Button className="h-12 font-bold gap-2" disabled={!scanValue.trim() || isLookingUp} onClick={() => openInvoice(scanValue)}>
              {isLookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
              Open
            </Button>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <SummaryTile label="Orders" value={String(totals.orders)} icon={<ShoppingBag className="w-5 h-5" />} />
          <SummaryTile label="Revenue" value={formatCurrency(totals.revenue)} icon={<Receipt className="w-5 h-5" />} tone="text-primary" />
          <SummaryTile label="Cash" value={formatCurrency(totals.cash)} icon={<Banknote className="w-5 h-5" />} tone="text-green-500" />
          <SummaryTile label="Card" value={formatCurrency(totals.card)} icon={<CreditCard className="w-5 h-5" />} tone="text-blue-500" />
        </div>

        {/* Filters */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice number, customer name or phone..."
              className="pl-10"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(RANGE_LABELS) as RangeKey[]).map((key) => (
              <Button
                key={key}
                size="sm"
                variant={range === key ? "default" : "outline"}
                className="font-bold"
                onClick={() => setRange(key)}
              >
                {RANGE_LABELS[key]}
              </Button>
            ))}
            <Button
              size="sm"
              variant={minePerCashier ? "default" : "outline"}
              className="font-bold"
              onClick={() => setMinePerCashier((prev) => !prev)}
            >
              <User className="w-4 h-4 mr-1.5" />
              My sales
            </Button>
          </div>
        </div>

        {/* List */}
        <div ref={listRef} className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-12 flex items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading orders...
            </div>
          ) : sales.length === 0 ? (
            <div className="p-12 flex flex-col items-center gap-2 text-muted-foreground opacity-70">
              <AlertCircle className="w-8 h-8" />
              <p className="font-semibold">No orders found</p>
              <p className="text-sm">
                {search ? "Nothing matches that search." : `No sales in ${RANGE_LABELS[range].toLowerCase()}.`}
              </p>
            </div>
          ) : (
            <>
              {/* Table on a desktop till, stacked cards on a tablet or phone */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/50 text-muted-foreground uppercase font-semibold text-[10px] tracking-wider">
                    <tr>
                      <th className="px-6 py-4">Date</th>
                      <th className="px-6 py-4">Invoice</th>
                      <th className="px-6 py-4">Customer</th>
                      <th className="px-6 py-4">Items</th>
                      <th className="px-6 py-4">Method</th>
                      <th className="px-6 py-4 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {pageSales.map((sale: any) => (
                      <tr
                        key={sale.id}
                        data-sale-id={sale.id}
                        onClick={() => setSelectedSale(sale)}
                        className={`cursor-pointer transition-colors ${
                          highlightId === sale.id ? "bg-primary/10" : "hover:bg-muted/30"
                        }`}
                      >
                        <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                          {new Date(sale.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          <div className="text-[10px]">{new Date(sale.created_at).toLocaleDateString()}</div>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs">{sale.invoice_number}</td>
                        <td className="px-6 py-4 font-medium">
                          {sale.customer_name || "Walk-in"}
                          {!isMine(sale) && (
                            <div className="text-[10px] text-muted-foreground">by {sale.created_by}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">{sale.inv_sale_items?.length || 0}</td>
                        <td className="px-6 py-4">
                          <Badge variant="outline" className="uppercase text-[9px]">
                            {formatPaymentMethod(sale.payment_method)}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right font-black text-primary whitespace-nowrap">
                          {formatCurrency(sale.net_amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden divide-y divide-border/50">
                {pageSales.map((sale: any) => (
                  <button
                    key={sale.id}
                    data-sale-id={sale.id}
                    onClick={() => setSelectedSale(sale)}
                    className={`w-full text-left p-4 transition-colors ${
                      highlightId === sale.id ? "bg-primary/10" : "hover:bg-muted/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-bold truncate">{sale.invoice_number}</p>
                        <p className="text-sm font-medium truncate mt-0.5">{sale.customer_name || "Walk-in"}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{formatDateTime(sale.created_at)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-black text-primary">{formatCurrency(sale.net_amount)}</p>
                        <Badge variant="outline" className="uppercase text-[9px] mt-1">
                          {formatPaymentMethod(sale.payment_method)}
                        </Badge>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {pageCount > 1 && (
                <div className="flex items-center justify-between gap-3 p-4 border-t border-border bg-muted/20">
                  <p className="text-xs text-muted-foreground font-semibold">
                    {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sales.length)} of {sales.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm font-bold px-2">
                      {page} / {pageCount}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === pageCount}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Order detail */}
      <AnimatePresence>
        {selectedSale && !showReceipt && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={closeDetail}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-border bg-muted/30 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xl font-bold">Order</h3>
                    <Badge variant="outline" className="font-mono">{selectedSale.invoice_number}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDateTime(selectedSale.created_at)}
                    {selectedSale.created_by ? ` · rang up by ${selectedSale.created_by}` : ""}
                  </p>
                </div>
                <button onClick={closeDetail} className="p-1 hover:bg-muted rounded-full shrink-0">
                  <X className="w-6 h-6 text-muted-foreground" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto max-h-[60vh]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-black mb-2">Customer</p>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-border shrink-0">
                        <User className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold truncate">{selectedSale.customer_name || "Walk-in Customer"}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {selectedSale.customer_phone || selectedSale.inv_customers?.phone || "Guest checkout"}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-[10px] text-muted-foreground uppercase font-black mb-2">Total</p>
                    <div className="flex flex-col sm:items-end">
                      <span className="font-black text-2xl text-primary">{formatCurrency(selectedSale.net_amount)}</span>
                      <Badge variant="secondary" className="uppercase font-black text-xs w-fit">
                        {formatPaymentMethod(selectedSale.payment_method)}
                      </Badge>
                    </div>
                  </div>
                </div>

                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] text-muted-foreground uppercase font-black border-b border-border">
                      <th className="py-2">Item</th>
                      <th className="py-2 text-center">Qty</th>
                      <th className="py-2 text-right">Price</th>
                      <th className="py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {(selectedSale.inv_sale_items || []).map((item: any) => (
                      <tr key={item.id}>
                        <td className="py-3 font-bold text-sm tracking-tight">{item.product_name}</td>
                        <td className="py-3 text-center font-black">{item.quantity}</td>
                        <td className="py-3 text-right text-sm">{formatCurrency(item.unit_price)}</td>
                        <td className="py-3 text-right font-black text-primary text-sm">
                          {formatCurrency(item.total_price)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {selectedSale.notes && (
                  <p className="mt-4 text-xs text-muted-foreground">
                    <span className="font-bold">Note:</span> {selectedSale.notes}
                  </p>
                )}
              </div>

              <div className="p-4 border-t border-border bg-muted/10 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Button variant="outline" className="h-11 font-bold gap-2" onClick={() => setShowReceipt(true)}>
                  <Printer className="w-4 h-4" /> Reprint receipt
                </Button>
                <Button
                  variant="outline"
                  className="h-11 font-bold gap-2"
                  onClick={() => navigate(`/cashier/pos?invoice=${encodeURIComponent(selectedSale.invoice_number)}`)}
                >
                  <Receipt className="w-4 h-4" /> Process return
                </Button>
                <Button className="h-11 font-bold" onClick={closeDetail}>
                  Close
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reprint. Same 80mm layout as the till prints, stamped as a reprint. */}
      <AnimatePresence>
        {showReceipt && selectedSale && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm print:bg-white print:p-0">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-background border border-border rounded-2xl shadow-2xl overflow-hidden w-full max-w-[400px] flex flex-col print:border-0 print:shadow-none print:w-full"
            >
              <div className="p-6 overflow-y-auto max-h-[80vh] print:max-h-none print:p-0">
                <PosReceipt
                  sale={selectedSale}
                  cashierName={selectedSale.created_by?.split("@")[0] || cashier?.name || "Admin"}
                  tillCode={selectedSale.till_code || tillSession?.till?.code}
                  variant="reprint"
                />
              </div>
              <div className="p-4 bg-muted border-t border-border grid grid-cols-2 gap-4 print:hidden">
                <Button onClick={() => window.print()} className="gap-2 h-12">
                  <Printer className="w-4 h-4" /> PRINT
                </Button>
                <Button variant="outline" onClick={() => setShowReceipt(false)} className="h-12">
                  BACK
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </CashierLayout>
  )
}

function SummaryTile({
  label,
  value,
  icon,
  tone = "text-foreground",
}: {
  label: string
  value: string
  icon: React.ReactNode
  tone?: string
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">{label}</p>
          <h3 className={`text-lg sm:text-2xl font-black mt-1 truncate ${tone}`}>{value}</h3>
        </div>
        <div className={`p-2 rounded-lg bg-muted shrink-0 ${tone}`}>{icon}</div>
      </div>
    </div>
  )
}
