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

/** Matches the portal's own limits, so a counter order cannot be larger than one a shop could place itself. */
const MAX_LINES = 100
const MAX_QTY = 9999

/*
 * Reads one shop for a counter order, tolerating a database without `town`.
 * Newest select first, narrowed on failure.
 */
const SUPPLIER_SELECTS = ['id, name, phone, is_active, town', 'id, name, phone, is_active', 'id, name, phone']

const loadSupplierForOrder = async (supabase: any, id: string) => {
  for (const select of SUPPLIER_SELECTS) {
    const { data, error } = await supabase.from('inv_suppliers').select(select).eq('id', id).maybeSingle()
    if (!error) return data || null
    if (!isMissingSchema(error)) throw error
  }
  return null
}

const ITEM_SELECT = 'inv_supplier_order_items (id, product_id, product_name, barcode, quantity, was_in_stock)'

const BASE_COLUMNS = `
  id, order_number, supplier_id, supplier_name, status, item_count, total_qty,
  note, admin_note, contact_phone, handled_by, handled_at, created_at, updated_at
`

/*
 * Newest first, narrowed on failure - the same trick the supplier session uses,
 * so one server binary serves a database that has or has not had
 * 20260816_supplier_town_and_counter_orders.sql run against it. Without this a
 * missing column would break the admin orders screen, which works fine today.
 */
const ORDER_SELECTS = [
  `${BASE_COLUMNS}, supplier_town, placed_by, ${ITEM_SELECT}`,
  `${BASE_COLUMNS}, ${ITEM_SELECT}`,
]

/**
 * Runs a query against each select in turn, dropping to the older column set
 * when the newer one is not there yet. `build` is called fresh each time
 * because a Supabase query builder cannot be re-run.
 */
const selectTolerantly = async (build: (select: string) => any) => {
  let lastError: any = null
  for (const select of ORDER_SELECTS) {
    const result = await build(select)
    if (!result.error) return result
    lastError = result.error
    if (!isMissingSchema(result.error)) break
  }
  return { data: null, error: lastError }
}

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

    const { data, error } = await selectTolerantly((select) => {
      let query = supabase
        .from('inv_supplier_orders')
        .select(select)
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

      return query
    })

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

/**
 * POST /api/inventory/supplier-orders
 * Body: { supplier_id, items: [{ product_id, quantity }], note?, placed_by? }
 *
 * An order placed at the counter for one of the shops we supply, for when they
 * phone or walk in rather than using the portal. It lands in exactly the same
 * table as a portal order, so there is one queue to work through, not two;
 * `placed_by` is what tells them apart afterwards.
 *
 * Two deliberate differences from the portal's own POST /api/supplier/orders:
 * the shop's category list is not enforced (staff order what the shop asks for,
 * not what a list allows), and an out-of-stock line is accepted rather than
 * refused - it is recorded with was_in_stock false so the packer can see it.
 *
 * There is no way to create a supplier here. An id that is not already on file
 * is rejected, so the till can never quietly add a shop to the books.
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { supplier_id, items, note, placed_by, contact_phone } = req.body || {}

    if (!supplier_id || typeof supplier_id !== 'string') {
      return res.status(400).json({ error: 'Choose which shop this order is for' })
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Add at least one product to the order' })
    }
    if (items.length > MAX_LINES) {
      return res.status(400).json({ error: `An order can hold at most ${MAX_LINES} products` })
    }

    // The same product twice would otherwise become two lines on one slip.
    const wanted = new Map<string, number>()
    for (const line of items) {
      const productId = line?.product_id
      const quantity = Math.trunc(Number(line?.quantity))
      if (!productId || typeof productId !== 'string') {
        return res.status(400).json({ error: 'Every line needs a product' })
      }
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_QTY) {
        return res.status(400).json({ error: `Quantity must be between 1 and ${MAX_QTY}` })
      }
      wanted.set(productId, (wanted.get(productId) || 0) + quantity)
    }

    const supabase = getSupabaseAdmin()

    // Registered shops only. Selecting from a list in the browser is a
    // convenience; this is the part that actually enforces it.
    const supplier = await loadSupplierForOrder(supabase, supplier_id)
    if (!supplier) return res.status(404).json({ error: 'That shop is not on file' })
    if (supplier.is_active === false) {
      return res.status(409).json({ error: `${supplier.name} is marked inactive` })
    }

    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, barcode, stock, specs')
      .in('id', Array.from(wanted.keys()))

    if (productsError) throw productsError

    const productById = new Map((products || []).map((product: any) => [product.id, product]))

    const rows: any[] = []
    for (const [productId, quantity] of wanted) {
      const product: any = productById.get(productId)
      if (!product) return res.status(400).json({ error: 'One of those products no longer exists' })

      const model = product.specs?.model
      const displayName = model && !String(product.name).includes(model) ? `${product.name} (${model})` : product.name

      rows.push({
        product_id: product.id,
        product_name: displayName,
        barcode: product.barcode || null,
        quantity,
        was_in_stock: Number(product.stock || 0) > 0,
      })
    }

    const orderPayload: any = {
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      supplier_town: supplier.town || null,
      placed_by: placed_by ? String(placed_by).slice(0, 120) : 'counter',
      status: 'pending',
      item_count: rows.length,
      total_qty: rows.reduce((sum, row) => sum + row.quantity, 0),
      note: note ? String(note).slice(0, 1000) : null,
      contact_phone: contact_phone ? String(contact_phone).slice(0, 40) : supplier.phone || null,
    }

    let { data: order, error: orderError } = await supabase
      .from('inv_supplier_orders')
      .insert(orderPayload)
      .select('id')
      .single()

    // A database still missing the two new columns: the order is worth more
    // than the extra fields, so place it without them.
    if (orderError && isMissingSchema(orderError)) {
      delete orderPayload.supplier_town
      delete orderPayload.placed_by
      ;({ data: order, error: orderError } = await supabase
        .from('inv_supplier_orders')
        .insert(orderPayload)
        .select('id')
        .single())
    }

    if (orderError) {
      if (isMissingSchema(orderError)) {
        return res.status(503).json({ error: 'Run supabase/migrations/20260809_supplier_shop_orders.sql first' })
      }
      throw orderError
    }

    const { error: itemsError } = await supabase
      .from('inv_supplier_order_items')
      .insert(rows.map((row) => ({ ...row, order_id: order!.id })))

    if (itemsError) {
      // An order with no lines shows up as something to fulfil with nothing to
      // fulfil - worse than no order at all.
      await supabase.from('inv_supplier_orders').delete().eq('id', order!.id)
      throw itemsError
    }

    const { data: full } = await selectTolerantly((select) =>
      supabase.from('inv_supplier_orders').select(select).eq('id', order!.id).maybeSingle()
    )

    console.log(`[Supplier Orders] 🛒 Counter order for ${supplier.name} by ${orderPayload.placed_by} (${rows.length} lines)`)

    res.status(201).json({ data: full ? shapeOrder(full) : { id: order!.id, items: rows } })
  } catch (error: any) {
    console.error('[Supplier Orders] POST error:', error)
    res.status(500).json({ error: error.message })
  }
})

// GET /api/inventory/supplier-orders/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await selectTolerantly((select) =>
      supabase.from('inv_supplier_orders').select(select).eq('id', req.params.id).maybeSingle()
    )

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

    // The write asks for nothing but the id, and the full row is read back
    // separately. Putting the tolerant select on the update itself would re-run
    // the UPDATE when it retried with the narrower column list.
    const { data: updated, error: updateError } = await supabase
      .from('inv_supplier_orders')
      .update(updates)
      .eq('id', req.params.id)
      .select('id')
      .maybeSingle()

    if (updateError) {
      if (isMissingSchema(updateError)) {
        return res.status(503).json({ error: 'Run supabase/migrations/20260809_supplier_shop_orders.sql first' })
      }
      throw updateError
    }
    if (!updated) return res.status(404).json({ error: 'Order not found' })

    const { data, error } = await selectTolerantly((select) =>
      supabase.from('inv_supplier_orders').select(select).eq('id', req.params.id).maybeSingle()
    )

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
