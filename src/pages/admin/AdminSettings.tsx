"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Save, Phone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import AdminLayout from "@/components/admin-layout"
import { toast } from "sonner"
import { getApiUrl } from "@/lib/utils/api"
import { INITIAL_DELIVERY_FEE, parseDeliveryFee } from "@/lib/utils/order-totals"
import { formatCurrency } from "@/lib/utils/currency"

export default function AdminSettingsPage() {
  const [whatsappNumber, setWhatsappNumber] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deliveryFee, setDeliveryFee] = useState('')
  const [savingFee, setSavingFee] = useState(false)
  const [feeLoaded, setFeeLoaded] = useState(false)

  useEffect(() => {
    loadSettings()
    void loadDeliveryFee()
  }, [])

  const loadDeliveryFee = async () => {
    try {
      const response = await fetch(getApiUrl('/api/admin/settings/delivery_fee'), { cache: 'no-store' })
      if (response.status === 404) {
        setDeliveryFee(INITIAL_DELIVERY_FEE.toFixed(2))
      } else {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Failed to load delivery fee')
        setDeliveryFee(parseDeliveryFee(result.data.value).toFixed(2))
      }
      setFeeLoaded(true)
    } catch (error: any) {
      toast.error(error.message || 'Failed to load delivery fee')
    }
  }

  let validFee: number | null = null
  try { validFee = parseDeliveryFee(deliveryFee) } catch { /* Inline validation below. */ }

  const handleSaveDeliveryFee = async () => {
    if (validFee === null || savingFee) return
    setSavingFee(true)
    try {
      const response = await fetch(getApiUrl('/api/admin/settings/delivery_fee'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: validFee.toFixed(2), description: 'Default delivery fee for new delivery orders' }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to save delivery fee')
      setDeliveryFee(parseDeliveryFee(result.data.value).toFixed(2))
      toast.success('Default delivery fee saved')
    } catch (error: any) {
      toast.error(error.message || 'Failed to save delivery fee')
    } finally {
      setSavingFee(false)
    }
  }

  const loadSettings = async () => {
    try {
      setLoading(true)
      const response = await fetch(getApiUrl('/api/admin/settings/whatsapp_number'))
      if (response.ok) {
        const { data } = await response.json()
        setWhatsappNumber(data?.value || "")
      }
    } catch (error) {
      console.error("Failed to load settings:", error)
      toast.error("Failed to load settings")
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      const response = await fetch(getApiUrl('/api/admin/settings/whatsapp_number'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value: whatsappNumber,
          description: 'Admin WhatsApp number for sending order receipts',
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save settings')
      }

      toast.success("Settings saved successfully!")
    } catch (error: any) {
      console.error("Failed to save settings:", error)
      toast.error(error.message || "Failed to save settings")
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-4xl font-bold">Settings</h1>
          <p className="text-muted-foreground mt-2">Manage admin settings and configurations</p>
        </motion.div>

        <section className="bg-card border border-border rounded-lg p-6 space-y-4">
          <h2 className="text-2xl font-bold">Delivery Fee</h2>
          <p className="text-muted-foreground">Set the fee for all new delivery orders. It is added to the bill total and shown on receipts. Walk-in and Visit Shop &amp; Pay orders have a delivery fee of Rs. 0.00. Existing bills keep their original amounts.</p>
          <div className="max-w-sm space-y-2">
            <label htmlFor="default-delivery-fee" className="block text-sm font-semibold">Default delivery fee (Rs.)</label>
            <Input id="default-delivery-fee" type="number" min="0" max="99999999.99" step="0.01"
              value={deliveryFee} disabled={!feeLoaded || savingFee} aria-invalid={feeLoaded && validFee === null}
              onChange={(event) => setDeliveryFee(event.target.value)} />
            {feeLoaded && validFee === null && <p role="alert" className="text-sm text-destructive">Enter an amount between 0.00 and 99,999,999.99 with up to two decimal places.</p>}
          </div>
          {validFee !== null && <p aria-live="polite" className="text-sm text-muted-foreground">Example: Rs. 1,000.00 subtotal + {formatCurrency(validFee)} delivery = <strong>{formatCurrency(1000 + validFee)}</strong></p>}
          <Button onClick={handleSaveDeliveryFee} disabled={!feeLoaded || validFee === null || savingFee} className="gap-2">
            <Save className="w-4 h-4" />{savingFee ? 'Saving...' : 'Save Delivery Fee'}
          </Button>
          {!feeLoaded && <Button variant="outline" onClick={loadDeliveryFee}>Reload delivery fee</Button>}
        </section>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-card border border-border rounded-lg p-6 space-y-6"
        >
          <div>
            <h2 className="text-2xl font-bold mb-4">WhatsApp Configuration</h2>
            <p className="text-muted-foreground mb-6">
              Configure your WhatsApp number to send order receipts to customers. 
              Make sure to use the format: +[country code][number] (e.g., +1234567890)
            </p>

            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading settings...</div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label htmlFor="whatsapp" className="block text-sm font-semibold mb-2">
                    Admin WhatsApp Number
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="whatsapp"
                      type="tel"
                      value={whatsappNumber}
                      onChange={(e) => setWhatsappNumber(e.target.value)}
                      placeholder="+1234567890"
                      className="pl-10"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    This number will be used to send order receipts to customers via WhatsApp.
                    Ensure you have Twilio configured with this number for WhatsApp messaging.
                  </p>
                </div>

                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                  <p className="text-sm text-yellow-600 dark:text-yellow-400 font-semibold mb-2">
                    📱 WhatsApp Integration Setup
                  </p>
                  <p className="text-xs text-muted-foreground">
                    To enable WhatsApp messaging, configure the following environment variables in your backend:
                  </p>
                  <ul className="text-xs text-muted-foreground mt-2 list-disc list-inside space-y-1">
                    <li><code>TWILIO_ACCOUNT_SID</code> - Your Twilio Account SID</li>
                    <li><code>TWILIO_AUTH_TOKEN</code> - Your Twilio Auth Token</li>
                    <li><code>TWILIO_WHATSAPP_FROM</code> - Your Twilio WhatsApp number (format: +1234567890)</li>
                  </ul>
                </div>

                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full sm:w-auto gap-2"
                >
                  <Save className="w-4 h-4" />
                  {saving ? "Saving..." : "Save Settings"}
                </Button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AdminLayout>
  )
}

