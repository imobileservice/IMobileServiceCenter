"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import {
  X,
  Package,
  Search,
  Plus,
  Trash2,
  AlertTriangle,
  PackageX,
  CheckCircle2,
  RefreshCcw,
  Truck,
  Phone,
  Mail,
  MapPin,
  User,
  ClipboardList,
  Wand2,
  Save,
  History,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/utils/currency"
import {
  inventoryPurchasesService,
  inventorySuppliersService,
  type RestockItem,
  type Supplier,
  type SupplierStats,
} from "@/lib/services/inventory.service"
import { toast } from "sonner"

const SHOPS = ["Meegoda", "Padukka", "Padukka new"]

interface SupplierDetailModalProps {
  supplier: Supplier
  onClose: () => void
  onEdit: () => void
  /** Called after anything that changes stock or links, so the parent can refresh. */
  onChanged: () => void
}

const EMPTY_TOTALS: SupplierStats = {
  products: 0,
  out_of_stock: 0,
  low_stock: 0,
  healthy: 0,
  needed_units: 0,
  estimated_cost: 0,
}

function StatusBadge({ status }: { status: RestockItem["status"] }) {
  if (status === "out") {
    return (
      <Badge className="bg-red-500 hover:bg-red-600 border-0 flex items-center gap-1 w-fit">
        <PackageX className="w-3 h-3" /> OUT OF STOCK
      </Badge>
    )
  }
  if (status === "low") {
    return (
      <Badge className="bg-amber-500 hover:bg-amber-600 border-0 flex items-center gap-1 w-fit">
        <AlertTriangle className="w-3 h-3" /> LOW STOCK
      </Badge>
    )
  }
  return (
    <Badge className="bg-green-500 hover:bg-green-600 border-0 flex items-center gap-1 w-fit">
      <CheckCircle2 className="w-3 h-3" /> IN STOCK
    </Badge>
  )
}

export default function SupplierDetailModal({ supplier, onClose, onEdit, onChanged }: SupplierDetailModalProps) {
  const [tab, setTab] = useState<"products" | "history">("products")
  const [items, setItems] = useState<RestockItem[]>([])
  const [totals, setTotals] = useState<SupplierStats>(EMPTY_TOTALS)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [orderQty, setOrderQty] = useState<Record<string, number>>({})
  const [unitCost, setUnitCost] = useState<Record<string, number>>({})
  const [targetDraft, setTargetDraft] = useState<Record<string, string>>({})
  const [shop, setShop] = useState(SHOPS[0])
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)

  const [showPicker, setShowPicker] = useState(false)
  const [pickerSearch, setPickerSearch] = useState("")
  const [pickerItems, setPickerItems] = useState<any[]>([])
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(new Set())
  const [pickerLoading, setPickerLoading] = useState(false)

  const [purchases, setPurchases] = useState<any[]>([])
  const [purchasesLoading, setPurchasesLoading] = useState(false)

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true)
      const res = await inventorySuppliersService.getProducts(supplier.id)
      const data = res.data || []
      setItems(data)
      setTotals(res.totals || EMPTY_TOTALS)
      setOrderQty((prev) => {
        const next: Record<string, number> = {}
        for (const item of data) {
          next[item.product_id] = prev[item.product_id] ?? item.suggested_qty
        }
        return next
      })
      setUnitCost((prev) => {
        const next: Record<string, number> = {}
        for (const item of data) {
          next[item.product_id] = prev[item.product_id] ?? item.unit_cost
        }
        return next
      })
      setTargetDraft(() => {
        const next: Record<string, string> = {}
        for (const item of data) {
          next[item.product_id] = item.is_target_auto ? "" : String(item.target_stock_level)
        }
        return next
      })
      setSelected((prev) => new Set([...prev].filter((id) => data.some((item) => item.product_id === id))))
      if (res.migration_required) {
        toast.error("Run supabase/migrations/supplier_management.sql to enable supplier product lists")
      }
    } catch (error: any) {
      console.error("Failed to load supplier products:", error)
      toast.error(error.message || "Failed to load supplier products")
    } finally {
      setLoading(false)
    }
  }, [supplier.id])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  useEffect(() => {
    if (tab !== "history" || purchases.length > 0) return
    const load = async () => {
      try {
        setPurchasesLoading(true)
        const res = await inventorySuppliersService.getPurchases(supplier.id)
        setPurchases(res.data || [])
      } catch (error: any) {
        console.error("Failed to load purchase history:", error)
        toast.error("Failed to load order history")
      } finally {
        setPurchasesLoading(false)
      }
    }
    load()
  }, [tab, supplier.id, purchases.length])

  // ─── Product picker ───────────────────────────────
  useEffect(() => {
    if (!showPicker) return
    let cancelled = false
    const load = async () => {
      try {
        setPickerLoading(true)
        const res = await inventorySuppliersService.getAvailableProducts(supplier.id, pickerSearch || undefined)
        if (!cancelled) setPickerItems(res.data || [])
      } catch (error: any) {
        console.error("Failed to load products:", error)
        if (!cancelled) toast.error("Failed to load products")
      } finally {
        if (!cancelled) setPickerLoading(false)
      }
    }
    const timer = setTimeout(load, pickerSearch ? 300 : 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [showPicker, pickerSearch, supplier.id])

  const handleAddProducts = async () => {
    if (pickerSelected.size === 0) {
      toast.error("Select at least one product")
      return
    }
    try {
      setSaving(true)
      await inventorySuppliersService.addProducts(supplier.id, { product_ids: [...pickerSelected] })
      toast.success(`${pickerSelected.size} product${pickerSelected.size > 1 ? "s" : ""} added to ${supplier.name}`)
      setPickerSelected(new Set())
      setShowPicker(false)
      setPickerSearch("")
      await fetchProducts()
      onChanged()
    } catch (error: any) {
      console.error("Failed to add products:", error)
      toast.error(error.message || "Failed to add products")
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveProduct = async (item: RestockItem) => {
    if (!confirm(`Remove "${item.name}" from ${supplier.name}'s product list?`)) return
    try {
      await inventorySuppliersService.removeProduct(supplier.id, item.product_id)
      setItems((prev) => prev.filter((row) => row.product_id !== item.product_id))
      toast.success("Product removed from supplier")
      onChanged()
    } catch (error: any) {
      console.error("Failed to remove product:", error)
      toast.error(error.message || "Failed to remove product")
    }
  }

  const handleSaveTarget = async (item: RestockItem) => {
    const raw = targetDraft[item.product_id]
    const value = raw === "" || raw === undefined ? 0 : Number(raw)
    if (Number.isNaN(value) || value < 0) {
      toast.error("Enter a valid target quantity")
      return
    }
    if (!item.is_target_auto && value === item.target_stock_level) return
    if (item.is_target_auto && value === 0) return

    try {
      await inventorySuppliersService.updateProduct(supplier.id, item.product_id, { target_stock_level: value })
      toast.success(value > 0 ? `Restock target set to ${value}` : "Restock target reset to automatic")
      await fetchProducts()
      onChanged()
    } catch (error: any) {
      console.error("Failed to update target:", error)
      toast.error(error.message || "Failed to update restock target")
    }
  }

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return items
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(term) ||
        (item.barcode || "").toLowerCase().includes(term) ||
        (item.brand || "").toLowerCase().includes(term)
    )
  }, [items, search])

  const toggleSelected = (productId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
  }

  const autoFillNeeded = () => {
    const needing = items.filter((item) => item.suggested_qty > 0)
    if (needing.length === 0) {
      toast.info("Nothing needs restocking from this supplier right now")
      return
    }
    setOrderQty((prev) => {
      const next = { ...prev }
      for (const item of needing) next[item.product_id] = item.suggested_qty
      return next
    })
    setSelected(new Set(needing.map((item) => item.product_id)))
    toast.success(`${needing.length} item${needing.length > 1 ? "s" : ""} filled with the quantity needed`)
  }

  const orderLines = useMemo(
    () =>
      items
        .filter((item) => selected.has(item.product_id))
        .map((item) => ({
          item,
          quantity: Number(orderQty[item.product_id] || 0),
          cost: Number(unitCost[item.product_id] ?? item.unit_cost ?? 0),
        }))
        .filter((line) => line.quantity > 0),
    [items, selected, orderQty, unitCost]
  )

  const orderUnits = orderLines.reduce((sum, line) => sum + line.quantity, 0)
  const orderTotal = orderLines.reduce((sum, line) => sum + line.quantity * line.cost, 0)

  const handleRecordRestock = async () => {
    if (orderLines.length === 0) {
      toast.error("Select products and enter quantities first")
      return
    }
    const missingCost = orderLines.find((line) => line.cost <= 0)
    if (missingCost) {
      toast.error(`Enter a unit cost for "${missingCost.item.name}"`)
      return
    }

    if (
      !confirm(
        `Record ${orderUnits} unit(s) received from ${supplier.name} into ${shop}?\nTotal: ${formatCurrency(orderTotal)}`
      )
    ) {
      return
    }

    try {
      setSaving(true)
      await inventoryPurchasesService.create({
        supplier_id: supplier.id,
        supplier_name: supplier.name,
        shop,
        notes: notes.trim() || undefined,
        created_by: "admin",
        items: orderLines.map((line) => ({
          product_id: line.item.product_id,
          quantity: line.quantity,
          cost_price: line.cost,
        })),
      })

      toast.success(`Stock received from ${supplier.name} into ${shop}`)
      setSelected(new Set())
      setNotes("")
      setPurchases([])
      await fetchProducts()
      onChanged()
      window.dispatchEvent(new CustomEvent("inventoryUpdated", { detail: { type: "purchase", supplier_id: supplier.id } }))
    } catch (error: any) {
      console.error("Failed to record restock:", error)
      toast.error(error.message || "Failed to record restock")
    } finally {
      setSaving(false)
    }
  }

  const stats = [
    { label: "Products", value: totals.products, className: "text-foreground" },
    { label: "Out of stock", value: totals.out_of_stock, className: "text-red-600" },
    { label: "Low stock", value: totals.low_stock, className: "text-amber-600" },
    { label: "Units wanted", value: totals.needed_units, className: "text-primary" },
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.97, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.97, opacity: 0 }}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-6xl my-4 flex flex-col max-h-[95vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="p-3 bg-primary/10 rounded-xl shrink-0">
                <Truck className="w-6 h-6 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="text-2xl font-bold tracking-tight truncate">{supplier.name}</h2>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                  {supplier.contact_person && (
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" /> {supplier.contact_person}
                    </span>
                  )}
                  {supplier.phone && (
                    <a href={`tel:${supplier.phone}`} className="flex items-center gap-1 hover:text-primary">
                      <Phone className="w-3 h-3" /> {supplier.phone}
                    </a>
                  )}
                  {supplier.email && (
                    <a href={`mailto:${supplier.email}`} className="flex items-center gap-1 hover:text-primary">
                      <Mail className="w-3 h-3" /> {supplier.email}
                    </a>
                  )}
                  {supplier.address && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {supplier.address}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={onEdit} className="gap-1.5">
                Edit
              </Button>
              <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {supplier.notes && (
            <p className="mt-3 text-xs text-muted-foreground bg-muted/50 border border-border rounded-lg p-3">
              {supplier.notes}
            </p>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-5">
            {stats.map((stat) => (
              <div key={stat.label} className="bg-muted/40 border border-border rounded-xl p-3">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{stat.label}</p>
                <p className={`text-2xl font-black ${stat.className}`}>{stat.value}</p>
              </div>
            ))}
            <div className="bg-muted/40 border border-border rounded-xl p-3 col-span-2 lg:col-span-1">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Est. restock cost</p>
              <p className="text-lg font-black text-primary truncate">{formatCurrency(totals.estimated_cost)}</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex bg-muted p-1 rounded-lg w-full sm:w-fit mt-5">
            <button
              onClick={() => setTab("products")}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                tab === "products" ? "bg-card shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ClipboardList className="w-4 h-4" /> Products & Needs
            </button>
            <button
              onClick={() => setTab("history")}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-md text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                tab === "history" ? "bg-card shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <History className="w-4 h-4" /> Order History
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {tab === "products" ? (
            <div className="p-5 sm:p-6 space-y-4">
              {/* Toolbar */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search this supplier's products..."
                    className="pl-10"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Button variant="outline" onClick={autoFillNeeded} className="gap-2 font-bold">
                  <Wand2 className="w-4 h-4" /> Fill What's Needed
                </Button>
                <Button onClick={() => setShowPicker(true)} className="gap-2 font-bold">
                  <Plus className="w-4 h-4" /> Add Products
                </Button>
              </div>

              {/* Product picker */}
              {showPicker && (
                <div className="border-2 border-dashed border-primary/40 rounded-xl p-4 bg-primary/5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="font-bold text-sm">Add products this supplier delivers</h4>
                    <button
                      onClick={() => {
                        setShowPicker(false)
                        setPickerSelected(new Set())
                        setPickerSearch("")
                      }}
                      className="p-1 hover:bg-muted rounded-lg"
                      aria-label="Close picker"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search products by name, model or barcode..."
                      className="pl-10 bg-card"
                      value={pickerSearch}
                      onChange={(e) => setPickerSearch(e.target.value)}
                    />
                  </div>

                  <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-card divide-y divide-border">
                    {pickerLoading ? (
                      <p className="p-4 text-sm text-muted-foreground text-center">Loading products...</p>
                    ) : pickerItems.length === 0 ? (
                      <p className="p-4 text-sm text-muted-foreground text-center italic">
                        {pickerSearch ? "No matching products left to add." : "Every product is already linked to this supplier."}
                      </p>
                    ) : (
                      pickerItems.map((product) => {
                        const checked = pickerSelected.has(product.id)
                        return (
                          <label
                            key={product.id}
                            className={`flex items-center gap-3 p-3 cursor-pointer transition-colors ${
                              checked ? "bg-primary/10" : "hover:bg-muted/50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setPickerSelected((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(product.id)) next.delete(product.id)
                                  else next.add(product.id)
                                  return next
                                })
                              }
                              className="w-4 h-4 accent-primary"
                            />
                            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center overflow-hidden border border-border shrink-0">
                              {product.image ? (
                                <img src={product.image} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <Package className="w-4 h-4 text-muted-foreground" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold truncate">{product.name}</p>
                              <p className="text-[10px] text-muted-foreground font-mono">
                                {product.barcode || "NO BARCODE"} · stock {product.stock}
                              </p>
                            </div>
                            <span className="text-xs font-bold text-primary shrink-0">{formatCurrency(product.unit_cost)}</span>
                          </label>
                        )
                      })
                    )}
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setShowPicker(false)
                        setPickerSelected(new Set())
                      }}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleAddProducts} disabled={saving || pickerSelected.size === 0} className="font-bold">
                      Add {pickerSelected.size > 0 ? `${pickerSelected.size} ` : ""}Product{pickerSelected.size === 1 ? "" : "s"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Product table */}
              <div className="border border-border rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[900px]">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="p-3 w-10"></th>
                        <th className="p-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Product</th>
                        <th className="p-3 font-bold text-xs uppercase tracking-wider text-muted-foreground text-center">In Stock</th>
                        <th className="p-3 font-bold text-xs uppercase tracking-wider text-muted-foreground text-center">Target</th>
                        <th className="p-3 font-bold text-xs uppercase tracking-wider text-muted-foreground text-center">Wanted</th>
                        <th className="p-3 font-bold text-xs uppercase tracking-wider text-muted-foreground">Status</th>
                        <th className="p-3 font-bold text-xs uppercase tracking-wider text-muted-foreground text-center">Order Qty</th>
                        <th className="p-3 font-bold text-xs uppercase tracking-wider text-muted-foreground text-center">Unit Cost</th>
                        <th className="p-3 font-bold text-xs uppercase tracking-wider text-muted-foreground text-right">Line Total</th>
                        <th className="p-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        [...Array(4)].map((_, i) => (
                          <tr key={i} className="animate-pulse border-b border-border">
                            <td className="p-3"><div className="h-4 w-4 bg-muted rounded" /></td>
                            <td className="p-3"><div className="h-4 w-40 bg-muted rounded" /></td>
                            <td className="p-3"><div className="h-4 w-10 bg-muted rounded mx-auto" /></td>
                            <td className="p-3"><div className="h-4 w-10 bg-muted rounded mx-auto" /></td>
                            <td className="p-3"><div className="h-4 w-10 bg-muted rounded mx-auto" /></td>
                            <td className="p-3"><div className="h-6 w-24 bg-muted rounded-full" /></td>
                            <td className="p-3"><div className="h-8 w-16 bg-muted rounded mx-auto" /></td>
                            <td className="p-3"><div className="h-8 w-20 bg-muted rounded mx-auto" /></td>
                            <td className="p-3"><div className="h-4 w-16 bg-muted rounded ml-auto" /></td>
                            <td className="p-3"></td>
                          </tr>
                        ))
                      ) : filteredItems.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="p-12 text-center">
                            <Package className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                            <p className="text-muted-foreground font-medium">
                              {items.length === 0
                                ? "No products linked to this supplier yet."
                                : "No products match your search."}
                            </p>
                            {items.length === 0 && (
                              <Button variant="outline" className="mt-4 gap-2" onClick={() => setShowPicker(true)}>
                                <Plus className="w-4 h-4" /> Add the first product
                              </Button>
                            )}
                          </td>
                        </tr>
                      ) : (
                        filteredItems.map((item) => {
                          const qty = Number(orderQty[item.product_id] || 0)
                          const cost = Number(unitCost[item.product_id] ?? item.unit_cost ?? 0)
                          const isSelected = selected.has(item.product_id)
                          return (
                            <tr
                              key={item.product_id}
                              className={`border-b border-border transition-colors ${
                                isSelected ? "bg-primary/5" : "hover:bg-muted/30"
                              }`}
                            >
                              <td className="p-3">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelected(item.product_id)}
                                  className="w-4 h-4 accent-primary"
                                  aria-label={`Select ${item.name}`}
                                />
                              </td>
                              <td className="p-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden border border-border shrink-0">
                                    {item.image ? (
                                      <img src={item.image} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                      <Package className="w-5 h-5 text-muted-foreground" />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-bold text-sm leading-tight line-clamp-1">{item.name}</p>
                                    <p className="text-[10px] text-muted-foreground font-mono">
                                      {item.barcode || "NO BARCODE"}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="p-3 text-center">
                                <span className={`text-xl font-black ${item.quantity <= 0 ? "text-red-600" : ""}`}>
                                  {item.quantity}
                                </span>
                                <p className="text-[9px] text-muted-foreground mt-0.5">
                                  M {item.qty_meegoda} · P {item.qty_padukka} · PN {item.qty_padukka_new}
                                </p>
                              </td>
                              <td className="p-3">
                                <div className="flex items-center gap-1 justify-center">
                                  <Input
                                    type="number"
                                    min={0}
                                    value={targetDraft[item.product_id] ?? ""}
                                    placeholder={`${item.target_stock_level}`}
                                    onChange={(e) =>
                                      setTargetDraft((prev) => ({ ...prev, [item.product_id]: e.target.value }))
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") handleSaveTarget(item)
                                    }}
                                    className="h-8 w-16 text-center text-sm font-bold px-1"
                                    title={item.is_target_auto ? "Automatic (low stock threshold x2)" : "Custom restock target"}
                                  />
                                  <button
                                    onClick={() => handleSaveTarget(item)}
                                    className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-primary"
                                    title="Save restock target"
                                  >
                                    <Save className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                              <td className="p-3 text-center">
                                <span className={`text-xl font-black ${item.needed_qty > 0 ? "text-primary" : "text-muted-foreground"}`}>
                                  {item.needed_qty}
                                </span>
                              </td>
                              <td className="p-3">
                                <StatusBadge status={item.status} />
                              </td>
                              <td className="p-3">
                                <Input
                                  type="number"
                                  min={0}
                                  value={qty}
                                  onChange={(e) => {
                                    const value = Math.max(0, Number(e.target.value) || 0)
                                    setOrderQty((prev) => ({ ...prev, [item.product_id]: value }))
                                    if (value > 0) {
                                      setSelected((prev) => new Set(prev).add(item.product_id))
                                    }
                                  }}
                                  className="h-9 w-20 text-center font-black mx-auto"
                                />
                              </td>
                              <td className="p-3">
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={cost}
                                  onChange={(e) =>
                                    setUnitCost((prev) => ({
                                      ...prev,
                                      [item.product_id]: Math.max(0, Number(e.target.value) || 0),
                                    }))
                                  }
                                  className="h-9 w-24 text-center font-bold mx-auto"
                                />
                              </td>
                              <td className="p-3 text-right font-black text-sm">
                                {isSelected && qty > 0 ? formatCurrency(qty * cost) : <span className="text-muted-foreground">—</span>}
                              </td>
                              <td className="p-3 text-right">
                                <button
                                  onClick={() => handleRemoveProduct(item)}
                                  className="p-1.5 rounded-md hover:bg-red-500/10 text-muted-foreground hover:text-red-500"
                                  title="Remove from this supplier"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-5 sm:p-6 space-y-3">
              {purchasesLoading ? (
                <p className="text-sm text-muted-foreground text-center py-10">Loading order history...</p>
              ) : purchases.length === 0 ? (
                <div className="text-center py-16">
                  <History className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground font-medium">No stock has been received from this supplier yet.</p>
                </div>
              ) : (
                purchases.map((purchase) => (
                  <div key={purchase.id} className="border border-border rounded-xl p-4 bg-muted/20">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div>
                        <p className="font-bold text-sm">
                          {new Date(purchase.created_at).toLocaleString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        {purchase.notes && <p className="text-xs text-muted-foreground mt-0.5">{purchase.notes}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-black text-primary">{formatCurrency(purchase.total_cost)}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                          {(purchase.inv_purchase_items || []).length} line item(s)
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {(purchase.inv_purchase_items || []).map((line: any) => (
                        <div key={line.id} className="flex items-center justify-between text-xs border-t border-border/60 pt-1">
                          <span className="font-medium truncate pr-3">{line.product_name}</span>
                          <span className="text-muted-foreground shrink-0">
                            {line.quantity} × {formatCurrency(line.cost_price)} ={" "}
                            <span className="font-bold text-foreground">{formatCurrency(line.total_cost)}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Restock footer */}
        {tab === "products" && (
          <div className="border-t border-border p-4 sm:p-5 bg-muted/30 rounded-b-2xl">
            <div className="flex flex-col lg:flex-row lg:items-end gap-4">
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
                    Receive into shop
                  </label>
                  <select
                    value={shop}
                    onChange={(e) => setShop(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm font-bold outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  >
                    {SHOPS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
                    Note (optional)
                  </label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Invoice no, delivery ref..."
                    className="h-9"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    {orderLines.length} product(s) · {orderUnits} unit(s)
                  </p>
                  <p className="text-2xl font-black text-primary leading-tight">{formatCurrency(orderTotal)}</p>
                </div>
                <Button
                  onClick={handleRecordRestock}
                  disabled={saving || orderLines.length === 0}
                  className="h-12 px-6 font-black gap-2"
                >
                  <RefreshCcw className={`w-4 h-4 ${saving ? "animate-spin" : ""}`} />
                  RECEIVE STOCK
                </Button>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Recording a restock adds the quantities to the selected shop, logs a purchase against this supplier and
              updates the buying price.
            </p>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
