import { Response } from 'express'
import { getSupabaseAdmin } from '../inventory/supabase-admin'
import { SupplierRequest } from './auth'
import {
  fetchAllowedCategoryIds,
  getDisplayName,
  isMissingSchema,
  PRODUCT_SELECT,
  resolveQuantity,
} from './shop.shared'

const MAX_LINES = 100
const MAX_QTY = 9999

const migrationMessage = 'Ordering is not set up yet. Please contact IMobile Service Center.'

/**
 * POST /api/supplier/orders
 * Body: { items: [{ product_id, quantity }], note?, contact_phone? }
 *
 * Places an order without anyone having to be phoned. Every line is re-checked
 * here against the shop's own category list and against live stock: the browser
 * decides what to show, this decides what is allowed, and the two are not the
 * same thing.
 */
export async function createSupplierOrderHandler(req: SupplierRequest, res: Response) {
  try {
    const supplier = req.supplier!
    const { items, note, contact_phone } = req.body || {}

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Add at least one product to your order' })
    }
    if (items.length > MAX_LINES) {
      return res.status(400).json({ error: `An order can hold at most ${MAX_LINES} products` })
    }

    // Same product twice in one payload would otherwise become two lines that
    // each pass the stock check on their own.
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

    const allowed = await fetchAllowedCategoryIds(supabase, supplier.id)
    if (allowed === null) return res.status(503).json({ error: migrationMessage })
    if (allowed.length === 0) {
      return res.status(403).json({ error: 'No products have been made available to your shop yet' })
    }

    const allowedSet = new Set(allowed)
    const productIds = Array.from(wanted.keys())

    const { data: products, error: productsError } = await supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .in('id', productIds)

    if (productsError) throw productsError

    const productById = new Map((products || []).map((product: any) => [product.id, product]))

    const rows: any[] = []
    for (const [productId, quantity] of wanted) {
      const product: any = productById.get(productId)

      // One message for "does not exist" and "not in your categories" alike:
      // a shop probing ids should not be able to tell the two apart.
      if (!product || !allowedSet.has(product.category_id)) {
        return res.status(403).json({ error: 'One of those products is not available to your shop' })
      }

      if (resolveQuantity(product) <= 0) {
        return res.status(409).json({
          error: `"${getDisplayName(product)}" has just gone out of stock. Please remove it and try again.`,
          product_id: productId,
        })
      }

      rows.push({
        product_id: product.id,
        product_name: getDisplayName(product),
        barcode: product.barcode || null,
        quantity,
        was_in_stock: true,
      })
    }

    const { data: order, error: orderError } = await supabase
      .from('inv_supplier_orders')
      .insert({
        supplier_id: supplier.id,
        supplier_name: supplier.name,
        status: 'pending',
        item_count: rows.length,
        total_qty: rows.reduce((sum, row) => sum + row.quantity, 0),
        note: note ? String(note).slice(0, 1000) : null,
        contact_phone: contact_phone ? String(contact_phone).slice(0, 40) : null,
      })
      .select('id, order_number, status, item_count, total_qty, note, created_at')
      .single()

    if (orderError) {
      if (isMissingSchema(orderError)) return res.status(503).json({ error: migrationMessage })
      throw orderError
    }

    const { error: itemsError } = await supabase
      .from('inv_supplier_order_items')
      .insert(rows.map((row) => ({ ...row, order_id: order.id })))

    if (itemsError) {
      // An order with no lines is worse than no order: it shows up in the admin
      // panel as something to fulfil and there is nothing to fulfil.
      await supabase.from('inv_supplier_orders').delete().eq('id', order.id)
      throw itemsError
    }

    console.log(`[Supplier] 🛒 Order ${order.order_number} from ${supplier.name} (${rows.length} lines)`)

    return res.status(201).json({ success: true, data: { ...order, items: rows } })
  } catch (error: any) {
    console.error('[Supplier] create order error:', error)
    return res.status(500).json({ error: error.message || 'Could not place your order' })
  }
}

/** GET /api/supplier/orders - this shop's own order history, newest first. */
export async function listSupplierOrdersHandler(req: SupplierRequest, res: Response) {
  try {
    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase
      .from('inv_supplier_orders')
      .select(
        'id, order_number, status, item_count, total_qty, note, admin_note, created_at, updated_at, inv_supplier_order_items (id, product_name, barcode, quantity)'
      )
      .eq('supplier_id', req.supplier!.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      if (isMissingSchema(error)) return res.json({ data: [], migration_required: true })
      throw error
    }

    const orders = (data || []).map((order: any) => ({
      ...order,
      items: order.inv_supplier_order_items || [],
      inv_supplier_order_items: undefined,
    }))

    return res.json({ data: orders, migration_required: false })
  } catch (error: any) {
    console.error('[Supplier] list orders error:', error)
    return res.status(500).json({ error: error.message || 'Could not load your orders' })
  }
}

/**
 * POST /api/supplier/orders/:id/cancel
 *
 * A shop can withdraw an order we have not acted on yet. Scoped to their own
 * supplier_id and to pending only, so neither someone else's order nor one we
 * have already started packing can be pulled out from under us.
 */
export async function cancelSupplierOrderHandler(req: SupplierRequest, res: Response) {
  try {
    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase
      .from('inv_supplier_orders')
      .update({ status: 'cancelled' })
      .eq('id', req.params.id)
      .eq('supplier_id', req.supplier!.id)
      .eq('status', 'pending')
      .select('id, order_number, status')
      .maybeSingle()

    if (error) throw error
    if (!data) {
      return res.status(409).json({ error: 'That order can no longer be cancelled. Please call us.' })
    }

    return res.json({ success: true, data })
  } catch (error: any) {
    console.error('[Supplier] cancel order error:', error)
    return res.status(500).json({ error: error.message || 'Could not cancel that order' })
  }
}
