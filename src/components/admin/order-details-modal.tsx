"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ordersService } from "@/lib/supabase/services/orders"
import { toast } from "sonner"
import { formatCurrency } from "@/lib/utils/currency"
import { notifyUpdate } from "@/hooks/use-realtime-updates"
import type { Database } from "@/lib/supabase/types"

type Order = Database['public']['Tables']['orders']['Row']
type OrderItem = Database['public']['Tables']['order_items']['Row']

interface OrderDetailsModalProps {
  orderId: string
  onClose: () => void
}

export default function OrderDetailsModal({ orderId, onClose }: OrderDetailsModalProps) {
  const [order, setOrder] = useState<Order | null>(null)
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    // Reset updating state when modal opens
    setUpdating(false)

    const fetchOrder = async () => {
      try {
        setLoading(true)
        const data = await ordersService.getById(orderId)
        setOrder(data)
        setOrderItems((data as any).order_items || [])
      } catch (error) {
        console.error('Failed to fetch order:', error)
        toast.error('Failed to load order details')
      } finally {
        setLoading(false)
      }
    }
    fetchOrder()
  }, [orderId])

  const handleStatusUpdate = async (status: Order['status']) => {
    if (!order || updating) return

    setUpdating(true)
    try {
      await ordersService.updateStatus(order.id, status)
      setOrder({ ...order, status })
      toast.success('Order status updated successfully')
      notifyUpdate('order')
    } catch (error: any) {
      console.error('Failed to update order status:', error)
      toast.error(error.message || 'Failed to update order status')
    } finally {
      setUpdating(false)
    }
  }

  if (loading) {
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
          className="bg-card border border-border rounded-lg p-6 max-w-2xl w-full"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-center py-8">Loading order details...</div>
        </motion.div>
      </motion.div>
    )
  }

  if (!order) return null

  const statuses: Order['status'][] = ["pending", "processing", "shipped", "delivered", "cancelled"]

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
        className="bg-card border border-border rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Order Details</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          {/* Order Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Order ID</p>
              <p className="font-semibold">#{order.order_number || order.id.substring(0, 8).toUpperCase()}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Date</p>
              <p className="font-semibold">{new Date(order.created_at).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <p className="font-semibold">{order.status || 'Pending'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="font-semibold">{formatCurrency(order.total || 0)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Payment Method</p>
              <p className="font-semibold capitalize">{order.payment_method?.replace(/_/g, ' ') || 'N/A'}</p>
            </div>
          </div>

          {/* Customer Info */}
          <div className="border-t border-border pt-6">
            <h3 className="font-bold mb-4">Customer Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-semibold">{order.customer_email || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Phone</p>
                <p className="font-semibold">{order.customer_phone || 'N/A'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-muted-foreground">Shipping Address</p>
                <p className="font-semibold">{order.shipping_address || 'N/A'}</p>
              </div>
            </div>
          </div>

          {/* Items */}
          {orderItems.length > 0 && (
            <div className="border-t border-border pt-6">
              <h3 className="font-bold mb-4">Order Items</h3>
              <div className="space-y-2">
                {orderItems.map((item) => (
                  <div key={item.id} className="flex justify-between items-center p-3 bg-muted rounded-lg">
                    <div>
                      <p className="font-semibold">{item.product_name}</p>
                      <p className="text-sm text-muted-foreground">Qty: {item.quantity}</p>
                    </div>
                    <p className="font-semibold">{formatCurrency(Number(item.price || 0) * item.quantity)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Total */}
          <div className="border-t border-border pt-6">
            <div className="flex justify-between items-center mb-6">
              <p className="text-lg font-bold">Total Amount</p>
              <p className="text-2xl font-bold text-primary">{formatCurrency(order.total || 0)}</p>
            </div>

            {/* Status Update */}
            <div>
              <p className="text-sm font-semibold mb-3">Update Status</p>
              <div className="grid grid-cols-2 gap-2">
                {statuses.map((status) => (
                  <Button
                    key={status}
                    variant={order.status === status ? "default" : "outline"}
                    onClick={() => handleStatusUpdate(status)}
                    className="bg-transparent"
                    disabled={updating}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <Button onClick={onClose} className="w-full">
            Close
          </Button>
        </div>
      </motion.div>
    </motion.div>
  )
}
