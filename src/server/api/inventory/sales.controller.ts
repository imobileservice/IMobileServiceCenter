import { Router, Request, Response } from 'express'
import { getSupabaseAdmin } from './supabase-admin'

const router = Router()

// POST /api/inventory/sales - Process a sale (TRANSACTIONAL via RPC)
router.post('/', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const {
      customer_id,
      customer_name,
      payment_method,
      source,
      discount,
      tax,
      notes,
      created_by,
      items,
    } = req.body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' })
    }

    // Validate items
    for (const item of items) {
      if (!item.product_id || !item.quantity || !item.price) {
        return res.status(400).json({ error: 'Each item must have product_id, quantity, and price' })
      }
      if (item.quantity <= 0) {
        return res.status(400).json({ error: 'Item quantity must be positive' })
      }
    }

    // Call the transactional RPC function
    const { data, error } = await supabase.rpc('process_sale', {
      p_customer_id: customer_id || null,
      p_customer_name: customer_name || 'Walk-in Customer',
      p_payment_method: payment_method || 'cash',
      p_source: source || 'pos',
      p_discount: Number(discount || 0),
      p_tax: Number(tax || 0),
      p_notes: notes || null,
      p_created_by: created_by || 'cashier',
      p_items: items,
    })

    if (error) {
      console.error('[Sales] RPC process_sale error:', error)
      // Check if it's a stock error
      if (error.message?.includes('Insufficient stock')) {
        return res.status(400).json({ error: error.message })
      }
      throw error
    }

    res.status(201).json({ data })
  } catch (error: any) {
    console.error('[Inventory Sales] POST error:', error)
    res.status(500).json({ error: error.message })
  }
})

// GET /api/inventory/sales - List sales
router.get('/', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { from_date, to_date, source, payment_method, limit: queryLimit } = req.query

    let query = supabase
      .from('inv_sales')
      .select(`
        *,
        inv_sale_items (
          id, product_id, product_name, quantity, unit_price, total_price
        )
      `)
      .order('created_at', { ascending: false })
      .limit(Number(queryLimit) || 100)

    if (from_date && typeof from_date === 'string') {
      query = query.gte('created_at', from_date)
    }
    if (to_date && typeof to_date === 'string') {
      query = query.lte('created_at', to_date)
    }
    if (source && typeof source === 'string') {
      query = query.eq('source', source)
    }
    if (payment_method && typeof payment_method === 'string') {
      query = query.eq('payment_method', payment_method)
    }

    const { data, error } = await query

    if (error) throw error

    res.json({ data })
  } catch (error: any) {
    console.error('[Inventory Sales] GET error:', error)
    res.status(500).json({ error: error.message })
  }
})

// GET /api/inventory/sales/invoice/:invoice_number - Get single sale by barcode/invoice number
router.get('/invoice/:invoice_number', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('inv_sales')
      .select(`
        *,
        inv_sale_items (
          id, product_id, product_name, quantity, unit_price, total_price
        ),
        inv_customers (
          id, name, phone, email
        )
      `)
      .eq('invoice_number', req.params.invoice_number)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Invoice not found' })
      }
      throw error
    }

    res.json({ data })
  } catch (error: any) {
    console.error('[Inventory Sales] GET/invoice/:invoice_number error:', error)
    res.status(500).json({ error: error.message })
  }
})

// GET /api/inventory/sales/:id - Get single sale with items
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('inv_sales')
      .select(`
        *,
        inv_sale_items (
          id, product_id, product_name, quantity, unit_price, total_price
        ),
        inv_customers (
          id, name, phone, email
        )
      `)
      .eq('id', req.params.id)
      .single()

    if (error) throw error

    res.json({ data })
  } catch (error: any) {
    console.error('[Inventory Sales] GET/:id error:', error)
    res.status(500).json({ error: error.message })
  }
})

// GET /api/inventory/sales/today/summary - Today's summary
router.get('/today/summary', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString()

    const { data, error } = await supabase
      .from('inv_sales')
      .select('id, net_amount, payment_method, source')
      .gte('created_at', todayStr)

    if (error) throw error

    const sales = data || []
    const totalSales = sales.length
    const totalRevenue = sales.reduce((sum: number, s: any) => sum + Number(s.net_amount || 0), 0)
    const cashSales = sales.filter((s: any) => s.payment_method === 'cash').length
    const cardSales = sales.filter((s: any) => s.payment_method === 'card').length
    const posSales = sales.filter((s: any) => s.source === 'pos').length
    const webSales = sales.filter((s: any) => s.source === 'website').length

    res.json({
      data: {
        total_sales: totalSales,
        total_revenue: totalRevenue,
        cash_sales: cashSales,
        card_sales: cardSales,
        pos_sales: posSales,
        web_sales: webSales,
      }
    })
  } catch (error: any) {
    console.error('[Inventory Sales] Today summary error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
