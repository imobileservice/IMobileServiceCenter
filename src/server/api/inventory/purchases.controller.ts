import { Router, Request, Response } from 'express'
import { getSupabaseAdmin } from './supabase-admin'

const router = Router()

// POST /api/inventory/purchases - Process purchase (TRANSACTIONAL via RPC)
router.post('/', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { supplier_id, supplier_name, notes, created_by, items } = req.body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' })
    }

    for (const item of items) {
      if (!item.product_id || !item.quantity || !item.cost_price) {
        return res.status(400).json({ error: 'Each item must have product_id, quantity, and cost_price' })
      }
    }

    const { data, error } = await supabase.rpc('process_purchase', {
      p_supplier_id: supplier_id || null,
      p_supplier_name: supplier_name || null,
      p_notes: notes || null,
      p_created_by: created_by || 'admin',
      p_items: items,
    })

    if (error) throw error

    res.status(201).json({ data })
  } catch (error: any) {
    console.error('[Inventory Purchases] POST error:', error)
    res.status(500).json({ error: error.message })
  }
})

// GET /api/inventory/purchases - List purchases
router.get('/', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('inv_purchases')
      .select(`
        *,
        inv_purchase_items (
          id, product_id, product_name, quantity, cost_price, total_cost
        )
      `)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) throw error

    res.json({ data })
  } catch (error: any) {
    console.error('[Inventory Purchases] GET error:', error)
    res.status(500).json({ error: error.message })
  }
})

// GET /api/inventory/purchases/:id - Get single purchase
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('inv_purchases')
      .select(`
        *,
        inv_purchase_items (
          id, product_id, product_name, quantity, cost_price, total_cost
        ),
        inv_suppliers (
          id, name, phone, email
        )
      `)
      .eq('id', req.params.id)
      .single()

    if (error) throw error

    res.json({ data })
  } catch (error: any) {
    console.error('[Inventory Purchases] GET/:id error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
