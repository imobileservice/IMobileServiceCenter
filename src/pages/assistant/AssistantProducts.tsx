"use client"

import type React from "react"
import { useEffect, useMemo, useState } from "react"
import { Plus, Search, Pencil, Trash2, Lock, X, Tag, PackagePlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import AssistantLayout from "@/components/assistant/assistant-layout"
// Printing is client-side only. The modal's one server call - compatible phone
// models, under /api/admin - is refused for an assistant and it prints the
// plain label instead, which is the everyday case anyway.
import BarcodeLabelModal, { type LabelProduct } from "@/components/admin/barcode-label-modal"
import { assistantService } from "@/lib/services/assistant.service"
import { useAssistantStore } from "@/lib/assistant-store"
import { formatCurrency } from "@/lib/utils/currency"

interface ProductRow {
  id: string
  name: string
  sku: string | null
  brand: string | null
  category_id: string | null
  price: number | null
  cost_price: number | null
  buy_price: number | null
  sell_price: number | null
  discount_price: number | null
  stock: number | null
  qty_label: string | null
  specs: { model?: string } | null
  description: string | null
  condition: string | null
  is_featured: boolean | null
  barcode: string | null
  image: string | null
  images: string[]
  stock_row: {
    quantity: number
    qty_meegoda: number
    qty_padukka: number
    qty_padukka_new: number
    low_stock_threshold: number
  } | null
}

type FormState = {
  name: string
  category_id: string
  brand: string
  sku: string
  sell_price: string
  cost_price: string
  buy_price: string
  discount_price: string
  condition: "new" | "used"
  qty_label: string
  description: string
  image: string
  is_featured: boolean
  qty_meegoda: string
  qty_padukka: string
  qty_padukka_new: string
}

const EMPTY_FORM: FormState = {
  name: "",
  category_id: "",
  brand: "",
  sku: "",
  sell_price: "",
  cost_price: "",
  buy_price: "",
  discount_price: "",
  condition: "new",
  qty_label: "",
  description: "",
  image: "",
  is_featured: false,
  qty_meegoda: "0",
  qty_padukka: "0",
  qty_padukka_new: "0",
}

/** The same bands as the admin Products screen, so both screens count alike. */
const VERY_LOW_STOCK_BELOW = 4
const LOW_STOCK_MAX = 5

type StockFilter = "all" | "very_low" | "low"

// inv_stock first, products.stock only when a product has no stock row - the
// order /api/products/list uses, which is what the admin screen shows. The two
// columns can disagree, and reading them the other way round gave different
// low-stock counts on the two screens.
const stockOf = (product: ProductRow) => Number(product.stock_row?.quantity ?? product.stock ?? 0)

/** The model is appended when the name does not already carry it, as on the admin screen. */
const displayName = (product: ProductRow) => {
  const model = product.specs?.model
  return model && !product.name.includes(model) ? `${product.name} (${model})` : product.name
}

const toLabel = (product: ProductRow): LabelProduct => ({
  id: product.id,
  name: displayName(product),
  barcode: product.barcode,
  price: product.price ?? undefined,
  brand: product.brand || undefined,
  model: product.specs?.model || undefined,
})

/**
 * Products, as an assistant sees them.
 *
 * The table is the admin's Products table column for column - someone adding
 * products needs the same prices and stock figures to do it. What differs is
 * what the buttons do. Adding and restocking take effect at once; editing and
 * deleting open a form whose submit button sends a request to the
 * administrator and changes nothing. The wording on those buttons says so,
 * because "Save" that does not save is the kind of thing people only discover
 * after they have stopped watching.
 */
export default function AssistantProductsPage() {
  const can = useAssistantStore((state) => state.can)

  const [products, setProducts] = useState<ProductRow[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [search, setSearch] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [stockFilter, setStockFilter] = useState<StockFilter>("all")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const [mode, setMode] = useState<"closed" | "create" | "edit">("closed")
  const [editing, setEditing] = useState<ProductRow | null>(null)
  const [deleting, setDeleting] = useState<ProductRow | null>(null)
  const [restocking, setRestocking] = useState<ProductRow | null>(null)
  const [printing, setPrinting] = useState<LabelProduct[] | null>(null)

  // The whole catalogue in one go, then filtered here - the admin screen works
  // the same way, and it keeps search instant.
  const load = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [productList, categoryList] = await Promise.all([
        assistantService.products({ limit: 1000 }),
        assistantService.categories().catch(() => []),
      ])
      setProducts(productList as ProductRow[])
      setCategories(categoryList)
    } catch (error: any) {
      if (error?.code !== "PERMISSION_DENIED") {
        toast.error(error?.message || "Could not load products")
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const categoryName = useMemo(() => {
    const byId = new Map(categories.map((category) => [category.id, category.name]))
    return (id: string | null) => (id ? byId.get(id) || "—" : "—")
  }, [categories])

  // A tab only for categories that hold at least one product.
  const categoryTabs = useMemo(() => {
    const used = new Set(products.map((product) => product.category_id).filter(Boolean))
    return categories
      .filter((category) => used.has(category.id))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)))
  }, [products, categories])

  const veryLowCount = products.filter((product) => stockOf(product) < VERY_LOW_STOCK_BELOW).length
  const lowCount = products.filter((product) => {
    const stock = stockOf(product)
    return stock >= VERY_LOW_STOCK_BELOW && stock <= LOW_STOCK_MAX
  }).length

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return products.filter((product) => {
      if (selectedCategory !== "all" && product.category_id !== selectedCategory) return false

      const stock = stockOf(product)
      if (stockFilter === "very_low" && stock >= VERY_LOW_STOCK_BELOW) return false
      if (stockFilter === "low" && (stock < VERY_LOW_STOCK_BELOW || stock > LOW_STOCK_MAX)) return false

      if (!term) return true
      return [
        product.name,
        product.brand,
        product.sku,
        product.barcode,
        product.specs?.model,
        categoryName(product.category_id),
      ].some((value) => String(value || "").toLowerCase().includes(term))
    })
  }, [products, search, selectedCategory, stockFilter, categoryName])

  const allSelected = filtered.length > 0 && filtered.every((product) => selectedIds.includes(product.id))
  const toggleAll = () => setSelectedIds(allSelected ? [] : filtered.map((product) => product.id))
  const toggleOne = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const printSelected = () =>
    setPrinting(products.filter((product) => selectedIds.includes(product.id)).map(toLabel))

  return (
    <AssistantLayout
      permission="products.view"
      title="Products"
      description="Add and restock products directly. Edits and deletions are sent to the administrator for approval."
    >
      <div className="space-y-4">
        {/* Category tabs, with the page actions alongside */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
            <Button
              size="sm"
              variant={selectedCategory === "all" ? "default" : "outline"}
              onClick={() => setSelectedCategory("all")}
              className="whitespace-nowrap rounded-full px-4"
            >
              All
            </Button>
            {categoryTabs.map((category) => (
              <Button
                key={category.id}
                size="sm"
                variant={selectedCategory === category.id ? "default" : "outline"}
                onClick={() => setSelectedCategory(category.id)}
                className="whitespace-nowrap rounded-full px-4"
              >
                {category.name}
              </Button>
            ))}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {selectedIds.length > 0 && (
              <Button variant="secondary" onClick={printSelected} className="gap-2">
                <Tag className="h-4 w-4" />
                Print labels ({selectedIds.length})
              </Button>
            )}
            {can("products.create") && (
              <Button
                onClick={() => {
                  setEditing(null)
                  setMode("create")
                }}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Add product
              </Button>
            )}
          </div>
        </div>

        {/* Search and stock filters */}
        <div className="flex flex-col items-stretch gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, brand, SKU, barcode or model"
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setStockFilter(stockFilter === "very_low" ? "all" : "very_low")}
              className={`font-semibold ${
                stockFilter === "very_low"
                  ? "border-red-600 bg-red-600 text-white hover:bg-red-700 hover:text-white"
                  : "border-red-500/40 text-red-500 hover:bg-red-500/10 hover:text-red-500"
              }`}
            >
              Very Low Stock ({veryLowCount})
            </Button>
            <Button
              variant="outline"
              onClick={() => setStockFilter(stockFilter === "low" ? "all" : "low")}
              className={`font-semibold ${
                stockFilter === "low"
                  ? "border-orange-500 bg-orange-500 text-white hover:bg-orange-600 hover:text-white"
                  : "border-orange-500/40 text-orange-500 hover:bg-orange-500/10 hover:text-orange-500"
              }`}
            >
              Low Stock ({lowCount})
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-xl border border-border bg-card" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-center">
            <p className="text-sm font-medium">No products found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {products.length ? "Try a different search, category or stock filter." : "Add the first one to get started."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[1080px]">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="w-12 px-4 py-4 text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-3 py-4 text-left font-semibold">Product Name</th>
                  <th className="px-3 py-4 text-left font-semibold">Category</th>
                  <th className="px-2 py-4 text-right text-xs font-semibold">Buy</th>
                  <th className="px-2 py-4 text-right text-xs font-semibold">Inventory</th>
                  <th className="px-2 py-4 text-right text-xs font-semibold">Website</th>
                  <th className="px-2 py-4 text-right text-xs font-semibold">Discount</th>
                  <th className="whitespace-nowrap px-3 py-4 text-left font-semibold">Stock</th>
                  <th className="whitespace-nowrap px-3 py-4 text-left font-semibold">Qty Label</th>
                  <th className="px-3 py-4 text-left font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => {
                  const stock = stockOf(product)
                  const details = [product.brand, product.barcode].filter(Boolean).join(" · ")
                  return (
                    <tr key={product.id} className="border-b border-border transition-colors last:border-0 hover:bg-muted/50">
                      <td className="w-12 px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-border"
                          checked={selectedIds.includes(product.id)}
                          onChange={() => toggleOne(product.id)}
                          aria-label={`Select ${product.name}`}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={product.image || "/placeholder.svg"}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded border border-border object-cover"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">{displayName(product)}</p>
                            {details && <p className="text-xs text-muted-foreground">{details}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sm">{categoryName(product.category_id)}</td>
                      <td className="px-2 py-3 text-right text-xs text-muted-foreground">
                        <Money value={product.cost_price} />
                      </td>
                      <td className="px-2 py-3 text-right text-xs font-medium text-blue-400">
                        <Money value={product.buy_price} />
                      </td>
                      <td className="px-2 py-3 text-right text-xs font-semibold">
                        {formatCurrency(product.price ?? product.sell_price)}
                      </td>
                      <td className="px-2 py-3 text-right text-xs font-medium text-green-500">
                        <Money value={product.discount_price} />
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
                            stock >= 10
                              ? "bg-green-100 text-green-800"
                              : stock >= 5
                                ? "bg-yellow-100 text-yellow-800"
                                : "border border-red-200 bg-red-100 text-red-600"
                          }`}
                        >
                          {stock} units
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {product.qty_label ? (
                          <span className="inline-flex items-center whitespace-nowrap rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                            {product.qty_label}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <ActionButton
                            allowed={can("inventory.adjust")}
                            title="Restock"
                            tone="blue"
                            onClick={() => setRestocking(product)}
                          >
                            <PackagePlus className="h-4 w-4" />
                          </ActionButton>
                          <ActionButton
                            allowed={can("products.edit_request")}
                            title="Request an edit"
                            onClick={() => {
                              setEditing(product)
                              setMode("edit")
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </ActionButton>
                          <ActionButton
                            title={product.barcode ? "Print barcode label" : "No barcode on this product"}
                            disabled={!product.barcode}
                            onClick={() => setPrinting([toLabel(product)])}
                          >
                            <Tag className="h-4 w-4" />
                          </ActionButton>
                          <ActionButton
                            allowed={can("products.delete_request")}
                            title="Request deletion"
                            tone="red"
                            onClick={() => setDeleting(product)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </ActionButton>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {mode !== "closed" && (
        <ProductForm
          mode={mode}
          product={editing}
          categories={categories}
          onClose={() => {
            setMode("closed")
            setEditing(null)
          }}
          onSaved={(created) => {
            setMode("closed")
            setEditing(null)
            load(true)
            // A new product goes straight to its label, as it does for the admin.
            if (created?.barcode) setPrinting([toLabel({ ...created, image: null, images: [], stock_row: null })])
          }}
        />
      )}

      {deleting && (
        <DeleteRequestDialog
          product={deleting}
          onClose={() => setDeleting(null)}
          onSent={() => {
            setDeleting(null)
            load(true)
          }}
        />
      )}

      {restocking && (
        <RestockDialog
          product={restocking}
          onClose={() => setRestocking(null)}
          onDone={() => {
            setRestocking(null)
            load(true)
          }}
        />
      )}

      <BarcodeLabelModal isOpen={!!printing} onClose={() => setPrinting(null)} products={printing} />
    </AssistantLayout>
  )
}

function Money({ value }: { value: number | null | undefined }) {
  return value ? <>{formatCurrency(value)}</> : <span className="text-muted-foreground/40">—</span>
}

const ACTION_TONES = {
  default: "text-foreground hover:bg-muted",
  blue: "text-blue-600 hover:bg-blue-500/10 hover:text-blue-700",
  red: "text-red-600 hover:bg-red-500/10 hover:text-red-700",
}

function ActionButton({
  allowed = true,
  title,
  tone = "default",
  disabled,
  onClick,
  children,
}: {
  allowed?: boolean
  title: string
  tone?: keyof typeof ACTION_TONES
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  const base = "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border transition-colors"

  if (!allowed) {
    return (
      <span title="You do not have this permission" className={`${base} text-muted-foreground/40`}>
        <Lock className="h-4 w-4" />
      </span>
    )
  }

  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${ACTION_TONES[tone]} disabled:pointer-events-none disabled:opacity-40`}
    >
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ */

function ProductForm({
  mode,
  product,
  categories,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit"
  product: ProductRow | null
  categories: any[]
  onClose: () => void
  /** Handed the new product after a create; nothing after an edit request. */
  onSaved: (created?: any) => void
}) {
  const [form, setForm] = useState<FormState>(() =>
    product
      ? {
          name: product.name || "",
          category_id: product.category_id || "",
          brand: product.brand || "",
          sku: product.sku || "",
          sell_price: String(product.sell_price ?? product.price ?? ""),
          cost_price: String(product.cost_price ?? ""),
          buy_price: String(product.buy_price ?? ""),
          discount_price: String(product.discount_price ?? ""),
          condition: (product.condition as "new" | "used") || "new",
          qty_label: product.qty_label || "",
          description: product.description || "",
          image: product.image || "",
          is_featured: Boolean(product.is_featured),
          qty_meegoda: String(product.stock_row?.qty_meegoda ?? 0),
          qty_padukka: String(product.stock_row?.qty_padukka ?? 0),
          qty_padukka_new: String(product.stock_row?.qty_padukka_new ?? 0),
        }
      : EMPTY_FORM
  )
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const buildPayload = () => {
    const sellPrice = Number(form.sell_price) || 0
    const meegoda = Number(form.qty_meegoda) || 0
    const padukka = Number(form.qty_padukka) || 0
    const padukkaNew = Number(form.qty_padukka_new) || 0

    return {
      name: form.name.trim(),
      category_id: form.category_id || null,
      brand: form.brand.trim() || null,
      sku: form.sku.trim() || null,
      // `price` is what the shop pages show; sell_price is the same number kept
      // under the name the inventory screens use.
      price: sellPrice,
      sell_price: sellPrice,
      cost_price: form.cost_price === "" ? null : Number(form.cost_price),
      buy_price: form.buy_price === "" ? null : Number(form.buy_price),
      discount_price: form.discount_price === "" ? null : Number(form.discount_price),
      condition: form.condition,
      qty_label: form.qty_label.trim() || null,
      description: form.description.trim() || null,
      is_featured: form.is_featured,
      image: form.image.trim() || undefined,
      images: form.image.trim() ? [form.image.trim()] : undefined,
      stock: meegoda + padukka + padukkaNew,
      qty_meegoda: meegoda,
      qty_padukka: padukka,
      qty_padukka_new: padukkaNew,
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.name.trim()) {
      toast.error("Give the product a name")
      return
    }
    if (!form.category_id) {
      toast.error("Pick a category")
      return
    }

    setSaving(true)
    try {
      if (mode === "create") {
        const created = await assistantService.createProduct(buildPayload())
        toast.success("Product added")
        onSaved(created)
      } else if (product) {
        const response = await assistantService.requestProductEdit(product.id, buildPayload(), note)
        toast.success(response.message || "Sent to the administrator for approval")
        onSaved()
      }
    } catch (error: any) {
      toast.error(error?.message || "Could not save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={mode === "create" ? "Add product" : `Request an edit: ${product?.name}`}
      onClose={onClose}
    >
      {mode === "edit" && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
          Nothing changes when you send this. The administrator sees what you have proposed and the
          current values side by side, and the change is applied only if they approve it.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Product name" required>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" required>
            <select
              value={form.category_id}
              onChange={(e) => set("category_id", e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              required
            >
              <option value="">Select a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Brand">
            <Input value={form.brand} onChange={(e) => set("brand", e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="SKU">
            <Input value={form.sku} onChange={(e) => set("sku", e.target.value)} />
          </Field>

          <Field label="Qty label">
            <Input
              value={form.qty_label}
              onChange={(e) => set("qty_label", e.target.value)}
              placeholder="e.g. Box of 25"
              maxLength={40}
            />
          </Field>

          <Field label="Condition">
            <select
              value={form.condition}
              onChange={(e) => set("condition", e.target.value as "new" | "used")}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="new">New</option>
              <option value="used">Used</option>
            </select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Selling price" required>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.sell_price}
              onChange={(e) => set("sell_price", e.target.value)}
              required
            />
          </Field>
          <Field label="Cost price">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.cost_price}
              onChange={(e) => set("cost_price", e.target.value)}
            />
          </Field>
          <Field label="Buy price">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.buy_price}
              onChange={(e) => set("buy_price", e.target.value)}
            />
          </Field>
          <Field label="Discount price">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.discount_price}
              onChange={(e) => set("discount_price", e.target.value)}
            />
          </Field>
        </div>

        <Field label="Quantity by shop">
          <div className="grid gap-3 sm:grid-cols-3">
            <LabelledNumber
              label="Meegoda"
              value={form.qty_meegoda}
              onChange={(value) => set("qty_meegoda", value)}
            />
            <LabelledNumber
              label="Padukka"
              value={form.qty_padukka}
              onChange={(value) => set("qty_padukka", value)}
            />
            <LabelledNumber
              label="Padukka (New)"
              value={form.qty_padukka_new}
              onChange={(value) => set("qty_padukka_new", value)}
            />
          </div>
        </Field>

        <Field label="Image URL">
          <Input
            value={form.image}
            onChange={(e) => set("image", e.target.value)}
            placeholder="https://…"
          />
        </Field>

        <Field label="Description">
          <textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            rows={3}
            className="w-full rounded-md border border-input bg-background p-3 text-sm"
          />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_featured}
            onChange={(e) => set("is_featured", e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          Show on the featured list
        </label>

        {mode === "edit" && (
          <Field label="Why is this change needed? (optional)">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="The administrator sees this next to your request."
              className="w-full rounded-md border border-input bg-background p-3 text-sm"
            />
          </Field>
        )}

        <div className="flex gap-3 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" disabled={saving} className="flex-1">
            {saving
              ? "Working..."
              : mode === "create"
                ? "Add product"
                : "Send for approval"}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function DeleteRequestDialog({
  product,
  onClose,
  onSent,
}: {
  product: ProductRow
  onClose: () => void
  onSent: () => void
}) {
  const [note, setNote] = useState("")
  const [sending, setSending] = useState(false)

  const send = async () => {
    setSending(true)
    try {
      const response = await assistantService.requestProductDelete(product.id, note)
      toast.success(response.message || "Sent to the administrator for approval")
      onSent()
    } catch (error: any) {
      toast.error(error?.message || "Could not send the request")
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal title="Request deletion" onClose={onClose}>
      <p className="text-sm">
        Ask the administrator to delete <span className="font-semibold">{product.name}</span>.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        The product stays exactly as it is until they approve. You can withdraw the request from
        “My Requests” at any time before then.
      </p>

      <div className="mt-4">
        <label className="mb-1.5 block text-sm font-medium">Reason (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Discontinued, duplicate listing, wrong product…"
          className="w-full rounded-md border border-input bg-background p-3 text-sm"
        />
      </div>

      <div className="mt-5 flex gap-3">
        <Button variant="outline" onClick={onClose} className="flex-1">
          Cancel
        </Button>
        <Button onClick={send} disabled={sending} variant="destructive" className="flex-1">
          {sending ? "Sending..." : "Send for approval"}
        </Button>
      </div>
    </Modal>
  )
}

const RESTOCK_SHOPS = [
  { key: "qty_meegoda", label: "Meegoda" },
  { key: "qty_padukka", label: "Padukka" },
  { key: "qty_padukka_new", label: "Padukka New" },
] as const

/**
 * The admin screen's restock: type how many arrived per shop and they are
 * added on top of what is there. The assistant stock endpoint takes absolute
 * quantities, so the addition is done here and the totals are sent.
 */
function RestockDialog({
  product,
  onClose,
  onDone,
}: {
  product: ProductRow
  onClose: () => void
  onDone: () => void
}) {
  const [added, setAdded] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const current = (key: (typeof RESTOCK_SHOPS)[number]["key"]) => Number(product.stock_row?.[key] ?? 0)
  const addedFor = (key: string) => Number(added[key]) || 0
  const totalAdded = RESTOCK_SHOPS.reduce((sum, shop) => sum + addedFor(shop.key), 0)
  const currentTotal = Number(product.stock_row?.quantity ?? product.stock ?? 0)

  const submit = async () => {
    setSaving(true)
    try {
      await assistantService.adjustStock(product.id, {
        qty_meegoda: Math.max(0, current("qty_meegoda") + addedFor("qty_meegoda")),
        qty_padukka: Math.max(0, current("qty_padukka") + addedFor("qty_padukka")),
        qty_padukka_new: Math.max(0, current("qty_padukka_new") + addedFor("qty_padukka_new")),
        note: `Restock: ${RESTOCK_SHOPS.map((shop) => `${shop.label}(+${addedFor(shop.key)})`).join(", ")}`,
      })
      toast.success("Stock updated")
      onDone()
    } catch (error: any) {
      toast.error(error?.message || "Could not update stock")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Restock product" onClose={onClose} maxWidth="max-w-md">
      <div className="mb-5 rounded-xl border border-border bg-muted/50 p-4">
        <p className="mb-1 text-xs font-bold uppercase text-muted-foreground">Product</p>
        <p className="font-semibold">{displayName(product)}</p>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center text-xs font-bold uppercase text-muted-foreground">
          <div className="text-left">Shop</div>
          <div>Current</div>
          <div>Add</div>
        </div>

        {RESTOCK_SHOPS.map((shop) => (
          <div key={shop.key} className="grid grid-cols-3 items-center gap-2">
            <div className="text-sm font-semibold">{shop.label}</div>
            <div className="text-center font-mono">{current(shop.key)}</div>
            <Input
              type="number"
              value={added[shop.key] ?? ""}
              onChange={(e) => setAdded((prev) => ({ ...prev, [shop.key]: e.target.value }))}
              placeholder="+0"
              className="h-9 text-center font-mono font-bold"
            />
          </div>
        ))}

        <div className="grid grid-cols-3 items-center gap-2 border-t border-border pt-4">
          <div className="font-black text-primary">TOTAL</div>
          <div className="text-center font-mono text-lg font-black">{currentTotal}</div>
          <div className="text-center font-mono text-lg font-black text-green-600">+{totalAdded}</div>
        </div>
        <div className="flex items-center justify-between text-primary">
          <div className="font-black">NEW TOTAL</div>
          <div className="font-mono text-2xl font-black">{currentTotal + totalAdded}</div>
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <Button variant="outline" onClick={onClose} className="flex-1" disabled={saving}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={saving || totalAdded === 0} className="flex-1">
          {saving ? "Updating..." : "Confirm restock"}
        </Button>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */

export function Modal({
  title,
  onClose,
  children,
  maxWidth = "max-w-2xl",
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  maxWidth?: string
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center">
      <div className={`my-8 w-full ${maxWidth} rounded-2xl border border-border bg-card shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-border p-5">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}

function LabelledNumber({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <Input type="number" min="0" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}
