"use client"

import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Check, FolderTree, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { inventorySuppliersService, type ProductCategory, type Supplier } from "@/lib/services/inventory.service"
import { toast } from "sonner"

/**
 * The tick list that decides what a shop sees.
 *
 * Split out from the modal because the Add Shop form needs the same grid before
 * the shop exists — it collects the ids and saves them straight after the shop
 * record is created.
 */
export function CategoryPicker({
  categories,
  selected,
  onToggle,
  onSelectAll,
  onClear,
  isLoading,
}: {
  categories: ProductCategory[]
  selected: string[]
  onToggle: (id: string) => void
  onSelectAll: (ids: string[]) => void
  onClear: () => void
  isLoading?: boolean
}) {
  const [search, setSearch] = useState("")

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return categories
    return categories.filter(
      (category) => category.name.toLowerCase().includes(term) || category.slug.toLowerCase().includes(term)
    )
  }, [categories, search])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Categories this shop can see
        </p>
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">
          {selected.length} selected
        </span>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search categories..."
          className="pl-10 h-9"
        />
      </div>

      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => onSelectAll(visible.map((c) => c.id))}>
          Select {search ? "these" : "all"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onClear}>
          Clear
        </Button>
      </div>

      <div className="max-h-64 overflow-y-auto space-y-1 -mx-1 px-1">
        {isLoading ? (
          <p className="text-xs text-muted-foreground py-6 text-center">Loading categories...</p>
        ) : visible.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">
            {categories.length === 0 ? "No categories exist yet." : "No category matches that search."}
          </p>
        ) : (
          visible.map((category) => {
            const checked = selected.includes(category.id)
            return (
              <button
                type="button"
                key={category.id}
                onClick={() => onToggle(category.id)}
                className={`w-full flex items-center gap-3 p-2 rounded-lg border text-left transition-colors ${
                  checked ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted/60"
                }`}
              >
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                    checked ? "bg-primary border-primary text-primary-foreground" : "border-input"
                  }`}
                >
                  {checked && <Check className="w-3 h-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold truncate">{category.name}</span>
                  <span className="block text-[10px] text-muted-foreground font-mono truncate">{category.slug}</span>
                </span>
                {category.is_active === false && (
                  <span className="text-[10px] font-bold text-muted-foreground shrink-0">hidden</span>
                )}
              </button>
            )
          })
        )}
      </div>

      {selected.length === 0 && (
        <p className="text-[11px] text-amber-600 font-medium">
          With nothing selected this shop sees an empty catalogue and cannot order.
        </p>
      )}
    </div>
  )
}

/** Loads every category once. Shared by the picker's two callers. */
export function useAllCategories(enabled = true) {
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setIsLoading(true)
    inventorySuppliersService
      .getAllCategories()
      .then((res) => {
        if (!cancelled) setCategories(res.data || [])
      })
      .catch((error: any) => {
        if (!cancelled) toast.error(error.message || "Could not load categories")
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [enabled])

  return { categories, isLoading }
}

interface Props {
  supplier: Supplier
  onClose: () => void
  onSaved: () => void
}

/** Edits one existing shop's category access. */
export default function SupplierCategoriesModal({ supplier, onClose, onSaved }: Props) {
  const { categories, isLoading } = useAllCategories()
  const [selected, setSelected] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingCurrent, setIsLoadingCurrent] = useState(true)

  useEffect(() => {
    let cancelled = false
    inventorySuppliersService
      .getCategories(supplier.id)
      .then((res) => {
        if (cancelled) return
        setSelected((res.data || []).map((row) => row.category_id))
      })
      .catch((error: any) => {
        if (!cancelled) toast.error(error.message || "Could not load this shop's categories")
      })
      .finally(() => {
        if (!cancelled) setIsLoadingCurrent(false)
      })
    return () => {
      cancelled = true
    }
  }, [supplier.id])

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))

  const save = async () => {
    setIsSaving(true)
    try {
      await inventorySuppliersService.setCategories(supplier.id, selected)
      toast.success(
        selected.length === 0
          ? `${supplier.name} can no longer see any products`
          : `${supplier.name} can now see ${selected.length} categor${selected.length === 1 ? "y" : "ies"}`
      )
      onSaved()
      onClose()
    } catch (error: any) {
      toast.error(error.message || "Could not save category access")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-border rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <FolderTree className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-black tracking-tight">Product Access</h2>
              <p className="text-xs text-muted-foreground">{supplier.name}</p>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <CategoryPicker
          categories={categories}
          selected={selected}
          onToggle={toggle}
          onSelectAll={(ids) => setSelected((prev) => Array.from(new Set([...prev, ...ids])))}
          onClear={() => setSelected([])}
          isLoading={isLoading || isLoadingCurrent}
        />

        <div className="flex gap-2 pt-5">
          <Button className="flex-1 font-bold" disabled={isSaving || isLoadingCurrent} onClick={save}>
            {isSaving ? "Saving..." : "Save access"}
          </Button>
          <Button variant="outline" className="flex-1" disabled={isSaving} onClick={onClose}>
            Cancel
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
