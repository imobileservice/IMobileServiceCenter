"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { X, Truck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { inventorySuppliersService, type Supplier } from "@/lib/services/inventory.service"
import { toast } from "sonner"

interface SupplierModalProps {
  isOpen: boolean
  onClose: () => void
  supplier?: Supplier | null
  onSaved?: (supplier: Supplier) => void
}

const EMPTY_FORM = {
  name: "",
  contact_person: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
}

export default function SupplierModal({ isOpen, onClose, supplier, onSaved }: SupplierModalProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState(EMPTY_FORM)

  useEffect(() => {
    if (!isOpen) return
    setLoading(false)
    if (supplier) {
      setFormData({
        name: supplier.name || "",
        contact_person: supplier.contact_person || "",
        phone: supplier.phone || "",
        email: supplier.email || "",
        address: supplier.address || "",
        notes: supplier.notes || "",
      })
    } else {
      setFormData(EMPTY_FORM)
    }
  }, [isOpen, supplier])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return

    if (!formData.name.trim()) {
      toast.error("Supplier name is required")
      return
    }

    setLoading(true)
    try {
      const payload = {
        name: formData.name.trim(),
        contact_person: formData.contact_person.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        email: formData.email.trim() || undefined,
        address: formData.address.trim() || undefined,
        notes: formData.notes.trim() || undefined,
      }

      const res = supplier
        ? await inventorySuppliersService.update(supplier.id, payload)
        : await inventorySuppliersService.create(payload)

      toast.success(supplier ? "Supplier updated" : "Supplier added")
      onSaved?.(res.data)
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
              <h2 className="text-xl font-bold">{supplier ? "Edit Supplier" : "Add Supplier"}</h2>
              <p className="text-xs text-muted-foreground">
                {supplier ? "Update the supplier details" : "Suppliers are managed entirely from here"}
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
            <label className="block text-sm font-semibold mb-2">Email</label>
            <Input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="supplier@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Address</label>
            <Input name="address" value={formData.address} onChange={handleChange} placeholder="Shop / warehouse address" />
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

          <div className="flex gap-3 pt-2">
            <Button type="submit" className="flex-1 font-bold" disabled={loading}>
              {loading ? "Saving..." : supplier ? "Update Supplier" : "Add Supplier"}
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
