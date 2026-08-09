import { Router, Request, Response } from 'express'
import { getSupabaseAdmin } from './supabase-admin'
import { isMissingSchema } from './restock.shared'

/**
 * Orders the shops we supply placed for themselves in /supplier.
 *
 * Mounted at /api/inventory/supplier-orders rather than hung off the suppliers
 * router, where a literal path like "shop-orders" has to be declared above
 * GET /:id or it gets swallowed as a supplier id.
 */
const router = Router()

const VALID_STATUSES = ['pending', 'confirmed', 'ready', 'completed', 'cancelled'] as const
type OrderStatus = (typeof VALID_STATUSES)[number]

const ORDER_SELECT = `
  id, order_number, supplier_id, supplier_name, status, item_count, total_qty,
  note, admin_note, contact_phone, handled_by, handled_at, created_at, updated_at,
  inv_supplier_order_items (id, product_id, product_name, barcode, quantity, was_in_stock)
`

const migrationPayload = {
  data: [],
  totals: { total: 0, pending: 0, confirmed: 0, ready: 0, completed: 0, cancelled: 0, pending_units: 0 },
  migration_required: true,
}

const shapeOrder = (order: any) => ({
  ...order,
  items: order.inv_supplier_order_items || [],
  inv_supplier_order_items: undefined,
})

// GET /api/inventory/supplier-orders?status=&supplier_id=&search=&limit=
router.get('/', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { status, supplier_id, search, limit } = req.query

    let query = supabase
      .from('inv_supplier_orders')
      .select(ORDER_SELECT)
      .order('created_at', { ascending: false })
      .limit(Math.min(Number(limit) || 200, 500))

    if (typeof status === 'string' && VALID_STATUSES.includes(status as OrderStatus)) {
      query = query.eq('status', status)
    }
    if (typeof supplier_id === 'string' && supplier_id.trim()) {
      query = query.eq('supplier_id', supplier_id.trim())
    }
    if (typeof search === 'string' && search.trim()) {
      const term = search.trim()
      query = query.or(`order_number.ilike.%${term}%,supplier_name.ilike.%${term}%`)
    }

    const { data, error } = await query

    if (error) {
      // The migration is pending. An empty list keeps the page usable instead of
      // showing an error the admin cannot act on from here.
      if (isMissingSchema(error)) return res.json(migrationPayload)
      throw error
    }

    const orders = (data || []).map(shapeOrder)

    /*
     * Counters are read separately rather than derived from `orders`: the list
     * above is filtered and capped, so counting it would report "3 pending" the
     * moment someone filters to completed.
     */
    const { data: statusRows, error: statusError } = await supabase
      .from('inv_supplier_orders')
      .select('status, total_qty')

    if (statusError && !isMissingSchema(statusError)) throw statusError

    const totals = { ...migrationPayload.totals, total: 0 }
    for (const row of statusRows || []) {
      totals.total += 1
      if (row.status in totals) (totals as any)[row.status] += 1
      if (row.status === 'pending') totals.pending_units += Number(row.total_qty || 0)
    }

    res.json({ data: orders, totals, migration_required: false })
  } catch (error: any) {
    console.error('[Supplier Orders] GET error:', error)
    res.status(500).json({ error: error.message })
  }
})

// GET /api/inventory/supplier-orders/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('inv_supplier_orders')
      .select(ORDER_SELECT)
      .eq('id', req.params.id)
      .maybeSingle()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Order not found' })

    res.json({ data: shapeOrder(data) })
  } catch (error: any) {
    console.error('[Supplier Orders] GET/:id error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * PUT /api/inventory/supplier-orders/:id
 * Body: { status?, admin_note?, handled_by? }
 *
 * Moves an order along. Stock is deliberately not touched here - the goods
 * leave through the POS, and decrementing twice is worse than tracking it once.
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { status, admin_note, handled_by } = req.body || {}
    const updates: Record<string, any> = {}

    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Status must be one of: ${VALID_STATUSES.join(', ')}` })
      }
      updates.status = status
      updates.handled_at = new Date().toISOString()
      if (handled_by) updates.handled_by = String(handled_by).slice(0, 120)
    }

    if (admin_note !== undefined) updates.admin_note = admin_note ? String(admin_note).slice(0, 1000) : null

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Nothing to update' })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('inv_supplier_orders')
      .update(updates)
      .eq('id', req.params.id)
      .select(ORDER_SELECT)
      .maybeSingle()

    if (error) {
      if (isMissingSchema(error)) {
        return res.status(503).json({ error: 'Run supabase/migrations/20260809_supplier_shop_orders.sql first' })
      }
      throw error
    }
    if (!data) return res.status(404).json({ error: 'Order not found' })

    res.json({ data: shapeOrder(data) })
  } catch (error: any) {
    console.error('[Supplier Orders] PUT error:', error)
    res.status(500).json({ error: error.message })
  }
})

// DELETE /api/inventory/supplier-orders/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { error } = await supabase.from('inv_supplier_orders').delete().eq('id', req.params.id)
    if (error) throw error
    res.json({ success: true })
  } catch (error: any) {
    console.error('[Supplier Orders] DELETE error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
