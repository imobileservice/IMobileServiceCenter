/**
 * Shared pieces of the supplier-shop portal.
 *
 * "Supplier" here means a shop WE supply, not a vendor who supplies us. They
 * sign in, browse the categories the admin opened to them, and order. The one
 * rule that matters is in fetchAllowedCategoryIds: a shop with no categories
 * assigned sees nothing, and every catalogue or order read is filtered through
 * it, so a shop can never reach a product outside its own list.
 */

import { isMissingSchema } from '../inventory/restock.shared'

export { isMissingSchema }

/** Numbers the portal's Call / WhatsApp buttons use when a shop has no rep of its own. */
export const DEFAULT_SUPPORT_PHONE = process.env.SUPPLIER_PORTAL_PHONE || '+94770344273'
export const DEFAULT_SUPPORT_WHATSAPP =
  process.env.SUPPLIER_PORTAL_WHATSAPP || process.env.SUPPLIER_PORTAL_PHONE || '+94770344273'

export type CategoryAccessMode = 'default' | 'custom'

/** The shared list every shop follows unless it has been given its own. */
export const fetchDefaultCategoryIds = async (supabase: any): Promise<string[] | null> => {
  const { data, error } = await supabase.from('inv_supplier_default_categories').select('category_id')

  if (error) {
    if (isMissingSchema(error)) return null
    throw error
  }

  return (data || []).map((row: any) => row.category_id).filter(Boolean)
}

/** One shop's own hand-picked list. Only consulted in 'custom' mode. */
export const fetchOwnCategoryIds = async (supabase: any, supplierId: string): Promise<string[] | null> => {
  const { data, error } = await supabase
    .from('inv_supplier_categories')
    .select('category_id')
    .eq('supplier_id', supplierId)

  if (error) {
    if (isMissingSchema(error)) return null
    throw error
  }

  return (data || []).map((row: any) => row.category_id).filter(Boolean)
}

/**
 * The categories this shop is allowed to see, resolved through its mode.
 *
 * The single place that answers the question, so the catalogue a shop browses
 * and the order it is allowed to place can never disagree about what is on
 * offer. An empty array is a real answer - a shop that has been given nothing -
 * while null means the migration has not been run, which the callers report as
 * "not set up". The two look the same to a shop but mean very different things
 * to whoever has to fix it.
 */
export const fetchAllowedCategoryIds = async (
  supabase: any,
  supplier: { id: string; category_access_mode?: CategoryAccessMode }
): Promise<string[] | null> => {
  if (supplier.category_access_mode === 'custom') {
    return fetchOwnCategoryIds(supabase, supplier.id)
  }

  const defaults = await fetchDefaultCategoryIds(supabase)

  /*
   * A database on 20260809 but not yet on 20260810 has per-shop lists and no
   * default table. Falling back to the shop's own list keeps those shops
   * working through the gap rather than emptying every catalogue at once.
   */
  if (defaults === null) return fetchOwnCategoryIds(supabase, supplier.id)

  return defaults
}

/** Product name including the model held in the JSONB specs column. */
export const getDisplayName = (product: any) => {
  if (!product) return 'Unknown Product'
  const model = product.specs?.model
  const name = product.name || 'Unknown Product'
  return model && !name.includes(model) ? `${name} (${model})` : name
}

export const getPrimaryImage = (product: any) =>
  product?.product_images?.find((img: any) => img.is_primary)?.url ||
  product?.product_images?.[0]?.url ||
  null

/**
 * Units on hand for one product row.
 *
 * inv_stock is the authority - it is what the POS decrements - but Supabase
 * hands an embedded one-to-one back as either an object or a single-element
 * array depending on how it resolved the relationship, and products.stock is
 * the only figure available for a product that has never had a stock row.
 */
export const resolveQuantity = (product: any) => {
  const stockRow = Array.isArray(product?.inv_stock) ? product.inv_stock[0] : product?.inv_stock
  if (stockRow && stockRow.quantity !== undefined && stockRow.quantity !== null) {
    return Number(stockRow.quantity) || 0
  }
  return Number(product?.stock || 0)
}

/**
 * The trade price - what a shop pays us, the figure the admin types into
 * "Inventory Price" on the product form.
 *
 * Same rule as the inventory screens (see products.controller), so the portal
 * and the office quote the same number: buy_price when it has been set, and the
 * general price only as a fallback for a product nobody has priced for trade.
 */
export const getInventoryPrice = (product: any) => {
  const buyPrice = Number(product?.buy_price ?? 0)
  return buyPrice > 0 ? buyPrice : Number(product?.price || 0)
}

/**
 * What a shop is allowed to know about a product: what it is, what it costs
 * them, and whether we have it. Never the count - a shop being told we hold 3
 * of something is how they learn to shop elsewhere for the other 7.
 *
 * The price shown is the inventory (trade) price, never the website price - a
 * shop buying to resell must not be quoted what their own customers pay.
 */
export const toCatalogItem = (product: any) => ({
  product_id: product.id,
  name: getDisplayName(product),
  brand: product.brand || null,
  barcode: product.barcode || null,
  category_id: product.category_id || null,
  image: getPrimaryImage(product),
  in_stock: resolveQuantity(product) > 0,
  inventory_price: getInventoryPrice(product),
})

export const PRODUCT_SELECT = `
  id, name, barcode, brand, category_id, specs, stock, price, buy_price,
  product_images (url, is_primary),
  inv_stock (quantity)
`
