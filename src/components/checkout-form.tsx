"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuthStore } from "@/lib/store"
import { authService } from "@/lib/supabase/services/auth"
import { accountService } from "@/lib/supabase/services/account"

interface CheckoutFormProps {
  step: number
  onNext: () => void
  onPrevious: () => void
  onComplete: (orderData: any) => void
}

export default function CheckoutForm({ step, onNext, onPrevious, onComplete }: CheckoutFormProps) {
  const user = useAuthStore((state) => state.user)
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    whatsapp: "",
    addressLine1: "",
    addressLine2: "",
    postalCode: "",
    city: "",
    alternateNumber: "",
    paymentMethod: "cash_on_delivery",
  })
  const [loading, setLoading] = useState(false)
  const [savedAddresses, setSavedAddresses] = useState<any[]>([])
  const [selectedShippingId, setSelectedShippingId] = useState<string>("new")
  const [selectedBillingId, setSelectedBillingId] = useState<string>("new")

  // Auto-load profile data when component mounts
  useEffect(() => {
    const loadProfileData = async () => {
      if (!user) return

      try {
        // Load profile
        const profile = await authService.getProfile(user.id)
        if (profile) {
          setFormData(prev => ({
            ...prev,
            fullName: profile.name || user.name || prev.fullName,
            email: user.email || profile.email || prev.email,
            whatsapp: profile.whatsapp || user.whatsapp || prev.whatsapp,
          }))
        }

        // Load addresses
        const addresses = await accountService.listAddresses()
        if (addresses && addresses.length > 0) {
          setSavedAddresses(addresses)
          
          // Find default shipping and billing
          const defaultShipping = addresses.find((a: any) => a.is_default && a.type === 'shipping') || addresses.find((a: any) => a.type === 'shipping') || addresses[0]
          const defaultBilling = addresses.find((a: any) => a.is_default && a.type === 'billing') || addresses.find((a: any) => a.type === 'billing') || addresses[0]
          
          if (defaultShipping) {
            setSelectedShippingId(defaultShipping.id)
            applyAddressToForm(defaultShipping)
          }
          if (defaultBilling) {
            setSelectedBillingId(defaultBilling.id)
          }
        }
      } catch (error) {
        console.error("Failed to load profile data:", error)
      }
    }

    loadProfileData()
  }, [user])

  const applyAddressToForm = (address: any) => {
    if (!address) return
    setFormData(prev => ({
      ...prev,
      addressLine1: address.address_line1 || "",
      addressLine2: address.address_line2 || "",
      postalCode: address.postal_code || "",
      city: address.city || "",
      fullName: address.full_name || prev.fullName,
      whatsapp: address.phone || prev.whatsapp,
    }))
  }

  const handleShippingChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value
    setSelectedShippingId(id)
    if (id === "new") {
      // Clear address fields for new entry
      setFormData(prev => ({
        ...prev,
        addressLine1: "",
        addressLine2: "",
        postalCode: "",
        city: "",
      }))
    } else {
      const addr = savedAddresses.find(a => a.id === id)
      if (addr) applyAddressToForm(addr)
    }
  }

  const handleBillingChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedBillingId(e.target.value)
    // Billing address doesn't fill the shipping form fields, but it's saved in state for the order payload if needed
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handlePaymentChange = (method: string) => {
    setFormData((prev) => ({ ...prev, paymentMethod: method }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (step === 3) {
      setLoading(true)
      try {
        // Pass form data to parent for order creation
        const finalData = {
            ...formData,
            // Include billing address string from selected ID if available and different from shipping
            billingAddressFull: selectedBillingId !== "new" && selectedBillingId !== selectedShippingId 
                ? savedAddresses.find(a => a.id === selectedBillingId)?.address_line1 
                : formData.addressLine1
        }
        await onComplete(finalData)
      } catch (error) {
        console.error("Order creation failed:", error)
      } finally {
        setLoading(false)
      }
    } else {
      onNext()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {step === 1 && (
        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          <h2 className="text-2xl font-bold mb-6">Shipping Information</h2>

          {savedAddresses.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-6 border-b border-border mb-6">
              <div>
                <label className="block text-sm font-semibold mb-2 text-primary">Shipping Address</label>
                <select 
                  value={selectedShippingId}
                  onChange={handleShippingChange}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="new">+ Add New Address</option>
                  {savedAddresses.map(addr => (
                    <option key={`ship-${addr.id}`} value={addr.id}>
                      {addr.full_name} - {addr.address_line1}, {addr.city}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-semibold mb-2 text-primary">Billing Address</label>
                <select 
                  value={selectedBillingId}
                  onChange={handleBillingChange}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="Same as shipping">Same as Shipping</option>
                  <option value="new">+ Add New Address</option>
                  {savedAddresses.map(addr => (
                    <option key={`bill-${addr.id}`} value={addr.id}>
                      {addr.full_name} - {addr.address_line1}, {addr.city}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold mb-2">Full Name</label>
            <Input
              type="text"
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              placeholder="John Doe"
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
              placeholder="john@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Phone Number</label>
            <Input
              type="tel"
              name="whatsapp"
              value={formData.whatsapp}
              onChange={handleChange}
              placeholder="+94 77 123 4567"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Address Line 1</label>
            <Input
              type="text"
              name="addressLine1"
              value={formData.addressLine1}
              onChange={handleChange}
              placeholder="123 Main Street"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Address Line 2 (Optional)</label>
            <Input
              type="text"
              name="addressLine2"
              value={formData.addressLine2}
              onChange={handleChange}
              placeholder="Apt 4B"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2">City</label>
              <Input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleChange}
                placeholder="New York"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2">Postal Code</label>
              <Input
                type="text"
                name="postalCode"
                value={formData.postalCode}
                onChange={handleChange}
                placeholder="10001"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">Alternate Number (Optional)</label>
            <Input
              type="tel"
              name="alternateNumber"
              value={formData.alternateNumber}
              onChange={handleChange}
              placeholder="+1 (555) 987-6543"
            />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          <h2 className="text-2xl font-bold mb-6">Payment Method</h2>

          <div className="space-y-3">
            <label
              className={`flex items-center p-4 border rounded-lg cursor-pointer hover:bg-muted transition-colors ${formData.paymentMethod === "cash_on_delivery" ? "border-primary bg-muted" : "border-border"}`}
              onClick={() => handlePaymentChange("cash_on_delivery")}
            >
              <input
                type="radio"
                name="paymentMethod"
                value="cash_on_delivery"
                checked={formData.paymentMethod === "cash_on_delivery"}
                readOnly
                className="w-4 h-4"
              />
              <span className="ml-3">
                <span className="font-semibold">Cash on Delivery</span>
                <p className="text-sm text-muted-foreground">Pay when you receive your order</p>
              </span>
            </label>

            <label
              className={`flex items-center p-4 border rounded-lg cursor-pointer hover:bg-muted transition-colors ${formData.paymentMethod === "visit_shop" ? "border-primary bg-muted" : "border-border"}`}
              onClick={() => handlePaymentChange("visit_shop")}
            >
              <input
                type="radio"
                name="paymentMethod"
                value="visit_shop"
                checked={formData.paymentMethod === "visit_shop"}
                readOnly
                className="w-4 h-4"
              />
              <span className="ml-3">
                <span className="font-semibold">Visit Shop & Pay</span>
                <p className="text-sm text-muted-foreground">Visit our store to complete payment</p>
              </span>
            </label>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          <h2 className="text-2xl font-bold mb-6">Order Confirmation</h2>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between pb-3 border-b border-border">
              <span className="text-muted-foreground">Name:</span>
              <span className="font-semibold">{formData.fullName}</span>
            </div>
            <div className="flex justify-between pb-3 border-b border-border">
              <span className="text-muted-foreground">Email:</span>
              <span className="font-semibold">{formData.email}</span>
            </div>
            <div className="flex justify-between pb-3 border-b border-border">
              <span className="text-muted-foreground">Address:</span>
              <span className="font-semibold text-right">
                {formData.addressLine1}, {formData.postalCode}
              </span>
            </div>
            <div className="flex justify-between pb-3 border-b border-border">
              <span className="text-muted-foreground">Payment:</span>
              <span className="font-semibold capitalize">
                {formData.paymentMethod === "cash_on_delivery" ? "Cash on Delivery" : "Visit Shop & Pay"}
              </span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground mt-6">
            By placing this order, you agree to our terms and conditions. You will receive a confirmation email shortly.
          </p>
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-4">
        {step > 1 && (
          <Button type="button" onClick={onPrevious} variant="outline" className="flex-1 bg-transparent">
            Previous
          </Button>
        )}
        <Button type="submit" className="flex-1" disabled={loading}>
          {loading ? "Processing..." : step === 3 ? "Place Order" : "Next"}
        </Button>
      </div>
    </form>
  )
}
