"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Truck,
  Plus,
  Search,
  RefreshCcw,
  AlertTriangle,
  PackageX,
  Package,
  Boxes,
  Wallet,
  Trash2,
  Pencil,
  Phone,
  Mail,
  User,
  Link2,
  ChevronRight,
  Info,
  KeyRound,
  MessageSquare,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import AdminLayout from "@/components/admin-layout"
import SupplierModal from "@/components/admin/supplier-modal"
import SupplierDetailModal from "@/components/admin/supplier-detail-modal"
import SupplierPortalModal from "@/components/admin/supplier-portal-modal"
import { formatCurrency } from "@/lib/utils/currency"
import {
  inventorySuppliersService,
  type RestockItem,
  type Supplier,
  type SupplierWithStats,
} from "@/lib/services/inventory.service"
import { toast } from "sonner"

type StatusFilter = "needed" | "out" | "low" | "all"
type ReplyFilter = "all" | "can_supply" | "unavailable" | "waiting"

const STATUS_FILTERS: Array<{ id: StatusFilter; label: string; activeClass: string }> = [
  { id: "needed", label: "Needs Restock", activeClass: "bg-card shadow-sm text-primary" },
  { id: "out", label: "Out of Stock", activeClass: "bg-card shadow-sm text-red-600" },
  { id: "low", label: "Low Stock", activeClass: "bg-card shadow-sm text-amber-600" },
  { id: "all", label: "All Products", activeClass: "bg-card shadow-sm text-foreground" },
]

const REPLY_FILTERS: Array<{ id: ReplyFilter; label: string; activeClass: string }> = [
  { id: "all", label: "Any reply", activeClass: "bg-card shadow-sm text-foreground" },
  { id: "can_supply", label: "Can supply", activeClass: "bg-card shadow-sm text-green-600" },
  { id: "unavailable", label: "Not available", activeClass: "bg-card shadow-sm text-red-600" },
  { id: "waiting", label: "Awaiting reply", activeClass: "bg-card shadow-sm text-amber-600" },
]

/** How each portal answer reads in the restock table. */
const REPLY_META: Record<string, { label: string; dotClass: string; textClass: string }> = {
  can_supply: { label: "Can supply", dotClass: "bg-green-500", textClass: "text-green-600" },
  unavailable: { label: "Not available", dotClass: "bg-red-500", textClass: "text-red-600" },
  pending: { label: "Reply pending", dotClass: "bg-amber-500", textClass: "text-amber-600" },
}

/** "2026-08-20" -> "20 Aug". The raw date stays in the tooltip. */
const formatExpectedDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString(undefined, { day: "numeric", month: "short" })
}

const formatRepliedAt = (value: string) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

const EMPTY_TOTALS = {
  products: 0,
  out_of_stock: 0,
  low_stock: 0,
  healthy: 0,
  needed_units: 0,
  estimated_cost: 0,
  unassigned: 0,
  suppliers: 0,
}

export default function SuppliersPage() {
  const [tab, setTab] = useState<"restock" | "suppliers">("restock")

  const [suppliers, setSuppliers] = useState<SupplierWithStats[]>([])
  const [suppliersLoading, setSuppliersLoading] = useState(true)

  const [items, setItems] = useState<RestockItem[]>([])
  const [totals, setTotals] = useState(EMPTY_TOTALS)
  const [itemsLoading, setItemsLoading] = useState(true)
  const [migrationRequired, setMigrationRequired] = useState(false)

  const [status, setStatus] = useState<StatusFilter>("needed")
  const [supplierFilter, setSupplierFilter] = useState("")
  const [replyFilter, setReplyFilter] = useState<ReplyFilter>("all")
  const [search, setSearch] = useState("")
  const [supplierSearch, setSupplierSearch] = useState("")

  const [modalOpen, setModalOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [activeSupplier, setActiveSupplier] = useState<Supplier | null>(null)
  const [portalSupplier, setPortalSupplier] = useState<SupplierWithStats | null>(null)
  const [assigningProduct, setAssigningProduct] = useState<RestockItem | null>(null)
  const [assignTarget, setAssignTarget] = useState("")

  const fetchSuppliers = useCallback(async () => {
    try {
      setSuppliersLoading(true)
      const res = await inventorySuppliersService.getAll({ withStats: true })
      setSuppliers(res.data || [])
      if (res.migration_required) setMigrationRequired(true)
    } catch (error: any) {
      console.error("Failed to load suppliers:", error)
      toast.error(error.message || "Failed to load suppliers")
    } finally {
      setSuppliersLoading(false)
    }
  }, [])

  const fetchRestock = useCallback(async () => {
    try {
      setItemsLoading(true)
      const res = await inventorySuppliersService.getRestockSummary({
        status,
        supplier_id: supplierFilter || undefined,
        search: search.trim() || undefined,
      })
      setItems(res.data || [])
      setTotals({ ...EMPTY_TOTALS, ...(res.totals || {}) })
      setMigrationRequired(Boolean(res.migration_required))
    } catch (error: any) {
      console.error("Failed to load restock summary:", error)
      toast.error(error.message || "Failed to load restock data")
    } finally {
      setItemsLoading(false)
    }
  }, [status, supplierFilter, search])

  useEffect(() => {
    fetchSuppliers()
  }, [fetchSuppliers])

  useEffect(() => {
    const timer = setTimeout(fetchRestock, search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [fetchRestock, search])

  useEffect(() => {
    const handleUpdate = () => {
      fetchSuppliers()
      fetchRestock()
    }
    window.addEventListener("inventoryUpdated", handleUpdate)
    window.addEventListener("productUpdated", handleUpdate)
    return () => {
      window.removeEventListener("inventoryUpdated", handleUpdate)
      window.removeEventListener("productUpdated", handleUpdate)
    }
  }, [fetchSuppliers, fetchRestock])

  const refreshAll = () => {
    fetchSuppliers()
    fetchRestock()
  }

  const handleDeleteSupplier = async (supplier: SupplierWithStats) => {
    if (
      !confirm(
        `Delete supplier "${supplier.name}"?\n\nTheir product list will be removed. Past purchase records are kept.`
      )
    ) {
      return
    }
    try {
      await inventorySuppliersService.delete(supplier.id)
      setSuppliers((prev) => prev.filter((row) => row.id !== supplier.id))
      toast.success("Supplier deleted")
      if (supplierFilter === supplier.id) setSupplierFilter("")
      fetchRestock()
    } catch (error: any) {
      console.error("Failed to delete supplier:", error)
      toast.error(error.message || "Failed to delete supplier")
    }
  }

  const handleAssignSupplier = async () => {
    if (!assigningProduct || !assignTarget) {
      toast.error("Choose a supplier first")
      return
    }
    try {
      await inventorySuppliersService.addProducts(assignTarget, { product_ids: [assigningProduct.product_id] })
      const supplierName = suppliers.find((s) => s.id === assignTarget)?.name || "supplier"
      toast.success(`"${assigningProduct.name}" assigned to ${supplierName}`)
      setAssigningProduct(null)
      setAssignTarget("")
      refreshAll()
    } catch (error: any) {
      console.error("Failed to assign supplier:", error)
      toast.error(error.message || "Failed to assign supplier")
    }
  }

  /**
   * The reply filter is applied here rather than server-side: the restock
   * payload already carries every supplier's answer, so re-fetching to narrow
   * it would only add a round trip.
   *
   * When one supplier is selected above, only that supplier's answer counts —
   * otherwise "can supply" would match a product any other supplier confirmed.
   */
  const visibleItems = useMemo(() => {
    if (replyFilter === "all") return items
    const scoped = (item: RestockItem) => {
      const list = item.suppliers || []
      const isRealSupplier = supplierFilter && supplierFilter !== "unassigned"
      return isRealSupplier ? list.filter((s) => s.id === supplierFilter) : list
    }
    if (replyFilter === "waiting") {
      return items.filter((item) => {
        const list = scoped(item)
        // Nobody to wait on is not the same as waiting.
        return list.length > 0 && list.every((s) => !s.response || s.response.status === "pending")
      })
    }
    return items.filter((item) => scoped(item).some((s) => s.response?.status === replyFilter))
  }, [items, replyFilter, supplierFilter])

  const filteredSuppliers = useMemo(() => {
    const term = supplierSearch.trim().toLowerCase()
    if (!term) return suppliers
    return suppliers.filter(
      (supplier) =>
        supplier.name.toLowerCase().includes(term) ||
        (supplier.contact_person || "").toLowerCase().includes(term) ||
        (supplier.phone || "").toLowerCase().includes(term) ||
        (supplier.email || "").toLowerCase().includes(term)
    )
  }, [suppliers, supplierSearch])

  const statCards = [
    {
      label: "Suppliers",
      value: suppliers.length,
      icon: Truck,
      iconClass: "text-primary",
      bgClass: "bg-primary/10",
      valueClass: "",
    },
    {
      label: "Out of Stock",
      value: totals.out_of_stock,
      icon: PackageX,
      iconClass: "text-red-600",
      bgClass: "bg-red-100",
      valueClass: totals.out_of_stock > 0 ? "text-red-600" : "",
    },
    {
      label: "Low Stock",
      value: totals.low_stock,
      icon: AlertTriangle,
      iconClass: "text-amber-600",
      bgClass: "bg-amber-100",
      valueClass: totals.low_stock > 0 ? "text-amber-600" : "",
    },
    {
      label: "Units Wanted",
      value: totals.needed_units,
      icon: Boxes,
      iconClass: "text-blue-600",
      bgClass: "bg-blue-100",
      valueClass: "",
    },
  ]

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Suppliers & Restocking</h1>
            <p className="text-muted-foreground mt-1">
              See what is running out, who supplies it and how much to order — all from here.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={refreshAll} className="gap-2">
              <RefreshCcw className={`w-4 h-4 ${itemsLoading || suppliersLoading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button
              onClick={() => {
                setEditingSupplier(null)
                setModalOpen(true)
              }}
              className="gap-2 font-bold"
            >
              <Plus className="w-4 h-4" /> Add Supplier
            </Button>
          </div>
        </div>

        {migrationRequired && (
          <div className="flex items-start gap-3 border border-amber-300 bg-amber-50 text-amber-900 rounded-xl p-4">
            <Info className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-bold">Supplier product lists are not enabled yet.</p>
              <p className="mt-0.5">
                Run <code className="font-mono bg-amber-100 px-1 rounded">supabase/migrations/supplier_management.sql</code>{" "}
                in the Supabase SQL editor to link products to suppliers and set restock targets. Everything else on this
                page keeps working.
              </p>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
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
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-card border border-border p-5 rounded-2xl shadow-sm bg-gradient-to-br from-card to-primary/5"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10">
                <Wallet className="w-6 h-6 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-wider">Est. Restock Cost</p>
                <p className="text-2xl font-black text-primary truncate">{formatCurrency(totals.estimated_cost)}</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Tabs */}
        <div className="flex bg-muted p-1 rounded-lg w-full sm:w-fit">
          <button
            onClick={() => setTab("restock")}
            className={`flex-1 sm:flex-none px-5 py-2 rounded-md text-sm font-bold transition-all ${
              tab === "restock" ? "bg-card shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Restock Needs
          </button>
          <button
            onClick={() => setTab("suppliers")}
            className={`flex-1 sm:flex-none px-5 py-2 rounded-md text-sm font-bold transition-all ${
              tab === "suppliers" ? "bg-card shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Suppliers ({suppliers.length})
          </button>
        </div>

        {tab === "restock" ? (
          <>
            {/* Filters */}
            <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center bg-card border border-border p-4 rounded-xl shadow-sm">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by product, model or barcode..."
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
                <option value="">All suppliers</option>
                <option value="unassigned">⚠ No supplier assigned ({totals.unassigned})</option>
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
                      status === option.id ? option.activeClass : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Portal replies */}
            <div className="flex flex-wrap items-center gap-3 -mt-1">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <MessageSquare className="w-3.5 h-3.5" /> Supplier replies
              </span>
              <div className="flex bg-muted p-1 rounded-lg overflow-x-auto">
                {REPLY_FILTERS.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setReplyFilter(option.id)}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold whitespace-nowrap transition-all ${
                      replyFilter === option.id ? option.activeClass : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {replyFilter !== "all" && (
                <span className="text-xs text-muted-foreground font-medium">
                  {visibleItems.length} of {items.length} shown
                </span>
              )}
            </div>

            {/* Restock table */}
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="p-4 font-bold text-xs uppercase tracking-wider text-muted-foreground">Product</th>
                      <th className="p-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-center">In Stock</th>
                      <th className="p-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-center">Target</th>
                      <th className="p-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-center">Wanted</th>
                      <th className="p-4 font-bold text-xs uppercase tracking-wider text-muted-foreground">Status</th>
                      <th className="p-4 font-bold text-xs uppercase tracking-wider text-muted-foreground">Supplier</th>
                      <th className="p-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-right">Est. Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemsLoading ? (
                      [...Array(5)].map((_, i) => (
                        <tr key={i} className="animate-pulse border-b border-border">
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="h-12 w-12 bg-muted rounded-lg" />
                              <div>
                                <div className="h-4 w-40 bg-muted rounded mb-2" />
                                <div className="h-3 w-24 bg-muted rounded" />
                              </div>
                            </div>
                          </td>
                          <td className="p-4"><div className="h-6 w-10 bg-muted rounded mx-auto" /></td>
                          <td className="p-4"><div className="h-6 w-10 bg-muted rounded mx-auto" /></td>
                          <td className="p-4"><div className="h-6 w-10 bg-muted rounded mx-auto" /></td>
                          <td className="p-4"><div className="h-6 w-24 bg-muted rounded-full" /></td>
                          <td className="p-4"><div className="h-6 w-28 bg-muted rounded" /></td>
                          <td className="p-4"><div className="h-4 w-20 bg-muted rounded ml-auto" /></td>
                        </tr>
                      ))
                    ) : visibleItems.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-16 text-center">
                          <Package className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
                          <p className="text-muted-foreground font-medium">
                            {replyFilter !== "all" && items.length > 0
                              ? "No product matches that reply yet. "
                              : status === "needed" || status === "out" || status === "low"
                                ? "Nothing needs restocking right now. "
                                : "No products found. "}
                            {(supplierFilter || search || replyFilter !== "all") && "Try clearing the filters."}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      visibleItems.map((item) => (
                        <tr key={item.product_id} className="border-b border-border hover:bg-muted/30 transition-colors">
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden border border-border shrink-0">
                                {item.image ? (
                                  <img src={item.image} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <Package className="w-6 h-6 text-muted-foreground" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <h4 className="font-bold leading-tight line-clamp-1">{item.name}</h4>
                                <p className="text-[10px] text-muted-foreground font-mono">
                                  {item.barcode || "NO BARCODE"}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            <span className={`text-2xl font-black ${item.quantity <= 0 ? "text-red-600" : ""}`}>
                              {item.quantity}
                            </span>
                            <p className="text-[9px] text-muted-foreground mt-0.5">
                              M {item.qty_meegoda} · P {item.qty_padukka} · PN {item.qty_padukka_new}
                            </p>
                          </td>
                          <td className="p-4 text-center">
                            <span className="text-lg font-bold text-muted-foreground">{item.target_stock_level}</span>
                            {item.is_target_auto && (
                              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">auto</p>
                            )}
                          </td>
                          <td className="p-4 text-center">
                            <span className={`text-2xl font-black ${item.needed_qty > 0 ? "text-primary" : "text-muted-foreground"}`}>
                              {item.needed_qty}
                            </span>
                          </td>
                          <td className="p-4">
                            {item.status === "out" ? (
                              <Badge className="bg-red-500 hover:bg-red-600 border-0 flex items-center gap-1 w-fit">
                                <PackageX className="w-3 h-3" /> OUT OF STOCK
                              </Badge>
                            ) : item.status === "low" ? (
                              <Badge className="bg-amber-500 hover:bg-amber-600 border-0 flex items-center gap-1 w-fit">
                                <AlertTriangle className="w-3 h-3" /> LOW STOCK
                              </Badge>
                            ) : (
                              <Badge className="bg-green-500 hover:bg-green-600 border-0 w-fit">IN STOCK</Badge>
                            )}
                          </td>
                          <td className="p-4">
                            {item.suppliers && item.suppliers.length > 0 ? (
                              <div className="flex flex-col gap-1.5">
                                {item.suppliers.map((supplier) => {
                                  const reply = supplier.response
                                  const meta = reply ? REPLY_META[reply.status] : null
                                  return (
                                    <div key={supplier.id} className="flex flex-col gap-0.5 items-start">
                                      <button
                                        onClick={() => {
                                          const full = suppliers.find((s) => s.id === supplier.id)
                                          if (full) setActiveSupplier(full)
                                        }}
                                        className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full border border-border bg-muted/50 hover:bg-primary/10 hover:text-primary transition-colors"
                                      >
                                        {supplier.name}
                                        <ChevronRight className="w-3 h-3" />
                                      </button>
                                      {reply && meta ? (
                                        <span
                                          title={[
                                            `Replied ${formatRepliedAt(reply.responded_at)}`,
                                            reply.expected_date ? `Expected ${reply.expected_date}` : "",
                                            reply.note ? `Note: ${reply.note}` : "",
                                          ]
                                            .filter(Boolean)
                                            .join("\n")}
                                          className={`inline-flex items-center gap-1 pl-2 text-[10px] font-bold ${meta.textClass}`}
                                        >
                                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dotClass}`} />
                                          {meta.label}
                                          {reply.available_qty != null && ` · ${reply.available_qty} units`}
                                          {reply.expected_date && ` · by ${formatExpectedDate(reply.expected_date)}`}
                                          {reply.note && <MessageSquare className="w-2.5 h-2.5 opacity-70" />}
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 pl-2 text-[10px] font-medium text-muted-foreground">
                                          <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-muted-foreground/40" />
                                          No reply yet
                                        </span>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            ) : assigningProduct?.product_id === item.product_id ? (
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={assignTarget}
                                  onChange={(e) => setAssignTarget(e.target.value)}
                                  autoFocus
                                  className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium outline-none max-w-[160px]"
                                >
                                  <option value="">Choose supplier...</option>
                                  {suppliers.map((supplier) => (
                                    <option key={supplier.id} value={supplier.id}>
                                      {supplier.name}
                                    </option>
                                  ))}
                                </select>
                                <Button size="sm" className="h-8 px-2 text-xs font-bold" onClick={handleAssignSupplier}>
                                  Save
                                </Button>
                                <button
                                  onClick={() => {
                                    setAssigningProduct(null)
                                    setAssignTarget("")
                                  }}
                                  className="text-xs text-muted-foreground hover:text-foreground px-1"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  if (suppliers.length === 0) {
                                    toast.error("Add a supplier first")
                                    return
                                  }
                                  setAssigningProduct(item)
                                  setAssignTarget("")
                                }}
                                className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-primary transition-colors"
                              >
                                <Link2 className="w-3 h-3" /> Assign supplier
                              </button>
                            )}
                          </td>
                          <td className="p-4 text-right">
                            <span className="font-black text-sm">
                              {item.estimated_cost > 0 ? formatCurrency(item.estimated_cost) : "—"}
                            </span>
                            {item.unit_cost > 0 && item.suggested_qty > 0 && (
                              <p className="text-[9px] text-muted-foreground">
                                {item.suggested_qty} × {formatCurrency(item.unit_cost)}
                              </p>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Supplier search */}
            <div className="bg-card border border-border p-4 rounded-xl shadow-sm">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search suppliers by name, contact, phone or email..."
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
                <Truck className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
                <p className="font-bold text-lg">
                  {suppliers.length === 0 ? "No suppliers yet" : "No suppliers match your search"}
                </p>
                <p className="text-muted-foreground text-sm mt-1">
                  {suppliers.length === 0
                    ? "Add your first supplier to start tracking who delivers what."
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
                    <Plus className="w-4 h-4" /> Add Supplier
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredSuppliers.map((supplier, index) => {
                  const needsAttention = supplier.stats.out_of_stock + supplier.stats.low_stock
                  return (
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
                            <Truck className="w-5 h-5 text-primary" />
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
                        {needsAttention > 0 && (
                          <Badge className="bg-red-500 hover:bg-red-600 border-0 shrink-0">{needsAttention} to order</Badge>
                        )}
                      </div>

                      <div className="flex flex-col gap-1 mt-3 text-xs text-muted-foreground">
                        {supplier.phone && (
                          <a href={`tel:${supplier.phone}`} className="flex items-center gap-1.5 hover:text-primary w-fit">
                            <Phone className="w-3 h-3" /> {supplier.phone}
                          </a>
                        )}
                        {supplier.email && (
                          <a href={`mailto:${supplier.email}`} className="flex items-center gap-1.5 hover:text-primary w-fit truncate">
                            <Mail className="w-3 h-3 shrink-0" /> <span className="truncate">{supplier.email}</span>
                          </a>
                        )}
                      </div>

                      <div className="grid grid-cols-4 gap-2 mt-4 pt-4 border-t border-border">
                        <div className="text-center">
                          <p className="text-xl font-black">{supplier.stats.products}</p>
                          <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Items</p>
                        </div>
                        <div className="text-center">
                          <p className={`text-xl font-black ${supplier.stats.out_of_stock > 0 ? "text-red-600" : ""}`}>
                            {supplier.stats.out_of_stock}
                          </p>
                          <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Out</p>
                        </div>
                        <div className="text-center">
                          <p className={`text-xl font-black ${supplier.stats.low_stock > 0 ? "text-amber-600" : ""}`}>
                            {supplier.stats.low_stock}
                          </p>
                          <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Low</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xl font-black text-primary">{supplier.stats.needed_units}</p>
                          <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Wanted</p>
                        </div>
                      </div>

                      {supplier.stats.estimated_cost > 0 && (
                        <p className="text-xs text-muted-foreground mt-3">
                          Estimated restock:{" "}
                          <span className="font-bold text-foreground">{formatCurrency(supplier.stats.estimated_cost)}</span>
                        </p>
                      )}
                      {supplier.last_purchase_at && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Last order {new Date(supplier.last_purchase_at).toLocaleDateString("en-GB")} ·{" "}
                          {supplier.purchase_count} total
                        </p>
                      )}

                      <div className="mt-4 pt-4 border-t border-border">
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <div className="min-w-0">
                            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                              Supplier portal
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {supplier.portal_enabled
                                ? supplier.portal_last_login_at
                                  ? `Last sign-in ${new Date(supplier.portal_last_login_at).toLocaleDateString("en-GB")}`
                                  : "Enabled - not signed in yet"
                                : "No access"}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 shrink-0"
                            onClick={() => setPortalSupplier(supplier)}
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            {supplier.portal_enabled ? "Manage" : "Give access"}
                          </Button>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1 font-bold" onClick={() => setActiveSupplier(supplier)}>
                          Manage Stock
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingSupplier(supplier)
                            setModalOpen(true)
                          }}
                          aria-label="Edit supplier"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteSupplier(supplier)}
                          className="hover:bg-red-500/10 hover:text-red-500"
                          aria-label="Delete supplier"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </>
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
            onSaved={(saved) => {
              refreshAll()
              if (activeSupplier && saved && activeSupplier.id === saved.id) setActiveSupplier(saved)
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeSupplier && (
          <SupplierDetailModal
            supplier={activeSupplier}
            onClose={() => setActiveSupplier(null)}
            onEdit={() => {
              setEditingSupplier(activeSupplier)
              setModalOpen(true)
            }}
            onChanged={refreshAll}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {portalSupplier && (
          <SupplierPortalModal
            supplier={portalSupplier}
            onClose={() => setPortalSupplier(null)}
            onSaved={refreshAll}
          />
        )}
      </AnimatePresence>
    </AdminLayout>
  )
}
