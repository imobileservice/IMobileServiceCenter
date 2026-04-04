import { Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'

export async function getCashiersHandler(req: Request, res: Response) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        
        if (!supabaseUrl || !supabaseKey) { return res.status(500).json({ error: 'Server config error' }) }

        const supabase = createClient(supabaseUrl, supabaseKey)
        const { data, error } = await supabase
            .from('admins')
            .select('id, email, name, role, created_at')
            .eq('role', 'cashier')
            .order('created_at', { ascending: false })

        if (error) throw error
        res.json({ data })
    } catch (error: any) {
        console.error('[Admin] Get Cashiers Error:', error)
        res.status(500).json({ error: error.message })
    }
}

export async function createCashierHandler(req: Request, res: Response) {
    try {
        const { email, password, name } = req.body
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        
        if (!supabaseUrl || !supabaseKey) { return res.status(500).json({ error: 'Server config error' }) }
        if (!email || !password) { return res.status(400).json({ error: 'Email and password required' }) }

        const supabase = createClient(supabaseUrl, supabaseKey)
        
        // Ensure email isn't already used
        const { data: existing } = await supabase.from('admins').select('id').eq('email', email.toLowerCase()).single()
        if (existing) {
            return res.status(400).json({ error: 'Email already exists' })
        }

        const { data, error } = await supabase
            .from('admins')
            .insert({
                email: email.toLowerCase(),
                password: password,
                name: name || 'New Cashier',
                role: 'cashier'
            })
            .select('id, email, name, role, created_at')
            .single()

        if (error) throw error
        res.json({ data })
    } catch (error: any) {
        console.error('[Admin] Create Cashier Error:', error)
        res.status(500).json({ error: error.message })
    }
}

export async function deleteCashierHandler(req: Request, res: Response) {
    try {
        const { id } = req.params
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

        if (!supabaseUrl || !supabaseKey) { return res.status(500).json({ error: 'Server config error' }) }

        const supabase = createClient(supabaseUrl, supabaseKey)
        const { error } = await supabase.from('admins').delete().eq('id', id).eq('role', 'cashier')

        if (error) throw error
        res.json({ success: true })
    } catch (error: any) {
        console.error('[Admin] Delete Cashier Error:', error)
        res.status(500).json({ error: error.message })
    }
}
