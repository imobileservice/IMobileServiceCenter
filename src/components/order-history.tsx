"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Package, ChevronRight, Loader2, Mail, Eye } from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/lib/store"
import { ordersService } from "@/lib/supabase/services/orders"
import { createClient } from "@/lib/supabase/client"
import { sendInvoiceToEmail } from "@/lib/utils/email"
import { toast } from "sonner"
import { formatCurrency } from "@/lib/utils/currency"

export default function OrderHistory() {
  const user = useAuthStore((state) => state.user)
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set())

  const toggleOrder = (orderId: string) => {
    const newExpanded = new Set(expandedOrders)
    if (newExpanded.has(orderId)) {
      newExpanded.delete(orderId)
    } else {
      newExpanded.add(orderId)
    }
    setExpandedOrders(newExpanded)
  }

  useEffect(() => {
    const loadOrders = async () => {
      if (!user) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        console.log('[OrderHistory] Loading orders for user:', user.id)
        const data = await ordersService.getByUserId(user.id)
        console.log('[OrderHistory] Orders loaded:', data?.length || 0)
        setOrders(data || [])
      } catch (error: any) {
        console.error('[OrderHistory] Failed to load orders:', error)
        toast.error("Failed to load orders: " + (error.message || "Unknown error"))
      } finally {
        setLoading(false)
      }
    }

    loadOrders()

    // Setup realtime subscription
    let channel: any;
    const supabase = createClient()

    if (user?.id) {
      channel = supabase.channel(`public:orders:user_id=eq.${user.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders', filter: `user_id=eq.${user.id}` },
          (payload: any) => {
            console.log('[OrderHistory] Realtime order update received:', payload)
            loadOrders()
          }
        )
        .subscribe((status: any) => {
          console.log('[OrderHistory] Realtime subscription status:', status)
        })
    }

    // Additional cross-tab listener (using same event as admin)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'orderUpdated' || (e.key && e.key.startsWith('adminUpdate_'))) {
        console.log('[OrderHistory] Cross-tab update detected, reloading...')
        loadOrders()
      }
    }
    window.addEventListener('storage', handleStorageChange)

    // Listen for order updates (when new order is placed)
    const handleOrderUpdate = () => {
      console.log('[OrderHistory] Order update event received, reloading...')
      loadOrders()
    }

    window.addEventListener('orderUpdated', handleOrderUpdate)

    // Fallback polling every 10 seconds
    const interval = setInterval(loadOrders, 10000)

    return () => {
      window.removeEventListener('orderUpdated', handleOrderUpdate)
      window.removeEventListener('storage', handleStorageChange)
      clearInterval(interval)
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [user])

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.3 },
    },
  }

  const detailsVariants = {
    hidden: { height: 0, opacity: 0 },
    visible: {
      height: "auto",
      opacity: 1,
      transition: { duration: 0.3 }
    }
  }

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "completed":
      case "delivered":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
      case "in transit":
      case "shipped":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
      case "pending":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
      case "cancelled":
      case "canceled":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
    }
  }

  const formatStatus = (status: string) => {
    if (!status) return "Pending"
    const statusLower = status.toLowerCase()
    if (statusLower === "completed") return "Delivered"
    if (statusLower === "shipped") return "In Transit"
    return status.charAt(0).toUpperCase() + status.slice(1)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="ml-2 text-muted-foreground">Loading orders...</p>
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-12">
        <Package className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground">No orders yet</p>
        <p className="text-sm text-muted-foreground mt-2">Your order history will appear here</p>
      </div>
    )
  }

  return (
    <motion.div
      className="space-y-4"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {orders.map((order) => {
        const itemCount = order.order_items?.length || 0
        const orderDate = order.created_at || order.date
        const orderNumber = order.order_number || order.id
        const orderTotal = Number(order.total) || 0
        const orderStatus = order.status || "pending"

        const isExpanded = expandedOrders.has(order.id)
        // Debug log to check data structure
        console.log(`Order ${order.id} items:`, order.order_items)

        return (
          <motion.div
            key={order.id}
            variants={itemVariants}
            className="bg-card border border-border rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
          >
            <div
              className="p-6 flex items-center justify-between cursor-pointer"
              onClick={() => toggleOrder(order.id)}
            >
              <div className="flex-1">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-muted rounded-lg">
                    <Package className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold">Order #{orderNumber}</p>
                    <p className="text-sm text-muted-foreground">
                      {orderDate ? new Date(orderDate).toLocaleDateString() : "Date not available"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="text-right mr-4">
                <p className="font-bold text-lg">{formatCurrency(orderTotal)}</p>
                <p className="text-sm text-muted-foreground">{itemCount} item(s)</p>
              </div>

              <div className="flex items-center gap-4">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(orderStatus)}`}>
                  {formatStatus(orderStatus)}
                </span>
                <Button variant="ghost" size="sm" onClick={(e) => {
                  e.stopPropagation()
                  toggleOrder(order.id)
                }}>
                  <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                </Button>
              </div>
            </div>

            {/* Expanded Details */}
            <motion.div
              initial="hidden"
              animate={isExpanded ? "visible" : "hidden"}
              variants={detailsVariants}
              className="px-6 pb-6"
            >
              <div className="border-t pt-4 mt-2">
                <h4 className="font-semibold mb-3">Order Items</h4>
                {(() => {
                  // Parse items - can be from order_items table or items JSONB field
                  const orderItems = order.order_items && order.order_items.length > 0
                    ? order.order_items
                    : (order.items as any)?.map((item: any) => ({
                      id: item.id || '',
                      product_name: item.product_name || item.name || 'Product',
                      product_image: item.product_image || item.image || null,
                      quantity: item.quantity || 1,
                      price: item.price || item.product_price || 0,
                    })) || []

                  return orderItems.length > 0 ? (
                    <div className="space-y-3">
                      {orderItems.map((item: any, index: number) => (
                        <div key={item.id || index} className="flex items-center justify-between py-2 border-b last:border-0 border-dashed">
                          <div className="flex items-center gap-3">
                            {item.product_image ? (
                              <img src={item.product_image} alt={item.product_name} className="w-12 h-12 object-cover rounded bg-muted" />
                            ) : (
                              <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                                <Package className="w-6 h-6 text-muted-foreground opacity-50" />
                              </div>
                            )}
                            <div>
                              <p className="font-medium text-sm">{item.product_name}</p>
                              <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                            </div>
                          </div>
                          <p className="font-medium">{formatCurrency(Number(item.price))}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No items details available.</p>
                  )
                })()}

                {/* Action Buttons */}
                <div className="flex gap-2 mt-4 pt-4 border-t">
                  <Link to={`/invoice/${order.id}`} className="flex-1">
                    <Button variant="outline" className="w-full gap-2">
                      <Eye className="w-4 h-4" />
                      View Invoice
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    className="flex-1 gap-2"
                    onClick={async (e) => {
                      e.stopPropagation()
                      try {
                        await sendInvoiceToEmail(order.id, user?.email)
                      } catch (error) {
                        console.error('Failed to send invoice:', error)
                      }
                    }}
                  >
                    <Mail className="w-4 h-4" />
                    Send Invoice
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )
      })}
    </motion.div>
  )
}
