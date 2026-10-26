import { createClient } from '@supabase/supabase-js'
import { asyncHandler } from '../utils/async-handler'
import { getDeliveryFee } from '../utils/delivery-fee'

// Public checkout configuration: expose only the delivery fee, no other settings.
export const getDeliveryFeeHandler = asyncHandler(async (_req, res) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return res.status(503).json({ error: 'Delivery fee is unavailable' })
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  res.setHeader('Cache-Control', 'no-store')
  return res.json({ delivery_fee: await getDeliveryFee(supabase) })
})
