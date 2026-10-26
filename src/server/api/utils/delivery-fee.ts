import type { SupabaseClient } from '@supabase/supabase-js'
import { INITIAL_DELIVERY_FEE, parseDeliveryFee } from '../../../lib/utils/order-totals'

export async function getDeliveryFee(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.from('admin_settings')
    .select('value').eq('key', 'delivery_fee').maybeSingle()
  if (error) throw new Error('Unable to load delivery fee. Please try again.')
  return data ? parseDeliveryFee(data.value) : INITIAL_DELIVERY_FEE
}
