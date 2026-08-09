"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { ChevronDown, KeyRound, Store, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  inventorySuppliersService,
  type CategoryAccessMode,
  type Supplier,
} from "@/lib/services/inventory.service"
import {
  AccessModeToggle,
  CategoryPicker,
  useAllCategories,
  useDefaultCategoryIds,
} from "@/components/admin/supplier-categories-modal"
import { toast } from "sonner"

interface SupplierModalProps {
  isOpen: boolean
  onClose: () => void
  supplier?: Supplier | null
  onSaved?: (supplier: Supplier) => void
}

const EMPTY_FORM = {
  name: "",
  email: "",
  password: "",
  contact_person: "",
  phone: "",
  address: "",
  notes: "",
  support_phone: "",
  support_whatsapp: "",
}

const MIN_PASSWORD = 6

/**
 * Adds or edits a shop we supply.
 *
 * A new shop is only useful once it has three things: a login, and at least one
 * product category to look at. Both are on the first screen for that reason —
 * the address and notes are the part that can wait.
 */
export default function SupplierModal({ isOpen, onClose, supplier, onSaved }: SupplierModalProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [showOptional, setShowOptional] = useState(false)
  const [accessMode, setAccessMode] = useState<CategoryAccessMode>("default")
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])

  const isEditing = Boolean(supplier)
  const { categories, isLoading: categoriesLoading } = useAllCategories(isOpen)
  const { ids: defaultCategoryIds, isLoading: defaultsLoading } = useDefaultCategoryIds(isOpen && !isEditing)

  useEffect(() => {
    if (!isOpen) return
    setLoading(false)
    setShowOptional(false)
    setAccessMode("default")
    setSelectedCategories([])

    if (supplier) {
      setFormData({
        name: supplier.name || "",
        email: supplier.email || "",
        password: "",
        contact_person: supplier.contact_person || "",
        phone: supplier.phone || "",
        address: supplier.address || "",
        notes: supplier.notes || "",
        support_phone: supplier.support_phone || "",
        support_whatsapp: supplier.support_whatsapp || "",
      })
      // Editing keeps the shop's existing access; it is changed from the
      // dedicated Product Access dialog, which shows what is already ticked.
      return
    }

    setFormData(EMPTY_FORM)
  }, [isOpen, supplier])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const toggleCategory = (id: string) =>
    setSelectedCategories((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return

    const name = formData.name.trim()
    const email = formData.email.trim()
    const password = formData.password.trim()

    if (!name) {
      toast.error("Shop name is required")
      return
    }
    // The email is the shop's username at /supplier/login, so a new shop without
    // one could never sign in. Existing shops that already have access are held
    // to the same rule; the rest can be edited freely.
    if (!email && (!isEditing || supplier?.portal_enabled)) {
      toast.error("Email is required — it is the shop's portal username")
      return
    }
    if (!isEditing && !password) {
      toast.error("Set a portal password so the shop can sign in")
      return
    }
    if (password && password.length < MIN_PASSWORD) {
      toast.error(`Password must be at least ${MIN_PASSWORD} characters`)
      return
    }

    setLoading(true)
    try {
      const payload = {
        name,
        email: email || undefined,
        contact_person: formData.contact_person.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        address: formData.address.trim() || undefined,
        notes: formData.notes.trim() || undefined,
        support_phone: formData.support_phone.trim() || undefined,
        support_whatsapp: formData.support_whatsapp.trim() || undefined,
      }

      const res = isEditing
        ? await inventorySuppliersService.update(supplier!.id, payload)
        : await inventorySuppliersService.create(payload)

      const saved: Supplier = res.data
      const savedLabel = isEditing ? "Shop updated" : "Shop added"

      /*
       * Credentials and category access are separate endpoints, so the shop row
       * is already committed by the time they run. If one fails we say so
       * plainly rather than reporting a clean save — the shop exists either way,
       * and the admin needs to know which half did not land.
       */
      if (password) {
        try {
          await inventorySuppliersService.setPortalAccess(saved.id, { enabled: true, password })
        } catch (error: any) {
          console.error("Failed to set portal access:", error)
          toast.error(`${savedLabel}, but the login was not saved: ${error.message || "unknown error"}`)
          onSaved?.(saved)
          onClose()
          return
        }
      }

      // A new shop defaults to the shared list, which the server already does —
      // only a deliberate override is worth a second call.
      if (!isEditing && accessMode === "custom") {
        try {
          await inventorySuppliersService.setCategories(saved.id, {
            mode: "custom",
            categoryIds: selectedCategories,
          })
        } catch (error: any) {
          console.error("Failed to set category access:", error)
          toast.error(`${savedLabel}, but product access was not saved: ${error.message || "unknown error"}`)
          onSaved?.(saved)
          onClose()
          return
        }
      }

      const extras = [
        password ? "portal access" : "",
        !isEditing
          ? accessMode === "custom"
            ? `${selectedCategories.length} categor${selectedCategories.length === 1 ? "y" : "ies"}`
            : "the default product list"
          : "",
      ].filter(Boolean)

      toast.success(extras.length ? `${savedLabel} with ${extras.join(" and ")}` : savedLabel)
      onSaved?.(saved)
      onClose()
    } catch (error: any) {
      console.error("Failed to save shop:", error)
      toast.error(error.message || "Failed to save shop")
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card border border-border rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-xl">
              <Store className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{isEditing ? "Edit Shop" : "Add Shop"}</h2>
              <p className="text-xs text-muted-foreground">
                {isEditing ? "Update the shop's details" : "They can sign in at /supplier/login straight away"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-2">Shop name *</label>
            <Input
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g. Kandy Mobile Centre"
              required
              autoFocus
            />
          </div>

          {/* Portal credentials */}
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-blue-500" />
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Shop portal login</p>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
                Email {(!isEditing || supplier?.portal_enabled) && "*"}
              </label>
              <Input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="shop@example.com"
                required={!isEditing}
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">This is their username.</p>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Password {isEditing ? "" : "*"}</label>
              <Input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder={isEditing ? "Leave blank to keep the current one" : `At least ${MIN_PASSWORD} characters`}
                autoComplete="new-password"
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Stored hashed and never shown again — send it to the shop yourself.
              </p>
            </div>
          </div>

          {/* Category access, on the first screen for a new shop: without it they
              sign in to an empty catalogue. */}
          {!isEditing && (
            <div className="rounded-xl border border-border p-4 space-y-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                What this shop can see
              </p>

              <AccessModeToggle
                mode={accessMode}
                onChange={setAccessMode}
                defaultCount={defaultCategoryIds.length}
                customCount={selectedCategories.length}
                isLoading={defaultsLoading}
              />

              {accessMode === "custom" ? (
                <>
                  <CategoryPicker
                    categories={categories}
                    selected={selectedCategories}
                    onToggle={toggleCategory}
                    onSelectAll={(ids) => setSelectedCategories((prev) => Array.from(new Set([...prev, ...ids])))}
                    onClear={() => setSelectedCategories([])}
                    isLoading={categoriesLoading}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={defaultsLoading}
                    onClick={() => setSelectedCategories(defaultCategoryIds)}
                  >
                    Start from the default list
                  </Button>
                </>
              ) : defaultCategoryIds.length === 0 && !defaultsLoading ? (
                <p className="text-[11px] text-amber-600 font-medium">
                  The default list is empty, so this shop will see nothing until you set it on the Product Access tab.
                </p>
              ) : null}
            </div>
          )}

          {/* Optional details */}
          {!showOptional ? (
            <button
              type="button"
              onClick={() => setShowOptional(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-border text-sm font-bold text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
            >
              <ChevronDown className="w-4 h-4" />
              Contact details & who they call
            </button>
          ) : (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="space-y-4 overflow-hidden"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Contact person</label>
                  <Input
                    name="contact_person"
                    value={formData.contact_person}
                    onChange={handleChange}
                    placeholder="Who runs the shop"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Their phone</label>
                  <Input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="+94 70 123 4567"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Address</label>
                <Input name="address" value={formData.address} onChange={handleChange} placeholder="Shop address" />
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-4">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Who this shop reaches from the portal
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold mb-2">Call button</label>
                    <Input
                      type="tel"
                      name="support_phone"
                      value={formData.support_phone}
                      onChange={handleChange}
                      placeholder="Leave blank for the main number"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">WhatsApp button</label>
                    <Input
                      type="tel"
                      name="support_whatsapp"
                      value={formData.support_whatsapp}
                      onChange={handleChange}
                      placeholder="Leave blank to use the call number"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Notes</label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Payment terms, delivery days, anything worth remembering..."
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                />
              </div>
            </motion.div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" className="flex-1 font-bold" disabled={loading}>
              {loading ? "Saving..." : isEditing ? "Update Shop" : "Add Shop"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} className="flex-1" disabled={loading}>
              Cancel
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}
