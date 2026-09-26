"use client"

import type React from "react"
import { useEffect, useMemo, useState } from "react"
import { Plus, Search, Pencil, Trash2, Lock, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import AssistantLayout from "@/components/assistant/assistant-layout"
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
  description: "",
  image: "",
  is_featured: false,
  qty_meegoda: "0",
  qty_padukka: "0",
  qty_padukka_new: "0",
}

/**
 * Products, as an assistant sees them.
 *
 * Adding is immediate. Editing and deleting are not: both open a form whose
 * submit button sends a request to the administrator and changes nothing. The
 * wording on those buttons says so, because "Save" that does not save is the
 * kind of thing people only discover after they have stopped watching.
 */
export default function AssistantProductsPage() {
  const can = useAssistantStore((state) => state.can)

  const [products, setProducts] = useState<ProductRow[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)

  const [mode, setMode] = useState<"closed" | "create" | "edit">("closed")
  const [editing, setEditing] = useState<ProductRow | null>(null)
  const [deleting, setDeleting] = useState<ProductRow | null>(null)

  const load = async (searchTerm?: string) => {
    setLoading(true)
    try {
      const [productList, categoryList] = await Promise.all([
        assistantService.products({ search: searchTerm, limit: 300 }),
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

  // Debounced search, so typing does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => load(search.trim() || undefined), 350)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const categoryName = useMemo(() => {
    const byId = new Map(categories.map((category) => [category.id, category.name]))
    return (id: string | null) => (id ? byId.get(id) || "—" : "—")
  }, [categories])

  return (
    <AssistantLayout
      permission="products.view"
      title="Products"
      description="Add products directly. Edits and deletions are sent to the administrator for approval."
    >
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, brand, SKU or barcode"
            className="pl-9"
          />
        </div>

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

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <p className="text-sm font-medium">No products found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {search ? "Try a different search." : "Add the first one to get started."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 text-right font-medium">Price</th>
                <th className="px-4 py-3 text-right font-medium">In stock</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const quantity = product.stock_row?.quantity ?? 0
                return (
                  <tr key={product.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {product.image ? (
                          <img
                            src={product.image}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-lg border border-border object-cover"
                          />
                        ) : (
                          <div className="h-10 w-10 shrink-0 rounded-lg border border-border bg-muted" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium">{product.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {product.brand || "No brand"}
                            {product.sku ? ` · ${product.sku}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {categoryName(product.category_id)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCurrency(product.sell_price ?? product.price, { showDecimals: false })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`tabular-nums ${
                          quantity === 0
                            ? "text-red-500"
                            : quantity <= (product.stock_row?.low_stock_threshold ?? 5)
                              ? "text-amber-500"
                              : ""
                        }`}
                      >
                        {quantity}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
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
                          allowed={can("products.delete_request")}
                          title="Request deletion"
                          destructive
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

      {mode !== "closed" && (
        <ProductForm
          mode={mode}
          product={editing}
          categories={categories}
          onClose={() => {
            setMode("closed")
            setEditing(null)
          }}
          onSaved={() => {
            setMode("closed")
            setEditing(null)
            load(search.trim() || undefined)
          }}
        />
      )}

      {deleting && (
        <DeleteRequestDialog
          product={deleting}
          onClose={() => setDeleting(null)}
          onSent={() => {
            setDeleting(null)
            load(search.trim() || undefined)
          }}
        />
      )}
    </AssistantLayout>
  )
}

function ActionButton({
  allowed,
  title,
  destructive,
  onClick,
  children,
}: {
  allowed: boolean
  title: string
  destructive?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  if (!allowed) {
    return (
      <span
        title="You do not have this permission"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/40"
      >
        <Lock className="h-4 w-4" />
      </span>
    )
  }

  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-muted ${
        destructive ? "text-red-500 hover:bg-red-500/10" : "text-muted-foreground hover:text-foreground"
      }`}
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
  onSaved: () => void
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
        await assistantService.createProduct(buildPayload())
        toast.success("Product added")
      } else if (product) {
        const response = await assistantService.requestProductEdit(product.id, buildPayload(), note)
        toast.success(response.message || "Sent to the administrator for approval")
      }
      onSaved()
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="SKU">
            <Input value={form.sku} onChange={(e) => set("sku", e.target.value)} />
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

/* ------------------------------------------------------------------ */

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
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
      <div className="my-8 w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl">
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
