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

const emptyShopStats = () => ({
  /** What the shop sees: its own list, or the shared default. */
  categories: 0,
  /** How many it has hand-picked, whether or not that list is in use. */
  own_categories: 0,
  orders: 0,
  pending_orders: 0,
  pending_units: 0,
  last_order_at: null as string | null,
})

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

    /*
     * What the shop cards show: how much catalogue each shop can see and what
     * they have ordered. Both tables are optional - on a database where
     * 20260809_supplier_shop_orders.sql has not been run the page still lists
     * the shops, with zeroes and a banner telling the admin what to run.
     */
    const [categoriesResult, ordersResult, defaultsResult] = await Promise.all([
      supabase.from('inv_supplier_categories').select('supplier_id'),
      supabase.from('inv_supplier_orders').select('supplier_id, status, total_qty, created_at'),
      supabase.from('inv_supplier_default_categories').select('category_id'),
    ])

    const migrationRequired =
      (categoriesResult.error && isMissingSchema(categoriesResult.error)) ||
      (ordersResult.error && isMissingSchema(ordersResult.error))

    if (categoriesResult.error && !isMissingSchema(categoriesResult.error)) throw categoriesResult.error
    if (ordersResult.error && !isMissingSchema(ordersResult.error)) throw ordersResult.error
    if (defaultsResult.error && !isMissingSchema(defaultsResult.error)) throw defaultsResult.error

    const defaultCount = (defaultsResult.data || []).length

    const statsBySupplier = new Map<string, ReturnType<typeof emptyShopStats>>()
    const statsFor = (id: string) => {
      const existing = statsBySupplier.get(id)
      if (existing) return existing
      const created = emptyShopStats()
      statsBySupplier.set(id, created)
      return created
    }

    for (const row of categoriesResult.data || []) {
      statsFor(row.supplier_id).own_categories += 1
    }

    for (const order of ordersResult.data || []) {
      const stats = statsFor(order.supplier_id)
      stats.orders += 1
      if (order.status === 'pending') {
        stats.pending_orders += 1
        stats.pending_units += Number(order.total_qty || 0)
      }
      if (!stats.last_order_at || order.created_at > stats.last_order_at) {
        stats.last_order_at = order.created_at
      }
    }

    const data = (suppliers || []).map((supplier: any) => {
      const stats = statsBySupplier.get(supplier.id) || emptyShopStats()
      const mode = supplier.category_access_mode === 'custom' ? 'custom' : 'default'
      return {
        ...supplier,
        category_access_mode: mode,
        // `categories` is what the shop actually sees, so a card following the
        // default reads the same number the shop's own portal would show.
        stats: { ...stats, categories: mode === 'custom' ? stats.own_categories : defaultCount },
      }
    })

    res.json({ data, default_categories: defaultCount, migration_required: Boolean(migrationRequired) })
  } catch (error: any) {
    console.error('[Inventory Suppliers] GET error:', error)
    res.status(500).json({ error: error.message })
  }
})

// ─── CATEGORY ACCESS ─────────────────────────────────
// Which slice of the catalogue a shop sees in their own portal.
// Declared before /:id so "categories" is never read as a supplier id.

// GET /api/inventory/suppliers/categories - every category, for the picker
router.get('/categories', async (_req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('categories')
      .select('id, name, slug, is_active')
      .order('name', { ascending: true })

    if (error) throw error
    res.json({ data: data || [] })
  } catch (error: any) {
    console.error('[Inventory Suppliers] categories error:', error)
    res.status(500).json({ error: error.message })
  }
})

/** Cleans a posted id list: strings only, no duplicates. */
const normalizeCategoryIds = (value: any) =>
  Array.from(new Set((value as any[]).filter((id: any) => typeof id === 'string' && id)))

// GET /api/inventory/suppliers/default-categories - the shared list
router.get('/default-categories', async (_req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('inv_supplier_default_categories')
      .select('category_id, categories (id, name, slug)')

    if (error) {
      if (isMissingSchema(error)) return res.json({ data: [], migration_required: true })
      throw error
    }

    res.json({ data: data || [], migration_required: false })
  } catch (error: any) {
    console.error('[Inventory Suppliers] GET/default-categories error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * PUT /api/inventory/suppliers/default-categories
 * Body: { category_ids: string[] }
 *
 * Sets the list every shop follows unless it has been given its own. Replaces
 * the list outright, so the tick grid in the admin panel is the truth:
 * unticking takes a category away, which an add-only endpoint could not express.
 *
 * This is the one write that changes what several shops see at once. Nothing
 * cascades from it - a shop in 'custom' mode is untouched by design.
 */
router.put('/default-categories', async (req: Request, res: Response) => {
  try {
    const { category_ids } = req.body || {}
    if (!Array.isArray(category_ids)) {
      return res.status(400).json({ error: 'category_ids must be an array' })
    }

    const wanted = normalizeCategoryIds(category_ids)
    const supabase = getSupabaseAdmin()

    // No WHERE clause is meant here: the table holds exactly one list.
    const { error: deleteError } = await supabase
      .from('inv_supplier_default_categories')
      .delete()
      .not('category_id', 'is', null)

    if (deleteError) {
      if (isMissingSchema(deleteError)) {
        return res
          .status(503)
          .json({ error: 'Run supabase/migrations/20260810_supplier_default_categories.sql first' })
      }
      throw deleteError
    }

    if (wanted.length === 0) return res.json({ data: [], count: 0 })

    const { data, error } = await supabase
      .from('inv_supplier_default_categories')
      .insert(wanted.map((categoryId) => ({ category_id: categoryId })))
      .select('category_id')

    if (error) throw error

    res.json({ data: data || [], count: data?.length || 0 })
  } catch (error: any) {
    console.error('[Inventory Suppliers] PUT/default-categories error:', error)
    res.status(500).json({ error: error.message })
  }
})

// GET /api/inventory/suppliers/:id/categories
router.get('/:id/categories', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()

    const [ownResult, supplierResult] = await Promise.all([
      supabase
        .from('inv_supplier_categories')
        .select('category_id, categories (id, name, slug)')
        .eq('supplier_id', req.params.id),
      supabase.from('inv_suppliers').select('category_access_mode').eq('id', req.params.id).maybeSingle(),
    ])

    if (ownResult.error) {
      if (isMissingSchema(ownResult.error)) return res.json({ data: [], mode: 'default', migration_required: true })
      throw ownResult.error
    }

    // A database without the mode column is one where every shop has its own
    // list, which is exactly what 'custom' means.
    const mode = supplierResult.error
      ? 'custom'
      : supplierResult.data?.category_access_mode === 'custom'
        ? 'custom'
        : 'default'

    res.json({ data: ownResult.data || [], mode, migration_required: false })
  } catch (error: any) {
    console.error('[Inventory Suppliers] GET/:id/categories error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * PUT /api/inventory/suppliers/:id/categories
 * Body: { mode?: 'default' | 'custom', category_ids?: string[] }
 *
 * Points one shop at the shared default, or gives it a list of its own.
 *
 * Switching to 'default' keeps whatever the shop had hand-picked rather than
 * deleting it, so turning the override back on restores the old list instead of
 * making someone rebuild it from memory.
 */
router.put('/:id/categories', async (req: Request, res: Response) => {
  try {
    const { mode, category_ids } = req.body || {}
    const supplierId = req.params.id
    const supabase = getSupabaseAdmin()

    if (mode !== undefined && mode !== 'default' && mode !== 'custom') {
      return res.status(400).json({ error: "mode must be 'default' or 'custom'" })
    }

    if (mode) {
      const { error: modeError } = await supabase
        .from('inv_suppliers')
        .update({ category_access_mode: mode })
        .eq('id', supplierId)

      if (modeError) {
        if (isMissingSchema(modeError)) {
          return res
            .status(503)
            .json({ error: 'Run supabase/migrations/20260810_supplier_default_categories.sql first' })
        }
        throw modeError
      }
    }

    if (!Array.isArray(category_ids)) {
      return res.json({ mode: mode || null, count: null })
    }

    const wanted = normalizeCategoryIds(category_ids)

    const { error: deleteError } = await supabase
      .from('inv_supplier_categories')
      .delete()
      .eq('supplier_id', supplierId)

    if (deleteError) {
      if (isMissingSchema(deleteError)) {
        return res.status(503).json({ error: 'Run supabase/migrations/20260809_supplier_shop_orders.sql first' })
      }
      throw deleteError
    }

    if (wanted.length === 0) {
      return res.json({ data: [], count: 0, mode: mode || null })
    }

    const { data, error } = await supabase
      .from('inv_supplier_categories')
      .insert(wanted.map((categoryId) => ({ supplier_id: supplierId, category_id: categoryId })))
      .select('category_id')

    if (error) throw error

    res.json({ data: data || [], count: data?.length || 0, mode: mode || null })
  } catch (error: any) {
    console.error('[Inventory Suppliers] PUT/:id/categories error:', error)
    res.status(500).json({ error: error.message })
  }
})

// ─── RESTOCK OVERVIEW ────────────────────────────────
// Declared before /:id so the literal path wins.

// GET /api/inventory/suppliers/restock-summary?status=all|low|out|needed&supplier_id=&search=
// Must stay above GET /:id, which would otherwise match "available-products"
// as a supplier id. Used by the Add Supplier form, where there is no id yet.
router.get('/available-products', (req, res) => listAvailableProducts(undefined, req, res))

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
          String(item.name || '').toLowerCase().includes(term) ||
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
/**
 * Products this supplier could be given, newest search first.
 *
 * supplierId is optional so the Add Supplier form can offer the same picker
 * before the supplier exists: with no id there is nothing linked yet, so the
 * whole catalogue is on offer.
 */
const listAvailableProducts = async (supplierId: string | undefined, req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { search } = req.query

    const links = supplierId ? await fetchSupplierLinks(supabase, supplierId) : []
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
}

router.get('/:id/available-products', (req, res) => listAvailableProducts(req.params.id, req, res))

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
    const { name, contact_person, phone, email, address, notes, is_active, support_phone, support_whatsapp } = req.body

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
    if (support_phone !== undefined) payload.support_phone = support_phone || null
    if (support_whatsapp !== undefined) payload.support_whatsapp = support_whatsapp || null

    let { data, error } = await supabase.from('inv_suppliers').insert(payload).select().single()

    // Older database without the notes/is_active/support columns: retry with the base fields.
    if (error && isMissingSchema(error)) {
      delete payload.notes
      delete payload.is_active
      delete payload.support_phone
      delete payload.support_whatsapp
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
      delete (payload as any).support_phone
      delete (payload as any).support_whatsapp
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
