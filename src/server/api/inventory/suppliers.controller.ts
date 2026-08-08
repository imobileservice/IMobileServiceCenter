import { Router, Request, Response } from 'express'
import { getSupabaseAdmin } from './supabase-admin'
import { hashPassword } from '../utils/password'
import {
  accumulate,
  buildStockItem,
  emptyTotals,
  fetchStockRows,
  fetchSupplierLinks,
  getDisplayName,
  getPrimaryImage,
  isMissingSchema,
  resolveTargetLevel,
  resolveUnitCost,
  STOCK_SELECT_WITH_TARGET,
} from './restock.shared'

const router = Router()

// ─── HELPERS ─────────────────────────────────────────

/*
 * The restock calculation moved to ./restock.shared so the supplier portal
 * (src/server/api/supplier) computes out / low / needed from exactly the same
 * code these admin endpoints use. Nothing about the behaviour changed.
 */

// ─── SUPPLIER LIST ───────────────────────────────────

// GET /api/inventory/suppliers?with_stats=true&search=
router.get('/', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { with_stats, search } = req.query

    let query = supabase.from('inv_suppliers').select('*').order('name', { ascending: true })

    if (search && typeof search === 'string' && search.trim()) {
      const term = search.trim()
      query = query.or(`name.ilike.%${term}%,contact_person.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`)
    }

    const { data: suppliers, error } = await query
    if (error) throw error

    if (with_stats !== 'true') {
      return res.json({ data: suppliers || [] })
    }

    const links = await fetchSupplierLinks(supabase)

    // Last purchase per supplier, for the "last ordered" column
    const { data: purchases } = await supabase
      .from('inv_purchases')
      .select('supplier_id, total_cost, created_at')
      .not('supplier_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(500)

    const purchaseStats = new Map<string, { last_purchase_at: string; purchase_count: number; total_spent: number }>()
    for (const purchase of purchases || []) {
      const existing = purchaseStats.get(purchase.supplier_id)
      if (existing) {
        existing.purchase_count += 1
        existing.total_spent += Number(purchase.total_cost || 0)
      } else {
        purchaseStats.set(purchase.supplier_id, {
          last_purchase_at: purchase.created_at,
          purchase_count: 1,
          total_spent: Number(purchase.total_cost || 0),
        })
      }
    }

    if (links === null) {
      // Migration pending: still return suppliers so the page works.
      return res.json({
        data: (suppliers || []).map((supplier: any) => ({
          ...supplier,
          stats: emptyTotals(),
          ...(purchaseStats.get(supplier.id) || { last_purchase_at: null, purchase_count: 0, total_spent: 0 }),
        })),
        migration_required: true,
      })
    }

    const linkedProductIds = Array.from(new Set<string>(links.map((link: any) => link.product_id as string)))
    const stockRows = await fetchStockRows(supabase, linkedProductIds)
    const stockByProduct = new Map(stockRows.map((row: any) => [row.product_id, row]))

    const data = (suppliers || []).map((supplier: any) => {
      const totals = emptyTotals()
      for (const link of links.filter((l: any) => l.supplier_id === supplier.id)) {
        const stock = stockByProduct.get(link.product_id)
        if (!stock) continue
        accumulate(totals, buildStockItem(stock, link))
      }
      return {
        ...supplier,
        stats: totals,
        ...(purchaseStats.get(supplier.id) || { last_purchase_at: null, purchase_count: 0, total_spent: 0 }),
      }
    })

    res.json({ data })
  } catch (error: any) {
    console.error('[Inventory Suppliers] GET error:', error)
    res.status(500).json({ error: error.message })
  }
})

// ─── RESTOCK OVERVIEW ────────────────────────────────
// Declared before /:id so the literal path wins.

// GET /api/inventory/suppliers/restock-summary?status=all|low|out|needed&supplier_id=&search=
router.get('/restock-summary', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { status, supplier_id, search } = req.query

    const [stockRows, links, suppliersResult, responsesResult] = await Promise.all([
      fetchStockRows(supabase),
      fetchSupplierLinks(supabase),
      supabase.from('inv_suppliers').select('id, name, phone, email, contact_person'),
      // What each supplier answered in their portal. Missing table just means
      // 20260806_supplier_portal.sql has not been run, which is not an error.
      supabase
        .from('inv_supplier_responses')
        .select('supplier_id, product_id, status, available_qty, expected_date, note, responded_at'),
    ])

    if (suppliersResult.error) throw suppliersResult.error
    const suppliers = suppliersResult.data || []
    const supplierById = new Map(suppliers.map((s: any) => [s.id, s]))

    // product_id:supplier_id -> what that supplier replied in their portal
    const responseByKey = new Map(
      (responsesResult.data || []).map((row: any) => [`${row.product_id}:${row.supplier_id}`, row])
    )

    // product_id -> suppliers that can deliver it
    const suppliersByProduct = new Map<string, any[]>()
    const linkByProductSupplier = new Map<string, any>()
    for (const link of links || []) {
      const supplier = supplierById.get(link.supplier_id)
      if (!supplier) continue
      const list = suppliersByProduct.get(link.product_id) || []
      list.push({
        ...supplier,
        reorder_qty: link.reorder_qty,
        cost_price: link.cost_price,
        is_preferred: link.is_preferred,
        response: responseByKey.get(`${link.product_id}:${link.supplier_id}`) || null,
      })
      suppliersByProduct.set(link.product_id, list)
      linkByProductSupplier.set(`${link.product_id}:${link.supplier_id}`, link)
    }

    let items = stockRows.map((stock: any) => {
      const productSuppliers = suppliersByProduct.get(stock.product_id) || []
      const preferredLink =
        supplier_id && typeof supplier_id === 'string'
          ? linkByProductSupplier.get(`${stock.product_id}:${supplier_id}`)
          : productSuppliers.find((s: any) => s.is_preferred)
      const item = buildStockItem(stock, preferredLink)
      return { ...item, suppliers: productSuppliers }
    })

    // Totals are computed on everything that needs attention, before filtering.
    const totals = emptyTotals()
    let unassignedNeeding = 0
    for (const item of items) {
      accumulate(totals, item)
      if (item.status !== 'ok' && item.suppliers.length === 0) unassignedNeeding += 1
    }

    if (supplier_id && typeof supplier_id === 'string') {
      if (supplier_id === 'unassigned') {
        items = items.filter((item: any) => item.suppliers.length === 0)
      } else {
        items = items.filter((item: any) => item.suppliers.some((s: any) => s.id === supplier_id))
      }
    }

    if (status === 'out') items = items.filter((item: any) => item.status === 'out')
    else if (status === 'low') items = items.filter((item: any) => item.status === 'low')
    else if (status === 'needed' || !status) items = items.filter((item: any) => item.status !== 'ok')

    if (search && typeof search === 'string' && search.trim()) {
      const term = search.trim().toLowerCase()
      items = items.filter(
        (item: any) =>
          item.name.toLowerCase().includes(term) ||
          (item.barcode || '').toLowerCase().includes(term) ||
          (item.brand || '').toLowerCase().includes(term)
      )
    }

    // Out of stock first, then the biggest gaps.
    items.sort((a: any, b: any) => {
      const rank = (s: string) => (s === 'out' ? 0 : s === 'low' ? 1 : 2)
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status)
      return b.needed_qty - a.needed_qty
    })

    res.json({
      data: items,
      totals: { ...totals, unassigned: unassignedNeeding, suppliers: suppliers.length },
      migration_required: links === null,
    })
  } catch (error: any) {
    console.error('[Inventory Suppliers] restock-summary error:', error)
    res.status(500).json({ error: error.message })
  }
})

// ─── SUPPLIER PRODUCTS ───────────────────────────────

// GET /api/inventory/suppliers/:id/products
router.get('/:id/products', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const links = await fetchSupplierLinks(supabase, req.params.id)

    if (links === null) {
      return res.json({ data: [], totals: emptyTotals(), migration_required: true })
    }

    const stockRows = await fetchStockRows(supabase, links.map((link: any) => link.product_id))
    const stockByProduct = new Map(stockRows.map((row: any) => [row.product_id, row]))

    const totals = emptyTotals()
    const data = links
      .map((link: any) => {
        const stock = stockByProduct.get(link.product_id)
        if (!stock) return null
        const item = buildStockItem(stock, link)
        accumulate(totals, item)
        return item
      })
      .filter(Boolean)
      .sort((a: any, b: any) => {
        const rank = (s: string) => (s === 'out' ? 0 : s === 'low' ? 1 : 2)
        if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status)
        return a.name.localeCompare(b.name)
      })

    res.json({ data, totals })
  } catch (error: any) {
    console.error('[Inventory Suppliers] GET/:id/products error:', error)
    res.status(500).json({ error: error.message })
  }
})

// POST /api/inventory/suppliers/:id/products - link one or many products
router.post('/:id/products', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { product_ids, items } = req.body

    const rows: any[] = []
    if (Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        if (!item?.product_id) continue
        rows.push({
          supplier_id: req.params.id,
          product_id: item.product_id,
          supplier_sku: item.supplier_sku || null,
          cost_price: item.cost_price === undefined || item.cost_price === null || item.cost_price === '' ? null : Number(item.cost_price),
          reorder_qty: Number(item.reorder_qty || 0),
          lead_time_days: item.lead_time_days === undefined || item.lead_time_days === null || item.lead_time_days === '' ? null : Number(item.lead_time_days),
          is_preferred: Boolean(item.is_preferred),
          notes: item.notes || null,
        })
      }
    } else if (Array.isArray(product_ids)) {
      for (const productId of product_ids) {
        if (productId) rows.push({ supplier_id: req.params.id, product_id: productId })
      }
    }

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Select at least one product to add' })
    }

    const { data, error } = await supabase
      .from('inv_supplier_products')
      .upsert(rows, { onConflict: 'supplier_id,product_id' })
      .select()

    if (error) {
      if (isMissingSchema(error)) {
        return res.status(503).json({ error: 'Run supabase/migrations/supplier_management.sql to enable supplier product lists.' })
      }
      throw error
    }

    res.status(201).json({ data, added: data?.length || 0 })
  } catch (error: any) {
    console.error('[Inventory Suppliers] POST/:id/products error:', error)
    res.status(500).json({ error: error.message })
  }
})

// PUT /api/inventory/suppliers/:id/products/:productId - update link + restock target
router.put('/:id/products/:productId', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { supplier_sku, cost_price, reorder_qty, lead_time_days, is_preferred, notes, target_stock_level, low_stock_threshold } = req.body

    const updates: any = {}
    if (supplier_sku !== undefined) updates.supplier_sku = supplier_sku || null
    if (cost_price !== undefined) updates.cost_price = cost_price === null || cost_price === '' ? null : Number(cost_price)
    if (reorder_qty !== undefined) updates.reorder_qty = Number(reorder_qty || 0)
    if (lead_time_days !== undefined) updates.lead_time_days = lead_time_days === null || lead_time_days === '' ? null : Number(lead_time_days)
    if (is_preferred !== undefined) updates.is_preferred = Boolean(is_preferred)
    if (notes !== undefined) updates.notes = notes || null

    let link: any = null
    if (Object.keys(updates).length > 0) {
      const { data, error } = await supabase
        .from('inv_supplier_products')
        .update(updates)
        .eq('supplier_id', req.params.id)
        .eq('product_id', req.params.productId)
        .select()
        .maybeSingle()

      if (error) {
        if (isMissingSchema(error)) {
          return res.status(503).json({ error: 'Run supabase/migrations/supplier_management.sql to enable supplier product lists.' })
        }
        throw error
      }
      link = data
    }

    // The restock target and the low stock threshold live on inv_stock.
    const stockUpdates: any = {}
    if (target_stock_level !== undefined) stockUpdates.target_stock_level = Math.max(0, Number(target_stock_level || 0))
    if (low_stock_threshold !== undefined) stockUpdates.low_stock_threshold = Math.max(0, Number(low_stock_threshold || 0))

    if (Object.keys(stockUpdates).length > 0) {
      stockUpdates.updated_at = new Date().toISOString()
      const { error: stockError } = await supabase
        .from('inv_stock')
        .update(stockUpdates)
        .eq('product_id', req.params.productId)

      if (stockError && !isMissingSchema(stockError)) throw stockError
      if (stockError) {
        return res.status(503).json({ error: 'Run supabase/migrations/supplier_management.sql to set restock targets.' })
      }
    }

    res.json({ data: link })
  } catch (error: any) {
    console.error('[Inventory Suppliers] PUT/:id/products/:productId error:', error)
    res.status(500).json({ error: error.message })
  }
})

// DELETE /api/inventory/suppliers/:id/products/:productId
router.delete('/:id/products/:productId', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { error } = await supabase
      .from('inv_supplier_products')
      .delete()
      .eq('supplier_id', req.params.id)
      .eq('product_id', req.params.productId)

    if (error) {
      if (isMissingSchema(error)) {
        return res.status(503).json({ error: 'Run supabase/migrations/supplier_management.sql to enable supplier product lists.' })
      }
      throw error
    }

    res.json({ success: true })
  } catch (error: any) {
    console.error('[Inventory Suppliers] DELETE/:id/products/:productId error:', error)
    res.status(500).json({ error: error.message })
  }
})

// GET /api/inventory/suppliers/:id/available-products?search= - products not yet linked
router.get('/:id/available-products', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { search } = req.query

    const links = await fetchSupplierLinks(supabase, req.params.id)
    const linkedIds = new Set((links || []).map((link: any) => link.product_id))

    let query = supabase
      .from('products')
      .select('id, name, barcode, brand, category_id, specs, price, buy_price, cost_price, stock, product_images (url, is_primary)')
      .order('name', { ascending: true })
      .limit(100)

    if (search && typeof search === 'string' && search.trim()) {
      const term = search.trim()
      query = query.or(`name.ilike.%${term}%,barcode.ilike.%${term}%,specs->>model.ilike.%${term}%`)
    }

    const { data, error } = await query
    if (error) throw error

    const products = (data || [])
      .filter((product: any) => !linkedIds.has(product.id))
      .map((product: any) => ({
        id: product.id,
        name: getDisplayName(product),
        barcode: product.barcode || null,
        brand: product.brand || null,
        image: getPrimaryImage(product),
        unit_cost: resolveUnitCost(product),
        stock: Number(product.stock || 0),
      }))

    res.json({ data: products })
  } catch (error: any) {
    console.error('[Inventory Suppliers] available-products error:', error)
    res.status(500).json({ error: error.message })
  }
})

// GET /api/inventory/suppliers/:id/purchases - order history for one supplier
router.get('/:id/purchases', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('inv_purchases')
      .select(`*, inv_purchase_items (id, product_id, product_name, quantity, cost_price, total_cost)`)
      .eq('supplier_id', req.params.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error
    res.json({ data: data || [] })
  } catch (error: any) {
    console.error('[Inventory Suppliers] GET/:id/purchases error:', error)
    res.status(500).json({ error: error.message })
  }
})

// ─── SUPPLIER CRUD ───────────────────────────────────

// GET /api/inventory/suppliers/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('inv_suppliers')
      .select('*')
      .eq('id', req.params.id)
      .single()

    if (error) throw error
    res.json({ data })
  } catch (error: any) {
    console.error('[Inventory Suppliers] GET/:id error:', error)
    res.status(500).json({ error: error.message })
  }
})

// POST /api/inventory/suppliers
router.post('/', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { name, contact_person, phone, email, address, notes, is_active } = req.body

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Supplier name is required' })
    }

    const payload: any = {
      name: String(name).trim(),
      contact_person: contact_person || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
    }
    if (notes !== undefined) payload.notes = notes || null
    if (is_active !== undefined) payload.is_active = Boolean(is_active)

    let { data, error } = await supabase.from('inv_suppliers').insert(payload).select().single()

    // Older database without the notes/is_active columns: retry with the base fields.
    if (error && isMissingSchema(error)) {
      delete payload.notes
      delete payload.is_active
      ;({ data, error } = await supabase.from('inv_suppliers').insert(payload).select().single())
    }

    if (error) throw error
    res.status(201).json({ data })
  } catch (error: any) {
    console.error('[Inventory Suppliers] POST error:', error)
    res.status(500).json({ error: error.message })
  }
})

// PUT /api/inventory/suppliers/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { id, created_at, stats, last_purchase_at, purchase_count, total_spent, ...updates } = req.body

    if (updates.name !== undefined && !String(updates.name).trim()) {
      return res.status(400).json({ error: 'Supplier name is required' })
    }

    /*
     * The portal credential never comes through this handler. It spreads the
     * request body straight into the update, so a portal_password sent here
     * would be stored exactly as typed - and verifyPassword falls back to a
     * plain-text comparison, so the unhashed value would still log in and look
     * perfectly fine. PUT /:id/portal is the only way to set it.
     */
    delete (updates as any).portal_password
    delete (updates as any).portal_last_login_at

    const payload = { ...updates, updated_at: new Date().toISOString() }

    let { data, error } = await supabase
      .from('inv_suppliers')
      .update(payload)
      .eq('id', req.params.id)
      .select()
      .single()

    if (error && isMissingSchema(error)) {
      delete (payload as any).notes
      delete (payload as any).is_active
      ;({ data, error } = await supabase
        .from('inv_suppliers')
        .update(payload)
        .eq('id', req.params.id)
        .select()
        .single())
    }

    if (error) throw error
    res.json({ data })
  } catch (error: any) {
    console.error('[Inventory Suppliers] PUT error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * PUT /api/inventory/suppliers/:id/portal
 * Body: { enabled?: boolean, password?: string }
 *
 * Turns the supplier's /supplier/login access on or off and sets their
 * password. The password is scrypt-hashed here with the same helper the admin
 * and cashier logins use, so the column never holds a readable credential.
 *
 * Sending only { enabled: false } revokes access without touching the password;
 * requireSupplier re-reads portal_enabled on every request, so an open session
 * stops working immediately rather than at expiry.
 */
router.put('/:id/portal', async (req: Request, res: Response) => {
  try {
    const { enabled, password } = req.body || {}
    const updates: Record<string, any> = {}

    if (typeof password === 'string' && password.trim()) {
      if (password.trim().length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' })
      }
      updates.portal_password = hashPassword(password.trim())
    }

    if (enabled !== undefined) updates.portal_enabled = Boolean(enabled)

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Nothing to update' })
    }

    const supabase = getSupabaseAdmin()

    // Turning access on without a password would leave an account that can
    // never be signed into, and reads as "enabled" in the UI.
    if (updates.portal_enabled && !updates.portal_password) {
      const { data: existing } = await supabase
        .from('inv_suppliers')
        .select('portal_password, email')
        .eq('id', req.params.id)
        .maybeSingle()

      if (!existing?.portal_password) {
        return res.status(400).json({ error: 'Set a password before enabling portal access' })
      }
      if (!existing?.email) {
        return res.status(400).json({ error: 'Add an email to this supplier before enabling portal access' })
      }
    }

    const { data, error } = await supabase
      .from('inv_suppliers')
      .update(updates)
      .eq('id', req.params.id)
      .select('id, name, email, portal_enabled, portal_last_login_at')
      .single()

    if (error) {
      if (isMissingSchema(error)) {
        return res.status(400).json({ error: 'Run 20260806_supplier_portal.sql first' })
      }
      throw error
    }

    res.json({ data })
  } catch (error: any) {
    console.error('[Inventory Suppliers] portal access error:', error)
    res.status(500).json({ error: error.message })
  }
})

// DELETE /api/inventory/suppliers/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { error } = await supabase
      .from('inv_suppliers')
      .delete()
      .eq('id', req.params.id)

    if (error) throw error
    res.json({ success: true })
  } catch (error: any) {
    console.error('[Inventory Suppliers] DELETE error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
