"use client"

import React, { useEffect, useState, lazy, Suspense } from "react"
import { motion } from "framer-motion"
import { TrendingUp, Package, ShoppingCart, Users, DollarSign } from "lucide-react"
import { ordersService } from "@/lib/supabase/services/orders"
import { productsServiceEnhanced } from "@/lib/supabase/services/products-enhanced"
import { customersService } from "@/lib/supabase/services/customers"
import { analyticsService } from "@/lib/supabase/services/analytics"
import AdminLayout from "@/components/admin-layout"
import { formatCurrency } from "@/lib/utils/currency"
import type { Database } from "@/lib/supabase/types"

type Order = Database['public']['Tables']['orders']['Row']

// Lazy load heavy chart components
const LineChart = lazy(() => import("recharts").then(mod => ({ default: mod.LineChart })))
const BarChart = lazy(() => import("recharts").then(mod => ({ default: mod.BarChart })))
const ResponsiveContainer = lazy(() => import("recharts").then(mod => ({ default: mod.ResponsiveContainer })))
const Line = lazy(() => import("recharts").then(mod => ({ default: mod.Line })))
const Bar = lazy(() => import("recharts").then(mod => ({ default: mod.Bar })))
const XAxis = lazy(() => import("recharts").then(mod => ({ default: mod.XAxis })))
const YAxis = lazy(() => import("recharts").then(mod => ({ default: mod.YAxis })))
const CartesianGrid = lazy(() => import("recharts").then(mod => ({ default: mod.CartesianGrid })))
const Tooltip = lazy(() => import("recharts").then(mod => ({ default: mod.Tooltip })))

const SALES_DATA = [
  { month: "Jan", sales: 4000, orders: 240 },
  { month: "Feb", sales: 3000, orders: 221 },
  { month: "Mar", sales: 2000, orders: 229 },
  { month: "Apr", sales: 2780, orders: 200 },
  { month: "May", sales: 1890, orders: 229 },
  { month: "Jun", sales: 2390, orders: 200 },
]


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
    transition: { duration: 0.5 },
  },
}

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalOrders: 0,
    totalProducts: 0,
    totalCustomers: 0,
    loading: true,
  })
  const [salesData, setSalesData] = useState(SALES_DATA)
  const [recentOrders, setRecentOrders] = useState<Order[]>([])

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        // Try to fetch stats from backend API first
        const { getApiUrl } = await import('@/lib/utils/api')
        let statsData = null
        try {
          const statsResponse = await fetch(getApiUrl('/api/admin/data/stats'))
          if (statsResponse.ok) {
            const statsResult = await statsResponse.json()
            statsData = statsResult.data
          }
        } catch (err) {
          console.warn('Failed to fetch stats from API, using fallback:', err)
        }

        // Fetch all data in parallel
        const [orders, productStats, customers] = await Promise.all([
          ordersService.getAll().catch(err => {
            console.error('Error fetching orders:', err)
            return []
          }),
          productsServiceEnhanced.getStats().catch(err => {
            console.error('Error fetching product stats:', err)
            return { total: 0, inStock: 0, outOfStock: 0, categories: 0, brands: 0 }
          }),
          customersService.getAll().catch(err => {
            console.error('Error fetching customers:', err)
            return []
          }),
        ])

        // Calculate revenue
        const revenue = (orders || []).reduce((sum, order) => sum + Number(order.total || 0), 0)

        // Get last 6 months sales data
        const now = new Date()
        const monthlyData = []
        for (let i = 5; i >= 0; i--) {
          const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
          const monthStart = date.toISOString()
          const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString()
          
          const monthOrders = (orders || []).filter(o => {
            const orderDate = new Date(o.created_at)
            return orderDate >= new Date(monthStart) && orderDate <= new Date(monthEnd)
          })

          monthlyData.push({
            month: date.toLocaleDateString('en-US', { month: 'short' }),
            sales: monthOrders.reduce((sum, o) => sum + Number(o.total || 0), 0),
            orders: monthOrders.length,
          })
        }

        // Use stats from API if available, otherwise use calculated values
        const finalStats = {
          totalRevenue: statsData?.totalRevenue ?? revenue,
          totalOrders: statsData?.totalOrders ?? (orders || []).length,
          totalProducts: statsData?.totalProducts ?? (productStats?.total || 0),
          totalCustomers: statsData?.totalCustomers ?? (customers || []).length,
          loading: false,
        }
        
        console.log('[AdminDashboard] Setting stats:', finalStats)
        console.log('[AdminDashboard] Stats from API:', statsData)
        console.log('[AdminDashboard] Calculated values:', { revenue, orders: (orders || []).length, products: productStats?.total, customers: (customers || []).length })
        
        setStats(finalStats)
        setSalesData(monthlyData.length > 0 ? monthlyData : SALES_DATA)
        
        // Get recent orders (last 5)
        const recent = (orders || []).slice(0, 5)
        setRecentOrders(recent)
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error)
        setStats(prev => ({ ...prev, loading: false }))
        setRecentOrders([])
      }
    }

    fetchDashboardData()
  }, [])

  // Compute STATS array based on current stats state
  // Use useMemo to ensure it updates when stats change
  const STATS = React.useMemo(() => [
    {
      icon: DollarSign,
      label: "Total Revenue",
      value: formatCurrency(stats.totalRevenue, { showDecimals: false }),
      change: "+12.5%",
      color: "bg-blue-500",
    },
    {
      icon: ShoppingCart,
      label: "Total Orders",
      value: stats.totalOrders.toLocaleString(),
      change: "+8.2%",
      color: "bg-green-500",
    },
    {
      icon: Package,
      label: "Products",
      value: stats.totalProducts.toString(),
      change: "+2.1%",
      color: "bg-purple-500",
    },
    {
      icon: Users,
      label: "Customers",
      value: stats.totalCustomers.toString(),
      change: "+5.3%",
      color: "bg-orange-500",
    },
  ], [stats.totalRevenue, stats.totalOrders, stats.totalProducts, stats.totalCustomers])

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Delivered":
      case "Completed":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
      case "Shipped":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
      case "Processing":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
      case "Pending":
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
      case "Cancelled":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <h1 className="text-4xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-2">Welcome back! Here's your business overview.</p>
      </motion.div>

      {/* Stats Grid */}
      {stats.loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-card border border-border rounded-lg p-6 animate-pulse">
              <div className="h-20 bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {STATS.map((stat, index) => {
            const Icon = stat.icon
            console.log(`[AdminDashboard] Rendering stat ${index}:`, stat.label, stat.value)
            return (
              <motion.div
                key={`${stat.label}-${index}`}
                variants={itemVariants}
                className="bg-card border border-border rounded-lg p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-muted-foreground text-sm font-medium">{stat.label}</p>
                    <h3 className="text-3xl font-bold mt-2 text-foreground break-words">{stat.value}</h3>
                    <p className="text-green-600 dark:text-green-400 text-sm mt-2 flex items-center gap-1">
                      <TrendingUp className="w-4 h-4 flex-shrink-0" />
                      <span>{stat.change}</span>
                    </p>
                  </div>
                  <div className={`${stat.color} p-3 rounded-lg text-white flex-shrink-0 ml-4`}>
                    <Icon className="w-6 h-6" />
                  </div>
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      )}

      {/* Charts */}
      <motion.div
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Sales Chart */}
        <motion.div variants={itemVariants} className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-lg font-bold mb-4">Sales Overview</h3>
          <Suspense fallback={<div className="h-[300px] bg-muted animate-pulse rounded" />}>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={salesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis stroke="var(--muted-foreground)" />
                <YAxis stroke="var(--muted-foreground)" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="sales"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={{ fill: "var(--primary)" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </Suspense>
        </motion.div>

        {/* Orders Chart */}
        <motion.div variants={itemVariants} className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-lg font-bold mb-4">Orders by Month</h3>
          <Suspense fallback={<div className="h-[300px] bg-muted animate-pulse rounded" />}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={salesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis stroke="var(--muted-foreground)" />
                <YAxis stroke="var(--muted-foreground)" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="orders" fill="var(--primary)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Suspense>
        </motion.div>
      </motion.div>

      {/* Recent Orders */}
      <motion.div variants={itemVariants} className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-lg font-bold mb-4">Recent Orders</h3>
        <div className="overflow-x-auto">
          {recentOrders.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No orders found</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-semibold">Order ID</th>
                  <th className="text-left py-3 px-4 font-semibold">Customer</th>
                  <th className="text-left py-3 px-4 font-semibold">Amount</th>
                  <th className="text-left py-3 px-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                    <td className="py-3 px-4 font-semibold">{order.id.substring(0, 8).toUpperCase()}</td>
                    <td className="py-3 px-4">{order.customer_email || order.shipping_address || "N/A"}</td>
                    <td className="py-3 px-4">{formatCurrency(order.total || 0)}</td>
                    <td className="py-3 px-4">
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(order.status || "Pending")}`}>
                        {order.status || "Pending"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </motion.div>
      </div>
    </AdminLayout>
  )
}
