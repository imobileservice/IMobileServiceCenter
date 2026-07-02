import { Router, Request, Response } from 'express'
import { getSupabaseAdmin } from './supabase-admin'
import crypto from 'crypto'

const router = Router()

function hashSecret(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

async function resolveOpenPosSession(supabase: any, sessionId?: string, sessionToken?: string) {
  if (!sessionId && !sessionToken) {
    return null
  }

  if (!sessionId || !sessionToken) {
    throw Object.assign(new Error('POS till session id and token are required'), { statusCode: 401 })
  }

  const { data: session, error } = await supabase
    .from('pos_till_sessions')
    .select('id, till_id, cashier_email, cashier_name, role, shop, status, session_token_hash')
    .eq('id', sessionId)
    .single()

  if (error || !session || session.status !== 'open' || session.session_token_hash !== hashSecret(String(sessionToken))) {
    throw Object.assign(new Error('Invalid or closed POS till session'), { statusCode: 401 })
  }

  return session
}

// POST /api/inventory/sales - Process a sale (TRANSACTIONAL via RPC)
router.post('/', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const {
      customer_id,
      customer_name,
      customer_phone,
      payment_method,
      source,
      discount,
      tax,
      notes,
      created_by,
      pos_session_id,
      pos_session_token,
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

    const posSession = await resolveOpenPosSession(supabase, pos_session_id, pos_session_token)

    const rpcArgs: any = {
      p_customer_id: customer_id || null,
      p_customer_name: customer_name || 'Walk-in Customer',
      p_customer_phone: customer_phone || null,
      p_payment_method: payment_method || 'cash',
      p_source: source || 'pos',
      p_discount: Number(discount || 0),
      p_tax: Number(tax || 0),
      p_notes: notes || null,
      p_created_by: posSession?.cashier_email || created_by || 'cashier',
      p_items: items,
      p_shop: posSession?.shop || req.body.shop || 'Meegoda',
    }

    if (posSession) {
      rpcArgs.p_pos_session_id = posSession.id
    }

    // Call the transactional RPC function
    const { data, error } = await supabase.rpc('process_sale', rpcArgs)

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
    res.status(error.statusCode || 500).json({ error: error.message })
  }
})

// GET /api/inventory/sales - List sales
router.get('/', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { from_date, to_date, source, payment_method, shop, limit: queryLimit } = req.query

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
    if (shop && typeof shop === 'string') {
      query = query.eq('shop', shop)
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

// DELETE /api/inventory/sales/:id - Delete a sale history record
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { id } = req.params

    const { data: sale, error: fetchError } = await supabase
      .from('inv_sales')
      .select('id, invoice_number')
      .eq('id', id)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Sale not found' })
      }
      throw fetchError
    }

    const { error } = await supabase
      .from('inv_sales')
      .delete()
      .eq('id', id)

    if (error) throw error

    res.json({ success: true, data: sale })
  } catch (error: any) {
    console.error('[Inventory Sales] DELETE/:id error:', error)
    res.status(500).json({ error: error.message })
  }
})

// GET /api/inventory/sales/today/summary - Today's summary
router.get('/today/summary', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { shop } = req.query
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString()

    let query = supabase
      .from('inv_sales')
      .select('id, net_amount, payment_method, source, shop')
      .gte('created_at', todayStr)

    if (shop && typeof shop === 'string') {
      query = query.eq('shop', shop)
    }

    const { data, error } = await query

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

// POST /api/inventory/sales/return - Process a return (good or damaged)
router.post('/return', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { invoice_number, product_id, quantity, condition, notes, created_by, pos_session_id, pos_session_token } = req.body

    if (!invoice_number || !product_id || !quantity || !condition) {
      return res.status(400).json({ error: 'invoice_number, product_id, quantity, and condition are required' })
    }

    if (condition !== 'good' && condition !== 'damaged') {
      return res.status(400).json({ error: 'condition must be "good" or "damaged"' })
    }

    const posSession = await resolveOpenPosSession(supabase, pos_session_id, pos_session_token)
    const sessionNote = posSession ? `POS session ${posSession.id}` : null

    const { data, error } = await supabase.rpc('process_return', {
      p_invoice_number: invoice_number,
      p_product_id: product_id,
      p_quantity: Number(quantity),
      p_condition: condition,
      p_notes: [notes, sessionNote].filter(Boolean).join(' | ') || null,
      p_created_by: posSession?.cashier_email || created_by || 'cashier',
    })

    if (error) {
      console.error('[Sales Return] RPC process_return error:', error)
      return res.status(400).json({ error: error.message })
    }

    res.status(200).json({ data })
  } catch (error: any) {
    console.error('[Inventory Sales Return] POST error:', error)
    res.status(error.statusCode || 500).json({ error: error.message })
  }
})

export default router
