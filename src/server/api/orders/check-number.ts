import { Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { asyncHandler } from '../utils/async-handler'

/**
 * GET /api/orders/check-number/:number
 * Check if an order number exists (bypass RLS)
 */
export const checkOrderNumberHandler = asyncHandler(async (req: Request, res: Response) => {
    const { number } = req.params

    if (!number) {
        return res.status(400).json({ error: 'Order number is required' })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
        return res.status(503).json({ error: 'Server configuration error' })
    }

    // Use service key to bypass RLS
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    const { data, error } = await adminClient
        .from('orders')
        .select('id')
        .eq('order_number', number)
        .maybeSingle()

    if (error) {
        console.error('Order number check error:', error)
        return res.status(500).json({ error: error.message })
    }

    return res.json({
        exists: !!data,
        orderNumber: number
    })
})
