"use client"

import React, { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import {
  BarChart3,
  CalendarDays,
  Database as DatabaseIcon,
  DollarSign,
  Download,
  Package,
  PieChart as PieChartIcon,
  ShoppingCart,
  TrendingUp,
  Users,
} from "lucide-react"
import { ordersService } from "@/lib/supabase/services/orders"
import { productsServiceEnhanced } from "@/lib/supabase/services/products-enhanced"
import { customersService } from "@/lib/supabase/services/customers"
import { inventoryCustomersService } from "@/lib/services/inventory.service"
import AdminLayout from "@/components/admin-layout"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/utils/currency"

type ReportPeriod = "daily" | "weekly" | "monthly"

type ReportBucket = {
  key: string
  label: string
  rangeLabel: string
  start: Date
  end: Date
  sales: number
  revenue: number
  profit: number
  webSales: number
  posSales: number
  webRevenue: number
  posRevenue: number
  webProfit: number
  posProfit: number
}

type ReportAnalytics = {
  buckets: ReportBucket[]
  rangeLabel: string
  totals: {
    sales: number
    revenue: number
    profit: number
    webSales: number
    posSales: number
    webRevenue: number
    posRevenue: number
    webProfit: number
    posProfit: number
    margin: number
  }
  channelPie: Array<{ name: string; value: number; fill: string }>
  profitPie: Array<{ name: string; value: number; fill: string }>
}

const PERIOD_OPTIONS: Array<{ id: ReportPeriod; label: string }> = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
]

const CHART_COLORS = {
  revenue: "#2563eb",
  profit: "#16a34a",
  web: "#3b82f6",
  pos: "#22c55e",
  cost: "#64748b",
  loss: "#ef4444",
  empty: "#334155",
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35 },
  },
}

const toNumber = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
const endOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate()

const formatShortDate = (date: Date) =>
  date.toLocaleDateString("en-US", { month: "short", day: "numeric" })

const formatRange = (start: Date, end: Date) =>
  `${formatShortDate(start)} - ${formatShortDate(end)}`

const formatAxisCurrency = (value: number) => {
  const numeric = Number(value) || 0
  const amount = Math.abs(numeric)
  const sign = numeric < 0 ? "-" : ""
  if (amount >= 1_000_000) return `${sign}Rs. ${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `${sign}Rs. ${(amount / 1_000).toFixed(0)}k`
  return `${sign}Rs. ${amount}`
}

const formatPercent = (value: number) =>
  `${Number.isFinite(value) ? value.toFixed(1) : "0.0"}%`

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

function createBuckets(period: ReportPeriod, now = new Date()): Pick<ReportAnalytics, "buckets" | "rangeLabel"> {
  const year = now.getFullYear()
  const month = now.getMonth()
  const monthName = now.toLocaleDateString("en-US", { month: "long" })

  if (period === "daily") {
    const totalDays = daysInMonth(year, month)
    const buckets = Array.from({ length: totalDays }, (_, index) => {
      const day = index + 1
      const date = new Date(year, month, day)
      return createBucket({
        key: `${year}-${month + 1}-${day}`,
        label: String(day),
        rangeLabel: formatShortDate(date),
        start: startOfDay(date),
        end: endOfDay(date),
      })
    })

    return { buckets, rangeLabel: `${monthName} ${year}` }
  }

  if (period === "weekly") {
    const totalDays = daysInMonth(year, month)
    const buckets: ReportBucket[] = []

    for (let startDay = 1; startDay <= totalDays; startDay += 7) {
      const endDay = Math.min(startDay + 6, totalDays)
      const start = new Date(year, month, startDay)
      const end = new Date(year, month, endDay)
      buckets.push(
        createBucket({
          key: `${year}-${month + 1}-week-${buckets.length + 1}`,
          label: `Week ${buckets.length + 1}`,
          rangeLabel: formatRange(start, end),
          start: startOfDay(start),
          end: endOfDay(end),
        })
      )
    }

    return { buckets, rangeLabel: `${monthName} ${year}` }
  }

  const buckets = Array.from({ length: 12 }, (_, index) => {
    const start = new Date(year, index, 1)
    const end = new Date(year, index, daysInMonth(year, index))
    return createBucket({
      key: `${year}-${index + 1}`,
      label: start.toLocaleDateString("en-US", { month: "short" }),
      rangeLabel: start.toLocaleDateString("en-US", { month: "long" }),
      start: startOfDay(start),
      end: endOfDay(end),
    })
  })

  return { buckets, rangeLabel: String(year) }
}

function createBucket(args: Pick<ReportBucket, "key" | "label" | "rangeLabel" | "start" | "end">): ReportBucket {
  return {
    ...args,
    sales: 0,
    revenue: 0,
    profit: 0,
    webSales: 0,
    posSales: 0,
    webRevenue: 0,
    posRevenue: 0,
    webProfit: 0,
    posProfit: 0,
  }
}

function findBucket(buckets: ReportBucket[], value: unknown) {
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return null
  return buckets.find(bucket => date >= bucket.start && date <= bucket.end) || null
}

function buildCostMap(products: any[]) {
  const map = new Map<string, number>()

  products.forEach(product => {
    if (!product?.id) return
    const cost = toNumber(product.cost_price ?? product.buy_price ?? product.inventory_price)
    if (cost > 0) map.set(product.id, cost)
  })

  return map
}

function getProductStockQuantity(product: any) {
  const directStock = [product?.stock_quantity, product?.quantity, product?.stock].find(
    value => value !== undefined && value !== null && value !== ""
  )

  if (directStock !== undefined) return Math.max(toNumber(directStock), 0)

  return ["qty_meegoda", "qty_padukka", "qty_padukka_new"].reduce(
    (sum, key) => sum + Math.max(toNumber(product?.[key]), 0),
    0
  )
}

function getShopInventoryUnitPrice(product: any) {
  const price = [product?.buy_price, product?.cost_price, product?.inventory_price, product?.price]
    .map(value => toNumber(value))
    .find(value => value > 0)

  return price || 0
}

function calculateShopStockValue(products: any[]) {
  return products.reduce(
    (sum, product) => sum + getProductStockQuantity(product) * getShopInventoryUnitPrice(product),
    0
  )
}

function getWebOrderItems(order: any) {
  if (Array.isArray(order?.order_items) && order.order_items.length > 0) {
    return order.order_items
  }

  const rawItems = order?.items
  if (Array.isArray(rawItems)) return rawItems

  if (typeof rawItems === "string") {
    try {
      const parsed = JSON.parse(rawItems)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  return []
}

function calculateItemsProfit(items: any[], productCosts: Map<string, number>) {
  return items.reduce((sum, item) => {
    const productId = item.product_id || item.productId || item.id
    const cost = productId ? productCosts.get(productId) : undefined
    if (cost === undefined) return sum

    const quantity = toNumber(item.quantity || item.qty || 1)
    const itemTotal = toNumber(item.total_price ?? item.total)
    const unitPrice = toNumber(item.price ?? item.unit_price ?? (quantity > 0 ? itemTotal / quantity : 0))

    return sum + (unitPrice - cost) * quantity
  }, 0)
}

function isRevenueOrder(order: any) {
  const status = String(order?.status || "").toLowerCase()
  const paymentStatus = String(order?.payment_status || "").toLowerCase()
  return status !== "cancelled" && status !== "canceled" && paymentStatus !== "failed" && paymentStatus !== "cancelled" && paymentStatus !== "canceled"
}

function buildReportAnalytics(
  period: ReportPeriod,
  orders: any[],
  posSales: any[],
  products: any[]
): ReportAnalytics {
  const { buckets, rangeLabel } = createBuckets(period)
  const productCosts = buildCostMap(products)

  orders.filter(isRevenueOrder).forEach(order => {
    const bucket = findBucket(buckets, order.created_at)
    if (!bucket) return

    const revenue = toNumber(order.total)
    const profit = calculateItemsProfit(getWebOrderItems(order), productCosts)

    bucket.sales += 1
    bucket.webSales += 1
    bucket.revenue += revenue
    bucket.webRevenue += revenue
    bucket.profit += profit
    bucket.webProfit += profit
  })

  posSales.forEach(sale => {
    const bucket = findBucket(buckets, sale.created_at)
    if (!bucket) return

    const revenue = toNumber(sale.net_amount ?? sale.total_amount)
    const profit = calculateItemsProfit(sale.inv_sale_items || [], productCosts)

    bucket.sales += 1
    bucket.posSales += 1
    bucket.revenue += revenue
    bucket.posRevenue += revenue
    bucket.profit += profit
    bucket.posProfit += profit
  })

  const totals = buckets.reduce(
    (acc, bucket) => ({
      sales: acc.sales + bucket.sales,
      revenue: acc.revenue + bucket.revenue,
      profit: acc.profit + bucket.profit,
      webSales: acc.webSales + bucket.webSales,
      posSales: acc.posSales + bucket.posSales,
      webRevenue: acc.webRevenue + bucket.webRevenue,
      posRevenue: acc.posRevenue + bucket.posRevenue,
      webProfit: acc.webProfit + bucket.webProfit,
      posProfit: acc.posProfit + bucket.posProfit,
      margin: 0,
    }),
    {
      sales: 0,
      revenue: 0,
      profit: 0,
      webSales: 0,
      posSales: 0,
      webRevenue: 0,
      posRevenue: 0,
      webProfit: 0,
      posProfit: 0,
      margin: 0,
    }
  )

  totals.margin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0

  const channelPie = withFallbackPie(
    [
      { name: "Website", value: totals.webRevenue, fill: CHART_COLORS.web },
      { name: "POS", value: totals.posRevenue, fill: CHART_COLORS.pos },
    ],
    "No revenue"
  )

  const knownCost = totals.revenue - totals.profit
  const profitPie =
    totals.profit >= 0
      ? withFallbackPie(
          [
            { name: "Known Cost", value: Math.max(knownCost, 0), fill: CHART_COLORS.cost },
            { name: "Profit", value: totals.profit, fill: CHART_COLORS.profit },
          ],
          "No profit"
        )
      : withFallbackPie(
          [
            { name: "Revenue", value: totals.revenue, fill: CHART_COLORS.revenue },
            { name: "Loss", value: Math.abs(totals.profit), fill: CHART_COLORS.loss },
          ],
          "No profit"
        )

  return { buckets, rangeLabel, totals, channelPie, profitPie }
}

function withFallbackPie(data: Array<{ name: string; value: number; fill: string }>, fallbackName: string) {
  return data.some(item => item.value > 0)
    ? data
    : [{ name: fallbackName, value: 1, fill: CHART_COLORS.empty }]
}

function downloadExcelReport(period: ReportPeriod, analytics: ReportAnalytics) {
  if (typeof window === "undefined") return

  const heading = `${period.charAt(0).toUpperCase()}${period.slice(1)} Dashboard Report`
  const generatedAt = new Date().toLocaleString()

  const rows = analytics.buckets.map(bucket => [
    bucket.label,
    bucket.rangeLabel,
    bucket.sales,
    bucket.webSales,
    bucket.posSales,
    bucket.revenue.toFixed(2),
    bucket.webRevenue.toFixed(2),
    bucket.posRevenue.toFixed(2),
    bucket.profit.toFixed(2),
    bucket.webProfit.toFixed(2),
    bucket.posProfit.toFixed(2),
    bucket.revenue > 0 ? `${((bucket.profit / bucket.revenue) * 100).toFixed(2)}%` : "0.00%",
  ])

  const headers = [
    "Period",
    "Range",
    "Sales",
    "Website Sales",
    "POS Sales",
    "Revenue",
    "Website Revenue",
    "POS Revenue",
    "Profit",
    "Website Profit",
    "POS Profit",
    "Profit Margin",
  ]

  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          table { border-collapse: collapse; font-family: Arial, sans-serif; }
          th, td { border: 1px solid #b8c2cc; padding: 8px 10px; }
          th { background: #111827; color: #ffffff; }
          .meta { font-weight: 700; background: #e5e7eb; }
        </style>
      </head>
      <body>
        <table>
          <tr><td class="meta" colspan="${headers.length}">${escapeHtml(heading)}</td></tr>
          <tr><td class="meta" colspan="${headers.length}">Range: ${escapeHtml(analytics.rangeLabel)}</td></tr>
          <tr><td class="meta" colspan="${headers.length}">Generated: ${escapeHtml(generatedAt)}</td></tr>
          <tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
          ${rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}
          <tr>
            <td class="meta">Total</td>
            <td class="meta">${escapeHtml(analytics.rangeLabel)}</td>
            <td class="meta">${analytics.totals.sales}</td>
            <td class="meta">${analytics.totals.webSales}</td>
            <td class="meta">${analytics.totals.posSales}</td>
            <td class="meta">${analytics.totals.revenue.toFixed(2)}</td>
            <td class="meta">${analytics.totals.webRevenue.toFixed(2)}</td>
            <td class="meta">${analytics.totals.posRevenue.toFixed(2)}</td>
            <td class="meta">${analytics.totals.profit.toFixed(2)}</td>
            <td class="meta">${analytics.totals.webProfit.toFixed(2)}</td>
            <td class="meta">${analytics.totals.posProfit.toFixed(2)}</td>
            <td class="meta">${analytics.totals.margin.toFixed(2)}%</td>
          </tr>
        </table>
      </body>
    </html>
  `

  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `imobile-${period}-sales-revenue-profit-${new Date().toISOString().slice(0, 10)}.xls`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

type BarChartSeries = {
  name: string
  color: string
  getValue: (bucket: ReportBucket) => number
  formatValue?: (value: number) => string
}

const formatNumberValue = (value: number) => value.toLocaleString()
const formatCurrencyValue = (value: number) => formatCurrency(value, { showDecimals: false })

function getLabelStep(length: number) {
  if (length > 24) return 5
  if (length > 14) return 3
  if (length > 8) return 2
  return 1
}

function getChartDomain(data: ReportBucket[], series: BarChartSeries[]) {
  const values = data.flatMap(bucket => series.map(item => item.getValue(bucket)))
  const minValue = Math.min(0, ...values)
  const maxValue = Math.max(0, ...values)

  if (minValue === maxValue) {
    return { min: 0, max: 1 }
  }

  const padding = (maxValue - minValue) * 0.08
  return {
    min: minValue < 0 ? minValue - padding : 0,
    max: maxValue > 0 ? maxValue + padding : 1,
  }
}

function GroupedBarChartView({
  data,
  series,
  valueFormatter = formatNumberValue,
}: {
  data: ReportBucket[]
  series: BarChartSeries[]
  valueFormatter?: (value: number) => string
}) {
  const width = 720
  const height = 330
  const padding = { top: 18, right: 18, bottom: 58, left: 76 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const domain = getChartDomain(data, series)
  const range = domain.max - domain.min
  const yForValue = (value: number) => padding.top + ((domain.max - value) / range) * plotHeight
  const baselineY = yForValue(0)
  const groupWidth = plotWidth / Math.max(data.length, 1)
  const barGap = data.length > 20 ? 1 : 3
  const barWidth = Math.max(2, Math.min(18, (groupWidth * 0.72 - barGap * (series.length - 1)) / series.length))
  const labelStep = getLabelStep(data.length)
  const ticks = Array.from({ length: 5 }, (_, index) => domain.min + (range / 4) * index)

  return (
    <div className="h-[330px] w-full overflow-hidden">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label="Bar chart">
        {ticks.map(tick => {
          const y = yForValue(tick)
          return (
            <g key={tick}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="var(--border)" strokeDasharray="4 4" opacity="0.75" />
              <text x={padding.left - 10} y={y + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
                {valueFormatter(tick)}
              </text>
            </g>
          )
        })}

        <line x1={padding.left} x2={width - padding.right} y1={baselineY} y2={baselineY} stroke="var(--border)" />
        <line x1={padding.left} x2={padding.left} y1={padding.top} y2={height - padding.bottom} stroke="var(--border)" />

        {data.map((bucket, bucketIndex) => {
          const groupCenter = padding.left + bucketIndex * groupWidth + groupWidth / 2
          const groupStart = groupCenter - (series.length * barWidth + (series.length - 1) * barGap) / 2
          const showLabel = bucketIndex === 0 || bucketIndex === data.length - 1 || bucketIndex % labelStep === 0

          return (
            <g key={bucket.key}>
              {series.map((item, seriesIndex) => {
                const value = item.getValue(bucket)
                const valueY = yForValue(value)
                const y = Math.min(valueY, baselineY)
                const barHeight = Math.abs(baselineY - valueY)

                return (
                  <rect
                    key={item.name}
                    x={groupStart + seriesIndex * (barWidth + barGap)}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    rx={Math.min(5, barWidth / 2)}
                    fill={item.color}
                    style={{ transition: "all 260ms ease" }}
                  >
                    <title>{`${bucket.rangeLabel} - ${item.name}: ${(item.formatValue || valueFormatter)(value)}`}</title>
                  </rect>
                )
              })}
              {showLabel && (
                <text x={groupCenter} y={height - 28} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                  {bucket.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function ChartLegend({ items }: { items: Array<{ name: string; color: string }> }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      {items.map(item => (
        <span key={item.name} className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
          {item.name}
        </span>
      ))}
    </div>
  )
}

function PieDonutChartView({
  data,
  centerLabel,
}: {
  data: Array<{ name: string; value: number; fill: string }>
  centerLabel: string
}) {
  const total = data.reduce((sum, item) => sum + Math.max(item.value, 0), 0)
  let offset = 0
  const isFallback = data.length === 1 && data[0]?.name.startsWith("No ")

  return (
    <div className="grid min-h-[260px] grid-cols-1 items-center gap-4 sm:grid-cols-[220px_1fr]">
      <svg viewBox="0 0 220 220" className="h-[220px] w-full max-w-[220px] justify-self-center" role="img" aria-label="Pie chart">
        <circle cx="110" cy="110" r="74" fill="none" stroke="var(--muted)" strokeWidth="30" opacity="0.28" />
        {data.map(item => {
          const percent = total > 0 ? (Math.max(item.value, 0) / total) * 100 : 0
          const dashOffset = -offset
          offset += percent

          return (
            <circle
              key={item.name}
              cx="110"
              cy="110"
              r="74"
              fill="none"
              stroke={item.fill}
              strokeWidth="30"
              pathLength="100"
              strokeDasharray={`${percent} ${100 - percent}`}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 110 110)"
              style={{ transition: "stroke-dasharray 260ms ease, stroke-dashoffset 260ms ease" }}
            >
              <title>{`${item.name}: ${isFallback ? "No data" : formatCurrencyValue(item.value)}`}</title>
            </circle>
          )
        })}
        <text x="110" y="104" textAnchor="middle" className="fill-foreground text-[18px] font-bold">
          {isFallback ? "No data" : centerLabel}
        </text>
        <text x="110" y="126" textAnchor="middle" className="fill-muted-foreground text-[11px]">
          Total
        </text>
      </svg>

      <div className="space-y-3">
        {data.map(item => {
          const percent = total > 0 && !isFallback ? (item.value / total) * 100 : 0
          return (
            <div key={item.name} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.fill }} />
                  <p className="truncate text-sm font-semibold">{item.name}</p>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{isFallback ? "No data" : formatPercent(percent)}</p>
              </div>
              <p className="text-sm font-bold">{isFallback ? "-" : formatCurrencyValue(item.value)}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function AdminDashboard() {
  const [activePeriod, setActivePeriod] = useState<ReportPeriod>("daily")
  const [orders, setOrders] = useState<any[]>([])
  const [posSales, setPosSales] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [recentTransactions, setRecentTransactions] = useState<any[]>([])
  const [stats, setStats] = useState({
    totalRevenue: 0,
    webRevenue: 0,
    posRevenue: 0,
    totalOrders: 0,
    webOrdersCount: 0,
    posOrdersCount: 0,
    shopStockValue: 0,
    totalProducts: 0,
    totalQuantity: 0,
    totalCustomers: 0,
    websiteCustomersCount: 0,
    shopCustomersCount: 0,
    loading: true,
  })

  useEffect(() => {
    const fetchDashboardData = async (silent = false) => {
      try {
        if (!silent) setStats(prev => ({ ...prev, loading: true }))

        const { getApiUrl } = await import("@/lib/utils/api")
        const reportStart = new Date(new Date().getFullYear(), 0, 1).toISOString()
        let statsData: any = null

        try {
          const statsResponse = await fetch(getApiUrl("/api/admin/data/stats"))
          if (statsResponse.ok) {
            const statsResult = await statsResponse.json()
            statsData = statsResult.data
          }
        } catch (err) {
          console.warn("Failed to fetch stats from API, using fallback:", err)
        }

        const needsProductStatsFallback =
          statsData?.totalProducts === undefined || statsData?.totalQuantity === undefined
        const needsWebsiteCustomerFallback = statsData?.websiteCustomersCount === undefined
        const needsShopCustomerFallback = statsData?.shopCustomersCount === undefined

        const productsRequest = fetch(getApiUrl("/api/inventory/products"))
          .then(res => {
            if (!res.ok) throw new Error(`Product API failed: ${res.status}`)
            return res.json()
          })
          .catch(async err => {
            console.warn("Failed to fetch product costs from API, using fallback:", err)
            const fallbackProducts = await productsServiceEnhanced.getAll().catch(() => [])
            return { data: fallbackProducts }
          })

        const [ordersData, posSalesResult, productStats, websiteCustomers, shopCustomersResult, productsResult] = await Promise.all([
          ordersService.getAll().catch(err => {
            console.error("Error fetching orders:", err)
            return []
          }),
          fetch(getApiUrl(`/api/inventory/sales?from_date=${encodeURIComponent(reportStart)}&limit=5000`))
            .then(res => res.json())
            .catch(err => {
              console.error("Error fetching POS sales:", err)
              return { data: [] }
            }),
          needsProductStatsFallback
            ? productsServiceEnhanced.getStats().catch(err => {
                console.error("Error fetching product stats:", err)
                return { total: 0, inStock: 0, outOfStock: 0, categories: 0, brands: 0, totalQuantity: 0 }
              })
            : Promise.resolve(null),
          needsWebsiteCustomerFallback
            ? customersService.getAll().catch(err => {
                console.error("Error fetching website customers:", err)
                return []
              })
            : Promise.resolve([]),
          needsShopCustomerFallback
            ? inventoryCustomersService.getAll().catch(err => {
                console.error("Error fetching shop customers:", err)
                return { data: [] }
              })
            : Promise.resolve({ data: [] }),
          productsRequest,
        ])

        const posSalesData = posSalesResult.data || []
        const productsData = productsResult.data || []
        const shopCustomers = shopCustomersResult.data || []

        setOrders(ordersData || [])
        setPosSales(posSalesData)
        setProducts(productsData)

        const revenueOrders = (ordersData || []).filter(isRevenueOrder)
        const webRevenue = revenueOrders.reduce((sum: number, order: any) => sum + toNumber(order.total), 0)
        const posRevenue = posSalesData.reduce((sum: number, sale: any) => sum + toNumber(sale.net_amount), 0)
        const totalRevenue = webRevenue + posRevenue
        const shopStockValue = statsData?.shopStockValue ?? calculateShopStockValue(productsData)
        const websiteCustomersCount = statsData?.websiteCustomersCount ?? (websiteCustomers || []).length
        const shopCustomersCount = statsData?.shopCustomersCount ?? shopCustomers.length

        const finalStats = {
          totalRevenue,
          webRevenue,
          posRevenue,
          totalOrders: revenueOrders.length + posSalesData.length,
          webOrdersCount: revenueOrders.length,
          posOrdersCount: posSalesData.length,
          shopStockValue,
          totalProducts: statsData?.totalProducts ?? (productStats?.total || productsData.length || 0),
          totalQuantity: statsData?.totalQuantity ?? (productStats?.totalQuantity || 0),
          totalCustomers: websiteCustomersCount + shopCustomersCount,
          websiteCustomersCount,
          shopCustomersCount,
          loading: false,
        }

        setStats(finalStats)

        const combinedTransactions = [
          ...(ordersData || []).map((order: any) => ({
            ...order,
            transactionType: "Website",
            displayId: order.order_number,
            displayAmount: order.total,
            displayStatus: order.status,
          })),
          ...posSalesData.map((sale: any) => ({
            ...sale,
            transactionType: "POS",
            displayId: sale.invoice_number,
            displayAmount: sale.net_amount,
            displayStatus: "Completed",
          })),
        ]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 10)

        setRecentTransactions(combinedTransactions)
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error)
        if (!silent) setStats(prev => ({ ...prev, loading: false }))
      }
    }

    fetchDashboardData()

    const pollingInterval = setInterval(() => fetchDashboardData(true), 30000)
    const handleUpdate = () => fetchDashboardData(true)
    const handleStorage = (event: StorageEvent) => {
      if (event.key?.startsWith("adminUpdate_")) handleUpdate()
    }

    window.addEventListener("orderUpdated", handleUpdate)
    window.addEventListener("productUpdated", handleUpdate)
    window.addEventListener("inventoryUpdated", handleUpdate)
    window.addEventListener("storage", handleStorage)

    return () => {
      clearInterval(pollingInterval)
      window.removeEventListener("orderUpdated", handleUpdate)
      window.removeEventListener("productUpdated", handleUpdate)
      window.removeEventListener("inventoryUpdated", handleUpdate)
      window.removeEventListener("storage", handleStorage)
    }
  }, [])

  const analytics = useMemo(
    () => buildReportAnalytics(activePeriod, orders, posSales, products),
    [activePeriod, orders, posSales, products]
  )

  const summarySections = useMemo(() => [
    {
      title: "Business Value",
      cards: [
        {
          icon: DatabaseIcon,
          label: "Total Shop Product Value",
          value: formatCurrency(stats.shopStockValue, { showDecimals: false }),
          subtext: "All shop stock at buy/cost price",
          color: "bg-indigo-500",
        },
        {
          icon: DollarSign,
          label: "Total Revenue",
          value: formatCurrency(stats.totalRevenue, { showDecimals: false }),
          subtext: `Web: ${formatCurrency(stats.webRevenue, { showDecimals: false })} | POS: ${formatCurrency(stats.posRevenue, { showDecimals: false })}`,
          color: "bg-blue-500",
        },
        {
          icon: ShoppingCart,
          label: "Total Orders",
          value: stats.totalOrders.toLocaleString(),
          subtext: `Web: ${stats.webOrdersCount} | POS: ${stats.posOrdersCount}`,
          color: "bg-green-500",
        },
      ],
    },
    {
      title: "Inventory & Customers",
      cards: [
        {
          icon: Package,
          label: "Total Products",
          value: stats.totalProducts.toString(),
          subtext: "Unique items",
          color: "bg-purple-500",
        },
        {
          icon: DatabaseIcon,
          label: "Total Quantity",
          value: (stats.totalQuantity || 0).toLocaleString(),
          subtext: "Units in stock",
          color: "bg-sky-500",
        },
        {
          icon: Users,
          label: "Total Customers",
          value: stats.totalCustomers.toLocaleString(),
          subtext: `Website: ${stats.websiteCustomersCount} | Shop permanent: ${stats.shopCustomersCount}`,
          color: "bg-orange-500",
        },
      ],
    },
  ], [stats])

  const reportCards = [
    {
      icon: CalendarDays,
      label: "Sales",
      value: analytics.totals.sales.toLocaleString(),
      subtext: `Web ${analytics.totals.webSales} | POS ${analytics.totals.posSales}`,
      color: "bg-sky-500",
    },
    {
      icon: DollarSign,
      label: "Revenue",
      value: formatCurrency(analytics.totals.revenue, { showDecimals: false }),
      subtext: analytics.rangeLabel,
      color: "bg-blue-500",
    },
    {
      icon: TrendingUp,
      label: "Profit",
      value: formatCurrency(analytics.totals.profit, { showDecimals: false }),
      subtext: `${formatPercent(analytics.totals.margin)} margin`,
      color: analytics.totals.profit >= 0 ? "bg-emerald-500" : "bg-red-500",
    },
    {
      icon: PieChartIcon,
      label: "POS Share",
      value: formatPercent(analytics.totals.revenue ? (analytics.totals.posRevenue / analytics.totals.revenue) * 100 : 0),
      subtext: formatCurrency(analytics.totals.posRevenue, { showDecimals: false }),
      color: "bg-violet-500",
    },
  ]

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Delivered":
      case "delivered":
      case "Completed":
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
      case "Shipped":
      case "shipped":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
      case "Processing":
      case "processing":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
      case "Pending":
      case "pending":
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
      case "Cancelled":
      case "cancelled":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: -18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Welcome back! Here's your business overview.</p>
        </motion.div>

        {stats.loading ? (
          <div className="space-y-5">
            {[1, 2].map((section) => (
              <div key={section} className="space-y-3">
                <div className="h-5 w-40 bg-muted rounded animate-pulse" />
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {[1, 2, 3].map((item) => (
                    <div key={item} className="bg-card border border-border rounded-lg p-5 animate-pulse">
                      <div className="h-20 bg-muted rounded" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <motion.div
            className="space-y-5"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {summarySections.map(section => (
              <motion.section key={section.title} variants={itemVariants} className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{section.title}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {section.cards.map((stat, index) => {
                    const Icon = stat.icon
                    return (
                      <div
                        key={`${stat.label}-${index}`}
                        className="bg-card border border-border rounded-lg p-4 2xl:p-5 hover:shadow-lg transition-shadow flex flex-col justify-center"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-muted-foreground text-xs md:text-sm font-medium truncate">{stat.label}</p>
                            <h3 className="text-lg md:text-xl 2xl:text-2xl font-bold mt-1.5 text-foreground truncate">{stat.value}</h3>
                            <p className="text-muted-foreground text-[10px] md:text-xs mt-1.5 truncate">{stat.subtext}</p>
                          </div>
                          <div className={`${stat.color} p-2 lg:p-2.5 2xl:p-3 rounded-lg text-white flex-shrink-0`}>
                            <Icon className="w-4 h-4 lg:w-5 lg:h-5 2xl:w-6 2xl:h-6" />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </motion.section>
            ))}
          </motion.div>
        )}

        <motion.div variants={itemVariants} initial="hidden" animate="visible" className="space-y-5">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">Performance</h2>
              <p className="text-sm text-muted-foreground">{analytics.rangeLabel}</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="inline-flex h-10 items-center rounded-lg border border-border bg-background p-1">
                {PERIOD_OPTIONS.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setActivePeriod(option.id)}
                    className={`h-8 px-4 rounded-md text-sm font-semibold transition-all ${
                      activePeriod === option.id
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                className="h-10"
                onClick={() => downloadExcelReport(activePeriod, analytics)}
              >
                <Download className="w-4 h-4" />
                Export .xls
              </Button>
            </div>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {reportCards.map((card) => {
                const Icon = card.icon
                return (
                  <div key={card.label} className="border border-border rounded-lg p-4 bg-card">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-muted-foreground truncate">{card.label}</p>
                        <p className="text-xl font-black mt-1 truncate">{card.value}</p>
                        <p className="text-xs text-muted-foreground mt-1 truncate">{card.subtext}</p>
                      </div>
                      <div className={`${card.color} p-2 rounded-lg text-white flex-shrink-0`}>
                        <Icon className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <motion.div
              key={activePeriod}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="grid grid-cols-1 xl:grid-cols-3 gap-4"
            >
              <div className="xl:col-span-2 border border-border rounded-lg p-4 sm:p-5 bg-card">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-base font-bold">Revenue and Profit</h3>
                    <p className="text-xs text-muted-foreground">{analytics.rangeLabel}</p>
                  </div>
                  <BarChart3 className="w-5 h-5 text-muted-foreground" />
                </div>
                <GroupedBarChartView
                  data={analytics.buckets}
                  valueFormatter={formatAxisCurrency}
                  series={[
                    {
                      name: "Revenue",
                      color: CHART_COLORS.revenue,
                      getValue: bucket => bucket.revenue,
                      formatValue: formatCurrencyValue,
                    },
                    {
                      name: "Profit",
                      color: CHART_COLORS.profit,
                      getValue: bucket => bucket.profit,
                      formatValue: formatCurrencyValue,
                    },
                  ]}
                />
                <ChartLegend
                  items={[
                    { name: "Revenue", color: CHART_COLORS.revenue },
                    { name: "Profit", color: CHART_COLORS.profit },
                  ]}
                />
              </div>

              <div className="border border-border rounded-lg p-4 sm:p-5 bg-card">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="text-base font-bold">Sales Count</h3>
                    <p className="text-xs text-muted-foreground">{analytics.totals.sales.toLocaleString()} transactions</p>
                  </div>
                  <CalendarDays className="w-5 h-5 text-muted-foreground" />
                </div>
                <GroupedBarChartView
                  data={analytics.buckets}
                  series={[
                    {
                      name: "Sales",
                      color: "#f97316",
                      getValue: bucket => bucket.sales,
                      formatValue: formatNumberValue,
                    },
                  ]}
                />
              </div>

              <div className="border border-border rounded-lg p-4 sm:p-5 bg-card">
                <h3 className="text-base font-bold mb-1">Revenue Channel</h3>
                <p className="text-xs text-muted-foreground mb-4">Website and POS</p>
                <PieDonutChartView
                  data={analytics.channelPie}
                  centerLabel={formatCurrencyValue(analytics.totals.revenue)}
                />
              </div>

              <div className="border border-border rounded-lg p-4 sm:p-5 bg-card">
                <h3 className="text-base font-bold mb-1">Profit Mix</h3>
                <p className="text-xs text-muted-foreground mb-4">Based on product cost</p>
                <PieDonutChartView
                  data={analytics.profitPie}
                  centerLabel={formatCurrencyValue(Math.max(analytics.totals.profit, 0))}
                />
              </div>

              <div className="border border-border rounded-lg p-4 sm:p-5 bg-card">
                <h3 className="text-base font-bold mb-4">Channel Summary</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold">Website</p>
                      <p className="text-xs text-muted-foreground">{analytics.totals.webSales.toLocaleString()} sales</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{formatCurrency(analytics.totals.webRevenue, { showDecimals: false })}</p>
                      <p className="text-xs text-emerald-500">{formatCurrency(analytics.totals.webProfit, { showDecimals: false })}</p>
                    </div>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold">POS</p>
                      <p className="text-xs text-muted-foreground">{analytics.totals.posSales.toLocaleString()} sales</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{formatCurrency(analytics.totals.posRevenue, { showDecimals: false })}</p>
                      <p className="text-xs text-emerald-500">{formatCurrency(analytics.totals.posProfit, { showDecimals: false })}</p>
                    </div>
                  </div>
                  <div className="border-t border-border pt-4">
                    <p className="text-xs text-muted-foreground">Margin</p>
                    <p className="text-2xl font-black">{formatPercent(analytics.totals.margin)}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} initial="hidden" animate="visible" className="bg-card border border-border rounded-lg p-4 sm:p-6">
          <div className="flex items-center justify-between gap-4 mb-6">
            <h3 className="text-lg font-bold">Recent Transactions</h3>
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5 text-blue-500 font-medium">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span> Website
              </span>
              <span className="flex items-center gap-1.5 text-green-500 font-medium">
                <span className="w-2 h-2 rounded-full bg-green-500"></span> POS
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            {recentTransactions.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No transactions found</div>
            ) : (
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-semibold">Transaction ID</th>
                    <th className="text-left py-3 px-4 font-semibold">Channel</th>
                    <th className="text-left py-3 px-4 font-semibold">Customer</th>
                    <th className="text-left py-3 px-4 font-semibold">Amount</th>
                    <th className="text-left py-3 px-4 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.map((tx) => (
                    <tr key={`${tx.transactionType}-${tx.id}`} className="border-b border-border hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4 font-semibold">#{tx.displayId || tx.id.substring(0, 8).toUpperCase()}</td>
                      <td className="py-3 px-4">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                          tx.transactionType === "Website" ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800"
                        }`}>
                          {tx.transactionType}
                        </span>
                      </td>
                      <td className="py-3 px-4 truncate max-w-[220px]">{tx.customer_name || tx.customer_email || "Walk-in Customer"}</td>
                      <td className="py-3 px-4 font-bold">{formatCurrency(tx.displayAmount || 0)}</td>
                      <td className="py-3 px-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(tx.displayStatus || "Pending")}`}>
                          {tx.displayStatus || "Completed"}
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
