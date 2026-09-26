"use client"

import { useEffect, useMemo, useState } from "react"
import { Search, Save, AlertTriangle, Boxes } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import AssistantLayout from "@/components/assistant/assistant-layout"
import { assistantService } from "@/lib/services/assistant.service"
import { useAssistantStore } from "@/lib/assistant-store"

interface StockRow {
  product_id: string
  quantity: number
  qty_meegoda: number
  qty_padukka: number
  qty_padukka_new: number
  low_stock_threshold: number
  updated_at: string
  is_low_stock: boolean
  products: {
    id: string
    name: string
    brand: string | null
    sku: string | null
    barcode: string | null
    price: number | null
  } | null
}

type Draft = {
  qty_meegoda: string
  qty_padukka: string
  qty_padukka_new: string
  low_stock_threshold: string
}

/**
 * Stock levels, and the one thing an assistant may change without asking.
 *
 * Quantities are edited per shop and the total is the sum, matching how the
 * rest of the system stores them. Each save writes an inv_stock_movements row
 * naming the assistant, so a quantity that moves without an explanation is
 * still attributable afterwards.
 */
export default function AssistantInventoryPage() {
  const can = useAssistantStore((state) => state.can)
  const canAdjust = can("inventory.adjust")

  const [rows, setRows] = useState<StockRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [lowOnly, setLowOnly] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      setRows((await assistantService.stock()) as StockRow[])
      setDrafts({})
    } catch (error: any) {
      if (error?.code !== "PERMISSION_DENIED") {
        toast.error(error?.message || "Could not load stock")
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (lowOnly && !row.is_low_stock) return false
      if (!term) return true
      const product = row.products
      return (
        product?.name?.toLowerCase().includes(term) ||
        product?.brand?.toLowerCase().includes(term) ||
        product?.sku?.toLowerCase().includes(term) ||
        product?.barcode?.toLowerCase().includes(term)
      )
    })
  }, [rows, search, lowOnly])

  const draftFor = (row: StockRow): Draft =>
    drafts[row.product_id] || {
      qty_meegoda: String(row.qty_meegoda ?? 0),
      qty_padukka: String(row.qty_padukka ?? 0),
      qty_padukka_new: String(row.qty_padukka_new ?? 0),
      low_stock_threshold: String(row.low_stock_threshold ?? 5),
    }

  const setDraft = (row: StockRow, key: keyof Draft, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [row.product_id]: { ...draftFor(row), [key]: value },
    }))
  }

  const isDirty = (row: StockRow) => {
    const draft = drafts[row.product_id]
    if (!draft) return false
    return (
      Number(draft.qty_meegoda) !== Number(row.qty_meegoda ?? 0) ||
      Number(draft.qty_padukka) !== Number(row.qty_padukka ?? 0) ||
      Number(draft.qty_padukka_new) !== Number(row.qty_padukka_new ?? 0) ||
      Number(draft.low_stock_threshold) !== Number(row.low_stock_threshold ?? 5)
    )
  }

  const save = async (row: StockRow) => {
    const draft = draftFor(row)
    setSavingId(row.product_id)
    try {
      const updated = await assistantService.adjustStock(row.product_id, {
        qty_meegoda: Number(draft.qty_meegoda) || 0,
        qty_padukka: Number(draft.qty_padukka) || 0,
        qty_padukka_new: Number(draft.qty_padukka_new) || 0,
        low_stock_threshold: Number(draft.low_stock_threshold) || 0,
      })

      setRows((prev) =>
        prev.map((existing) =>
          existing.product_id === row.product_id
            ? {
                ...existing,
                ...updated,
                is_low_stock: updated.quantity <= updated.low_stock_threshold,
              }
            : existing
        )
      )
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[row.product_id]
        return next
      })
      toast.success(`${row.products?.name || "Stock"} updated`)
    } catch (error: any) {
      toast.error(error?.message || "Could not update the stock")
    } finally {
      setSavingId(null)
    }
  }

  const totals = useMemo(
    () => ({
      units: rows.reduce((sum, row) => sum + Math.max(row.quantity || 0, 0), 0),
      low: rows.filter((row) => row.is_low_stock).length,
    }),
    [rows]
  )

  return (
    <AssistantLayout
      permission="inventory.view"
      title="Inventory"
      description="Stock levels per shop. Adjustments take effect immediately and are logged against your account."
    >
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Products tracked</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{rows.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Units in stock</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{totals.units.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-xs uppercase tracking-wide text-amber-600 dark:text-amber-400">
            At or below threshold
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
            {totals.low}
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products"
            className="pl-9"
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={lowOnly}
            onChange={(e) => setLowOnly(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          Only show what needs restocking
        </label>
      </div>

      {!canAdjust && (
        <div className="mb-4 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          You can see stock levels but not change them. Ask the administrator for the “Adjust stock”
          permission if you need it.
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <Boxes className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Nothing to show</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {lowOnly ? "Everything is above its threshold." : "Try a different search."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((row) => {
            const draft = draftFor(row)
            const total =
              (Number(draft.qty_meegoda) || 0) +
              (Number(draft.qty_padukka) || 0) +
              (Number(draft.qty_padukka_new) || 0)
            const dirty = isDirty(row)

            return (
              <div
                key={row.product_id}
                className={`rounded-xl border bg-card p-4 ${
                  row.is_low_stock ? "border-amber-500/40" : "border-border"
                }`}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{row.products?.name || "Unknown product"}</p>
                      {row.is_low_stock && (
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.products?.brand || "No brand"}
                      {row.products?.sku ? ` · ${row.products.sku}` : ""}
                      {row.products?.barcode ? ` · ${row.products.barcode}` : ""}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:w-auto">
                    <NumberField
                      label="Meegoda"
                      value={draft.qty_meegoda}
                      disabled={!canAdjust}
                      onChange={(value) => setDraft(row, "qty_meegoda", value)}
                    />
                    <NumberField
                      label="Padukka"
                      value={draft.qty_padukka}
                      disabled={!canAdjust}
                      onChange={(value) => setDraft(row, "qty_padukka", value)}
                    />
                    <NumberField
                      label="Padukka New"
                      value={draft.qty_padukka_new}
                      disabled={!canAdjust}
                      onChange={(value) => setDraft(row, "qty_padukka_new", value)}
                    />
                    <NumberField
                      label="Low at"
                      value={draft.low_stock_threshold}
                      disabled={!canAdjust}
                      onChange={(value) => setDraft(row, "low_stock_threshold", value)}
                    />
                  </div>

                  <div className="flex items-center gap-3 lg:w-40 lg:justify-end">
                    <div className="text-right">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total</p>
                      <p className="text-lg font-bold tabular-nums">{total}</p>
                    </div>

                    {canAdjust && (
                      <Button
                        size="sm"
                        onClick={() => save(row)}
                        disabled={!dirty || savingId === row.product_id}
                        className="gap-1.5"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {savingId === row.product_id ? "Saving" : "Save"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </AssistantLayout>
  )
}

function NumberField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <Input
        type="number"
        min="0"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full sm:w-24"
      />
    </div>
  )
}
