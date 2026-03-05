"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type AddressType = "billing" | "shipping"

interface AddressModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (payload: {
    id?: string
    type: AddressType
    full_name: string
    phone?: string
    address_line1: string
    address_line2?: string
    city: string
    state?: string
    postal_code?: string
    country: string
    is_default?: boolean
  }) => Promise<void> | void
  initial?: Partial<{
    id: string
    type: AddressType
    full_name: string
    phone: string
    address_line1: string
    address_line2: string
    city: string
    state: string
    postal_code: string
    country: string
    is_default: boolean
  }>
}

export default function AddressModal({ isOpen, onClose, onSave, initial }: AddressModalProps) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    id: "" as string | undefined,
    type: (initial?.type || "billing") as AddressType,
    full_name: initial?.full_name || "",
    phone: initial?.phone || "",
    address_line1: initial?.address_line1 || "",
    address_line2: initial?.address_line2 || "",
    city: initial?.city || "",
    state: initial?.state || "",
    postal_code: initial?.postal_code || "",
    country: initial?.country || "",
    is_default: initial?.is_default ?? false,
  })

  useEffect(() => {
    setForm({
      id: initial?.id,
      type: (initial?.type || "billing") as AddressType,
      full_name: initial?.full_name || "",
      phone: initial?.phone || "",
      address_line1: initial?.address_line1 || "",
      address_line2: initial?.address_line2 || "",
      city: initial?.city || "",
      state: initial?.state || "",
      postal_code: initial?.postal_code || "",
      country: initial?.country || "",
      is_default: initial?.is_default ?? false,
    })
  }, [initial, isOpen])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (saving) return
    
    try {
      setSaving(true)
      console.log('[AddressModal] Saving address:', form)
      await onSave(form)
      // onSave will handle closing the modal and showing success toast
    } catch (error: any) {
      console.error('[AddressModal] Save error:', error)
      // Error is handled by parent component
      throw error
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card border border-border rounded-lg p-6 w-full max-w-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">{form.id ? "Edit Address" : "Add Address"}</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Type</label>
              <select
                className="w-full bg-background border border-border rounded px-3 h-10 text-sm"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as AddressType })}
              >
                <option value="billing">Billing</option>
                <option value="shipping">Shipping</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Full name</label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Phone</label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Address line 1</label>
              <Input value={form.address_line1} onChange={(e) => setForm({ ...form, address_line1: e.target.value })} required />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Address line 2</label>
              <Input value={form.address_line2} onChange={(e) => setForm({ ...form, address_line2: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">City</label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} required />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">State</label>
              <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Postal code</label>
              <Input value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Country</label>
              <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} required />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" onClick={handleSubmit} disabled={saving}>
              {saving ? "Saving..." : form.id ? "Save Changes" : "Save Address"}
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}


