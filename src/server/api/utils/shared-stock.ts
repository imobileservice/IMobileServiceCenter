import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Ids of products that share another product's stock (products.stock_source_id,
 * e.g. "Narzo 20 Display" sharing "Oppo A17K Display"). Their inv_stock rows
 * mirror the main product's, so stock counts and stock values skip them to count
 * each physical unit once. Revenue is unaffected: sales are recorded per product.
 *
 * Empty until supabase/migrations/20261107_shared_stock.sql has been applied.
 */
export async function loadSharedStockIds(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase.from('products').select('id').not('stock_source_id', 'is', null)
  if (error) return new Set()
  return new Set((data || []).map((row: any) => row.id))
}
