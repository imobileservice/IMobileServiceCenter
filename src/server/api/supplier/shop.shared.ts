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

/**
 * The categories this shop is allowed to see.
 *
 * Returns null when the migration has not been run yet, which the callers
 * report as "not set up" rather than as an empty catalogue - the two look the
 * same to a shop but mean very different things to whoever has to fix it.
 */
export const fetchAllowedCategoryIds = async (
  supabase: any,
  supplierId: string
): Promise<string[] | null> => {
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
 * What a shop is allowed to know about a product: what it is, and whether we
 * have it. Never the count - a shop being told we hold 3 of something is how
 * they learn to shop elsewhere for the other 7.
 */
export const toCatalogItem = (product: any) => ({
  product_id: product.id,
  name: getDisplayName(product),
  brand: product.brand || null,
  barcode: product.barcode || null,
  category_id: product.category_id || null,
  image: getPrimaryImage(product),
  in_stock: resolveQuantity(product) > 0,
})

export const PRODUCT_SELECT = `
  id, name, barcode, brand, category_id, specs, stock,
  product_images (url, is_primary),
  inv_stock (quantity)
`
