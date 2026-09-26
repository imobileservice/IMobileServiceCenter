/**
 * Product and category writes, with no HTTP in them.
 *
 * This logic used to live only inside the /api/admin/products handlers. It has
 * three callers now - the administrator's own routes, an assistant creating a
 * product, and the approval step that applies an assistant's edit or delete
 * once an administrator has signed it off - so it lives here and every caller
 * gets exactly the same behaviour: the same barcode generation, the same
 * category-slug resolution, the same inv_stock initialisation, the same
 * un-migrated-database fallbacks.
 *
 * Every function takes a service-role Supabase client and returns a plain
 * result. Throwing is reserved for genuine faults; an expected failure (unknown
 * category, product referenced by a past sale) comes back as `ok: false` with a
 * status the caller can pass straight to the client.
 */
import { SupabaseClient } from '@supabase/supabase-js'
import { isMissingRelation, setProductCompatibility } from './compatibility'

export interface WriteResult<T = any> {
  ok: boolean
  status?: number
  error?: string
  data?: T
}

/**
 * Pull `compatible_model_ids` out of a product payload.
 *
 * Compatibility is stored in product_compatibility, not on the products row, so
 * the ids must be removed before the insert/update - exactly how images and the
 * per-shop qty_* fields are handled. Returns undefined when the caller did not
 * send the field, which means "leave existing compatibility alone".
 */
export function extractCompatibleModelIds(payload: any): string[] | undefined {
  if (!('compatible_model_ids' in payload)) return undefined

  const raw = payload.compatible_model_ids
  delete payload.compatible_model_ids

  if (!Array.isArray(raw)) return []
  return Array.from(new Set(raw.map((id: any) => String(id)).filter(Boolean)))
}

/**
 * Save the compatible model set for a product. Never touches stock - it only
 * writes join rows, so one Display A with ten models still has one inv_stock
 * row. A failure is logged and swallowed: the product itself already saved.
 */
async function saveCompatibility(
  supabase: SupabaseClient,
  productId: string,
  modelIds: string[] | undefined
) {
  if (modelIds === undefined || !productId) return

  const result = await setProductCompatibility(supabase, productId, modelIds)
  if (!result.ok) {
    console.error('[ProductWrite] Failed to save phone compatibility:', result.error)
  } else if (result.added || result.removed) {
    console.log(
      `[ProductWrite] Compatibility for ${productId}: +${result.added} / -${result.removed} models`
    )
  }
}

/** Turn a category slug into the category_id column the products table holds. */
async function resolveCategory(supabase: SupabaseClient, payload: any): Promise<WriteResult<null>> {
  if (!payload.category || payload.category_id) {
    delete payload.category
    return { ok: true }
  }

  const { data, error } = await supabase
    .from('categories')
    .select('id')
    .eq('slug', payload.category)
    .single()

  if (error || !data) {
    return { ok: false, status: 400, error: `Category not found: ${payload.category}` }
  }

  payload.category_id = data.id
  delete payload.category
  return { ok: true }
}

/** Sequential 6-digit barcode: 000001, 000002, ... */
async function nextBarcode(supabase: SupabaseClient): Promise<string> {
  const { data: rows } = await supabase
    .from('products')
    .select('barcode')
    .not('barcode', 'is', null)
    .order('barcode', { ascending: false })
    .limit(100)

  let next = 1
  if (rows && rows.length > 0) {
    const numeric = rows
      .map((row: any) => parseInt(row.barcode, 10))
      .filter((value: number) => !Number.isNaN(value))
    if (numeric.length > 0) next = Math.max(...numeric) + 1
  }
  return String(next).padStart(6, '0')
}

async function writeImages(
  supabase: SupabaseClient,
  productId: string,
  urls: string[],
  nameForAlt: string
) {
  if (urls.length === 0) return
  const { error } = await supabase.from('product_images').insert(
    urls.map((url, index) => ({
      product_id: productId,
      url,
      display_order: index,
      is_primary: index === 0,
      alt_text: `${nameForAlt} image ${index + 1}`,
    }))
  )
  if (error) console.error('[ProductWrite] Error writing product images:', error)
}

/**
 * Create a product, its stock row and its images.
 *
 * `payload` is mutated - callers pass a copy.
 */
export async function createProductRecord(
  supabase: SupabaseClient,
  input: Record<string, any>
): Promise<WriteResult> {
  const productData: any = { ...input }
  const imageUrls: string[] = productData.images || (productData.image ? [productData.image] : [])

  const qty_meegoda = Number(productData.qty_meegoda) || 0
  const qty_padukka = Number(productData.qty_padukka) || 0
  const qty_padukka_new = Number(productData.qty_padukka_new) || 0
  const totalStock = Number(productData.stock) || 0

  delete productData.image
  delete productData.images
  delete productData.qty_meegoda
  delete productData.qty_padukka
  delete productData.qty_padukka_new

  const compatibleModelIds = extractCompatibleModelIds(productData)

  const category = await resolveCategory(supabase, productData)
  if (!category.ok) return category

  if (!productData.barcode) {
    productData.barcode = await nextBarcode(supabase)
    console.log(`[ProductWrite] Auto-generated barcode: ${productData.barcode}`)
  }

  let { data, error } = await supabase.from('products').insert(productData).select().single()

  // `sku` only exists once add_phone_model_compatibility.sql has been applied.
  // Retry without it so product creation keeps working on an un-migrated DB.
  if (error && isMissingRelation(error) && productData.sku !== undefined) {
    console.warn('[ProductWrite] products.sku missing - retrying without SKU. Run add_phone_model_compatibility.sql')
    const { sku, ...withoutSku } = productData
    const retry = await supabase.from('products').insert(withoutSku).select().single()
    data = retry.data
    error = retry.error
  }

  if (error) {
    console.error('[ProductWrite] Error creating product:', error)
    return { ok: false, status: 500, error: error.message }
  }

  await saveCompatibility(supabase, data?.id, compatibleModelIds)

  // Initialise stock in inv_stock so the product appears in Inventory. The DB
  // trigger trg_update_total_quantity recomputes quantity from the shop qtys.
  if (data?.id) {
    const { error: stockError } = await supabase.from('inv_stock').upsert(
      {
        product_id: data.id,
        quantity: totalStock,
        qty_meegoda,
        qty_padukka,
        qty_padukka_new,
        low_stock_threshold: 5,
      },
      { onConflict: 'product_id' }
    )
    if (stockError) console.error('[ProductWrite] Error initialising inv_stock:', stockError)
  }

  if (data?.id) await writeImages(supabase, data.id, imageUrls, productData.name)

  return { ok: true, data }
}

/** Update a product, its stock row and (when supplied) its image set. */
export async function updateProductRecord(
  supabase: SupabaseClient,
  id: string,
  input: Record<string, any>
): Promise<WriteResult> {
  const updateData: any = { ...input }
  const imageUrls: string[] | undefined =
    updateData.images || (updateData.image ? [updateData.image] : undefined)

  const qty_meegoda = updateData.qty_meegoda
  const qty_padukka = updateData.qty_padukka
  const qty_padukka_new = updateData.qty_padukka_new

  delete updateData.image
  delete updateData.images
  delete updateData.qty_meegoda
  delete updateData.qty_padukka
  delete updateData.qty_padukka_new

  const compatibleModelIds = extractCompatibleModelIds(updateData)

  const category = await resolveCategory(supabase, updateData)
  if (!category.ok) return category

  let { data, error } = await supabase
    .from('products')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  // Same un-migrated-DB guard as create: drop SKU rather than fail the save.
  if (error && isMissingRelation(error) && updateData.sku !== undefined) {
    console.warn('[ProductWrite] products.sku missing - retrying without SKU. Run add_phone_model_compatibility.sql')
    const { sku, ...withoutSku } = updateData
    const retry = await supabase.from('products').update(withoutSku).eq('id', id).select().single()
    data = retry.data
    error = retry.error
  }

  if (error) {
    console.error('[ProductWrite] Error updating product:', error)
    return { ok: false, status: 500, error: error.message }
  }

  await saveCompatibility(supabase, id, compatibleModelIds)

  if (
    updateData.stock !== undefined ||
    qty_meegoda !== undefined ||
    qty_padukka !== undefined ||
    qty_padukka_new !== undefined
  ) {
    const stockUpsert: any = { product_id: data.id, updated_at: new Date().toISOString() }
    if (updateData.stock !== undefined) stockUpsert.quantity = Number(updateData.stock) || 0
    if (qty_meegoda !== undefined) stockUpsert.qty_meegoda = Number(qty_meegoda)
    if (qty_padukka !== undefined) stockUpsert.qty_padukka = Number(qty_padukka)
    if (qty_padukka_new !== undefined) stockUpsert.qty_padukka_new = Number(qty_padukka_new)

    const { error: stockError } = await supabase
      .from('inv_stock')
      .upsert({ ...stockUpsert, low_stock_threshold: 5 }, { onConflict: 'product_id' })

    if (stockError) console.error('[ProductWrite] Error syncing inv_stock:', stockError)
  }

  if (imageUrls !== undefined && data?.id) {
    await supabase.from('product_images').delete().eq('product_id', id)
    await writeImages(supabase, id, imageUrls, updateData.name || data.name)
  }

  return { ok: true, data }
}

export async function deleteProductRecord(
  supabase: SupabaseClient,
  id: string
): Promise<WriteResult<{ success: true }>> {
  const { error } = await supabase.from('products').delete().eq('id', id)

  if (error) {
    console.error('[ProductWrite] Error deleting product:', error)
    if (error.code === '23503') {
      return {
        ok: false,
        status: 409,
        error:
          'Cannot delete product because it exists in past sales/receipts. Please update its stock to 0 instead to discontinue it.',
      }
    }
    return { ok: false, status: 500, error: error.message }
  }

  return { ok: true, data: { success: true } }
}

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

export async function updateCategoryRecord(
  supabase: SupabaseClient,
  id: string,
  input: Record<string, any>
): Promise<WriteResult> {
  const { data, error } = await supabase
    .from('categories')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return { ok: false, status: 500, error: error.message }
  return { ok: true, data }
}

export async function deleteCategoryRecord(
  supabase: SupabaseClient,
  id: string
): Promise<WriteResult<{ success: true }>> {
  // Same refusal the administrator's own route gives: a category still holding
  // products cannot be removed, or those products lose their category_id.
  const { count } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id)

  if ((count || 0) > 0) {
    return {
      ok: false,
      status: 409,
      error: `Cannot delete this category: ${count} product(s) still use it. Move them first.`,
    }
  }

  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) return { ok: false, status: 500, error: error.message }
  return { ok: true, data: { success: true } }
}
