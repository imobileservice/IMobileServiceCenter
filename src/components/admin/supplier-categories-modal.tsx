"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Check, FolderTree, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  inventorySuppliersService,
  type CategoryAccessMode,
  type ProductCategory,
  type Supplier,
} from "@/lib/services/inventory.service"
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
      (category) =>
        String(category.name || "").toLowerCase().includes(term) ||
        String(category.slug || "").toLowerCase().includes(term)
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
          With nothing selected, shops on this list see an empty catalogue and cannot order.
        </p>
      )}
    </div>
  )
}

/** Loads the shared default list once, as plain category ids. */
export function useDefaultCategoryIds(enabled = true) {
  const [ids, setIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(enabled)

  const reload = useCallback(() => {
    setIsLoading(true)
    return inventorySuppliersService
      .getDefaultCategories()
      .then((res) => setIds((res.data || []).map((row) => row.category_id)))
      .catch((error: any) => toast.error(error.message || "Could not load the default categories"))
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    if (enabled) reload()
  }, [enabled, reload])

  return { ids, isLoading, reload, setIds }
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

/**
 * Edits one shop's category access: follow the shared default, or pick a list
 * just for them.
 *
 * The hand-picked list stays loaded and editable even while the shop is on the
 * default, so switching the override on is one click rather than a rebuild.
 */
export default function SupplierCategoriesModal({ supplier, onClose, onSaved }: Props) {
  const { categories, isLoading } = useAllCategories()
  const { ids: defaultIds, isLoading: defaultsLoading } = useDefaultCategoryIds()

  const [mode, setMode] = useState<CategoryAccessMode>("default")
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
        setMode(res.mode === "custom" ? "custom" : "default")
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
      // The hand-picked list is only written when it is the one in use;
      // otherwise a shop on the default would have its saved list overwritten
      // by whatever happened to be on screen.
      await inventorySuppliersService.setCategories(supplier.id, {
        mode,
        ...(mode === "custom" ? { categoryIds: selected } : {}),
      })

      if (mode === "default") {
        toast.success(`${supplier.name} now follows the default list (${defaultIds.length} categories)`)
      } else {
        toast.success(
          selected.length === 0
            ? `${supplier.name} can no longer see any products`
            : `${supplier.name} can now see ${selected.length} categor${selected.length === 1 ? "y" : "ies"}`
        )
      }
      onSaved()
      onClose()
    } catch (error: any) {
      toast.error(error.message || "Could not save category access")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4">
      {/* Backdrop clicks do not close this - ticking through a long category
          list and losing it to a stray click is the whole job undone. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-border rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
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

        <AccessModeToggle
          mode={mode}
          onChange={setMode}
          defaultCount={defaultIds.length}
          customCount={selected.length}
          isLoading={defaultsLoading}
        />

        {mode === "custom" ? (
          <div className="mt-5">
            <CategoryPicker
              categories={categories}
              selected={selected}
              onToggle={toggle}
              onSelectAll={(ids) => setSelected((prev) => Array.from(new Set([...prev, ...ids])))}
              onClear={() => setSelected([])}
              isLoading={isLoading || isLoadingCurrent}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-3"
              disabled={defaultsLoading}
              onClick={() => setSelected(defaultIds)}
            >
              Start from the default list
            </Button>
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-sm font-semibold">Following the default list</p>
            <p className="text-xs text-muted-foreground mt-1">
              {defaultsLoading
                ? "Loading..."
                : defaultIds.length === 0
                  ? "The default list is empty, so this shop sees nothing. Set it on the Product Access tab."
                  : `${defaultIds.length} categor${defaultIds.length === 1 ? "y" : "ies"}. Change it on the Product Access tab and every shop on the default follows.`}
            </p>
          </div>
        )}

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

/** The default / custom switch, shared by this modal and the Add Shop form. */
export function AccessModeToggle({
  mode,
  onChange,
  defaultCount,
  customCount,
  isLoading,
}: {
  mode: CategoryAccessMode
  onChange: (mode: CategoryAccessMode) => void
  defaultCount: number
  customCount: number
  isLoading?: boolean
}) {
  const options: Array<{ id: CategoryAccessMode; label: string; hint: string }> = [
    {
      id: "default",
      label: "Use the default list",
      hint: isLoading ? "Loading..." : `${defaultCount} categor${defaultCount === 1 ? "y" : "ies"}, shared by all shops`,
    },
    {
      id: "custom",
      label: "Choose for this shop",
      hint: `${customCount} categor${customCount === 1 ? "y" : "ies"} picked just for them`,
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {options.map((option) => (
        <button
          type="button"
          key={option.id}
          onClick={() => onChange(option.id)}
          className={`text-left p-3 rounded-xl border transition-colors ${
            mode === option.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/60"
          }`}
        >
          <span className="flex items-center gap-2">
            <span
              className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ${
                mode === option.id ? "border-primary bg-primary" : "border-input"
              }`}
            />
            <span className="text-sm font-bold">{option.label}</span>
          </span>
          <span className="block text-[11px] text-muted-foreground mt-1 pl-[22px]">{option.hint}</span>
        </button>
      ))}
    </div>
  )
}
