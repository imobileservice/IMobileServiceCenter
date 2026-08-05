import { Router, Request, Response } from 'express'
import { getSupabaseAdmin } from './supabase-admin'

const router = Router()

// ─── HELPERS ─────────────────────────────────────────

const STOCK_SELECT_WITH_TARGET = `
  product_id,
  quantity,
  damaged_quantity,
  low_stock_threshold,
  target_stock_level,
  qty_meegoda,
  qty_padukka,
  qty_padukka_new,
  products (
    id, name, barcode, category_id, brand, specs, price, cost_price, buy_price,
    product_images (url, is_primary)
  )
`

const STOCK_SELECT_LEGACY = STOCK_SELECT_WITH_TARGET.replace('  target_stock_level,\n', '')

/**
 * True when the error means "supplier_management.sql has not been run yet".
 * Lets every endpoint keep working (just without the supplier↔product links)
 * on a database where the migration is still pending.
 */
const isMissingSchema = (error: any) => {
  if (!error) return false
  const code = error.code || ''
  const message = `${error.message || ''} ${error.details || ''}`.toLowerCase()
  return (
    code === '42P01' || // undefined_table
    code === '42703' || // undefined_column
    code === 'PGRST205' || // table not in schema cache
    code === 'PGRST204' || // column not in schema cache
    message.includes('inv_supplier_products') ||
    message.includes('target_stock_level')
  )
}

const getPrimaryImage = (product: any) =>
  product?.product_images?.find((img: any) => img.is_primary)?.url ||
  product?.product_images?.[0]?.url ||
  null

/** Product name including the model from the JSONB specs column, matching the rest of the admin UI. */
const getDisplayName = (product: any) => {
  if (!product) return 'Unknown Product'
  const model = product.specs?.model
  const name = product.name || 'Unknown Product'
  return model && !name.includes(model) ? `${name} (${model})` : name
}

/** Stock level we want to restock back up to. 0 / unset means "auto". */
const resolveTargetLevel = (stock: any) => {
  const configured = Number(stock?.target_stock_level || 0)
  if (configured > 0) return configured
  const threshold = Number(stock?.low_stock_threshold ?? 5)
  return Math.max(threshold * 2, threshold + 1, 1)
}

const resolveUnitCost = (product: any, link?: any) => {
  const candidates = [link?.cost_price, product?.buy_price, product?.cost_price, product?.price]
  for (const candidate of candidates) {
    const value = Number(candidate || 0)
    if (value > 0) return value
  }
  return 0
}

/**
 * Turns a raw inv_stock row (+ optional supplier link) into the shape the
 * supplier screens render: status, how many units are wanted and what it costs.
 */
const buildStockItem = (stock: any, link?: any) => {
  const product = stock?.products || {}
  const quantity = Number(stock?.quantity || 0)
  const threshold = Number(stock?.low_stock_threshold ?? 5)
  const target = resolveTargetLevel(stock)
  const neededQty = Math.max(0, target - quantity)
  const packQty = Number(link?.reorder_qty || 0)
  const suggestedQty = neededQty > 0 ? Math.max(neededQty, packQty) : 0
  const unitCost = resolveUnitCost(product, link)

  const status: 'out' | 'low' | 'ok' =
    quantity <= 0 ? 'out' : quantity <= threshold ? 'low' : 'ok'

  return {
    product_id: stock.product_id,
    name: getDisplayName(product),
    raw_name: product.name || '',
    barcode: product.barcode || null,
    brand: product.brand || null,
    category: product.category_id || null,
    image: getPrimaryImage(product),
    quantity,
    damaged_quantity: Number(stock?.damaged_quantity || 0),
    low_stock_threshold: threshold,
    target_stock_level: target,
    is_target_auto: !Number(stock?.target_stock_level || 0),
    qty_meegoda: Number(stock?.qty_meegoda || 0),
    qty_padukka: Number(stock?.qty_padukka || 0),
    qty_padukka_new: Number(stock?.qty_padukka_new || 0),
    status,
    needed_qty: neededQty,
    suggested_qty: suggestedQty,
    unit_cost: unitCost,
    estimated_cost: suggestedQty * unitCost,
    // Supplier link details (only present when queried per supplier)
    link_id: link?.id ?? null,
    supplier_sku: link?.supplier_sku ?? null,
    supplier_cost_price: link?.cost_price ?? null,
    reorder_qty: packQty,
    lead_time_days: link?.lead_time_days ?? null,
    is_preferred: Boolean(link?.is_preferred),
    link_notes: link?.notes ?? null,
  }
}

/** Reads inv_stock, tolerating a database where target_stock_level does not exist yet. */
const fetchStockRows = async (supabase: any, productIds?: string[]) => {
  const run = async (select: string) => {
    let query = supabase.from('inv_stock').select(select)
    if (productIds) {
      if (productIds.length === 0) return { data: [], error: null }
      query = query.in('product_id', productIds)
    }
    return query
  }

  let { data, error } = await run(STOCK_SELECT_WITH_TARGET)

  if (error && isMissingSchema(error)) {
    ;({ data, error } = await run(STOCK_SELECT_LEGACY))
  }

  if (error) throw error
  return (data || []).filter((row: any) => row.products)
}

/** Reads supplier↔product links. Returns null when the migration is pending. */
const fetchSupplierLinks = async (supabase: any, supplierId?: string) => {
  let query = supabase.from('inv_supplier_products').select('*')
  if (supplierId) query = query.eq('supplier_id', supplierId)

  const { data, error } = await query
  if (error) {
    if (isMissingSchema(error)) return null
    throw error
  }
  return data || []
}

const emptyTotals = () => ({
  products: 0,
  out_of_stock: 0,
  low_stock: 0,
  healthy: 0,
  needed_units: 0,
  estimated_cost: 0,
})

const accumulate = (totals: ReturnType<typeof emptyTotals>, item: any) => {
  totals.products += 1
  if (item.status === 'out') totals.out_of_stock += 1
  else if (item.status === 'low') totals.low_stock += 1
  else totals.healthy += 1
  totals.needed_units += item.suggested_qty
  totals.estimated_cost += item.estimated_cost
  return totals
}

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

    const [stockRows, links, suppliersResult] = await Promise.all([
      fetchStockRows(supabase),
      fetchSupplierLinks(supabase),
      supabase.from('inv_suppliers').select('id, name, phone, email, contact_person'),
    ])

    if (suppliersResult.error) throw suppliersResult.error
    const suppliers = suppliersResult.data || []
    const supplierById = new Map(suppliers.map((s: any) => [s.id, s]))

    // product_id -> suppliers that can deliver it
    const suppliersByProduct = new Map<string, any[]>()
    const linkByProductSupplier = new Map<string, any>()
    for (const link of links || []) {
      const supplier = supplierById.get(link.supplier_id)
      if (!supplier) continue
      const list = suppliersByProduct.get(link.product_id) || []
      list.push({ ...supplier, reorder_qty: link.reorder_qty, cost_price: link.cost_price, is_preferred: link.is_preferred })
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
