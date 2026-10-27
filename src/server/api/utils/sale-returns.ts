import type { SupabaseClient } from '@supabase/supabase-js'
import { summarizeSaleReturns } from '../../../lib/utils/sale-returns'

export async function includeSaleReturns(supabase: SupabaseClient, sales: any[]) {
  if (!sales.length) return []
  const movements: any[] = []
  // Keep the PostgREST URL bounded even for the dashboard's larger sales query.
  for (let batch = 0; batch < sales.length; batch += 100) {
    const ids = sales.slice(batch, batch + 100).map(sale => sale.id)
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from('inv_stock_movements').select('*')
        .in('reference_id', ids).in('type', ['return_good', 'return_damaged'])
        .order('created_at', { ascending: false }).order('id').range(offset, offset + 999)
      if (error) throw error
      movements.push(...(data || []))
      if (!data || data.length < 1000) break
    }
  }
  return sales.map(sale => summarizeSaleReturns(sale, movements))
}
