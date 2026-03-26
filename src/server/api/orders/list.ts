import { Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'

export const getUserOrdersHandler = async (req: Request, res: Response) => {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

        if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
            return res.status(500).json({ error: 'Supabase configuration missing' })
        }

        // 1. Authenticate User
        // We expect the session token in headers
        const token = req.headers['x-session-token'] as string

        if (!token) {
            return res.status(401).json({ error: 'Unauthorized: No session token' })
        }

        // Create a client with the user's token to verify identity
        const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
            auth: { persistSession: false, autoRefreshToken: false }
        })

        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token)

        if (authError || !user) {
            return res.status(401).json({ error: 'Unauthorized: Invalid token' })
        }

        // 2. Fetch Orders using Service Role (Bypass RLS)
        // We authenticated the user, now we fetch THEIR orders using admin privileges
        // to ensure we bypass any broken RLS on order_items
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
            auth: { persistSession: false, autoRefreshToken: false }
        })

        const { data, error } = await supabaseAdmin
            .from('orders')
            .select(`
        *,
        order_items (*)
      `)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })

        if (error) {
            console.error('[API] Failed to fetch user orders:', error)
            return res.status(500).json({ error: 'Failed to fetch orders' })
        }

        return res.json({ data: data || [] })
    } catch (error: any) {
        console.error('[API] getOrders error:', error)
        return res.status(500).json({ error: error.message || 'Internal Server Error' })
    }
}
