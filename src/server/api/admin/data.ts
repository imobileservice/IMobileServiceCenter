import { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'

// Async error wrapper
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      console.error('[Admin Data API] Unhandled async error:', error)
      if (!res.headersSent) {
        res.status(error.status || 500).json({
          error: error.message || 'Internal Server Error',
          ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
        })
      }
    })
  }
}

const isRevenueOrder = (order: any) => {
  const status = String(order?.status || '').toLowerCase()
  const paymentStatus = String(order?.payment_status || '').toLowerCase()
  const cancelledStatuses = new Set(['cancelled', 'canceled'])
  const failedPaymentStatuses = new Set(['failed', 'cancelled', 'canceled'])

  return !cancelledStatuses.has(status) && !failedPaymentStatuses.has(paymentStatus)
}

const toNumber = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const getStockUnitValue = (product: any) => {
  const price = [product?.buy_price, product?.cost_price, product?.price]
    .map(value => toNumber(value))
    .find(value => value > 0)

  return price || 0
}

/**
 * GET /api/admin/data/orders
 * Get all orders (admin only, uses service role)
 */
export const getOrdersHandler = asyncHandler(async (req: Request, res: Response) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(503).json({
      error: 'Supabase not configured',
    })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })

  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items (*)
    `)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching orders:', error)
    return res.status(500).json({ error: error.message, data: [] })
  }

  return res.json({ data: data || [] })
})

/**
 * GET /api/admin/data/customers
 * Get all customers with stats (admin only)
 */
export const getCustomersHandler = asyncHandler(async (req: Request, res: Response) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(503).json({
      error: 'Supabase not configured',
    })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })

  // Get all profiles
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })

  if (profilesError) {
    console.error('Error fetching profiles:', profilesError)
    return res.status(500).json({ error: profilesError.message, data: [] })
  }

  // Get orders for statistics
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('user_id, total, created_at, status, payment_status')

  if (ordersError) {
    console.error('Error fetching orders for stats:', ordersError)
    return res.status(500).json({ error: ordersError.message, data: [] })
  }

  // Calculate statistics for each customer
  const customers = (profiles || []).map((profile: any) => {
    const userOrders = (orders || []).filter((o: any) => o.user_id === profile.id && isRevenueOrder(o))
    const totalOrders = userOrders.length
    const totalSpent = userOrders.reduce((sum: number, o: any) => sum + Number(o.total || 0), 0)
    const lastOrder = userOrders.length > 0 
      ? new Date(Math.max(...userOrders.map((o: any) => new Date(o.created_at).getTime())))
      : null
    
    // Customer is active if:
    // 1. They have orders in last 90 days, OR
    // 2. They signed up recently (within last 30 days) - new customers are considered active
    const profileCreatedAt = new Date(profile.created_at)
    const daysSinceSignup = (Date.now() - profileCreatedAt.getTime()) / (1000 * 60 * 60 * 24)
    const isNewCustomer = daysSinceSignup < 30
    
    const hasRecentOrder = lastOrder 
      ? (Date.now() - lastOrder.getTime()) < 90 * 24 * 60 * 60 * 1000
      : false
    
    const isActive = hasRecentOrder || isNewCustomer

    return {
      id: profile.id,
      name: profile.name || profile.email || 'Unknown',
      email: profile.email || '',
      phone: null,
      whatsapp: profile.whatsapp || null,
      joinDate: profile.created_at.split('T')[0],
      totalOrders,
      totalSpent: Number(totalSpent.toFixed(2)),
      status: isActive ? 'Active' : 'Inactive',
    }
  })

  return res.json({ data: customers || [] })
})

/**
 * GET /api/admin/data/messages
 * Get all messages (admin only)
 */
export const getMessagesHandler = asyncHandler(async (req: Request, res: Response) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(503).json({
      error: 'Supabase not configured',
    })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching messages:', error)
    return res.status(500).json({ error: error.message, data: [] })
  }

  return res.json({ data: data || [] })
})

/**
 * GET /api/admin/data/orders/:id
 * Get single order by ID (admin only, uses service role)
 */
export const getOrderByIdHandler = asyncHandler(async (req: Request, res: Response) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(503).json({
      error: 'Supabase not configured',
    })
  }

  const { id } = req.params
  if (!id) {
    return res.status(400).json({ error: 'Order ID is required' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })

  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items (*)
    `)
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching order:', error)
    return res.status(404).json({ error: error.message || 'Order not found' })
  }

  return res.json({ data })
})

/**
 * GET /api/admin/data/stats
 * Get dashboard statistics (admin only)
 */
// Products sharing another product's stock are the same physical part, so they
// are not counted as products of their own. Falls back to every product until
// the shared-stock migration has added stock_source_id.
async function countMainProducts(supabase: any) {
  const main = await supabase.from('products').select('id', { count: 'exact', head: true }).is('stock_source_id', null)
  if (!main.error) return main
  return supabase.from('products').select('id', { count: 'exact', head: true })
}

// PostgREST caps a select at 1000 rows, which would silently undercount stock.
// products(*) rather than a column list so stock_source_id is read when the
// shared-stock migration exists, without breaking the query before it does.
async function loadAllStockRows(supabase: any) {
  const data: any[] = []
  for (let offset = 0; ; offset += 1000) {
    const page = await supabase.from('inv_stock').select('quantity, products (*)').order('id').range(offset, offset + 999)
    if (page.error) return { data, error: page.error }
    data.push(...(page.data || []))
    if (!page.data || page.data.length < 1000) break
  }
  return { data, error: null }
}

export const getStatsHandler = asyncHandler(async (req: Request, res: Response) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(503).json({
      error: 'Supabase not configured',
    })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })

  // Fetch all data in parallel
  const [ordersResult, posSalesResult, productsResult, profilesResult, invCustomersResult, stockResult] = await Promise.all([
    supabase.from('orders').select('total, created_at, status, payment_status'),
    supabase.from('inv_sales').select('net_amount, created_at'),
    countMainProducts(supabase),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('inv_customers').select('id', { count: 'exact', head: true }),
    loadAllStockRows(supabase)
  ])

  const orders = (ordersResult.data || []).filter(isRevenueOrder)
  const posSales = posSalesResult.data || []
  const totalProducts = productsResult.count || 0
  const websiteCustomersCount = profilesResult.count || 0
  const shopCustomersCount = invCustomersResult.count || 0
  const totalCustomers = websiteCustomersCount + shopCustomersCount
  // A product sharing another product's stock holds the same units, so only the
  // main product of each group is counted.
  const stockRows = (stockResult.data || []).filter((s: any) => {
    const product = Array.isArray(s.products) ? s.products[0] : s.products
    return !product?.stock_source_id
  })
  const totalQuantity = stockRows.reduce((sum: number, s: any) => sum + toNumber(s.quantity), 0)
  const shopStockValue = stockRows.reduce((sum: number, s: any) => {
    const product = Array.isArray(s.products) ? s.products[0] : s.products
    return sum + Math.max(toNumber(s.quantity), 0) * getStockUnitValue(product)
  }, 0)

  const webRevenue = orders.reduce((sum: number, o: any) => sum + Number(o.total || 0), 0)
  const posRevenue = posSales.reduce((sum: number, s: any) => sum + Number(s.net_amount || 0), 0)
  const totalRevenue = webRevenue + posRevenue

  return res.json({
    data: {
      totalRevenue,
      webRevenue,
      posRevenue,
      totalOrders: orders.length + posSales.length,
      webOrdersCount: orders.length,
      posOrdersCount: posSales.length,
      shopStockValue,
      totalProducts,
      totalQuantity,
      totalCustomers,
      websiteCustomersCount,
      shopCustomersCount,
    }
  })
})
