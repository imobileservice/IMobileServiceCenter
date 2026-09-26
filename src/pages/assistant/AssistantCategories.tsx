"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { Plus, Pencil, Trash2, Lock, FolderTree } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import AssistantLayout from "@/components/assistant/assistant-layout"
import { assistantService } from "@/lib/services/assistant.service"
import { useAssistantStore } from "@/lib/assistant-store"
import { Modal, Field } from "./AssistantProducts"

interface CategoryRow {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  is_active: boolean
  sort_order: number
  product_count: number
}

/**
 * Categories, as an assistant sees them.
 *
 * Same rule as products: adding is immediate, editing and deleting go to the
 * administrator. The product count on each row is shown because deleting a
 * category that still holds products is refused - seeing the number first saves
 * a round trip through the approval queue for a request that cannot succeed.
 */
export default function AssistantCategoriesPage() {
  const can = useAssistantStore((state) => state.can)

  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<"closed" | "create" | "edit">("closed")
  const [editing, setEditing] = useState<CategoryRow | null>(null)
  const [deleting, setDeleting] = useState<CategoryRow | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      setCategories((await assistantService.categories()) as CategoryRow[])
    } catch (error: any) {
      if (error?.code !== "PERMISSION_DENIED") {
        toast.error(error?.message || "Could not load categories")
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <AssistantLayout
      permission="categories.view"
      title="Categories"
      description="Add categories directly. Edits and deletions are sent to the administrator for approval."
    >
      <div className="mb-5 flex justify-end">
        {can("categories.create") && (
          <Button
            onClick={() => {
              setEditing(null)
              setMode("create")
            }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add category
          </Button>
        )}
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-2xl border border-border bg-card" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <FolderTree className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No categories yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Products need a category, so this is usually the first thing to set up.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <div key={category.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{category.name}</p>
                  <p className="truncate text-xs text-muted-foreground">/{category.slug}</p>
                </div>
                {!category.is_active && (
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                    inactive
                  </span>
                )}
              </div>

              {category.description && (
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{category.description}</p>
              )}

              <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                <span className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{category.product_count}</span> product
                  {category.product_count === 1 ? "" : "s"}
                </span>

                <div className="flex items-center gap-1">
                  {can("categories.edit_request") ? (
                    <button
                      title="Request an edit"
                      onClick={() => {
                        setEditing(category)
                        setMode("edit")
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  ) : (
                    <LockedAction />
                  )}

                  {can("categories.delete_request") ? (
                    <button
                      title="Request deletion"
                      onClick={() => setDeleting(category)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-500 transition-colors hover:bg-red-500/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : (
                    <LockedAction />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {mode !== "closed" && (
        <CategoryForm
          mode={mode}
          category={editing}
          onClose={() => {
            setMode("closed")
            setEditing(null)
          }}
          onSaved={() => {
            setMode("closed")
            setEditing(null)
            load()
          }}
        />
      )}

      {deleting && (
        <DeleteCategoryDialog
          category={deleting}
          onClose={() => setDeleting(null)}
          onSent={() => {
            setDeleting(null)
            load()
          }}
        />
      )}
    </AssistantLayout>
  )
}

function LockedAction() {
  return (
    <span
      title="You do not have this permission"
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/40"
    >
      <Lock className="h-4 w-4" />
    </span>
  )
}

function CategoryForm({
  mode,
  category,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit"
  category: CategoryRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(category?.name || "")
  const [slug, setSlug] = useState(category?.slug || "")
  const [description, setDescription] = useState(category?.description || "")
  const [sortOrder, setSortOrder] = useState(String(category?.sort_order ?? 0))
  const [isActive, setIsActive] = useState(category?.is_active !== false)
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error("Give the category a name")
      return
    }

    const payload = {
      name: name.trim(),
      slug: slug.trim() || undefined,
      description: description.trim() || null,
      sort_order: Number(sortOrder) || 0,
      is_active: isActive,
    }

    setSaving(true)
    try {
      if (mode === "create") {
        await assistantService.createCategory(payload)
        toast.success("Category added")
      } else if (category) {
        const response = await assistantService.requestCategoryEdit(category.id, payload, note)
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
      title={mode === "create" ? "Add category" : `Request an edit: ${category?.name}`}
      onClose={onClose}
    >
      {mode === "edit" && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
          Nothing changes when you send this. The administrator reviews it first.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>

        <Field label="URL slug">
          <Input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="Left blank, this is made from the name"
          />
        </Field>

        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-input bg-background p-3 text-sm"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sort order">
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </Field>

          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              Active on the shop
            </label>
          </div>
        </div>

        {mode === "edit" && (
          <Field label="Why is this change needed? (optional)">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-input bg-background p-3 text-sm"
            />
          </Field>
        )}

        <div className="flex gap-3 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" disabled={saving} className="flex-1">
            {saving ? "Working..." : mode === "create" ? "Add category" : "Send for approval"}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function DeleteCategoryDialog({
  category,
  onClose,
  onSent,
}: {
  category: CategoryRow
  onClose: () => void
  onSent: () => void
}) {
  const [note, setNote] = useState("")
  const [sending, setSending] = useState(false)

  const send = async () => {
    setSending(true)
    try {
      const response = await assistantService.requestCategoryDelete(category.id, note)
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
        Ask the administrator to delete <span className="font-semibold">{category.name}</span>.
      </p>

      {category.product_count > 0 && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
          {category.product_count} product{category.product_count === 1 ? " is" : "s are"} still in this
          category. A category holding products cannot be deleted, so this request will fail unless they
          are moved first.
        </div>
      )}

      <div className="mt-4">
        <label className="mb-1.5 block text-sm font-medium">Reason (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
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
