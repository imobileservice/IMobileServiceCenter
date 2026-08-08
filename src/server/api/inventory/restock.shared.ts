/**
 * Restock maths shared by the admin supplier screens and the supplier portal.
 *
 * Both sides answer the same question - what is out, what is low, how many units
 * are wanted - and they must answer it identically. A supplier being told to
 * send 8 units while the admin screen says 12 is worse than either number being
 * wrong on its own, so the calculation lives here once and neither controller
 * keeps a copy.
 *
 * Moved out of suppliers.controller.ts unchanged when the supplier portal was
 * added; every function here is pure or a plain read.
 */

export const STOCK_SELECT_WITH_TARGET = `
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
export const isMissingSchema = (error: any) => {
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

export const getPrimaryImage = (product: any) =>
  product?.product_images?.find((img: any) => img.is_primary)?.url ||
  product?.product_images?.[0]?.url ||
  null

/** Product name including the model from the JSONB specs column, matching the rest of the admin UI. */
export const getDisplayName = (product: any) => {
  if (!product) return 'Unknown Product'
  const model = product.specs?.model
  const name = product.name || 'Unknown Product'
  return model && !name.includes(model) ? `${name} (${model})` : name
}

/** Stock level we want to restock back up to. 0 / unset means "auto". */
export const resolveTargetLevel = (stock: any) => {
  const configured = Number(stock?.target_stock_level || 0)
  if (configured > 0) return configured
  const threshold = Number(stock?.low_stock_threshold ?? 5)
  return Math.max(threshold * 2, threshold + 1, 1)
}

export const resolveUnitCost = (product: any, link?: any) => {
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
export const buildStockItem = (stock: any, link?: any) => {
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
export const fetchStockRows = async (supabase: any, productIds?: string[]) => {
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
export const fetchSupplierLinks = async (supabase: any, supplierId?: string) => {
  let query = supabase.from('inv_supplier_products').select('*')
  if (supplierId) query = query.eq('supplier_id', supplierId)

  const { data, error } = await query
  if (error) {
    if (isMissingSchema(error)) return null
    throw error
  }
  return data || []
}

export const emptyTotals = () => ({
  products: 0,
  out_of_stock: 0,
  low_stock: 0,
  healthy: 0,
  needed_units: 0,
  estimated_cost: 0,
})

export const accumulate = (totals: ReturnType<typeof emptyTotals>, item: any) => {
  totals.products += 1
  if (item.status === 'out') totals.out_of_stock += 1
  else if (item.status === 'low') totals.low_stock += 1
  else totals.healthy += 1
  totals.needed_units += item.suggested_qty
  totals.estimated_cost += item.estimated_cost
  return totals
}
