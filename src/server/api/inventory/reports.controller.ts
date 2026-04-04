import { Router, Request, Response } from 'express'
import { getSupabaseAdmin } from './supabase-admin'

const router = Router()

// GET /api/inventory/reports/sales-summary
router.get('/sales-summary', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { period } = req.query // 'today', 'week', 'month', 'year'

    const now = new Date()
    let startDate: Date

    switch (period) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        break
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1)
        break
      case 'month':
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1)
        break
    }

    const { data: sales, error } = await supabase
      .from('inv_sales')
      .select('id, net_amount, total_amount, discount_amount, payment_method, source, created_at')
      .gte('created_at', startDate.toISOString())

    if (error) throw error

    const salesList = sales || []
    const totalRevenue = salesList.reduce((sum, s: any) => sum + Number(s.net_amount || 0), 0)
    const totalGross = salesList.reduce((sum, s: any) => sum + Number(s.total_amount || 0), 0)
    const totalDiscount = salesList.reduce((sum, s: any) => sum + Number(s.discount_amount || 0), 0)

    // Group by date
    const dailyMap: Record<string, { date: string; revenue: number; count: number }> = {}
    salesList.forEach((s: any) => {
      const date = new Date(s.created_at).toISOString().split('T')[0]
      if (!dailyMap[date]) {
        dailyMap[date] = { date, revenue: 0, count: 0 }
      }
      dailyMap[date].revenue += Number(s.net_amount || 0)
      dailyMap[date].count += 1
    })

    // Payment breakdown
    const paymentBreakdown = {
      cash: salesList.filter((s: any) => s.payment_method === 'cash').reduce((sum, s: any) => sum + Number(s.net_amount || 0), 0),
      card: salesList.filter((s: any) => s.payment_method === 'card').reduce((sum, s: any) => sum + Number(s.net_amount || 0), 0),
      bank_transfer: salesList.filter((s: any) => s.payment_method === 'bank_transfer').reduce((sum, s: any) => sum + Number(s.net_amount || 0), 0),
      online: salesList.filter((s: any) => s.payment_method === 'online').reduce((sum, s: any) => sum + Number(s.net_amount || 0), 0),
    }

    res.json({
      data: {
        total_sales: salesList.length,
        total_revenue: totalRevenue,
        total_gross: totalGross,
        total_discount: totalDiscount,
        daily: Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date)),
        payment_breakdown: paymentBreakdown,
      }
    })
  } catch (error: any) {
    console.error('[Reports] Sales summary error:', error)
    res.status(500).json({ error: error.message })
  }
})

// GET /api/inventory/reports/top-products
router.get('/top-products', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { limit: queryLimit } = req.query

    const { data, error } = await supabase
      .from('inv_sale_items')
      .select('product_id, product_name, quantity, total_price')

    if (error) throw error

    // Aggregate by product
    const productMap: Record<string, { product_id: string; product_name: string; total_qty: number; total_revenue: number }> = {}
    ;(data || []).forEach((item: any) => {
      if (!productMap[item.product_id]) {
        productMap[item.product_id] = {
          product_id: item.product_id,
          product_name: item.product_name,
          total_qty: 0,
          total_revenue: 0,
        }
      }
      productMap[item.product_id].total_qty += item.quantity
      productMap[item.product_id].total_revenue += Number(item.total_price || 0)
    })

    const sorted = Object.values(productMap)
      .sort((a, b) => b.total_revenue - a.total_revenue)
      .slice(0, Number(queryLimit) || 10)

    res.json({ data: sorted })
  } catch (error: any) {
    console.error('[Reports] Top products error:', error)
    res.status(500).json({ error: error.message })
  }
})

// GET /api/inventory/reports/profit-margins
router.get('/profit-margins', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase
      .from('products')
      .select('id, name, price, cost_price, category, brand')
      .gt('cost_price', 0)

    if (error) throw error

    const products = (data || []).map((p: any) => ({
      ...p,
      profit: Number(p.price) - Number(p.cost_price),
      margin_percent: Number(p.cost_price) > 0
        ? ((Number(p.price) - Number(p.cost_price)) / Number(p.price) * 100).toFixed(1)
        : 0,
    }))

    res.json({ data: products })
  } catch (error: any) {
    console.error('[Reports] Profit margins error:', error)
    res.status(500).json({ error: error.message })
  }
})

// GET /api/inventory/reports/stock-value
router.get('/stock-value', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase
      .from('inv_stock')
      .select(`quantity, products (id, name, price, cost_price, category)`)

    if (error) throw error

    let totalRetailValue = 0
    let totalCostValue = 0

    ;(data || []).forEach((s: any) => {
      const qty = s.quantity || 0
      const retail = Number(s.products?.price || 0)
      const cost = Number(s.products?.cost_price || 0)
      totalRetailValue += qty * retail
      totalCostValue += qty * cost
    })

    res.json({
      data: {
        total_retail_value: totalRetailValue,
        total_cost_value: totalCostValue,
        potential_profit: totalRetailValue - totalCostValue,
        total_items: (data || []).reduce((sum: number, s: any) => sum + (s.quantity || 0), 0),
      }
    })
  } catch (error: any) {
    console.error('[Reports] Stock value error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
