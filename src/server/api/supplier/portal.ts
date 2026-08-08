import { Response } from 'express'
import { getSupabaseAdmin } from '../inventory/supabase-admin'
import {
  accumulate,
  buildStockItem,
  emptyTotals,
  fetchStockRows,
  fetchSupplierLinks,
} from '../inventory/restock.shared'
import { SupplierRequest } from './auth'

const VALID_STATUSES = new Set(['pending', 'can_supply', 'unavailable'])

/**
 * GET /api/supplier/restock
 *
 * What this supplier is being asked for: their assigned products, which are out,
 * which are low, how many units are wanted, and what they last answered.
 *
 * The supplier id comes from req.supplier (the session), never from the query
 * string - see requireSupplier. Only products linked to them are ever read, so
 * there is no way to widen this to the rest of the catalogue.
 */
export async function supplierRestockHandler(req: SupplierRequest, res: Response) {
  try {
    const supplierId = req.supplier!.id
    const supabase = getSupabaseAdmin()

    const links = await fetchSupplierLinks(supabase, supplierId)

    if (links === null) {
      // supplier_management.sql has not been run on this database.
      return res.json({ data: [], totals: emptyTotals(), migration_required: true })
    }

    if (links.length === 0) {
      return res.json({ data: [], totals: emptyTotals(), migration_required: false })
    }

    const productIds = links.map((link: any) => link.product_id)
    const linkByProduct = new Map(links.map((link: any) => [link.product_id, link]))

    const [stockRows, responsesResult] = await Promise.all([
      fetchStockRows(supabase, productIds),
      supabase
        .from('inv_supplier_responses')
        .select('product_id, status, available_qty, expected_date, note, responded_at')
        .eq('supplier_id', supplierId),
    ])

    const responseByProduct = new Map(
      (responsesResult.data || []).map((row: any) => [row.product_id, row])
    )

    const totals = emptyTotals()
    const items = stockRows.map((stock: any) => {
      const item = buildStockItem(stock, linkByProduct.get(stock.product_id))
      accumulate(totals, item)
      const response: any = responseByProduct.get(stock.product_id)
      return {
        ...item,
        // A supplier has no business seeing what the product sells for in the
        // shop, or what it costs from anyone else. Their own agreed price stays.
        unit_cost: undefined,
        estimated_cost: undefined,
        my_price: item.supplier_cost_price,
        response: response
          ? {
              status: response.status,
              available_qty: response.available_qty,
              expected_date: response.expected_date,
              note: response.note,
              responded_at: response.responded_at,
            }
          : null,
      }
    })

    // Out of stock first, then the biggest gaps - same order as the admin view.
    items.sort((a: any, b: any) => {
      const rank = (s: string) => (s === 'out' ? 0 : s === 'low' ? 1 : 2)
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status)
      return b.needed_qty - a.needed_qty
    })

    return res.json({
      data: items,
      totals: { ...totals, estimated_cost: undefined },
      supplier: req.supplier,
      migration_required: false,
    })
  } catch (error: any) {
    console.error('[Supplier] restock error:', error)
    return res.status(500).json({ error: error.message || 'Could not load your product list' })
  }
}

/**
 * POST /api/supplier/respond
 * Body: { product_id, status, available_qty?, expected_date?, note? }
 *
 * Records "can supply" / "not available" against one line. Upserted on
 * (supplier_id, product_id) so a supplier can change their answer.
 */
export async function supplierRespondHandler(req: SupplierRequest, res: Response) {
  try {
    const supplierId = req.supplier!.id
    const { product_id, status, available_qty, expected_date, note } = req.body || {}

    if (!product_id) return res.status(400).json({ error: 'product_id is required' })
    if (!VALID_STATUSES.has(status)) {
      return res.status(400).json({ error: 'status must be pending, can_supply or unavailable' })
    }

    const supabase = getSupabaseAdmin()

    // The product must already be assigned to this supplier. Without this check
    // a supplier could post a reply against any product id in the catalogue.
    const { data: link } = await supabase
      .from('inv_supplier_products')
      .select('id')
      .eq('supplier_id', supplierId)
      .eq('product_id', product_id)
      .maybeSingle()

    if (!link) {
      return res.status(403).json({ error: 'This product is not assigned to you' })
    }

    const qty =
      available_qty === undefined || available_qty === null || available_qty === ''
        ? null
        : Math.max(0, Math.trunc(Number(available_qty) || 0))

    const { data, error } = await supabase
      .from('inv_supplier_responses')
      .upsert(
        {
          supplier_id: supplierId,
          product_id,
          status,
          available_qty: status === 'unavailable' ? null : qty,
          expected_date: status === 'unavailable' ? null : expected_date || null,
          note: note ? String(note).slice(0, 500) : null,
          responded_at: new Date().toISOString(),
        },
        { onConflict: 'supplier_id,product_id' }
      )
      .select('product_id, status, available_qty, expected_date, note, responded_at')
      .single()

    if (error) throw error

    return res.json({ success: true, data })
  } catch (error: any) {
    console.error('[Supplier] respond error:', error)
    return res.status(500).json({ error: error.message || 'Could not save your reply' })
  }
}
