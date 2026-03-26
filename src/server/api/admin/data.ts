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
    .select('user_id, total, created_at')

  if (ordersError) {
    console.error('Error fetching orders for stats:', ordersError)
    return res.status(500).json({ error: ordersError.message, data: [] })
  }

  // Calculate statistics for each customer
  const customers = (profiles || []).map((profile: any) => {
    const userOrders = (orders || []).filter((o: any) => o.user_id === profile.id)
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
  const [ordersResult, productsResult, profilesResult] = await Promise.all([
    supabase.from('orders').select('total, created_at'),
    supabase.from('products').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
  ])

  const orders = ordersResult.data || []
  const totalProducts = productsResult.count || 0
  const totalCustomers = profilesResult.count || 0

  const revenue = orders.reduce((sum: number, o: any) => sum + Number(o.total || 0), 0)

  return res.json({
    data: {
      totalRevenue: revenue,
      totalOrders: orders.length,
      totalProducts,
      totalCustomers,
    }
  })
})

