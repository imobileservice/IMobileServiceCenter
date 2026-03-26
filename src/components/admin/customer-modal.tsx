"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { customersService } from "@/lib/supabase/services/customers"
import { toast } from "sonner"
import type { Customer } from "@/lib/supabase/services/customers"

interface CustomerModalProps {
  isOpen: boolean
  onClose: () => void
  editingCustomerId?: string | null
}

export default function CustomerModal({ isOpen, onClose, editingCustomerId }: CustomerModalProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    whatsapp: "",
  })

  useEffect(() => {
    // Reset loading state when modal opens/closes
    if (!isOpen) {
      setLoading(false)
      return
    }

    // Reset loading state when opening modal
    setLoading(false)

    if (editingCustomerId) {
      const fetchCustomer = async () => {
        try {
          setLoading(true)
          const customer = await customersService.getById(editingCustomerId)
          if (customer) {
            setFormData({
              name: customer.name || "",
              email: customer.email || "",
              phone: customer.phone || "",
              whatsapp: customer.whatsapp || "",
            })
          }
        } catch (error) {
          console.error('Failed to fetch customer:', error)
          toast.error('Failed to load customer details')
        } finally {
          setLoading(false)
        }
      }
      fetchCustomer()
    } else {
      setFormData({
        name: "",
        email: "",
        phone: "",
        whatsapp: "",
      })
    }
  }, [editingCustomerId, isOpen])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Prevent double submission
    if (loading) {
      return
    }
    
    setLoading(true)

    try {
      if (editingCustomerId) {
        await customersService.update(editingCustomerId, {
          name: formData.name,
          phone: formData.phone || null,
          whatsapp: formData.whatsapp || null,
        })
        toast.success('Customer updated successfully')
      } else {
        toast.error('Cannot create customers - they must register themselves')
        return
      }

      onClose()
      window.dispatchEvent(new Event('customerUpdated'))
    } catch (error: any) {
      console.error('Failed to save customer:', error)
      toast.error(error.message || 'Failed to save customer')
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
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card border border-border rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Edit Customer</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-2">Name</label>
            <Input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Customer name"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Email</label>
            <Input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="customer@example.com"
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground mt-1">Email cannot be changed</p>
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

          <div>
            <label className="block text-sm font-semibold mb-2">WhatsApp</label>
            <Input
              type="tel"
              name="whatsapp"
              value={formData.whatsapp}
              onChange={handleChange}
              placeholder="+94 70 123 4567"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? "Saving..." : "Update"} Customer
            </Button>
            <Button type="button" variant="outline" onClick={onClose} className="flex-1 bg-transparent" disabled={loading}>
              Cancel
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}
