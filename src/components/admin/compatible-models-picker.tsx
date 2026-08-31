"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Check, Loader2, Plus, Search, Smartphone, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { phoneModelsService, type PhoneModel } from "@/lib/supabase/services/phone-models"
import { toast } from "sonner"

/**
 * "Compatible Phone Models" section of the product form.
 *
 * One physical product (Display A, SKU DSP001, stock 5) is ticked against as
 * many phone models as it fits. Ticking ten models creates ten relationship
 * rows - it does NOT create ten products and does NOT multiply the stock.
 *
 * The list is loaded once and filtered in the browser so ticking twenty models
 * is twenty clicks with no page changes and no round trips.
 */

interface CompatibleModelsPickerProps {
  /** Models currently attached to the product. */
  value: PhoneModel[]
  onChange: (models: PhoneModel[]) => void
  /** The product's own brand - used to pre-filter and to seed new models. */
  brand?: string
  /** Model names known for the brand, offered as a one-click bulk import. */
  brandModelSuggestions?: string[]
  disabled?: boolean
}

export default function CompatibleModelsPicker({
  value,
  onChange,
  brand,
  brandModelSuggestions = [],
  disabled = false,
}: CompatibleModelsPickerProps) {
  const [allModels, setAllModels] = useState<PhoneModel[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [brandFilter, setBrandFilter] = useState<string>("")
  const [importing, setImporting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newModelName, setNewModelName] = useState("")
  const [newModelCode, setNewModelCode] = useState("")
  const [showAddModel, setShowAddModel] = useState(false)
  const [tableMissing, setTableMissing] = useState(false)

  const selectedIds = useMemo(() => new Set(value.map((m) => m.id)), [value])

  const loadModels = useCallback(async () => {
    setLoading(true)
    try {
      const models = await phoneModelsService.getAll({ limit: 2000 })
      setAllModels(models)
      // An empty catalogue on first use is normal; it is only a problem if the
      // migration has not been run, which the import button surfaces.
      setTableMissing(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadModels()
  }, [loadModels])

  // Default the brand filter to the product's own brand, which is the common
  // case (a Xiaomi display fitting several Redmi models).
  useEffect(() => {
    if (brand && !brandFilter) {
      const hasBrand = allModels.some((m) => m.brand_name.toLowerCase() === brand.toLowerCase())
      if (hasBrand) setBrandFilter(brand)
    }
  }, [brand, brandFilter, allModels])

  const brandOptions = useMemo(() => {
    const names = new Set<string>()
    for (const model of allModels) {
      if (model.brand_name) names.add(model.brand_name)
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [allModels])

  const visibleModels = useMemo(() => {
    const term = search.trim().toLowerCase()

    return allModels
      .filter((model) => {
        if (brandFilter && model.brand_name.toLowerCase() !== brandFilter.toLowerCase()) return false
        if (!term) return true

        return (
          model.name.toLowerCase().includes(term) ||
          model.label.toLowerCase().includes(term) ||
          (model.model_code || "").toLowerCase().includes(term) ||
          model.aliases.some((alias) => alias.toLowerCase().includes(term))
        )
      })
      .slice(0, 400)
  }, [allModels, brandFilter, search])

  const toggleModel = (model: PhoneModel) => {
    if (disabled) return

    if (selectedIds.has(model.id)) {
      onChange(value.filter((m) => m.id !== model.id))
    } else {
      onChange([...value, model])
    }
  }

  const selectAllVisible = () => {
    if (disabled) return
    const additions = visibleModels.filter((m) => !selectedIds.has(m.id))
    if (additions.length === 0) return
    onChange([...value, ...additions])
  }

  /**
   * Turn the brand's known model names into real phone_models rows in one call.
   * Existing models are reused, so pressing this twice adds nothing.
   */
  const importBrandModels = async () => {
    if (!brand || brandModelSuggestions.length === 0) return

    setImporting(true)
    try {
      const models = await phoneModelsService.bulkCreate({
        brand,
        names: brandModelSuggestions,
      })

      // Merge into the local catalogue without dropping models of other brands
      setAllModels((prev) => {
        const byId = new Map(prev.map((m) => [m.id, m]))
        for (const model of models) byId.set(model.id, model)
        return Array.from(byId.values())
      })
      setBrandFilter(brand)
      toast.success(`${brand}: ${models.length} models available to tick`)
    } catch (error: any) {
      if (String(error?.message || "").includes("Phone model tables not found")) {
        setTableMissing(true)
      }
      toast.error(error?.message || "Could not import models")
    } finally {
      setImporting(false)
    }
  }

  /** Add a model the catalogue does not have yet, then tick it immediately. */
  const addModel = async () => {
    const name = newModelName.trim()
    if (!name) {
      toast.error("Enter the model name")
      return
    }
    if (!brand) {
      toast.error("Select the product brand first")
      return
    }

    setCreating(true)
    try {
      const model = await phoneModelsService.create({
        brand,
        name,
        modelCode: newModelCode.trim() || undefined,
      })

      setAllModels((prev) => (prev.some((m) => m.id === model.id) ? prev : [...prev, model]))
      if (!selectedIds.has(model.id)) onChange([...value, model])

      setNewModelName("")
      setNewModelCode("")
      setShowAddModel(false)
      toast.success(`${model.label} added`)
    } catch (error: any) {
      if (String(error?.message || "").includes("Phone model tables not found")) {
        setTableMissing(true)
      }
      toast.error(error?.message || "Could not add model")
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-primary" />
            Compatible Phone Models
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Tick every phone this one part fits. This does not create extra products and does not
            change the stock - it stays one product with one stock count.
          </p>
        </div>
        <span className="text-sm font-semibold whitespace-nowrap">
          {value.length} selected
        </span>
      </div>

      {tableMissing && (
        <div className="text-xs p-3 rounded-lg bg-destructive/10 text-destructive">
          Phone model tables are missing. Run
          <code className="mx-1">supabase/migrations/add_phone_model_compatibility.sql</code>
          in the Supabase SQL editor, then reopen this product.
        </div>
      )}

      {/* Selected models */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-muted">
          {value.map((model) => (
            <span
              key={model.id}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background border border-border text-xs font-medium"
            >
              {model.label}
              <button
                type="button"
                onClick={() => toggleModel(model)}
                disabled={disabled}
                className="text-muted-foreground hover:text-destructive transition-colors"
                aria-label={`Remove ${model.label}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => onChange([])}
            disabled={disabled}
            className="text-xs text-muted-foreground hover:text-destructive underline ml-1"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Search + brand filter */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search model, code or alias..."
            className="pl-9"
            disabled={disabled}
          />
        </div>
        <select
          value={brandFilter}
          onChange={(e) => setBrandFilter(e.target.value)}
          className="px-3 py-2 border border-border rounded-lg bg-background text-sm"
          disabled={disabled}
          aria-label="Filter models by brand"
        >
          <option value="">All brands</option>
          {brandOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {/* Bulk helpers */}
      <div className="flex flex-wrap gap-2">
        {brand && brandModelSuggestions.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={importBrandModels}
            disabled={disabled || importing}
          >
            {importing ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5 mr-1.5" />
            )}
            Import {brandModelSuggestions.length} {brand} models
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={selectAllVisible}
          disabled={disabled || visibleModels.length === 0}
        >
          <Check className="w-3.5 h-3.5 mr-1.5" />
          Select all shown ({visibleModels.length})
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowAddModel((prev) => !prev)}
          disabled={disabled}
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          New model
        </Button>
      </div>

      {showAddModel && (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 p-3 rounded-lg border border-border">
          <Input
            type="text"
            value={newModelName}
            onChange={(e) => setNewModelName(e.target.value)}
            placeholder={brand ? `Model name (e.g. Redmi Note 8)` : "Select a brand first"}
            disabled={disabled || creating || !brand}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                addModel()
              }
            }}
          />
          <Input
            type="text"
            value={newModelCode}
            onChange={(e) => setNewModelCode(e.target.value)}
            placeholder="Model code (optional, e.g. M1908C3JG)"
            disabled={disabled || creating || !brand}
          />
          <Button type="button" size="sm" onClick={addModel} disabled={disabled || creating || !brand}>
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Add"}
          </Button>
        </div>
      )}

      {/* Model list */}
      <div className="border border-border rounded-lg max-h-64 overflow-y-auto">
        {loading ? (
          <div className="p-6 flex items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Loading phone models...
          </div>
        ) : visibleModels.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {allModels.length === 0
              ? "No phone models yet. Use \"Import ... models\" or \"New model\" to build the list."
              : "No models match this search."}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {visibleModels.map((model) => {
              const checked = selectedIds.has(model.id)
              return (
                <li key={model.id}>
                  <label
                    className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                      checked ? "bg-primary/5" : "hover:bg-muted"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleModel(model)}
                      disabled={disabled}
                      className="w-4 h-4 accent-primary"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate">{model.label}</span>
                      {(model.model_code || model.aliases.length > 0) && (
                        <span className="block text-xs text-muted-foreground truncate">
                          {[model.model_code, ...model.aliases].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
