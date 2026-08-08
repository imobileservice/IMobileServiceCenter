"use client"

import type React from "react"
import { useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { X, Truck, KeyRound, ChevronDown, Search, Package, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatCurrency } from "@/lib/utils/currency"
import {
  inventorySuppliersService,
  type AvailableProduct,
  type Supplier,
} from "@/lib/services/inventory.service"
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
}

const MIN_PASSWORD = 6

export default function SupplierModal({ isOpen, onClose, supplier, onSaved }: SupplierModalProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState(EMPTY_FORM)

  // The optional half of the form stays collapsed so the three fields that make
  // a working supplier — name, email, password — are the whole first screen.
  const [showOptional, setShowOptional] = useState(false)

  const [products, setProducts] = useState<AvailableProduct[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [productSearch, setProductSearch] = useState("")
  const [selectedProducts, setSelectedProducts] = useState<string[]>([])

  const isEditing = Boolean(supplier)

  useEffect(() => {
    if (!isOpen) return
    setLoading(false)
    setShowOptional(false)
    setProductSearch("")
    setSelectedProducts([])
    setProducts([])
    if (supplier) {
      setFormData({
        name: supplier.name || "",
        email: supplier.email || "",
        password: "",
        contact_person: supplier.contact_person || "",
        phone: supplier.phone || "",
        address: supplier.address || "",
        notes: supplier.notes || "",
      })
    } else {
      setFormData(EMPTY_FORM)
    }
  }, [isOpen, supplier])

  /**
   * Only fetched once the optional section is opened — most saves never expand
   * it, and the catalogue is the one expensive read on this form.
   */
  const loadProducts = useCallback(async () => {
    try {
      setProductsLoading(true)
      const res = await inventorySuppliersService.getAvailableProducts(
        supplier?.id || null,
        productSearch.trim() || undefined
      )
      setProducts(res.data || [])
    } catch (error: any) {
      console.error("Failed to load products:", error)
      toast.error(error.message || "Could not load products")
    } finally {
      setProductsLoading(false)
    }
  }, [supplier?.id, productSearch])

  useEffect(() => {
    if (!isOpen || !showOptional) return
    const timer = setTimeout(loadProducts, productSearch ? 300 : 0)
    return () => clearTimeout(timer)
  }, [isOpen, showOptional, loadProducts, productSearch])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const toggleProduct = (id: string) => {
    setSelectedProducts((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return

    const name = formData.name.trim()
    const email = formData.email.trim()
    const password = formData.password.trim()

    if (!name) {
      toast.error("Supplier name is required")
      return
    }
    // The email is the supplier's username at /supplier/login, so a new supplier
    // without one could never sign in. Existing suppliers that already have
    // access are held to the same rule; the rest can be edited freely.
    if (!email && (!isEditing || supplier?.portal_enabled)) {
      toast.error("Email is required — it is the supplier's portal username")
      return
    }
    if (!isEditing && !password) {
      toast.error("Set a portal password so the supplier can sign in")
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
      }

      const res = isEditing
        ? await inventorySuppliersService.update(supplier!.id, payload)
        : await inventorySuppliersService.create(payload)

      const saved: Supplier = res.data
      const savedLabel = isEditing ? "Supplier updated" : "Supplier added"

      /*
       * Credentials and product links are separate endpoints, so the supplier
       * row is already committed by the time they run. If one fails we say so
       * plainly rather than reporting a clean save — the supplier exists either
       * way, and the admin needs to know which half did not land.
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

      if (selectedProducts.length > 0) {
        try {
          await inventorySuppliersService.addProducts(saved.id, { product_ids: selectedProducts })
        } catch (error: any) {
          console.error("Failed to assign products:", error)
          toast.error(`${savedLabel}, but the products were not assigned: ${error.message || "unknown error"}`)
          onSaved?.(saved)
          onClose()
          return
        }
      }

      const extras = [
        password ? "portal access" : "",
        selectedProducts.length ? `${selectedProducts.length} product${selectedProducts.length === 1 ? "" : "s"}` : "",
      ].filter(Boolean)

      toast.success(extras.length ? `${savedLabel} with ${extras.join(" and ")}` : savedLabel)
      onSaved?.(saved)
      onClose()
    } catch (error: any) {
      console.error("Failed to save supplier:", error)
      toast.error(error.message || "Failed to save supplier")
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
              <Truck className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{isEditing ? "Edit Supplier" : "Add Supplier"}</h2>
              <p className="text-xs text-muted-foreground">
                {isEditing ? "Update the supplier details" : "They can sign in at /supplier/login straight away"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-2">Supplier name *</label>
            <Input
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g. Colombo Mobile Distributors"
              required
              autoFocus
            />
          </div>

          {/* Portal credentials */}
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-blue-500" />
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Supplier portal login
              </p>
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
                placeholder="supplier@example.com"
                required={!isEditing}
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">This is their username.</p>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">
                Password {isEditing ? "" : "*"}
              </label>
              <Input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder={
                  isEditing
                    ? "Leave blank to keep the current one"
                    : `At least ${MIN_PASSWORD} characters`
                }
                autoComplete="new-password"
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Stored hashed and never shown again — send it to the supplier yourself.
              </p>
            </div>
          </div>

          {/* Optional details */}
          {!showOptional ? (
            <button
              type="button"
              onClick={() => setShowOptional(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-border text-sm font-bold text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
            >
              <ChevronDown className="w-4 h-4" />
              Add optional details & products
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
                    placeholder="Name of the rep"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Phone</label>
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
                <Input
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  placeholder="Shop / warehouse address"
                />
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

              {/* Product picker */}
              <div className="rounded-xl border border-border p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Products they supply
                  </p>
                  {selectedProducts.length > 0 && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      {selectedProducts.length} selected
                    </span>
                  )}
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Search by name or barcode..."
                    className="pl-10 h-9"
                  />
                </div>

                <div className="max-h-52 overflow-y-auto space-y-1 -mx-1 px-1">
                  {productsLoading ? (
                    <p className="text-xs text-muted-foreground py-6 text-center">Loading products...</p>
                  ) : products.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-6 text-center">
                      {productSearch ? "No product matches that search." : "No products available to assign."}
                    </p>
                  ) : (
                    products.map((product) => {
                      const checked = selectedProducts.includes(product.id)
                      return (
                        <button
                          type="button"
                          key={product.id}
                          onClick={() => toggleProduct(product.id)}
                          className={`w-full flex items-center gap-3 p-2 rounded-lg border text-left transition-colors ${
                            checked
                              ? "border-primary bg-primary/5"
                              : "border-transparent hover:bg-muted/60"
                          }`}
                        >
                          <span
                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                              checked ? "bg-primary border-primary text-primary-foreground" : "border-input"
                            }`}
                          >
                            {checked && <Check className="w-3 h-3" />}
                          </span>
                          <span className="w-8 h-8 rounded bg-muted flex items-center justify-center overflow-hidden shrink-0">
                            {product.image ? (
                              <img src={product.image} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Package className="w-4 h-4 text-muted-foreground" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs font-semibold truncate">{product.name}</span>
                            <span className="block text-[10px] text-muted-foreground font-mono truncate">
                              {product.barcode || "No barcode"} · {product.stock} in stock
                            </span>
                          </span>
                          {product.unit_cost > 0 && (
                            <span className="text-[10px] font-bold text-muted-foreground shrink-0">
                              {formatCurrency(product.unit_cost)}
                            </span>
                          )}
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            </motion.div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" className="flex-1 font-bold" disabled={loading}>
              {loading ? "Saving..." : isEditing ? "Update Supplier" : "Add Supplier"}
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
