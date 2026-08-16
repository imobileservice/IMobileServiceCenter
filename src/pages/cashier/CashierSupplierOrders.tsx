"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Minus,
  Package,
  PackagePlus,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Store,
  Trash2,
  Truck,
  X,
} from "lucide-react"
import CashierLayout from "@/components/cashier-layout"
import SupplierOrderSlip from "@/components/cashier/supplier-order-slip"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useCashierStore } from "@/lib/cashier-store"
import {
  inventoryProductsService,
  inventorySuppliersService,
  shopOrdersService,
  type ShopOrder,
  type ShopOrderStatus,
  type Supplier,
} from "@/lib/services/inventory.service"
import { toast } from "sonner"

const PAGE_SIZE = 12

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  confirmed: "bg-blue-500/10 text-blue-500 border-blue-500/30",
  ready: "bg-violet-500/10 text-violet-500 border-violet-500/30",
  completed: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  cancelled: "bg-red-500/10 text-red-500 border-red-500/30",
}

const STATUS_LABELS: Record<string, string> = {
  pending: "New",
  confirmed: "Confirmed",
  ready: "Ready to collect",
  completed: "Collected",
  cancelled: "Cancelled",
}

/**
 * What a cashier may move an order to. Cancelling and deleting are deliberately
 * absent - those stay in the admin panel, so a till cannot make an order the
 * shop is waiting on disappear.
 */
const NEXT_STATUS: Partial<Record<ShopOrderStatus, { to: ShopOrderStatus; label: string }>> = {
  pending: { to: "confirmed", label: "Confirm order" },
  confirmed: { to: "ready", label: "Mark ready to collect" },
  ready: { to: "completed", label: "Mark collected" },
}

const FILTERS: Array<{ key: ShopOrderStatus | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "pending", label: "New" },
  { key: "confirmed", label: "Confirmed" },
  { key: "ready", label: "Ready" },
  { key: "completed", label: "Collected" },
]

const formatDateTime = (value?: string) => {
  if (!value) return "—"
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString()
}

/**
 * Supplier orders at the till.
 *
 * The shops we supply place orders in their own portal; until now those only
 * appeared in the admin panel, so the person actually packing the box could not
 * see them. This is the same queue, with the two things a cashier does to it:
 * move an order along, and raise one at the counter for a shop that phoned.
 */
export default function CashierSupplierOrders() {
  const { cashier, tillSession } = useCashierStore()

  const [orders, setOrders] = useState<ShopOrder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [migrationRequired, setMigrationRequired] = useState(false)
  const [filter, setFilter] = useState<ShopOrderStatus | "all">("pending")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  const [selected, setSelected] = useState<ShopOrder | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [slipOrder, setSlipOrder] = useState<ShopOrder | null>(null)
  const [slipVariant, setSlipVariant] = useState<"original" | "reprint">("original")
  const [composerOpen, setComposerOpen] = useState(false)

  const loadOrders = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await shopOrdersService.getAll({
        status: filter === "all" ? undefined : filter,
        search: search.trim() || undefined,
        limit: 300,
      })
      setOrders(res.data || [])
      setMigrationRequired(Boolean(res.migration_required))
    } catch (err: any) {
      toast.error(err.message || "Could not load supplier orders")
    } finally {
      setIsLoading(false)
    }
  }, [filter, search])

  useEffect(() => {
    const timer = setTimeout(loadOrders, search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [loadOrders, search])

  useEffect(() => {
    setPage(1)
  }, [filter, search])

  const pageCount = Math.max(1, Math.ceil(orders.length / PAGE_SIZE))
  const pageOrders = useMemo(
    () => orders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [orders, page]
  )

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount))
  }, [pageCount])

  const advance = async (order: ShopOrder) => {
    const next = NEXT_STATUS[order.status]
    if (!next) return
    setIsSaving(true)
    try {
      const res = await shopOrdersService.update(order.id, {
        status: next.to,
        handled_by: cashier?.email || "cashier",
      })
      toast.success(`${order.order_number} → ${STATUS_LABELS[next.to]}`)
      setSelected(res.data)
      setOrders((prev) => prev.map((item) => (item.id === order.id ? res.data : item)))
    } catch (err: any) {
      toast.error(err.message || "Could not update that order")
    } finally {
      setIsSaving(false)
    }
  }

  const printSlip = (order: ShopOrder, variant: "original" | "reprint") => {
    setSlipVariant(variant)
    setSlipOrder(order)
  }

  return (
    <CashierLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Supplier Orders</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Orders from the shops we supply — theirs from the portal, and any you raise at the counter.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={loadOrders} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" className="gap-2 font-bold" onClick={() => setComposerOpen(true)}>
              <PackagePlus className="w-4 h-4" />
              New order
            </Button>
          </div>
        </div>

        {migrationRequired && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <p>Supplier ordering is not set up on this database yet. Ask the admin to run the shop orders migration.</p>
          </div>
        )}

        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search order number or shop name..."
              className="pl-10"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((entry) => (
              <Button
                key={entry.key}
                size="sm"
                variant={filter === entry.key ? "default" : "outline"}
                className="font-bold"
                onClick={() => setFilter(entry.key)}
              >
                {entry.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-12 flex items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading supplier orders...
            </div>
          ) : orders.length === 0 ? (
            <div className="p-12 flex flex-col items-center gap-2 text-muted-foreground opacity-70">
              <Truck className="w-8 h-8" />
              <p className="font-semibold">No supplier orders</p>
              <p className="text-sm">
                {search ? "Nothing matches that search." : `No orders with the "${FILTERS.find((f) => f.key === filter)?.label}" filter.`}
              </p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-border/50">
                {pageOrders.map((order) => (
                  <button
                    key={order.id}
                    onClick={() => setSelected(order)}
                    className="w-full text-left p-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-black tracking-tight truncate">{order.supplier_name}</p>
                          {order.supplier_town && (
                            <span className="text-xs text-muted-foreground">· {order.supplier_town}</span>
                          )}
                        </div>
                        <p className="font-mono text-[11px] text-muted-foreground mt-0.5">{order.order_number}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {formatDateTime(order.created_at)}
                          {order.placed_by ? ` · counter, by ${order.placed_by}` : " · from the shop portal"}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span
                          className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            STATUS_STYLES[order.status] || STATUS_STYLES.pending
                          }`}
                        >
                          {STATUS_LABELS[order.status] || order.status}
                        </span>
                        <p className="text-xs text-muted-foreground mt-1.5">
                          {order.item_count} product{order.item_count === 1 ? "" : "s"} · {order.total_qty} unit
                          {order.total_qty === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {pageCount > 1 && (
                <div className="flex items-center justify-between gap-3 p-4 border-t border-border bg-muted/20">
                  <p className="text-xs text-muted-foreground font-semibold">
                    {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, orders.length)} of {orders.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm font-bold px-2">
                      {page} / {pageCount}
                    </span>
                    <Button variant="outline" size="sm" disabled={page === pageCount} onClick={() => setPage((p) => p + 1)}>
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
        {selected && !slipOrder && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setSelected(null)}>
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
                    <h3 className="text-xl font-bold truncate">{selected.supplier_name}</h3>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        STATUS_STYLES[selected.status] || STATUS_STYLES.pending
                      }`}
                    >
                      {STATUS_LABELS[selected.status] || selected.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {selected.supplier_town ? `${selected.supplier_town} · ` : ""}
                    <span className="font-mono">{selected.order_number}</span> · {formatDateTime(selected.created_at)}
                  </p>
                  {selected.contact_phone && (
                    <p className="text-xs text-muted-foreground">Tel: {selected.contact_phone}</p>
                  )}
                </div>
                <button onClick={() => setSelected(null)} className="p-1 hover:bg-muted rounded-full shrink-0">
                  <X className="w-6 h-6 text-muted-foreground" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto max-h-[55vh]">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] text-muted-foreground uppercase font-black border-b border-border">
                      <th className="py-2">Item</th>
                      <th className="py-2 text-right">Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {(selected.items || []).map((line) => (
                      <tr key={line.id}>
                        <td className="py-3">
                          <p className="font-bold text-sm tracking-tight">{line.product_name}</p>
                          <p className="text-[11px] text-muted-foreground font-mono">
                            {line.barcode || "No barcode"}
                            {line.was_in_stock === false && (
                              <span className="text-red-500 font-sans font-bold"> · was out of stock</span>
                            )}
                          </p>
                        </td>
                        <td className="py-3 text-right font-black">× {line.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {selected.note && (
                  <p className="mt-4 text-xs text-muted-foreground">
                    <span className="font-bold">Shop's note:</span> {selected.note}
                  </p>
                )}
                {selected.admin_note && (
                  <p className="mt-1 text-xs text-blue-500">
                    <span className="font-bold">Office:</span> {selected.admin_note}
                  </p>
                )}
                {selected.handled_by && (
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    Last handled by {selected.handled_by}
                    {selected.handled_at ? ` on ${formatDateTime(selected.handled_at)}` : ""}
                  </p>
                )}
              </div>

              <div className="p-4 border-t border-border bg-muted/10 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Button variant="outline" className="h-11 font-bold gap-2" onClick={() => printSlip(selected, "reprint")}>
                  <Printer className="w-4 h-4" /> Print slip
                </Button>
                {NEXT_STATUS[selected.status] ? (
                  <Button
                    className="h-11 font-bold gap-2 sm:col-span-2"
                    disabled={isSaving}
                    onClick={() => advance(selected)}
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {NEXT_STATUS[selected.status]!.label}
                  </Button>
                ) : (
                  <Button variant="outline" className="h-11 font-bold sm:col-span-2" onClick={() => setSelected(null)}>
                    Close
                  </Button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New counter order */}
      <AnimatePresence>
        {composerOpen && (
          <OrderComposer
            placedBy={cashier?.email || "cashier"}
            onClose={() => setComposerOpen(false)}
            onPlaced={(order) => {
              setComposerOpen(false)
              loadOrders()
              printSlip(order, "original")
            }}
          />
        )}
      </AnimatePresence>

      {/* Printable slip */}
      <AnimatePresence>
        {slipOrder && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm print:bg-white print:p-0">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-background border border-border rounded-2xl shadow-2xl overflow-hidden w-full max-w-[400px] flex flex-col print:border-0 print:shadow-none print:w-full"
            >
              <div className="p-6 overflow-y-auto max-h-[80vh] print:max-h-none print:p-0">
                <SupplierOrderSlip
                  order={slipOrder}
                  shop={cashier?.shop}
                  tillCode={tillSession?.till?.code}
                  variant={slipVariant}
                />
              </div>
              <div className="p-4 bg-muted border-t border-border grid grid-cols-2 gap-4 print:hidden">
                <Button onClick={() => window.print()} className="gap-2 h-12">
                  <Printer className="w-4 h-4" /> PRINT
                </Button>
                <Button variant="outline" onClick={() => setSlipOrder(null)} className="h-12">
                  DONE
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </CashierLayout>
  )
}

/**
 * Raises an order at the counter for a shop that phoned or walked in.
 *
 * The shop is picked from the registered list and nothing else — there is no
 * "add a shop" path here by design, and the server refuses an id it does not
 * already hold, so the list is a convenience rather than the control.
 */
function OrderComposer({
  placedBy,
  onClose,
  onPlaced,
}: {
  placedBy: string
  onClose: () => void
  onPlaced: (order: ShopOrder) => void
}) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [suppliersLoading, setSuppliersLoading] = useState(true)
  const [supplierSearch, setSupplierSearch] = useState("")
  const [supplier, setSupplier] = useState<Supplier | null>(null)

  const [productSearch, setProductSearch] = useState("")
  const [products, setProducts] = useState<any[]>([])
  const [productsLoading, setProductsLoading] = useState(false)

  // product_id -> { name, quantity }
  const [lines, setLines] = useState<Record<string, { name: string; quantity: number }>>({})
  const [note, setNote] = useState("")
  const [isPlacing, setIsPlacing] = useState(false)

  useEffect(() => {
    inventorySuppliersService
      .getAll()
      .then((res) => setSuppliers((res.data || []).filter((entry: any) => entry.is_active !== false)))
      .catch((err: any) => toast.error(err.message || "Could not load the shop list"))
      .finally(() => setSuppliersLoading(false))
  }, [])

  useEffect(() => {
    if (!supplier) return
    const term = productSearch.trim()
    if (term.length < 2) {
      setProducts([])
      return
    }
    setProductsLoading(true)
    const timer = setTimeout(() => {
      inventoryProductsService
        .getAll({ search: term })
        .then((res) => setProducts(res.data || []))
        .catch(() => setProducts([]))
        .finally(() => setProductsLoading(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [productSearch, supplier])

  const visibleSuppliers = useMemo(() => {
    const term = supplierSearch.trim().toLowerCase()
    if (!term) return suppliers
    return suppliers.filter(
      (entry) =>
        entry.name.toLowerCase().includes(term) ||
        String(entry.town || "").toLowerCase().includes(term) ||
        String(entry.phone || "").includes(term)
    )
  }, [suppliers, supplierSearch])

  const setQty = (productId: string, name: string, quantity: number) =>
    setLines((prev) => {
      const next = { ...prev }
      if (quantity <= 0) delete next[productId]
      else next[productId] = { name, quantity: Math.min(quantity, 9999) }
      return next
    })

  const lineList = Object.entries(lines)
  const totalUnits = lineList.reduce((sum, [, line]) => sum + line.quantity, 0)

  const place = async () => {
    if (!supplier || lineList.length === 0) return
    setIsPlacing(true)
    try {
      const res = await shopOrdersService.create({
        supplier_id: supplier.id,
        items: lineList.map(([productId, line]) => ({ product_id: productId, quantity: line.quantity })),
        note: note.trim() || null,
        placed_by: placedBy,
      })
      toast.success(`Order ${res.data.order_number} raised for ${supplier.name}`)
      onPlaced(res.data)
    } catch (err: any) {
      toast.error(err.message || "Could not place that order")
    } finally {
      setIsPlacing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[105] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-5 border-b border-border bg-muted/30 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-xl font-bold">New supplier order</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {supplier ? `For ${supplier.name}${supplier.town ? ` · ${supplier.town}` : ""}` : "Choose a registered shop"}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-full shrink-0">
            <X className="w-6 h-6 text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {!supplier ? (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  autoFocus
                  value={supplierSearch}
                  onChange={(e) => setSupplierSearch(e.target.value)}
                  placeholder="Search shops by name, town or phone..."
                  className="pl-10 h-12"
                />
              </div>

              {suppliersLoading ? (
                <div className="py-12 flex items-center justify-center gap-3 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" /> Loading shops...
                </div>
              ) : visibleSuppliers.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Store className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="font-semibold">No registered shop matches</p>
                  <p className="text-sm mt-1">New shops are added by the office, not from the till.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {visibleSuppliers.map((entry) => (
                    <button
                      key={entry.id}
                      onClick={() => setSupplier(entry)}
                      className="text-left border border-border rounded-lg p-3 hover:border-primary hover:bg-muted/40 transition-colors"
                    >
                      <p className="font-bold text-sm truncate">{entry.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {entry.town || "No town recorded"}
                        {entry.phone ? ` · ${entry.phone}` : ""}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <Store className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">{supplier.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {supplier.town || "No town recorded — the slip will say so"}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSupplier(null)}>
                  Change
                </Button>
              </div>

              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    autoFocus
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Search products to add..."
                    className="pl-10 h-11"
                  />
                </div>

                {productsLoading ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Searching...</p>
                ) : products.length > 0 ? (
                  <div className="border border-border rounded-lg divide-y divide-border/50 max-h-56 overflow-y-auto">
                    {products.map((product: any) => (
                      <button
                        key={product.id}
                        onClick={() => {
                          const current = lines[product.id]?.quantity || 0
                          setQty(product.id, product.name, current + 1)
                        }}
                        className="w-full text-left px-3 py-2.5 hover:bg-muted/40 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{product.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {product.barcode || "No barcode"} · stock {Number(product.stock || 0)}
                          </p>
                        </div>
                        <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
                      </button>
                    ))}
                  </div>
                ) : productSearch.trim().length >= 2 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No product matches that.</p>
                ) : null}
              </div>

              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">
                  On this order
                </p>
                {lineList.length === 0 ? (
                  <div className="border border-dashed border-border rounded-lg py-8 text-center text-muted-foreground">
                    <Package className="w-7 h-7 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Search above and tap a product to add it.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {lineList.map(([productId, line]) => (
                      <div key={productId} className="flex items-center gap-3 border border-border rounded-lg p-2.5">
                        <p className="flex-1 min-w-0 text-sm font-semibold truncate">{line.name}</p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0"
                            onClick={() => setQty(productId, line.name, line.quantity - 1)}
                            aria-label="Less"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </Button>
                          <Input
                            type="number"
                            min="0"
                            value={line.quantity}
                            onChange={(e) => setQty(productId, line.name, Math.trunc(Number(e.target.value) || 0))}
                            className="h-8 w-14 text-center font-bold px-1"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0"
                            onClick={() => setQty(productId, line.name, line.quantity + 1)}
                            aria-label="More"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-red-500"
                            onClick={() => setQty(productId, line.name, 0)}
                            aria-label="Remove"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">
                  Note (optional)
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Collection day, who called, anything the packer should know..."
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                />
              </div>
            </>
          )}
        </div>

        {supplier && (
          <div className="p-4 border-t border-border bg-muted/10 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground font-semibold">
              {lineList.length} product{lineList.length === 1 ? "" : "s"} · {totalUnits} unit
              {totalUnits === 1 ? "" : "s"}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onClose} className="h-11">
                Cancel
              </Button>
              <Button
                className="h-11 font-bold gap-2"
                disabled={lineList.length === 0 || isPlacing}
                onClick={place}
              >
                {isPlacing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Place order &amp; print
              </Button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}
