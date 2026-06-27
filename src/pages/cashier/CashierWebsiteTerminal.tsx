"use client"

import React, { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Clock,
  CreditCard,
  Mail,
  MapPin,
  PackageCheck,
  Phone,
  RefreshCcw,
  Search,
  Truck,
} from "lucide-react"
import CashierLayout from "@/components/cashier-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/utils/currency"
import { websiteOrdersService } from "@/lib/services/inventory.service"
import { toast } from "sonner"

type WebsiteOrderStatus = "pending" | "processing" | "shipped" | "delivered" | "cancelled"

interface WebsiteOrderItem {
  id: string
  product_id?: string | null
  product_name: string
  product_image?: string | null
  quantity: number
  price: number
}

interface WebsiteOrder {
  id: string
  order_number?: string | null
  customer_name?: string | null
  customer_email?: string | null
  customer_phone?: string | null
  shipping_address?: string | null
  billing_address?: string | null
  subtotal?: number | null
  shipping?: number | null
  tax?: number | null
  total?: number | null
  status?: string | null
  payment_method?: string | null
  payment_status?: string | null
  created_at: string
  order_items?: WebsiteOrderItem[]
}

const statusOptions: Array<{ id: "active" | WebsiteOrderStatus; label: string }> = [
  { id: "active", label: "Active" },
  { id: "pending", label: "Pending" },
  { id: "processing", label: "Processing" },
  { id: "shipped", label: "Shipped" },
  { id: "delivered", label: "Delivered" },
  { id: "cancelled", label: "Cancelled" },
]

const normalizeStatus = (status?: string | null): WebsiteOrderStatus => {
  const value = (status || "pending").toLowerCase()
  if (value === "processing" || value === "shipped" || value === "delivered" || value === "cancelled") {
    return value
  }
  return "pending"
}

const getStatusClass = (status: WebsiteOrderStatus) => {
  switch (status) {
    case "processing":
      return "bg-blue-500/10 text-blue-500 border-blue-500/20"
    case "shipped":
      return "bg-violet-500/10 text-violet-500 border-violet-500/20"
    case "delivered":
      return "bg-green-500/10 text-green-500 border-green-500/20"
    case "cancelled":
      return "bg-red-500/10 text-red-500 border-red-500/20"
    default:
      return "bg-amber-500/10 text-amber-500 border-amber-500/20"
  }
}

const formatMethod = (method?: string | null) => (method || "N/A").replace(/_/g, " ")

export default function CashierWebsiteTerminal() {
  const [orders, setOrders] = useState<WebsiteOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<"active" | WebsiteOrderStatus>("active")
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState<WebsiteOrderStatus | null>(null)

  const fetchOrders = async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      const res = await websiteOrdersService.getAll()
      const nextOrders = (res.data || []) as WebsiteOrder[]
      setOrders(nextOrders)
      setSelectedOrderId(prev => prev || nextOrders[0]?.id || null)
    } catch (err: any) {
      toast.error(err.message || "Failed to load website orders")
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrders()
    const timer = window.setInterval(() => fetchOrders(true), 15000)
    return () => window.clearInterval(timer)
  }, [])

  const filteredOrders = useMemo(() => {
    const search = searchTerm.trim().toLowerCase()

    return orders.filter(order => {
      const status = normalizeStatus(order.status)
      const matchesStatus = statusFilter === "active"
        ? status !== "delivered" && status !== "cancelled"
        : status === statusFilter

      const matchesSearch = !search || [
        order.order_number,
        order.customer_name,
        order.customer_email,
        order.customer_phone,
        order.shipping_address,
        ...(order.order_items || []).map(item => item.product_name),
      ].some(value => String(value || "").toLowerCase().includes(search))

      return matchesStatus && matchesSearch
    })
  }, [orders, searchTerm, statusFilter])

  const selectedOrder = filteredOrders.find(order => order.id === selectedOrderId)
    || orders.find(order => order.id === selectedOrderId)
    || filteredOrders[0]
    || null

  const activeCount = orders.filter(order => {
    const status = normalizeStatus(order.status)
    return status !== "delivered" && status !== "cancelled"
  }).length
  const pendingCount = orders.filter(order => normalizeStatus(order.status) === "pending").length
  const processingCount = orders.filter(order => normalizeStatus(order.status) === "processing").length
  const activeRevenue = orders
    .filter(order => {
      const status = normalizeStatus(order.status)
      return status !== "cancelled"
    })
    .reduce((sum, order) => sum + Number(order.total || 0), 0)

  const updateOrderStatus = async (status: WebsiteOrderStatus) => {
    if (!selectedOrder) return

    setUpdatingStatus(status)
    try {
      const res = await websiteOrdersService.updateStatus(selectedOrder.id, status)
      setOrders(prev => prev.map(order => (
        order.id === selectedOrder.id ? { ...order, ...(res.data || {}), status } : order
      )))
      toast.success(`Order marked ${status}`)
    } catch (err: any) {
      toast.error(err.message || "Failed to update order")
    } finally {
      setUpdatingStatus(null)
    }
  }

  return (
    <CashierLayout>
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Website Terminal</h1>
          </div>
          <Button variant="outline" onClick={() => fetchOrders()} className="gap-2 w-full sm:w-auto">
            <RefreshCcw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { label: "Active Orders", value: activeCount, icon: PackageCheck },
            { label: "Pending", value: pendingCount, icon: Clock },
            { label: "Processing", value: processingCount, icon: Truck },
            { label: "Website Revenue", value: formatCurrency(activeRevenue), icon: CreditCard },
          ].map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-card border border-border rounded-xl p-4 flex items-center justify-between"
            >
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase">{stat.label}</p>
                <p className="text-2xl font-black mt-1">{stat.value}</p>
              </div>
              <div className="p-3 rounded-lg bg-primary/10 text-primary">
                <stat.icon className="w-5 h-5" />
              </div>
            </motion.div>
          ))}
        </div>

        <div className="flex flex-col xl:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search order, customer, phone, address, or product..."
              className="pl-9 bg-card border-border"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {statusOptions.map(option => (
              <Button
                key={option.id}
                variant={statusFilter === option.id ? "default" : "outline"}
                size="sm"
                className="whitespace-nowrap"
                onClick={() => setStatusFilter(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-7 bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
              <h2 className="font-bold">Website Orders</h2>
              <Badge variant="secondary">{filteredOrders.length} shown</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-muted-foreground uppercase font-semibold text-[10px] tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Order</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Items</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground animate-pulse">
                        Loading website orders...
                      </td>
                    </tr>
                  ) : filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                        <div className="flex flex-col items-center gap-2 opacity-60">
                          <AlertCircle className="w-8 h-8" />
                          <p>No website orders found.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map(order => {
                      const status = normalizeStatus(order.status)
                      const isSelected = selectedOrder?.id === order.id

                      return (
                        <tr
                          key={order.id}
                          onClick={() => setSelectedOrderId(order.id)}
                          className={`cursor-pointer hover:bg-muted/40 transition-colors ${isSelected ? "bg-primary/5" : ""}`}
                        >
                          <td className="px-4 py-4">
                            <p className="font-black">#{order.order_number || order.id.slice(0, 8).toUpperCase()}</p>
                            <p className="text-[10px] text-muted-foreground">{new Date(order.created_at).toLocaleString()}</p>
                          </td>
                          <td className="px-4 py-4">
                            <p className="font-bold line-clamp-1">{order.customer_name || order.customer_email || "Website Customer"}</p>
                            <p className="text-[10px] text-muted-foreground line-clamp-1">{order.customer_phone || order.customer_email || "No contact"}</p>
                          </td>
                          <td className="px-4 py-4 font-bold">{order.order_items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 0}</td>
                          <td className="px-4 py-4 text-right font-black text-primary">{formatCurrency(Number(order.total || 0))}</td>
                          <td className="px-4 py-4 text-right">
                            <Badge variant="outline" className={`capitalize ${getStatusClass(status)}`}>{status}</Badge>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="xl:col-span-5 bg-card border border-border rounded-xl overflow-hidden min-h-[520px]">
            {selectedOrder ? (
              <div className="h-full flex flex-col">
                <div className="p-5 border-b border-border bg-muted/20 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground font-bold uppercase">Selected Order</p>
                    <h2 className="text-xl font-black mt-1">#{selectedOrder.order_number || selectedOrder.id.slice(0, 8).toUpperCase()}</h2>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(selectedOrder.created_at).toLocaleString()}</p>
                  </div>
                  <Badge variant="outline" className={`capitalize ${getStatusClass(normalizeStatus(selectedOrder.status))}`}>
                    {normalizeStatus(selectedOrder.status)}
                  </Badge>
                </div>

                <div className="p-5 space-y-5 overflow-y-auto">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div className="space-y-2">
                      <p className="font-black">{selectedOrder.customer_name || "Website Customer"}</p>
                      <p className="flex items-center gap-2 text-muted-foreground"><Phone className="w-4 h-4" /> {selectedOrder.customer_phone || "No phone"}</p>
                      <p className="flex items-center gap-2 text-muted-foreground"><Mail className="w-4 h-4" /> {selectedOrder.customer_email || "No email"}</p>
                    </div>
                    <div className="space-y-2">
                      <p className="flex items-start gap-2 text-muted-foreground">
                        <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>{selectedOrder.shipping_address || "No shipping address"}</span>
                      </p>
                      <p className="flex items-center gap-2 capitalize text-muted-foreground">
                        <CreditCard className="w-4 h-4" /> {formatMethod(selectedOrder.payment_method)}
                      </p>
                    </div>
                  </div>

                  <div className="border border-border rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-muted/50 text-muted-foreground uppercase font-semibold text-[10px]">
                        <tr>
                          <th className="px-3 py-3">Product</th>
                          <th className="px-3 py-3 text-center">Qty</th>
                          <th className="px-3 py-3 text-right">Website Price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {(selectedOrder.order_items || []).map(item => (
                          <tr key={item.id}>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-md bg-muted border border-border overflow-hidden flex-shrink-0">
                                  {item.product_image ? (
                                    <img src={item.product_image} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <PackageCheck className="w-5 h-5 m-2 text-muted-foreground" />
                                  )}
                                </div>
                                <p className="font-bold leading-tight">{item.product_name}</p>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-center font-black">{item.quantity}</td>
                            <td className="px-3 py-3 text-right">
                              <p className="font-black">{formatCurrency(Number(item.price || 0))}</p>
                              <p className="text-[10px] text-muted-foreground">{formatCurrency(Number(item.price || 0) * Number(item.quantity || 0))}</p>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-2 text-sm border-t border-border pt-4">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal</span>
                      <span>{formatCurrency(Number(selectedOrder.subtotal || 0))}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Shipping</span>
                      <span>{formatCurrency(Number(selectedOrder.shipping || 0))}</span>
                    </div>
                    <div className="flex justify-between text-xl font-black">
                      <span>Total</span>
                      <span className="text-primary">{formatCurrency(Number(selectedOrder.total || 0))}</span>
                    </div>
                  </div>
                </div>

                <div className="p-5 border-t border-border bg-muted/10 grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="gap-2"
                    disabled={Boolean(updatingStatus)}
                    onClick={() => updateOrderStatus("processing")}
                  >
                    <PackageCheck className="w-4 h-4" /> Processing
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2"
                    disabled={Boolean(updatingStatus)}
                    onClick={() => updateOrderStatus("shipped")}
                  >
                    <Truck className="w-4 h-4" /> Shipped
                  </Button>
                  <Button
                    className="gap-2"
                    disabled={Boolean(updatingStatus)}
                    onClick={() => updateOrderStatus("delivered")}
                  >
                    <CheckCircle2 className="w-4 h-4" /> Delivered
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2 text-red-500 hover:text-red-600"
                    disabled={Boolean(updatingStatus)}
                    onClick={() => updateOrderStatus("cancelled")}
                  >
                    <Ban className="w-4 h-4" /> Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-10 text-center">
                <PackageCheck className="w-12 h-12 mb-3 opacity-50" />
                <p className="font-bold">No order selected</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </CashierLayout>
  )
}
