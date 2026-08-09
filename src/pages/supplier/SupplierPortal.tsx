"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { AnimatePresence, motion } from "framer-motion"
import {
  AlertTriangle,
  Check,
  ClipboardList,
  LogOut,
  Minus,
  Package,
  PackageX,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Store,
  Trash2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useSupplierStore } from "@/lib/supplier-store"
import {
  supplierPortalService,
  type CatalogCategory,
  type CatalogItem,
  type CatalogTotals,
  type MyOrder,
  type SupplierContact,
} from "@/lib/services/supplier-portal.service"
import { toast } from "sonner"

type Tab = "catalog" | "orders"

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  confirmed: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  ready: "bg-violet-500/10 text-violet-500 border-violet-500/20",
  completed: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  cancelled: "bg-red-500/10 text-red-500 border-red-500/20",
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Waiting for us",
  confirmed: "Confirmed",
  ready: "Ready to collect",
  completed: "Completed",
  cancelled: "Cancelled",
}

/** wa.me wants digits only, and Sri Lankan numbers are usually typed as 0xx. */
const toWhatsAppNumber = (value: string) => {
  const trimmed = (value || "").replace(/[^\d+]/g, "")
  if (trimmed.startsWith("+")) return trimmed.slice(1)
  if (trimmed.startsWith("0")) return `94${trimmed.slice(1)}`
  return trimmed
}

const formatDate = (value: string) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

export default function SupplierPortalPage() {
  const navigate = useNavigate()
  const supplier = useSupplierStore((state) => state.supplier)
  const isAuthenticated = useSupplierStore((state) => state.isAuthenticated)
  const isSessionExpired = useSupplierStore((state) => state.isSessionExpired)
  const logout = useSupplierStore((state) => state.logout)

  const [tab, setTab] = useState<Tab>("catalog")

  const [items, setItems] = useState<CatalogItem[]>([])
  const [categories, setCategories] = useState<CatalogCategory[]>([])
  const [totals, setTotals] = useState<CatalogTotals | null>(null)
  const [categoryId, setCategoryId] = useState("")
  const [search, setSearch] = useState("")
  const [inStockOnly, setInStockOnly] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [migrationRequired, setMigrationRequired] = useState(false)

  const [contact, setContact] = useState<SupplierContact | null>(null)

  // product_id -> units wanted. Cleared once the order is placed.
  const [basket, setBasket] = useState<Record<string, number>>({})
  const [basketOpen, setBasketOpen] = useState(false)
  const [orderNote, setOrderNote] = useState("")
  const [isPlacing, setIsPlacing] = useState(false)

  const [orders, setOrders] = useState<MyOrder[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)

  useEffect(() => {
    if (!isAuthenticated || isSessionExpired()) navigate("/supplier/login", { replace: true })
  }, [isAuthenticated, isSessionExpired, navigate])

  // The contact numbers live on the shop's record, so the portal never carries a
  // hardcoded phone number that has to be chased down when it changes.
  useEffect(() => {
    if (!isAuthenticated) return
    supplierPortalService
      .getSession()
      .then((result) => setContact(result.contact))
      .catch(() => {
        /* The buttons simply stay hidden; the catalogue is still usable. */
      })
  }, [isAuthenticated])

  const loadCatalog = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await supplierPortalService.getCatalog({
        search: search.trim() || undefined,
        category_id: categoryId || undefined,
        in_stock_only: inStockOnly || undefined,
      })
      setItems(result.data || [])
      setCategories(result.categories || [])
      setTotals(result.totals || null)
      setMigrationRequired(Boolean(result.migration_required))
    } catch (err: any) {
      // A dropped session already cleared the store; the effect above bounces to
      // the login screen, so there is nothing useful to show here.
      if (!useSupplierStore.getState().isAuthenticated) return
      toast.error(err.message || "Could not load the product list")
    } finally {
      setIsLoading(false)
    }
  }, [search, categoryId, inStockOnly])

  useEffect(() => {
    if (!isAuthenticated) return
    const timer = setTimeout(loadCatalog, search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [isAuthenticated, loadCatalog, search])

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true)
    try {
      const result = await supplierPortalService.getOrders()
      setOrders(result.data || [])
    } catch (err: any) {
      if (!useSupplierStore.getState().isAuthenticated) return
      toast.error(err.message || "Could not load your orders")
    } finally {
      setOrdersLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated && tab === "orders") loadOrders()
  }, [isAuthenticated, tab, loadOrders])

  const handleLogout = async () => {
    await supplierPortalService.logout()
    logout()
    navigate("/supplier/login", { replace: true })
  }

  const setQty = (productId: string, quantity: number) =>
    setBasket((prev) => {
      const next = { ...prev }
      if (quantity <= 0) delete next[productId]
      else next[productId] = Math.min(quantity, 9999)
      return next
    })

  const basketLines = useMemo(
    () =>
      Object.entries(basket).map(([productId, quantity]) => ({
        product_id: productId,
        quantity,
        name: items.find((item) => item.product_id === productId)?.name || "Product",
      })),
    [basket, items]
  )

  const basketUnits = basketLines.reduce((sum, line) => sum + line.quantity, 0)

  const placeOrder = async () => {
    if (basketLines.length === 0) return
    setIsPlacing(true)
    try {
      const result = await supplierPortalService.placeOrder({
        items: basketLines.map((line) => ({ product_id: line.product_id, quantity: line.quantity })),
        note: orderNote.trim() || null,
      })
      toast.success(`Order ${result.data.order_number} sent. We will confirm it shortly.`)
      setBasket({})
      setOrderNote("")
      setBasketOpen(false)
      setTab("orders")
      loadOrders()
      // Something we just took off the shelf may now be out of stock.
      loadCatalog()
    } catch (err: any) {
      toast.error(err.message || "Could not place your order")
    } finally {
      setIsPlacing(false)
    }
  }

  const cancelOrder = async (order: MyOrder) => {
    if (!confirm(`Cancel order ${order.order_number}?`)) return
    try {
      await supplierPortalService.cancelOrder(order.id)
      toast.success("Order cancelled")
      loadOrders()
    } catch (err: any) {
      toast.error(err.message || "Could not cancel that order")
    }
  }

  if (!isAuthenticated) return null

  const callHref = contact?.phone ? `tel:${contact.phone}` : null
  const whatsappHref = contact?.whatsapp
    ? `https://wa.me/${toWhatsAppNumber(contact.whatsapp)}?text=${encodeURIComponent(
        `Hello, this is ${supplier?.name || "our shop"}.`
      )}`
    : null

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="border-b border-border bg-card sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
              <Store className="w-5 h-5 text-blue-500" />
            </div>
            <div className="min-w-0">
              <h1 className="font-black tracking-tight truncate">{supplier?.name}</h1>
              <p className="text-xs text-muted-foreground truncate">IMobile Service Center · Shop Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {whatsappHref && (
              <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                <Button size="sm" className="gap-2 bg-green-600 hover:bg-green-700 text-white font-bold">
                  <WhatsAppIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">WhatsApp</span>
                </Button>
              </a>
            )}
            {callHref && (
              <a href={callHref}>
                <Button size="sm" variant="outline" className="gap-2 font-bold">
                  <Phone className="w-4 h-4" />
                  <span className="hidden sm:inline">Call</span>
                </Button>
              </a>
            )}
            <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        {migrationRequired && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 text-sm">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <p>The shop portal is not set up yet. Please contact IMobile Service Center.</p>
          </div>
        )}

        <div className="flex bg-muted p-1 rounded-lg w-full sm:w-fit">
          <button
            onClick={() => setTab("catalog")}
            className={`flex-1 sm:flex-none px-5 py-2 rounded-md text-sm font-bold transition-all ${
              tab === "catalog" ? "bg-card shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Products
          </button>
          <button
            onClick={() => setTab("orders")}
            className={`flex-1 sm:flex-none px-5 py-2 rounded-md text-sm font-bold transition-all ${
              tab === "orders" ? "bg-card shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            My Orders
          </button>
        </div>

        {tab === "catalog" ? (
          <>
            {totals && (
              <div className="grid grid-cols-3 gap-3">
                <SummaryTile label="Products" value={totals.products} />
                <SummaryTile label="In stock" value={totals.in_stock} tone="text-emerald-500" />
                <SummaryTile label="Out of stock" value={totals.out_of_stock} tone="text-red-500" />
              </div>
            )}

            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, brand or barcode..."
                  className="pl-10"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <FilterChip active={!categoryId} onClick={() => setCategoryId("")}>
                  All categories
                </FilterChip>
                {categories.map((category) => (
                  <FilterChip
                    key={category.id}
                    active={categoryId === category.id}
                    onClick={() => setCategoryId(category.id)}
                  >
                    {category.name}
                  </FilterChip>
                ))}
                <FilterChip active={inStockOnly} onClick={() => setInStockOnly((prev) => !prev)}>
                  In stock only
                </FilterChip>
                <Button variant="ghost" size="sm" onClick={loadCatalog} disabled={isLoading} className="gap-2">
                  <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </div>

            {isLoading ? (
              <p className="text-muted-foreground text-sm py-12 text-center">Loading products...</p>
            ) : items.length === 0 ? (
              <div className="text-center py-16">
                <PackageX className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-semibold">Nothing to show</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {categories.length === 0
                    ? "No product categories have been opened for your shop yet. Please call us."
                    : search || categoryId || inStockOnly
                      ? "No product matches those filters."
                      : "There are no products in your categories yet."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map((item) => (
                  <CatalogCard
                    key={item.product_id}
                    item={item}
                    quantity={basket[item.product_id] || 0}
                    onChange={(quantity) => setQty(item.product_id, quantity)}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <OrdersList orders={orders} isLoading={ordersLoading} onCancel={cancelOrder} onRefresh={loadOrders} />
        )}
      </main>

      {/* Basket bar */}
      <AnimatePresence>
        {basketLines.length > 0 && tab === "catalog" && (
          <motion.div
            initial={{ y: 80 }}
            animate={{ y: 0 }}
            exit={{ y: 80 }}
            className="fixed bottom-0 inset-x-0 z-30 border-t border-border bg-card"
          >
            <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <ShoppingCart className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate">
                    {basketLines.length} product{basketLines.length === 1 ? "" : "s"} · {basketUnits} unit
                    {basketUnits === 1 ? "" : "s"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">Ready to send to IMobile</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => setBasket({})} aria-label="Clear order">
                  <Trash2 className="w-4 h-4" />
                </Button>
                <Button className="font-bold gap-2" onClick={() => setBasketOpen(true)}>
                  Review order
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {basketOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
            onClick={() => setBasketOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="bg-card border border-border w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-5 max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="font-black tracking-tight text-lg">Your order</h2>
                  <p className="text-xs text-muted-foreground">
                    {basketLines.length} product{basketLines.length === 1 ? "" : "s"} · {basketUnits} units
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setBasketOpen(false)} aria-label="Close">
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-2">
                {basketLines.map((line) => (
                  <div key={line.product_id} className="flex items-center gap-3 border border-border rounded-lg p-3">
                    <p className="flex-1 min-w-0 text-sm font-semibold truncate">{line.name}</p>
                    <QuantityStepper
                      quantity={line.quantity}
                      onChange={(quantity) => setQty(line.product_id, quantity)}
                    />
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Note (optional)
                </label>
                <textarea
                  value={orderNote}
                  onChange={(e) => setOrderNote(e.target.value)}
                  rows={3}
                  placeholder="Delivery day, colour preference, anything we should know..."
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                />
              </div>

              <Button className="w-full mt-4 font-bold gap-2 h-11" disabled={isPlacing} onClick={placeOrder}>
                <Check className="w-4 h-4" />
                {isPlacing ? "Sending..." : "Place order"}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center mt-2">
                No need to call — this goes straight to IMobile Service Center.
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

function CatalogCard({
  item,
  quantity,
  onChange,
}: {
  item: CatalogItem
  quantity: number
  onChange: (quantity: number) => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3"
    >
      <div className="flex items-start gap-3">
        <div className="w-14 h-14 rounded bg-muted flex items-center justify-center overflow-hidden border border-border shrink-0">
          {item.image ? (
            <img src={item.image} alt="" className="w-full h-full object-cover" />
          ) : (
            <Package className="w-6 h-6 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-sm leading-tight line-clamp-2">{item.name}</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {item.brand ? `${item.brand} · ` : ""}
            {item.barcode || "No barcode"}
          </p>
          <span
            className={`inline-block mt-2 text-[11px] font-bold px-2 py-0.5 rounded-full border ${
              item.in_stock
                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                : "bg-red-500/10 text-red-500 border-red-500/20"
            }`}
          >
            {item.in_stock ? "In stock" : "Out of stock"}
          </span>
        </div>
      </div>

      {item.in_stock ? (
        quantity > 0 ? (
          <QuantityStepper quantity={quantity} onChange={onChange} />
        ) : (
          <Button size="sm" className="font-bold gap-2" onClick={() => onChange(1)}>
            <Plus className="w-4 h-4" />
            Add to order
          </Button>
        )
      ) : (
        <Button size="sm" variant="outline" disabled className="font-bold">
          Not available
        </Button>
      )}
    </motion.div>
  )
}

function QuantityStepper({ quantity, onChange }: { quantity: number; onChange: (quantity: number) => void }) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => onChange(quantity - 1)} aria-label="Less">
        <Minus className="w-3.5 h-3.5" />
      </Button>
      <Input
        type="number"
        min="0"
        value={quantity}
        onChange={(e) => onChange(Math.trunc(Number(e.target.value) || 0))}
        className="h-8 w-16 text-center font-bold"
      />
      <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => onChange(quantity + 1)} aria-label="More">
        <Plus className="w-3.5 h-3.5" />
      </Button>
    </div>
  )
}

function OrdersList({
  orders,
  isLoading,
  onCancel,
  onRefresh,
}: {
  orders: MyOrder[]
  isLoading: boolean
  onCancel: (order: MyOrder) => void
  onRefresh: () => void
}) {
  if (isLoading) {
    return <p className="text-muted-foreground text-sm py-12 text-center">Loading your orders...</p>
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-16">
        <ClipboardList className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="font-semibold">No orders yet</p>
        <p className="text-sm text-muted-foreground mt-1">Anything you order will show up here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={onRefresh} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>
      {orders.map((order) => (
        <motion.div
          key={order.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-lg p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-black tracking-tight">{order.order_number}</p>
              <p className="text-xs text-muted-foreground">{formatDate(order.created_at)}</p>
            </div>
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                STATUS_STYLES[order.status] || STATUS_STYLES.pending
              }`}
            >
              {STATUS_LABELS[order.status] || order.status}
            </span>
          </div>

          <div className="mt-3 space-y-1">
            {order.items.map((line) => (
              <div key={line.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{line.product_name}</span>
                <span className="font-bold shrink-0">× {line.quantity}</span>
              </div>
            ))}
          </div>

          {order.note && (
            <p className="mt-3 text-xs text-muted-foreground">
              <span className="font-semibold">Your note:</span> {order.note}
            </p>
          )}
          {order.admin_note && (
            <p className="mt-1 text-xs text-blue-500">
              <span className="font-semibold">IMobile:</span> {order.admin_note}
            </p>
          )}

          {order.status === "pending" && (
            <Button
              size="sm"
              variant="outline"
              className="mt-3 hover:bg-red-500/10 hover:text-red-500"
              onClick={() => onCancel(order)}
            >
              Cancel order
            </Button>
          )}
        </motion.div>
      ))}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  )
}

function SummaryTile({ label, value, tone = "text-foreground" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-black mt-1 ${tone}`}>{value}</p>
    </div>
  )
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.174.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.174-.297-.019-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 016.988 2.896 9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.886-9.885 9.886m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  )
}
