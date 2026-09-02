"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Check, FileSpreadsheet, Loader2, Plus, Search, Table2, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getApiUrl } from "@/lib/utils/api"
import { phoneModelsService, type PhoneModel } from "@/lib/supabase/services/phone-models"
import { toast } from "sonner"

/**
 * "One product -> many phone models", two ways of doing the same job:
 *
 *   Manual   a two column table - the display on the left, the phones it fits
 *            on the right, ticked one or more at a time. Best for a handful of
 *            products, or for fixing one afterwards.
 *
 *   Excel    SKU | Product | Compatible Models, pasted or uploaded as .csv.
 *            Best for the first bulk load of a whole shelf.
 *
 * Both write the SAME relationship rows. Neither creates a product and neither
 * touches stock: Display A with ten compatible phones is still one product with
 * one stock count.
 */

interface ImportResultRow {
  row: number
  sku: string
  product: string
  status: "linked" | "skipped"
  message: string
  linked: number
  created_models: number
}

interface ImportSummary {
  rows: number
  linked: number
  skipped: number
  compatibility_rows: number
  models_created: number
  products_created: number
}

interface ParsedRow {
  sku: string
  product: string
  models: string[]
}

/** Only the fields the table needs - the admin list already has them all. */
export interface CompatibilityProduct {
  id: string
  name: string
  category?: string | null
  brand?: string | null
  sku?: string | null
}

const SAMPLE = `SKU\tProduct\tCompatible Models
DSP001\tDisplay A\tRedmi Note 8, Redmi Note 8T, Redmi Note 9, Redmi Note 9S`

/** Split one CSV/TSV line, honouring "quoted, values". */
function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      cells.push(current)
      current = ""
    } else {
      current += char
    }
  }

  cells.push(current)
  return cells.map((c) => c.trim())
}

function parseSheet(text: string): { rows: ParsedRow[]; error?: string } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  if (lines.length === 0) return { rows: [], error: "Nothing to import" }

  // Excel pastes are tab separated; a saved .csv is comma separated.
  const delimiter = lines[0].includes("\t") ? "\t" : ","

  let startIndex = 0
  const header = splitLine(lines[0], delimiter).map((h) => h.toLowerCase())
  const looksLikeHeader = header.some((h) => h === "sku" || h === "product" || h.includes("model"))

  let skuIndex = 0
  let productIndex = 1
  let modelsIndex = 2

  if (looksLikeHeader) {
    startIndex = 1
    const findIndex = (...names: string[]) =>
      header.findIndex((h) => names.some((n) => h === n || h.includes(n)))

    const sku = findIndex("sku", "code")
    const product = findIndex("product", "name", "item")
    const models = findIndex("compatible models", "models", "compatible", "phones")

    if (sku >= 0) skuIndex = sku
    if (product >= 0) productIndex = product
    if (models >= 0) modelsIndex = models
  }

  const rows: ParsedRow[] = []
  for (let i = startIndex; i < lines.length; i++) {
    const cells = splitLine(lines[i], delimiter)
    const sku = (cells[skuIndex] || "").trim()
    const product = (cells[productIndex] || "").trim()
    const modelsCell = (cells[modelsIndex] || "").trim()

    if (!sku && !product) continue

    const models = modelsCell
      .split(/[,;|]/)
      .map((m) => m.trim())
      .filter(Boolean)

    rows.push({ sku, product, models })
  }

  if (rows.length === 0) return { rows: [], error: "No data rows found" }
  return { rows }
}

/**
 * Is this product a display?
 *
 * The catalogue names them plainly ("Samsung A32 4G Incell Display") and files
 * them under a display category, so either signal is enough. Written as one
 * test so the manual table and anything added later stay in agreement.
 */
export function isDisplay(name?: string | null, category?: string | null): boolean {
  return /display|lcd|screen/i.test(`${name || ""} ${category || ""}`)
}

/** Same ids in any order? Used to spot which rows actually changed. */
function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((id) => set.has(id))
}

interface CompatibilityImportModalProps {
  isOpen: boolean
  onClose: () => void
  onImported?: () => void
  /** The admin product list, so the manual table needs no extra fetch. */
  products?: CompatibilityProduct[]
}

export default function CompatibilityImportModal({
  isOpen,
  onClose,
  onImported,
  products = [],
}: CompatibilityImportModalProps) {
  const [tab, setTab] = useState<"manual" | "sheet">("manual")

  // --- Excel / csv tab ------------------------------------------------------
  const [text, setText] = useState("")
  const [mode, setMode] = useState<"merge" | "replace">("merge")
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<ImportResultRow[] | null>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [wasDryRun, setWasDryRun] = useState(false)

  // --- Manual table tab -----------------------------------------------------
  const [models, setModels] = useState<PhoneModel[]>([])
  const [loadingTable, setLoadingTable] = useState(false)
  const [tableMissing, setTableMissing] = useState(false)
  /** What the database holds right now, per product id. */
  const [saved, setSaved] = useState<Record<string, string[]>>({})
  /** What the admin has ticked, per product id. */
  const [draft, setDraft] = useState<Record<string, string[]>>({})
  const [productSearch, setProductSearch] = useState("")
  const [brandFilter, setBrandFilter] = useState("")
  const [openRow, setOpenRow] = useState<string | null>(null)
  const [modelSearch, setModelSearch] = useState("")
  const [saving, setSaving] = useState(false)
  // "The phone this display fits is not in the list yet" - typed in here rather
  // than in a second screen, then ticked on the open row straight away.
  const [showNewModel, setShowNewModel] = useState(false)
  const [newModelBrand, setNewModelBrand] = useState("")
  const [newModelName, setNewModelName] = useState("")
  const [newModelCode, setNewModelCode] = useState("")
  const [creatingModel, setCreatingModel] = useState(false)

  const modelById = useMemo(() => {
    const map = new Map<string, PhoneModel>()
    for (const model of models) map.set(model.id, model)
    return map
  }, [models])

  /**
   * Only displays go in the left column. A power bank or a charging cable has
   * no "which phone does this fit" question, and listing them buries the 200+
   * displays this screen exists for.
   */
  const displayProducts = useMemo(
    () => products.filter((p) => isDisplay(p.name, p.category)),
    [products]
  )

  /**
   * Only phone models go in the right column.
   *
   * The migration seeded phone_models from every product's specs.model, so the
   * catalogue also picked up accessory names ("Aspor A337 30000mah"). A brand
   * that the shop stocks a display for is a phone brand; one that only ever
   * appears on power banks is not - so its entries are hidden here rather than
   * deleted, which keeps the data intact if it turns out to be wanted.
   */
  const phoneBrandNames = useMemo(() => {
    const names = new Set<string>()
    for (const product of displayProducts) {
      if (product.brand) names.add(String(product.brand).trim().toLowerCase())
    }
    return names
  }, [displayProducts])

  const phoneModels = useMemo(() => {
    // Anything already ticked on a display stays offered, whatever its brand -
    // hiding a model that is in use would look like data loss.
    const inUse = new Set<string>()
    for (const product of displayProducts) {
      for (const id of draft[product.id] || []) inUse.add(id)
    }

    return models.filter(
      (model) =>
        inUse.has(model.id) || phoneBrandNames.has((model.brand_name || "").trim().toLowerCase())
    )
  }, [models, phoneBrandNames, displayProducts, draft])

  /**
   * Load the phone model catalogue and each display's current model list.
   * The bulk endpoint takes 500 ids at a time, so the products are chunked.
   */
  const loadTable = useCallback(async () => {
    setLoadingTable(true)
    try {
      const catalogue = await phoneModelsService.getAll({ limit: 2000 })
      const byId = new Map(catalogue.map((m) => [m.id, m]))

      const ids = displayProducts.map((p) => p.id)
      const merged: Record<string, string[]> = {}

      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200)
        const map = await phoneModelsService.getForProducts(chunk)
        for (const id of chunk) {
          const attached = map[id] || []
          merged[id] = attached.map((m) => m.id)
          // A model already attached but past the catalogue page limit would
          // otherwise render as a nameless chip.
          for (const model of attached) {
            if (!byId.has(model.id)) byId.set(model.id, model)
          }
        }
      }

      setModels(Array.from(byId.values()))
      setSaved(merged)
      setDraft(merged)
    } finally {
      setLoadingTable(false)
    }
  }, [displayProducts])

  useEffect(() => {
    if (!isOpen) return
    setOpenRow(null)
    setModelSearch("")
    setShowNewModel(false)
    setNewModelName("")
    setNewModelCode("")
    loadTable()
  }, [isOpen, loadTable])

  const productBrands = useMemo(() => {
    const names = new Set<string>()
    for (const product of displayProducts) {
      if (product.brand) names.add(String(product.brand))
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [displayProducts])

  /**
   * Brands the new-model form can file a phone under: every brand the shop
   * stocks a display for, plus every brand already present in the phone model
   * catalogue. A brand typed on a product but never on a model still shows,
   * which is exactly the case that needs a new model most.
   */
  const allBrandNames = useMemo(() => {
    const byLower = new Map<string, string>()
    for (const product of displayProducts) {
      const name = String(product.brand || "").trim()
      if (name && !byLower.has(name.toLowerCase())) byLower.set(name.toLowerCase(), name)
    }
    for (const model of models) {
      const name = String(model.brand_name || "").trim()
      if (name && !byLower.has(name.toLowerCase())) byLower.set(name.toLowerCase(), name)
    }
    return Array.from(byLower.values()).sort((a, b) => a.localeCompare(b))
  }, [displayProducts, models])

  const visibleProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase()

    return displayProducts.filter((product) => {
      if (brandFilter && String(product.brand || "") !== brandFilter) return false
      if (!term) return true

      return (
        String(product.name || "").toLowerCase().includes(term) ||
        String(product.sku || "").toLowerCase().includes(term) ||
        String(product.brand || "").toLowerCase().includes(term)
      )
    })
  }, [displayProducts, productSearch, brandFilter])

  const changedIds = useMemo(
    () => Object.keys(draft).filter((id) => !sameSet(draft[id] || [], saved[id] || [])),
    [draft, saved]
  )

  const visibleModels = useMemo(() => {
    const term = modelSearch.trim().toLowerCase()
    if (!term) return phoneModels.slice(0, 300)

    return phoneModels
      .filter(
        (model) =>
          model.label.toLowerCase().includes(term) ||
          model.name.toLowerCase().includes(term) ||
          (model.model_code || "").toLowerCase().includes(term) ||
          model.aliases.some((alias) => alias.toLowerCase().includes(term))
      )
      .slice(0, 300)
  }, [phoneModels, modelSearch])

  if (!isOpen) return null

  const toggleModelForRow = (productId: string, modelId: string) => {
    setDraft((prev) => {
      const current = prev[productId] || []
      const next = current.includes(modelId)
        ? current.filter((id) => id !== modelId)
        : [...current, modelId]
      return { ...prev, [productId]: next }
    })
  }

  const addAllShownToRow = (productId: string) => {
    setDraft((prev) => {
      const current = prev[productId] || []
      const set = new Set(current)
      for (const model of visibleModels) set.add(model.id)
      return { ...prev, [productId]: Array.from(set) }
    })
  }

  const clearRow = (productId: string) => {
    setDraft((prev) => ({ ...prev, [productId]: [] }))
  }

  /** Open the inline form for a row, seeded with what was already typed. */
  const openNewModelForm = (product: CompatibilityProduct) => {
    setShowNewModel(true)
    setNewModelBrand((prev) => prev || String(product.brand || ""))
    setNewModelName((prev) => prev || modelSearch.trim())
  }

  /**
   * Add a phone the catalogue has never heard of, then tick it on this row.
   *
   * The same call also extends the brand's model list, so the new phone turns
   * up in the product form's own "Model" dropdown without anyone retyping it.
   * An existing model is returned rather than duplicated, so pressing Add twice
   * is harmless.
   */
  const createModelForRow = async (product: CompatibilityProduct) => {
    const name = newModelName.trim()
    const brand = (newModelBrand || product.brand || "").trim()

    if (!name) {
      toast.error("Enter the phone model name")
      return
    }
    if (!brand) {
      toast.error("Pick the phone brand for this model")
      return
    }

    setCreatingModel(true)
    try {
      const model = await phoneModelsService.create({
        brand,
        name,
        modelCode: newModelCode.trim() || undefined,
      })

      setModels((prev) => (prev.some((m) => m.id === model.id) ? prev : [...prev, model]))
      setDraft((prev) => {
        const current = prev[product.id] || []
        if (current.includes(model.id)) return prev
        return { ...prev, [product.id]: [...current, model.id] }
      })

      setNewModelName("")
      setNewModelCode("")
      setModelSearch("")
      toast.success(`${model.label} added to the phone model list and ticked here`)
    } catch (error: any) {
      if (String(error?.message || "").includes("Phone model tables not found")) {
        setTableMissing(true)
      }
      toast.error(error?.message || "Could not add the phone model")
    } finally {
      setCreatingModel(false)
    }
  }

  /** Save only the rows the admin actually touched. */
  const saveManual = async () => {
    if (changedIds.length === 0) return

    setSaving(true)
    let done = 0
    let failed = 0

    try {
      for (const productId of changedIds) {
        try {
          await phoneModelsService.setForProduct(productId, draft[productId] || [])
          setSaved((prev) => ({ ...prev, [productId]: draft[productId] || [] }))
          done++
        } catch (error: any) {
          failed++
          if (String(error?.message || "").includes("Phone model tables not found")) {
            setTableMissing(true)
            break
          }
        }
      }

      if (done > 0) {
        toast.success(`${done} product(s) updated. Stock unchanged.`)
        onImported?.()
      }
      if (failed > 0) toast.error(`${failed} product(s) could not be saved`)
    } finally {
      setSaving(false)
    }
  }

  const readFile = async (file: File) => {
    const content = await file.text()
    setText(content)
    setResults(null)
    setSummary(null)
  }

  const run = async (dryRun: boolean) => {
    const parsed = parseSheet(text)
    if (parsed.error) {
      toast.error(parsed.error)
      return
    }

    setRunning(true)
    try {
      const response = await fetch(getApiUrl("/api/admin/compatibility/import"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsed.rows, mode, dryRun }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || "Import failed")

      setResults(data.results || [])
      setSummary(data.summary || null)
      setWasDryRun(dryRun)

      if (dryRun) {
        toast.success(`Preview: ${data.summary?.linked || 0} row(s) ready, ${data.summary?.skipped || 0} skipped`)
      } else {
        toast.success(
          `${data.summary?.compatibility_rows || 0} compatibility links saved across ${data.summary?.linked || 0} product(s)`
        )
        onImported?.()
      }
    } catch (error: any) {
      toast.error(error?.message || "Import failed")
    } finally {
      setRunning(false)
    }
  }

  const busy = running || saving || creatingModel

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-background border border-border rounded-xl w-full max-w-5xl max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold">Compatible Phone Models</h2>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Two ways in: tick a table, or paste a sheet */}
        <div className="flex gap-1 px-5 pt-4">
          <button
            type="button"
            onClick={() => setTab("manual")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-semibold border-b-2 transition-colors ${
              tab === "manual"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Table2 className="w-4 h-4" />
            Manual table
          </button>
          <button
            type="button"
            onClick={() => setTab("sheet")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-semibold border-b-2 transition-colors ${
              tab === "sheet"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Excel / .csv
          </button>
        </div>

        {tableMissing && (
          <div className="mx-5 mt-4 text-xs p-3 rounded-lg bg-destructive/10 text-destructive">
            Phone model tables are missing. Run
            <code className="mx-1">supabase/migrations/add_phone_model_compatibility.sql</code>
            in the Supabase SQL editor, then reopen this window.
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Manual: display on the left, the phones it fits on the right      */}
        {/* ---------------------------------------------------------------- */}
        {tab === "manual" && (
          <div className="flex-1 min-h-0 flex flex-col p-5 pt-4 gap-3">
            <p className="text-sm text-muted-foreground">
              Pick a display on the left, then tick every phone it fits on the right. One display
              can carry as many phones as you like - it stays <strong>one product with one stock
              count</strong>. Only displays and phone models are listed here.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search a display by name, SKU or brand..."
                  className="pl-9"
                  disabled={busy}
                />
              </div>
              <select
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
                className="px-3 py-2 border border-border rounded-lg bg-background text-sm"
                disabled={busy}
                aria-label="Filter displays by brand"
              >
                <option value="">All brands</option>
                {productBrands.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 min-h-0 border border-border rounded-lg overflow-y-auto">
              {loadingTable ? (
                <div className="p-8 flex items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Loading products and phone models...
                </div>
              ) : visibleProducts.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  {displayProducts.length === 0 ? "No displays found in the catalogue." : "No display matches this search."}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0 z-10">
                    <tr>
                      <th className="text-left p-2 w-10">#</th>
                      <th className="text-left p-2 w-[38%]">Display</th>
                      <th className="text-left p-2">Compatible phone models</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleProducts.map((product, index) => {
                      const selectedIds = draft[product.id] || []
                      const isOpen = openRow === product.id
                      const isChanged = !sameSet(selectedIds, saved[product.id] || [])

                      return (
                        <tr
                          key={product.id}
                          className={`border-t border-border align-top ${isChanged ? "bg-primary/5" : ""}`}
                        >
                          <td className="p-2 text-muted-foreground">{index + 1}</td>

                          <td className="p-2">
                            <span className="block font-medium">{product.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {[product.sku, product.brand, product.category]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </td>

                          <td className="p-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {selectedIds.map((modelId) => {
                                const model = modelById.get(modelId)
                                return (
                                  <span
                                    key={modelId}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted border border-border text-xs"
                                  >
                                    {model?.label || "Model"}
                                    <button
                                      type="button"
                                      onClick={() => toggleModelForRow(product.id, modelId)}
                                      disabled={busy}
                                      className="text-muted-foreground hover:text-destructive"
                                      aria-label={`Remove ${model?.label || "model"}`}
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </span>
                                )
                              })}

                              <button
                                type="button"
                                onClick={() => {
                                  setOpenRow(isOpen ? null : product.id)
                                  setModelSearch("")
                                  // A half-typed model belongs to the row it was
                                  // started on, not to the next one opened.
                                  setShowNewModel(false)
                                  setNewModelName("")
                                  setNewModelCode("")
                                  setNewModelBrand(String(product.brand || ""))
                                }}
                                disabled={busy}
                                className="text-xs font-semibold text-primary hover:underline"
                              >
                                {isOpen ? "Done" : selectedIds.length > 0 ? "+ Add / edit" : "+ Select models"}
                              </button>

                              {selectedIds.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => clearRow(product.id)}
                                  disabled={busy}
                                  className="text-xs text-muted-foreground hover:text-destructive underline"
                                >
                                  Clear
                                </button>
                              )}
                            </div>

                            {isOpen && (
                              <div className="mt-2 p-2 border border-border rounded-lg bg-background">
                                <div className="flex flex-wrap gap-2 mb-2">
                                  <div className="relative flex-1 min-w-[12rem]">
                                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                    <input
                                      type="text"
                                      value={modelSearch}
                                      onChange={(e) => setModelSearch(e.target.value)}
                                      placeholder="Search phone model, code or alias..."
                                      className="w-full pl-8 pr-2 py-1.5 text-xs border border-border rounded-md bg-background"
                                      autoFocus
                                    />
                                  </div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => addAllShownToRow(product.id)}
                                    disabled={busy || visibleModels.length === 0}
                                  >
                                    <Check className="w-3.5 h-3.5 mr-1.5" />
                                    Add all shown ({visibleModels.length})
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      showNewModel ? setShowNewModel(false) : openNewModelForm(product)
                                    }
                                    disabled={busy}
                                  >
                                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                                    New model
                                  </Button>
                                </div>

                                {/* Phone missing from the catalogue? Add it here. */}
                                {showNewModel && (
                                  <div className="mb-2 p-2 rounded-md border border-primary/40 bg-primary/5">
                                    <p className="text-[11px] text-muted-foreground mb-2">
                                      Not in the list? Add the phone here - it is saved to the phone
                                      model catalogue (so the product form&apos;s <strong>Model</strong>{" "}
                                      dropdown offers it too) and ticked on this display right away.
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_1fr_auto] gap-2">
                                      <select
                                        value={newModelBrand}
                                        onChange={(e) => setNewModelBrand(e.target.value)}
                                        className="px-2 py-1.5 text-xs border border-border rounded-md bg-background"
                                        disabled={busy}
                                        aria-label="Brand for the new phone model"
                                      >
                                        <option value="">Brand...</option>
                                        {allBrandNames.map((name) => (
                                          <option key={name} value={name}>
                                            {name}
                                          </option>
                                        ))}
                                      </select>
                                      <input
                                        type="text"
                                        value={newModelName}
                                        onChange={(e) => setNewModelName(e.target.value)}
                                        placeholder="Phone model (e.g. Redmi Note 14)"
                                        className="px-2 py-1.5 text-xs border border-border rounded-md bg-background"
                                        disabled={busy}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault()
                                            createModelForRow(product)
                                          }
                                        }}
                                      />
                                      <input
                                        type="text"
                                        value={newModelCode}
                                        onChange={(e) => setNewModelCode(e.target.value)}
                                        placeholder="Model code (optional)"
                                        className="px-2 py-1.5 text-xs border border-border rounded-md bg-background"
                                        disabled={busy}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault()
                                            createModelForRow(product)
                                          }
                                        }}
                                      />
                                      <Button
                                        type="button"
                                        size="sm"
                                        onClick={() => createModelForRow(product)}
                                        disabled={busy || !newModelName.trim()}
                                      >
                                        {creatingModel ? (
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                          "Add"
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                )}

                                <div className="max-h-52 overflow-y-auto border border-border rounded-md">
                                  {phoneModels.length === 0 ? (
                                    <p className="p-3 text-xs text-muted-foreground">
                                      No phone models yet. Use{" "}
                                      <button
                                        type="button"
                                        onClick={() => openNewModelForm(product)}
                                        className="font-semibold text-primary hover:underline"
                                      >
                                        New model
                                      </button>{" "}
                                      to add the first one, or import a sheet.
                                    </p>
                                  ) : visibleModels.length === 0 ? (
                                    <p className="p-3 text-xs text-muted-foreground">
                                      No model matches this search.{" "}
                                      <button
                                        type="button"
                                        onClick={() => openNewModelForm(product)}
                                        className="font-semibold text-primary hover:underline"
                                      >
                                        Add &quot;{modelSearch.trim() || "a new model"}&quot; to the system
                                      </button>
                                    </p>
                                  ) : (
                                    <ul className="divide-y divide-border">
                                      {visibleModels.map((model) => {
                                        const checked = selectedIds.includes(model.id)
                                        return (
                                          <li key={model.id}>
                                            <label
                                              className={`flex items-center gap-2 px-2.5 py-1.5 cursor-pointer text-xs ${
                                                checked ? "bg-primary/5" : "hover:bg-muted"
                                              }`}
                                            >
                                              <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggleModelForRow(product.id, model.id)}
                                                disabled={busy}
                                                className="w-3.5 h-3.5 accent-primary"
                                              />
                                              <span className="flex-1 min-w-0 truncate">
                                                {model.label}
                                                {model.model_code ? (
                                                  <span className="text-muted-foreground">
                                                    {" "}
                                                    · {model.model_code}
                                                  </span>
                                                ) : null}
                                              </span>
                                            </label>
                                          </li>
                                        )
                                      })}
                                    </ul>
                                  )}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Excel / csv                                                       */}
        {/* ---------------------------------------------------------------- */}
        {tab === "sheet" && (
          <div className="flex-1 min-h-0 overflow-y-auto p-5 pt-4 space-y-4">
            <div className="text-sm text-muted-foreground space-y-1">
              <p>
                Paste rows straight from Excel, or upload a .csv. Each row attaches models to a
                product that <strong>already exists</strong> - importing never creates a product and
                never changes stock.
              </p>
              <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto">{SAMPLE}</pre>
            </div>

            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setResults(null)
              }}
              rows={8}
              placeholder="Paste your rows here..."
              className="w-full px-3 py-2 border border-border rounded-lg bg-background font-mono text-xs"
              disabled={running}
            />

            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded-lg cursor-pointer text-sm hover:bg-muted">
                <Upload className="w-4 h-4" />
                Upload .csv
                <input
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  className="hidden"
                  disabled={running}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) readFile(file)
                  }}
                />
              </label>

              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="import-mode"
                  checked={mode === "merge"}
                  onChange={() => setMode("merge")}
                  disabled={running}
                />
                Add to existing models
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="import-mode"
                  checked={mode === "replace"}
                  onChange={() => setMode("replace")}
                  disabled={running}
                />
                Replace the model list
              </label>
            </div>

            {summary && (
              <div className="p-3 rounded-lg bg-muted text-sm">
                <p className="font-semibold mb-1">
                  {wasDryRun ? "Preview" : "Imported"}: {summary.linked} of {summary.rows} rows
                </p>
                <p className="text-muted-foreground text-xs">
                  {summary.compatibility_rows} compatibility links · {summary.models_created} new
                  phone models · {summary.products_created} products created · {summary.skipped}{" "}
                  skipped
                </p>
              </div>
            )}

            {results && results.length > 0 && (
              <div className="border border-border rounded-lg max-h-56 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left p-2">Row</th>
                      <th className="text-left p-2">SKU</th>
                      <th className="text-left p-2">Product</th>
                      <th className="text-left p-2">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((row) => (
                      <tr key={row.row} className="border-t border-border">
                        <td className="p-2">{row.row}</td>
                        <td className="p-2 font-mono">{row.sku || "-"}</td>
                        <td className="p-2">{row.product || "-"}</td>
                        <td
                          className={`p-2 ${row.status === "linked" ? "text-green-600" : "text-orange-600"}`}
                        >
                          {row.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 p-5 border-t border-border">
          <span className="text-xs text-muted-foreground">
            {tab === "manual"
              ? changedIds.length > 0
                ? `${changedIds.length} product(s) changed - not saved yet`
                : `${visibleProducts.length} display(s) shown`
              : "Rows match existing products only"}
          </span>

          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Close
            </Button>

            {tab === "manual" ? (
              <Button onClick={saveManual} disabled={busy || changedIds.length === 0}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Save {changedIds.length > 0 ? `(${changedIds.length})` : ""}
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => run(true)} disabled={busy || !text.trim()}>
                  {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Preview
                </Button>
                <Button onClick={() => run(false)} disabled={busy || !text.trim()}>
                  {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Import
                </Button>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
