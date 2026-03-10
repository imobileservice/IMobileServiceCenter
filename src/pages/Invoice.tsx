"use client"

import { useState, useEffect } from "react"
import { useParams, Link } from "react-router-dom"
import { motion } from "framer-motion"
import { ArrowLeft, Download, Printer, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ordersService } from "@/lib/supabase/services/orders"
import { formatCurrency } from "@/lib/utils/currency"
import { useAuthStore } from "@/lib/store"
import { sendInvoiceToWhatsApp, formatPhoneForWhatsApp } from "@/lib/utils/whatsapp"
import { sendInvoiceToEmail } from "@/lib/utils/email"
import { toast } from "sonner"
import type { Database } from "@/lib/supabase/types"

type Order = Database['public']['Tables']['orders']['Row'] & {
  order_items?: Array<{
    id: string
    product_name: string
    product_image: string | null
    quantity: number
    price: number
  }>
}

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>()
  const user = useAuthStore((state) => state.user)
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) {
      setError("Order ID is required")
      setLoading(false)
      return
    }

    const loadOrder = async () => {
      try {
        setLoading(true)
        const orderData = await ordersService.getById(id)
        setOrder(orderData as Order)
      } catch (err: any) {
        console.error("Failed to load order:", err)
        setError(err.message || "Failed to load invoice")
        toast.error("Failed to load invoice")
      } finally {
        setLoading(false)
      }
    }

    loadOrder()
  }, [id])

  const handleSendToWhatsApp = () => {
    if (!order || !order.customer_phone) {
      toast.error("Customer phone number not available")
      return
    }

    sendInvoiceToWhatsApp(order.id, order.customer_phone, order.order_number)
    toast.success("Opening WhatsApp...")
  }

  const handlePrint = () => {
    window.print()
  }

  const handleDownload = () => {
    // Create a simple text invoice for download
    if (!order) return

    const invoiceText = `
INVOICE

Order Number: ${order.order_number}
Date: ${new Date(order.created_at).toLocaleDateString()}

Customer Details:
Name: ${order.customer_name}
Email: ${order.customer_email}
Phone: ${order.customer_phone || 'N/A'}
Address: ${order.shipping_address}

Items:
${(order.items as any)?.map((item: any, index: number) =>
      `${index + 1}. ${item.product_name || item.name} x ${item.quantity} - ${formatCurrency(Number(item.price || item.product_price) * item.quantity)}`
    ).join('\n') || order.order_items?.map((item, index) =>
      `${index + 1}. ${item.product_name} x ${item.quantity} - ${formatCurrency(Number(item.price) * item.quantity)}`
    ).join('\n') || 'No items'}

Subtotal: ${formatCurrency(Number(order.subtotal))}
Shipping: ${formatCurrency(Number(order.shipping))}
Total: ${formatCurrency(Number(order.total))}

Payment Method: ${order.payment_method === 'cash_on_delivery' ? 'Cash on Delivery' : order.payment_method || 'N/A'}
Status: ${order.status?.toUpperCase() || 'PENDING'}

Thank you for your order!
    `.trim()

    const blob = new Blob([invoiceText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `invoice-${order.order_number}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading invoice...</p>
        </div>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-4">Invoice Not Found</h1>
          <p className="text-muted-foreground mb-6">{error || "The invoice you're looking for doesn't exist."}</p>
          <Link to="/profile">
            <Button>Go to My Orders</Button>
          </Link>
        </div>
      </div>
    )
  }

  // Parse items - can be from order_items table or items JSONB field
  const orderItems: NonNullable<Order['order_items']> = order.order_items && order.order_items.length > 0
    ? order.order_items
    : (order.items as any)?.map((item: any) => ({
      id: item.id || '',
      product_name: item.product_name || item.name || 'Product',
      product_image: item.product_image || item.image || null,
      quantity: item.quantity || 1,
      price: item.price || item.product_price || 0,
    })) || []

  const [sendingEmail, setSendingEmail] = useState(false)

  const handleSendEmail = async () => {
    if (!order) return
    try {
      setSendingEmail(true)
      const success = await sendInvoiceToEmail(order.id, user?.email || order.customer_email)
      if (success) {
        // Toast is handled inside sendInvoiceToEmail
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to trigger email send")
    } finally {
      setSendingEmail(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 print:hidden">
          <Link to="/profile">
            <Button variant="ghost" className="gap-2 -ml-4 sm:ml-0">
              <ArrowLeft className="w-4 h-4" />
              Back to Orders
            </Button>
          </Link>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            {order.customer_phone && (
              <Button onClick={handleSendToWhatsApp} className="gap-2 bg-green-600 hover:bg-green-700">
                <Mail className="w-4 h-4" />
                Send via WhatsApp
              </Button>
            )}
            <Button
              onClick={handleSendEmail}
              disabled={sendingEmail}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white min-w-[140px]"
            >
              {sendingEmail ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <Mail className="w-4 h-4" />
              )}
              {sendingEmail ? "Sending..." : "Send to Email"}
            </Button>
            <Button onClick={handleDownload} variant="outline" className="gap-2 flex-1 sm:flex-none">
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Download</span>
            </Button>
            <Button onClick={handlePrint} variant="outline" className="gap-2 flex-1 sm:flex-none">
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Print</span>
            </Button>
          </div>
        </div>


        {/* Invoice Content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-lg p-4 sm:p-8 lg:p-10 print:border-0 print:shadow-none overflow-hidden"
        >
          {/* Invoice Header */}
          <div className="border-b border-border pb-6 mb-6">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold mb-2">INVOICE</h1>
                <p className="text-muted-foreground text-sm sm:text-base break-words">Order #{order.order_number}</p>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-sm text-muted-foreground">Date</p>
                <p className="font-semibold">{new Date(order.created_at).toLocaleDateString()}</p>
              </div>
            </div>
          </div>

          {/* Customer Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 w-full">
            <div className="w-full overflow-hidden">
              <h2 className="font-bold text-lg mb-3">Bill To:</h2>
              <p className="font-semibold break-words">{order.customer_name}</p>
              <p className="text-muted-foreground break-words">{order.customer_email}</p>
              {order.customer_phone && (
                <p className="text-muted-foreground break-words">{order.customer_phone}</p>
              )}
              <p className="text-muted-foreground mt-2 break-words">{order.shipping_address}</p>
            </div>
            <div className="w-full overflow-hidden">
              <h2 className="font-bold text-lg mb-3">Order Information:</h2>
              <div className="space-y-2 text-sm">
                <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                  <span className="text-muted-foreground">Order Number:</span>
                  <span className="font-semibold break-words">{order.order_number}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                  <span className="text-muted-foreground">Payment Method:</span>
                  <span className="font-semibold capitalize">
                    {order.payment_method === 'cash_on_delivery' ? 'Cash on Delivery' : order.payment_method || 'N/A'}
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                  <span className="text-muted-foreground">Status:</span>
                  <span className="font-semibold uppercase">{order.status || 'PENDING'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Order Items */}
          <div className="mb-8 w-full">
            <h2 className="font-bold text-lg mb-4">Order Items:</h2>
            <div className="w-full overflow-x-auto border border-border rounded-lg">
              <table className="w-full min-w-[500px]">
                <thead className="bg-muted">
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-semibold text-sm whitespace-nowrap">Item</th>
                    <th className="text-center py-3 px-4 font-semibold text-sm whitespace-nowrap">Qty</th>
                    <th className="text-right py-3 px-4 font-semibold text-sm whitespace-nowrap">Price</th>
                    <th className="text-right py-3 px-4 font-semibold text-sm whitespace-nowrap">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {orderItems.map((item, index) => (
                    <tr key={item.id || index} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="py-3 px-4">
                        <p className="font-medium text-sm break-words max-w-[200px] sm:max-w-none">{item.product_name}</p>
                      </td>
                      <td className="py-3 px-4 text-center text-sm">{item.quantity}</td>
                      <td className="py-3 px-4 text-right text-sm whitespace-nowrap">{formatCurrency(Number(item.price))}</td>
                      <td className="py-3 px-4 text-right font-semibold text-sm whitespace-nowrap">
                        {formatCurrency(Number(item.price) * item.quantity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Order Summary */}
          <div className="border-t border-border pt-6">
            <div className="w-full sm:max-w-md sm:ml-auto space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal:</span>
                <span className="font-semibold">{formatCurrency(Number(order.subtotal))}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Shipping:</span>
                <span className="font-semibold">{formatCurrency(Number(order.shipping))}</span>
              </div>
              {/* Note: There was a duplicate 'Shipping' line here in original code, removed the duplicate */}
              {/* Tax removed as requested */}
              <div className="flex justify-between text-lg font-bold pt-3 border-t border-border">
                <span>Total:</span>
                <span className="text-primary">{formatCurrency(Number(order.total))}</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-border text-center text-sm text-muted-foreground">
            <p>Thank you for your order!</p>
            <p className="mt-2">If you have any questions, please contact us.</p>
          </div>
        </motion.div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print\\:border-0,
          .print\\:border-0 * {
            visibility: visible;
          }
          .print\\:border-0 {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  )
}

