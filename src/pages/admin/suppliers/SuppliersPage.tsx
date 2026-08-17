"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Store,
  Plus,
  Search,
  RefreshCcw,
  ClipboardList,
  Boxes,
  CheckCircle2,
  Trash2,
  Pencil,
  Phone,
  Mail,
  User,
  FolderTree,
  Info,
  KeyRound,
  Package,
  QrCode,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import AdminLayout from "@/components/admin-layout"
import SupplierModal from "@/components/admin/supplier-modal"
import SupplierPortalModal from "@/components/admin/supplier-portal-modal"
import SupplierLoginShare from "@/components/admin/supplier-login-share"
import SupplierCategoriesModal, {
  CategoryPicker,
  useAllCategories,
  useDefaultCategoryIds,
} from "@/components/admin/supplier-categories-modal"
import ShopOrderModal, { STATUS_META, formatOrderDate } from "@/components/admin/shop-order-modal"
import {
  inventorySuppliersService,
  shopOrdersService,
  type ShopOrder,
  type ShopOrderStatus,
  type ShopOrderTotals,
  type Supplier,
  type SupplierWithStats,
} from "@/lib/services/inventory.service"
import { toast } from "sonner"

type StatusFilter = ShopOrderStatus | "all"

const STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: "pending", label: "New" },
  { id: "confirmed", label: "Confirmed" },
  { id: "ready", label: "Ready" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
  { id: "all", label: "All" },
]

const EMPTY_TOTALS: ShopOrderTotals = {
  total: 0,
  pending: 0,
  confirmed: 0,
  ready: 0,
  completed: 0,
  cancelled: 0,
  pending_units: 0,
}

/**
 * Sets the one list that every shop sees unless it has been given its own, and
 * shows at a glance which shops are on it.
 *
 * Editing here is the fast path: adding a category to the catalogue is one save,
 * not one save per shop. Shops with their own list are listed separately so it
 * is obvious they will not follow this change.
 */
function ProductAccessTab({
  suppliers,
  onEditShop,
  onChanged,
}: {
  suppliers: SupplierWithStats[]
  onEditShop: (supplier: SupplierWithStats) => void
  onChanged: () => void
}) {
  const { categories, isLoading: categoriesLoading } = useAllCategories()
  const { ids: savedIds, isLoading: defaultsLoading, reload } = useDefaultCategoryIds()

  const [selected, setSelected] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)

  // Re-seeded whenever the saved list arrives or changes, so Cancel is simply
  // "load it again" and there is no third copy of the truth to drift.
  useEffect(() => {
    setSelected(savedIds)
  }, [savedIds])

  const isDirty = useMemo(() => {
    if (selected.length !== savedIds.length) return true
    const saved = new Set(savedIds)
    return selected.some((id) => !saved.has(id))
  }, [selected, savedIds])

  const onDefault = suppliers.filter((supplier) => supplier.category_access_mode !== "custom")
  const onCustom = suppliers.filter((supplier) => supplier.category_access_mode === "custom")

  const save = async () => {
    setIsSaving(true)
    try {
      await inventorySuppliersService.setDefaultCategories(selected)
      toast.success(
        selected.length === 0
          ? `Default list cleared — ${onDefault.length} shop${onDefault.length === 1 ? "" : "s"} now see nothing`
          : `Default list saved · ${onDefault.length} shop${onDefault.length === 1 ? "" : "s"} updated`
      )
      await reload()
      onChanged()
    } catch (error: any) {
      toast.error(error.message || "Could not save the default list")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 items-start">
      <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2.5 bg-primary/10 rounded-xl shrink-0">
            <FolderTree className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-bold text-lg leading-tight">Default product list</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Every shop sees these categories unless you have picked a list just for them.
            </p>
          </div>
        </div>

        <CategoryPicker
          categories={categories}
          selected={selected}
          onToggle={(id) =>
            setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
          }
          onSelectAll={(ids) => setSelected((prev) => Array.from(new Set([...prev, ...ids])))}
          onClear={() => setSelected([])}
          isLoading={categoriesLoading || defaultsLoading}
        />

        <div className="flex items-center gap-2 pt-4 mt-4 border-t border-border">
          <Button className="font-bold" disabled={!isDirty || isSaving} onClick={save}>
            {isSaving ? "Saving..." : "Save default list"}
          </Button>
          <Button variant="outline" disabled={!isDirty || isSaving} onClick={() => setSelected(savedIds)}>
            Cancel
          </Button>
          {isDirty && (
            <span className="text-xs text-amber-600 font-semibold">
              Affects {onDefault.length} shop{onDefault.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <AccessGroup
          title="Following the default"
          hint={`${savedIds.length} categor${savedIds.length === 1 ? "y" : "ies"} each`}
          suppliers={onDefault}
          emptyText="No shop is on the default list."
          onEditShop={onEditShop}
        />
        <AccessGroup
          title="Own list"
          hint="Not affected by the default"
          suppliers={onCustom}
          emptyText="Every shop follows the default."
          onEditShop={onEditShop}
          showOwnCount
        />
      </div>
    </div>
  )
}

function AccessGroup({
  title,
  hint,
  suppliers,
  emptyText,
  onEditShop,
  showOwnCount,
}: {
  title: string
  hint: string
  suppliers: SupplierWithStats[]
  emptyText: string
  onEditShop: (supplier: SupplierWithStats) => void
  showOwnCount?: boolean
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h3 className="font-bold">
          {title} ({suppliers.length})
        </h3>
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      </div>

      {suppliers.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">{emptyText}</p>
      ) : (
        <div className="space-y-1">
          {suppliers.map((supplier) => (
            <div
              key={supplier.id}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/60 transition-colors"
            >
              <Store className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{supplier.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {supplier.stats.categories === 0
                    ? "sees nothing"
                    : `sees ${supplier.stats.categories} categor${supplier.stats.categories === 1 ? "y" : "ies"}`}
                  {showOwnCount && supplier.stats.own_categories !== supplier.stats.categories
                    ? ` · ${supplier.stats.own_categories} picked`
                    : ""}
                </p>
              </div>
              <Button size="sm" variant="ghost" className="shrink-0" onClick={() => onEditShop(supplier)}>
                Edit
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Shops we supply, and what they have ordered from us.
 *
 * The three tabs are the whole job: Orders is what needs doing today, Shops is
 * who you supply, Product Access is what they are allowed to see. Stock never
 * moves from this page — a shop order is fulfilled through the POS like any
 * other sale.
 */
export default function SuppliersPage() {
  const [tab, setTab] = useState<"orders" | "shops" | "access">("orders")

  const [suppliers, setSuppliers] = useState<SupplierWithStats[]>([])
  const [suppliersLoading, setSuppliersLoading] = useState(true)

  const [orders, setOrders] = useState<ShopOrder[]>([])
  const [totals, setTotals] = useState<ShopOrderTotals>(EMPTY_TOTALS)
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [migrationRequired, setMigrationRequired] = useState(false)

  const [status, setStatus] = useState<StatusFilter>("pending")
  const [supplierFilter, setSupplierFilter] = useState("")
  const [search, setSearch] = useState("")
  const [supplierSearch, setSupplierSearch] = useState("")

  const [modalOpen, setModalOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [portalSupplier, setPortalSupplier] = useState<SupplierWithStats | null>(null)
  // The password rides along only when it has just been set - see the share card.
  const [shareTarget, setShareTarget] = useState<{ supplier: Supplier; password: string | null } | null>(null)
  const [categorySupplier, setCategorySupplier] = useState<SupplierWithStats | null>(null)
  const [activeOrder, setActiveOrder] = useState<ShopOrder | null>(null)

  const fetchSuppliers = useCallback(async () => {
    try {
      setSuppliersLoading(true)
      const res = await inventorySuppliersService.getAll({ withStats: true })
      setSuppliers(res.data || [])
      if (res.migration_required) setMigrationRequired(true)
    } catch (error: any) {
      console.error("Failed to load shops:", error)
      toast.error(error.message || "Failed to load shops")
    } finally {
      setSuppliersLoading(false)
    }
  }, [])

  const fetchOrders = useCallback(async () => {
    try {
      setOrdersLoading(true)
      const res = await shopOrdersService.getAll({
        status: status === "all" ? undefined : status,
        supplier_id: supplierFilter || undefined,
        search: search.trim() || undefined,
      })
      setOrders(res.data || [])
      setTotals({ ...EMPTY_TOTALS, ...(res.totals || {}) })
      if (res.migration_required) setMigrationRequired(true)
    } catch (error: any) {
      console.error("Failed to load shop orders:", error)
      toast.error(error.message || "Failed to load shop orders")
    } finally {
      setOrdersLoading(false)
    }
  }, [status, supplierFilter, search])

  useEffect(() => {
    fetchSuppliers()
  }, [fetchSuppliers])

  useEffect(() => {
    const timer = setTimeout(fetchOrders, search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [fetchOrders, search])

  // New orders arrive while the page is open, so keep it warm rather than
  // making the admin remember to hit Refresh.
  useEffect(() => {
    const interval = setInterval(fetchOrders, 60000)
    return () => clearInterval(interval)
  }, [fetchOrders])

  const refreshAll = () => {
    fetchSuppliers()
    fetchOrders()
  }

  const handleDeleteSupplier = async (supplier: SupplierWithStats) => {
    if (
      !confirm(
        `Delete shop "${supplier.name}"?\n\nTheir login, product access and order history will be removed.`
      )
    ) {
      return
    }
    try {
      await inventorySuppliersService.delete(supplier.id)
      setSuppliers((prev) => prev.filter((row) => row.id !== supplier.id))
      toast.success("Shop deleted")
      if (supplierFilter === supplier.id) setSupplierFilter("")
      fetchOrders()
    } catch (error: any) {
      console.error("Failed to delete shop:", error)
      toast.error(error.message || "Failed to delete shop")
    }
  }

  /** Applies a changed order in place so the list does not flash on every status click. */
  const handleOrderChanged = (updated: ShopOrder | null) => {
    if (!updated) {
      setOrders((prev) => prev.filter((order) => order.id !== activeOrder?.id))
      fetchOrders()
      fetchSuppliers()
      return
    }
    setOrders((prev) => prev.map((order) => (order.id === updated.id ? updated : order)))
    setActiveOrder(updated)
    fetchSuppliers()
  }

  const filteredSuppliers = useMemo(() => {
    const term = supplierSearch.trim().toLowerCase()
    if (!term) return suppliers
    return suppliers.filter(
      (supplier) =>
        String(supplier.name || "").toLowerCase().includes(term) ||
        (supplier.contact_person || "").toLowerCase().includes(term) ||
        (supplier.phone || "").toLowerCase().includes(term) ||
        (supplier.email || "").toLowerCase().includes(term)
    )
  }, [suppliers, supplierSearch])

  const statCards = [
    {
      label: "Shops",
      value: suppliers.length,
      icon: Store,
      iconClass: "text-primary",
      bgClass: "bg-primary/10",
      valueClass: "",
    },
    {
      label: "New Orders",
      value: totals.pending,
      icon: ClipboardList,
      iconClass: "text-amber-600",
      bgClass: "bg-amber-100",
      valueClass: totals.pending > 0 ? "text-amber-600" : "",
    },
    {
      label: "Units Requested",
      value: totals.pending_units,
      icon: Boxes,
      iconClass: "text-blue-600",
      bgClass: "bg-blue-100",
      valueClass: "",
    },
    {
      label: "Completed",
      value: totals.completed,
      icon: CheckCircle2,
      iconClass: "text-green-600",
      bgClass: "bg-green-100",
      valueClass: "",
    },
  ]

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Shops & Orders</h1>
            <p className="text-muted-foreground mt-1">
              The shops you supply order for themselves — everything they send lands here.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={refreshAll} className="gap-2">
              <RefreshCcw className={`w-4 h-4 ${ordersLoading || suppliersLoading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button
              onClick={() => {
                setEditingSupplier(null)
                setModalOpen(true)
              }}
              className="gap-2 font-bold"
            >
              <Plus className="w-4 h-4" /> Add Shop
            </Button>
          </div>
        </div>

        {migrationRequired && (
          <div className="flex items-start gap-3 border border-amber-300 bg-amber-50 text-amber-900 rounded-xl p-4">
            <Info className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-bold">Shop ordering is not enabled yet.</p>
              <p className="mt-0.5">
                Run{" "}
                <code className="font-mono bg-amber-100 px-1 rounded">
                  supabase/migrations/20260809_supplier_shop_orders.sql
                </code>{" "}
                in the Supabase SQL editor to let shops see their categories and place orders.
              </p>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {statCards.map((card, index) => {
            const Icon = card.icon
            return (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-card border border-border p-5 rounded-2xl shadow-sm"
              >
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${card.bgClass}`}>
                    <Icon className={`w-6 h-6 ${card.iconClass}`} />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-wider">{card.label}</p>
                    <p className={`text-3xl font-black ${card.valueClass}`}>{card.value}</p>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* Tabs */}
        <div className="flex bg-muted p-1 rounded-lg w-full sm:w-fit">
          <button
            onClick={() => setTab("orders")}
            className={`flex-1 sm:flex-none px-5 py-2 rounded-md text-sm font-bold transition-all ${
              tab === "orders" ? "bg-card shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Shop Orders {totals.pending > 0 && `(${totals.pending} new)`}
          </button>
          <button
            onClick={() => setTab("shops")}
            className={`flex-1 sm:flex-none px-5 py-2 rounded-md text-sm font-bold transition-all ${
              tab === "shops" ? "bg-card shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Shops ({suppliers.length})
          </button>
          <button
            onClick={() => setTab("access")}
            className={`flex-1 sm:flex-none px-5 py-2 rounded-md text-sm font-bold transition-all ${
              tab === "access" ? "bg-card shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Product Access
          </button>
        </div>

        {tab === "orders" ? (
          <>
            {/* Filters */}
            <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center bg-card border border-border p-4 rounded-xl shadow-sm">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by order number or shop..."
                  className="pl-10"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <select
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm font-medium outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] lg:w-56"
              >
                <option value="">All shops</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>

              <div className="flex bg-muted p-1 rounded-lg overflow-x-auto">
                {STATUS_FILTERS.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setStatus(option.id)}
                    className={`px-3 py-2 rounded-md text-xs font-bold whitespace-nowrap transition-all ${
                      status === option.id
                        ? "bg-card shadow-sm text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {option.label}
                    {option.id !== "all" && totals[option.id] > 0 ? ` (${totals[option.id]})` : ""}
                  </button>
                ))}
              </div>
            </div>

            {/* Orders table */}
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[860px]">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="p-4 font-bold text-xs uppercase tracking-wider text-muted-foreground">Order</th>
                      <th className="p-4 font-bold text-xs uppercase tracking-wider text-muted-foreground">Shop</th>
                      <th className="p-4 font-bold text-xs uppercase tracking-wider text-muted-foreground">Items</th>
                      <th className="p-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-center">
                        Units
                      </th>
                      <th className="p-4 font-bold text-xs uppercase tracking-wider text-muted-foreground">Status</th>
                      <th className="p-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-right">
                        Placed
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordersLoading ? (
                      [...Array(5)].map((_, i) => (
                        <tr key={i} className="animate-pulse border-b border-border">
                          <td className="p-4"><div className="h-4 w-28 bg-muted rounded" /></td>
                          <td className="p-4"><div className="h-4 w-32 bg-muted rounded" /></td>
                          <td className="p-4"><div className="h-4 w-40 bg-muted rounded" /></td>
                          <td className="p-4"><div className="h-6 w-10 bg-muted rounded mx-auto" /></td>
                          <td className="p-4"><div className="h-6 w-24 bg-muted rounded-full" /></td>
                          <td className="p-4"><div className="h-4 w-24 bg-muted rounded ml-auto" /></td>
                        </tr>
                      ))
                    ) : orders.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-16 text-center">
                          <ClipboardList className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
                          <p className="text-muted-foreground font-medium">
                            {status === "pending"
                              ? "No new orders right now. "
                              : "No orders match those filters. "}
                            {(supplierFilter || search) && "Try clearing the filters."}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      orders.map((order) => (
                        <tr
                          key={order.id}
                          onClick={() => setActiveOrder(order)}
                          className="border-b border-border hover:bg-muted/30 transition-colors cursor-pointer"
                        >
                          <td className="p-4">
                            <p className="font-black">{order.order_number}</p>
                            {order.note && (
                              <p className="text-[10px] text-muted-foreground line-clamp-1 max-w-[180px]">
                                {order.note}
                              </p>
                            )}
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-2 min-w-0">
                              <Store className="w-4 h-4 text-muted-foreground shrink-0" />
                              <span className="font-semibold truncate">{order.supplier_name}</span>
                            </div>
                          </td>
                          <td className="p-4">
                            <p className="text-sm line-clamp-2 max-w-[260px]">
                              {order.items
                                .slice(0, 3)
                                .map((item) => `${item.product_name} ×${item.quantity}`)
                                .join(", ")}
                              {order.items.length > 3 ? ` +${order.items.length - 3} more` : ""}
                            </p>
                          </td>
                          <td className="p-4 text-center">
                            <span className="text-2xl font-black">{order.total_qty}</span>
                          </td>
                          <td className="p-4">
                            <span
                              className={`inline-block text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                                STATUS_META[order.status].badge
                              }`}
                            >
                              {STATUS_META[order.status].label}
                            </span>
                          </td>
                          <td className="p-4 text-right text-xs text-muted-foreground whitespace-nowrap">
                            {formatOrderDate(order.created_at)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : tab === "shops" ? (
          <>
            {/* Shop search */}
            <div className="bg-card border border-border p-4 rounded-xl shadow-sm">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search shops by name, contact, phone or email..."
                  className="pl-10"
                  value={supplierSearch}
                  onChange={(e) => setSupplierSearch(e.target.value)}
                />
              </div>
            </div>

            {suppliersLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="bg-card border border-border rounded-2xl p-5 animate-pulse h-52" />
                ))}
              </div>
            ) : filteredSuppliers.length === 0 ? (
              <div className="bg-card border border-border rounded-2xl p-16 text-center">
                <Store className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
                <p className="font-bold text-lg">
                  {suppliers.length === 0 ? "No shops yet" : "No shops match your search"}
                </p>
                <p className="text-muted-foreground text-sm mt-1">
                  {suppliers.length === 0
                    ? "Add the first shop you supply and give them a login."
                    : "Try a different search term."}
                </p>
                {suppliers.length === 0 && (
                  <Button
                    className="mt-5 gap-2 font-bold"
                    onClick={() => {
                      setEditingSupplier(null)
                      setModalOpen(true)
                    }}
                  >
                    <Plus className="w-4 h-4" /> Add Shop
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredSuppliers.map((supplier, index) => (
                  <motion.div
                    key={supplier.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index * 0.04, 0.3) }}
                    className="bg-card border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="p-2.5 bg-primary/10 rounded-xl shrink-0">
                          <Store className="w-5 h-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-bold text-lg leading-tight truncate">{supplier.name}</h3>
                          {supplier.contact_person && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <User className="w-3 h-3" /> {supplier.contact_person}
                            </p>
                          )}
                        </div>
                      </div>
                      {supplier.stats.pending_orders > 0 && (
                        <Badge className="bg-amber-500 hover:bg-amber-600 border-0 shrink-0">
                          {supplier.stats.pending_orders} new
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-col gap-1 mt-3 text-xs text-muted-foreground">
                      {supplier.phone && (
                        <a href={`tel:${supplier.phone}`} className="flex items-center gap-1.5 hover:text-primary w-fit">
                          <Phone className="w-3 h-3" /> {supplier.phone}
                        </a>
                      )}
                      {supplier.email && (
                        <a
                          href={`mailto:${supplier.email}`}
                          className="flex items-center gap-1.5 hover:text-primary w-fit truncate"
                        >
                          <Mail className="w-3 h-3 shrink-0" /> <span className="truncate">{supplier.email}</span>
                        </a>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-border">
                      <div className="text-center">
                        <p className={`text-xl font-black ${supplier.stats.categories === 0 ? "text-red-600" : ""}`}>
                          {supplier.stats.categories}
                        </p>
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">
                          {supplier.category_access_mode === "custom" ? "Own Cats" : "Default Cats"}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-xl font-black">{supplier.stats.orders}</p>
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Orders</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xl font-black text-primary">{supplier.stats.pending_units}</p>
                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">
                          Units Due
                        </p>
                      </div>
                    </div>

                    {supplier.stats.categories === 0 && (
                      <p className="text-[11px] text-red-600 font-medium mt-3">
                        {supplier.category_access_mode === "custom"
                          ? "No categories picked — this shop sees an empty catalogue."
                          : "The default list is empty — this shop sees an empty catalogue."}
                      </p>
                    )}
                    {supplier.stats.last_order_at && (
                      <p className="text-[10px] text-muted-foreground mt-2">
                        Last order {new Date(supplier.stats.last_order_at).toLocaleDateString("en-GB")}
                      </p>
                    )}

                    <div className="mt-4 pt-4 border-t border-border">
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="min-w-0">
                          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            Shop portal
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {supplier.portal_enabled
                              ? supplier.portal_last_login_at
                                ? `Last sign-in ${new Date(supplier.portal_last_login_at).toLocaleDateString("en-GB")}`
                                : "Enabled - not signed in yet"
                              : "No access"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Nothing to hand over until the shop actually has a login. */}
                          {supplier.portal_enabled && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              onClick={() => setShareTarget({ supplier, password: null })}
                            >
                              <QrCode className="w-3.5 h-3.5" />
                              Share
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() => setPortalSupplier(supplier)}
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            {supplier.portal_enabled ? "Manage" : "Give access"}
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1 font-bold gap-1.5" onClick={() => setCategorySupplier(supplier)}>
                        <FolderTree className="w-4 h-4" /> Product Access
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSupplierFilter(supplier.id)
                          setStatus("all")
                          setTab("orders")
                        }}
                        aria-label="See this shop's orders"
                      >
                        <Package className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingSupplier(supplier)
                          setModalOpen(true)
                        }}
                        aria-label="Edit shop"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeleteSupplier(supplier)}
                        className="hover:bg-red-500/10 hover:text-red-500"
                        aria-label="Delete shop"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        ) : (
          <ProductAccessTab
            suppliers={suppliers}
            onEditShop={setCategorySupplier}
            onChanged={fetchSuppliers}
          />
        )}
      </div>

      <AnimatePresence>
        {modalOpen && (
          <SupplierModal
            isOpen={modalOpen}
            supplier={editingSupplier}
            onClose={() => {
              setModalOpen(false)
              setEditingSupplier(null)
            }}
            onSaved={refreshAll}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {portalSupplier && (
          <SupplierPortalModal
            supplier={portalSupplier}
            onClose={() => setPortalSupplier(null)}
            onSaved={(password) => {
              refreshAll()
              // A password that was just typed is readable for this one moment,
              // so the card that carries it opens straight away.
              if (password) setShareTarget({ supplier: portalSupplier, password })
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {shareTarget && (
          <SupplierLoginShare
            supplier={shareTarget.supplier}
            password={shareTarget.password}
            onClose={() => setShareTarget(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {categorySupplier && (
          <SupplierCategoriesModal
            supplier={categorySupplier}
            onClose={() => setCategorySupplier(null)}
            onSaved={fetchSuppliers}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeOrder && (
          <ShopOrderModal
            order={activeOrder}
            onClose={() => setActiveOrder(null)}
            onChanged={handleOrderChanged}
          />
        )}
      </AnimatePresence>
    </AdminLayout>
  )
}
