/** Whole units only, with the same limits for portal and counter orders. */
export function readOrderItems(items: unknown): Map<string, number> {
  if (!Array.isArray(items) || items.length === 0) throw new Error('Add at least one product to the order')
  if (items.length > 100) throw new Error('An order can hold at most 100 products')

  const wanted = new Map<string, number>()
  for (const line of items) {
    const productId = line?.product_id
    if (typeof productId !== 'string' || !productId.trim()) throw new Error('Every line needs a product')
    const value = line?.quantity
    const quantity = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 9999) {
      throw new Error('Quantity must be a whole number between 1 and 9999')
    }
    const combined = (wanted.get(productId) || 0) + quantity
    if (combined > 9999) throw new Error('Quantity must be a whole number between 1 and 9999 per product')
    wanted.set(productId, combined)
  }
  return wanted
}
