"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { AlertTriangle, Check, LogOut, PackageX, RefreshCw, Truck, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useSupplierStore } from "@/lib/supplier-store"
import {
  supplierPortalService,
  type SupplierRestockItem,
  type SupplierRestockTotals,
} from "@/lib/services/supplier-portal.service"
import { toast } from "sonner"

type Filter = "needed" | "out" | "low" | "all"

const STATUS_STYLES: Record<string, string> = {
  out: "bg-red-500/10 text-red-500 border-red-500/20",
  low: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  ok: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
}

const STATUS_LABELS: Record<string, string> = {
  out: "Out of stock",
  low: "Low stock",
  ok: "In stock",
}

export default function SupplierPortalPage() {
  const navigate = useNavigate()
  const supplier = useSupplierStore((state) => state.supplier)
  const isAuthenticated = useSupplierStore((state) => state.isAuthenticated)
  const isSessionExpired = useSupplierStore((state) => state.isSessionExpired)
  const logout = useSupplierStore((state) => state.logout)

  const [items, setItems] = useState<SupplierRestockItem[]>([])
  const [totals, setTotals] = useState<SupplierRestockTotals | null>(null)
  const [filter, setFilter] = useState<Filter>("needed")
  const [isLoading, setIsLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, { qty: string; date: string; note: string }>>({})
  const [migrationRequired, setMigrationRequired] = useState(false)

  useEffect(() => {
    if (!isAuthenticated || isSessionExpired()) navigate("/supplier/login", { replace: true })
  }, [isAuthenticated, isSessionExpired, navigate])

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await supplierPortalService.getRestock()
      setItems(result.data || [])
      setTotals(result.totals || null)
      setMigrationRequired(Boolean(result.migration_required))
    } catch (err: any) {
      // A dropped session already cleared the store; the effect above bounces
      // to the login screen, so there is nothing useful to show here.
      if (!useSupplierStore.getState().isAuthenticated) return
      toast.error(err.message || "Could not load your products")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated) load()
  }, [isAuthenticated, load])

  const handleLogout = async () => {
    await supplierPortalService.logout()
    logout()
    navigate("/supplier/login", { replace: true })
  }

  const draftFor = (item: SupplierRestockItem) =>
    drafts[item.product_id] || {
      qty: item.response?.available_qty != null ? String(item.response.available_qty) : String(item.suggested_qty || ""),
      date: item.response?.expected_date || "",
      note: item.response?.note || "",
    }

  const setDraft = (productId: string, patch: Partial<{ qty: string; date: string; note: string }>) =>
    setDrafts((prev) => ({
      ...prev,
      [productId]: { ...(prev[productId] || { qty: "", date: "", note: "" }), ...patch },
    }))

  const respond = async (item: SupplierRestockItem, status: "can_supply" | "unavailable") => {
    const draft = draftFor(item)
    setSavingId(item.product_id)
    try {
      const result = await supplierPortalService.respond({
        product_id: item.product_id,
        status,
        available_qty: status === "can_supply" ? Number(draft.qty || 0) : null,
        expected_date: status === "can_supply" ? draft.date || null : null,
        note: draft.note || null,
      })
      setItems((prev) =>
        prev.map((row) => (row.product_id === item.product_id ? { ...row, response: result.data } : row))
      )
      toast.success(status === "can_supply" ? "Marked as available" : "Marked as not available")
    } catch (err: any) {
      toast.error(err.message || "Could not save your reply")
    } finally {
      setSavingId(null)
    }
  }

  const filtered = useMemo(() => {
    if (filter === "all") return items
    if (filter === "out") return items.filter((i) => i.status === "out")
    if (filter === "low") return items.filter((i) => i.status === "low")
    return items.filter((i) => i.status !== "ok")
  }, [items, filter])

  if (!isAuthenticated) return null

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
              <Truck className="w-5 h-5 text-blue-500" />
            </div>
            <div className="min-w-0">
              <h1 className="font-black tracking-tight truncate">{supplier?.name}</h1>
              <p className="text-xs text-muted-foreground truncate">Supplier Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={isLoading} className="gap-2">
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {migrationRequired && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 text-sm">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <p>The supplier tables are not set up yet. Please contact IMobile Service Center.</p>
          </div>
        )}

        {totals && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryTile label="Your products" value={totals.products} />
            <SummaryTile label="Out of stock" value={totals.out_of_stock} tone="text-red-500" />
            <SummaryTile label="Low stock" value={totals.low_stock} tone="text-amber-500" />
            <SummaryTile label="Units wanted" value={totals.needed_units} tone="text-blue-500" />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {(["needed", "out", "low", "all"] as Filter[]).map((key) => (
            <Button
              key={key}
              size="sm"
              variant={filter === key ? "default" : "outline"}
              onClick={() => setFilter(key)}
              className="font-semibold"
            >
              {key === "needed" ? "Needs restocking" : key === "out" ? "Out of stock" : key === "low" ? "Low stock" : "All products"}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <p className="text-muted-foreground text-sm py-12 text-center">Loading your products...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <PackageX className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold">Nothing to supply right now</p>
            <p className="text-sm text-muted-foreground mt-1">
              {items.length === 0
                ? "No products have been assigned to you yet."
                : "All of your products are in stock."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => {
              const draft = draftFor(item)
              const answered = item.response && item.response.status !== "pending"

              return (
                <motion.div
                  key={item.product_id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-card border border-border rounded-lg p-4"
                >
                  <div className="flex items-start gap-4">
                    {item.image && (
                      <img src={item.image} alt="" className="w-14 h-14 rounded object-cover border border-border shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="font-bold truncate">{item.name}</h3>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLES[item.status]}`}>
                          {STATUS_LABELS[item.status]}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {item.brand ? `${item.brand} · ` : ""}
                        {item.barcode || "No barcode"}
                        {item.supplier_sku ? ` · Your SKU: ${item.supplier_sku}` : ""}
                      </p>
                      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-sm">
                        <span className="text-muted-foreground">In shop: <b className="text-foreground">{item.quantity}</b></span>
                        <span className="text-muted-foreground">Wanted: <b className="text-blue-500">{item.suggested_qty}</b></span>
                        {item.my_price ? (
                          <span className="text-muted-foreground">Your price: <b className="text-foreground">Rs. {item.my_price}</b></span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {answered && (
                    <div className="mt-3 text-xs font-semibold flex items-center gap-2">
                      {item.response!.status === "can_supply" ? (
                        <span className="text-emerald-500 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" />
                          You said you can supply
                          {item.response!.available_qty != null ? ` ${item.response!.available_qty} units` : ""}
                          {item.response!.expected_date ? ` by ${item.response!.expected_date}` : ""}
                        </span>
                      ) : (
                        <span className="text-red-500 flex items-center gap-1">
                          <X className="w-3.5 h-3.5" />
                          You said this is not available
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mt-3 pt-3 border-t border-border grid gap-2 sm:grid-cols-[110px_150px_1fr_auto]">
                    <Input
                      type="number"
                      min="0"
                      value={draft.qty}
                      onChange={(e) => setDraft(item.product_id, { qty: e.target.value })}
                      placeholder="Qty"
                      className="h-9"
                    />
                    <Input
                      type="date"
                      value={draft.date}
                      onChange={(e) => setDraft(item.product_id, { date: e.target.value })}
                      className="h-9"
                    />
                    <Input
                      value={draft.note}
                      onChange={(e) => setDraft(item.product_id, { note: e.target.value })}
                      placeholder="Note (optional)"
                      className="h-9"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="h-9 gap-1 font-bold"
                        disabled={savingId === item.product_id}
                        onClick={() => respond(item, "can_supply")}
                      >
                        <Check className="w-4 h-4" />
                        Can supply
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 gap-1"
                        disabled={savingId === item.product_id}
                        onClick={() => respond(item, "unavailable")}
                      >
                        <X className="w-4 h-4" />
                        No
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

function SummaryTile({ label, value, tone = "text-foreground" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-black mt-1 ${tone}`}>{value}</p>
    </div>
  )
}
