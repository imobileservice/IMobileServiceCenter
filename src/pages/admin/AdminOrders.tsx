"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Search, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ordersService } from "@/lib/supabase/services/orders"
import { createClient } from "@/lib/supabase/client"
import OrderDetailsModal from "@/components/admin/order-details-modal"
import AdminLayout from "@/components/admin-layout"
import { formatCurrency } from "@/lib/utils/currency"
import type { Database } from "@/lib/supabase/types"

type Order = Database['public']['Tables']['orders']['Row']

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterMethod, setFilterMethod] = useState<string>("all")
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null)

  const fetchOrders = async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      const data = await ordersService.getAll()
      setOrders(data || [])
    } catch (error) {
      console.error('Failed to fetch orders:', error)
      if (!silent) setOrders([])
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrders()

    // Setup realtime subscription
    const supabase = createClient()
    const channel = supabase.channel('admin:orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload: any) => {
          console.log('🔄 AdminOrders: Realtime order update received:', payload)
          fetchOrders(true)
        }
      )
      .subscribe()

    // Listen for order updates (real-time within the same tab)
    const handleOrderUpdate = () => {
      console.log('🔄 AdminOrders: Received order update event, refreshing...')
      fetchOrders(true)
    }

    // Listen for custom events
    window.addEventListener('orderUpdated', handleOrderUpdate)

    // Listen for localStorage updates (cross-tab)
    const handleStorageUpdate = (e: StorageEvent) => {
      if (e.key && e.key.startsWith('adminUpdate_')) {
        const { type } = JSON.parse(e.newValue || '{}')
        if (type === 'order') {
          console.log('🔄 AdminOrders: Received localStorage order update, refreshing...')
          fetchOrders(true)
        }
      }
    }

    window.addEventListener('storage', handleStorageUpdate)

    // Polling fallback (every 10 seconds)
    const pollingInterval = setInterval(() => {
      fetchOrders(true)
    }, 10000)

    return () => {
      window.removeEventListener('orderUpdated', handleOrderUpdate)
      window.removeEventListener('storage', handleStorageUpdate)
      clearInterval(pollingInterval)
      supabase.removeChannel(channel)
    }
  }, [])

  const filteredOrders = orders.filter((order) => {
    const displayId = order.order_number || order.id.substring(0, 8).toUpperCase()
    const searchLower = searchTerm.toLowerCase()
    
    const matchesSearch = (
      displayId.toLowerCase().includes(searchLower) ||
      order.shipping_address?.toLowerCase().includes(searchLower) ||
      order.customer_email?.toLowerCase().includes(searchLower)
    )

    const matchesMethod = filterMethod === "all" || order.payment_method === filterMethod
    
    return matchesSearch && matchesMethod
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Delivered":
        return "bg-green-100 text-green-800"
      case "Shipped":
        return "bg-blue-100 text-blue-800"
      case "Processing":
        return "bg-yellow-100 text-yellow-800"
      case "Pending":
        return "bg-gray-100 text-gray-800"
      case "Cancelled":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Orders</h1>
              <p className="text-muted-foreground mt-1">Manage and track customer orders</p>
            </div>
          </div>
        </motion.div>

        {/* Search & Filter */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search by order number or customer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <select
              value={filterMethod}
              onChange={(e) => setFilterMethod(e.target.value)}
              className="bg-background border border-border rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary min-w-[200px]"
            >
              <option value="all">All Payment Methods</option>
              <option value="cash_on_delivery">Cash on Delivery</option>
              <option value="visit_shop">Visit Shop & Pay</option>
            </select>
          </div>
        </motion.div>

        {/* Orders Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-card border border-border rounded-lg overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-4 px-6 font-semibold">Order ID</th>
                  <th className="text-left py-4 px-6 font-semibold">Customer</th>
                  <th className="text-left py-4 px-6 font-semibold">Amount</th>
                  <th className="text-left py-4 px-6 font-semibold">Method</th>
                  <th className="text-left py-4 px-6 font-semibold">Date</th>
                  <th className="text-left py-4 px-6 font-semibold">Status</th>
                  <th className="text-left py-4 px-6 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">Loading orders...</td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">No orders found</td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => (
                    <motion.tr
                      key={order.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="border-b border-border hover:bg-muted/50 transition-colors"
                    >
                      <td className="py-4 px-6 font-semibold">#{order.order_number || order.id.substring(0, 8).toUpperCase()}</td>
                      <td className="py-4 px-6">{order.customer_email || 'N/A'}</td>
                      <td className="py-4 px-6 font-semibold">{formatCurrency(order.total || 0)}</td>
                      <td className="py-4 px-6 text-sm">
                        <span className="capitalize">
                          {order.payment_method?.replace(/_/g, ' ') || 'N/A'}
                        </span>
                      </td>
                      <td className="py-4 px-6">{new Date(order.created_at).toLocaleDateString()}</td>
                      <td className="py-4 px-6">
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(order.status || 'pending')}`}>
                          {order.status || 'Pending'}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <Button size="sm" variant="outline" onClick={() => setSelectedOrder(order.id)} className="gap-2">
                          <Eye className="w-4 h-4" />
                          View
                        </Button>
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Order Details Modal */}
        {selectedOrder && <OrderDetailsModal orderId={selectedOrder} onClose={() => setSelectedOrder(null)} />}
      </div>
    </AdminLayout>
  )
}
