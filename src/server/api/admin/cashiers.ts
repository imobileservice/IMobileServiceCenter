import { Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { hashPassword } from '../utils/password'

const DEFAULT_SHOP = 'Meegoda'
const VALID_TILL_STATUSES = new Set(['active', 'inactive'])

function getAdminClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Server config error')
    }

    return createClient(supabaseUrl, supabaseKey)
}

function normalizeTillCode(code: string) {
    return code.trim().toUpperCase()
}

function hashSecret(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex')
}

function validateTillCode(code: string) {
    if (!/^[A-Z0-9-]{3,32}$/.test(code)) {
        throw Object.assign(new Error('Till code must be 3-32 characters using letters, numbers, and hyphens only'), { statusCode: 400 })
    }
}

export async function getCashiersHandler(req: Request, res: Response) {
    try {
        const supabase = getAdminClient()
        const { data, error } = await supabase
            .from('admins')
            .select('id, email, name, role, created_at, shop')
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
        const { email, password, name, shop } = req.body
        if (!email || !password) { return res.status(400).json({ error: 'Email and password required' }) }

        const supabase = getAdminClient()
        
        // Ensure email isn't already used
        const { data: existing } = await supabase.from('admins').select('id').eq('email', email.toLowerCase()).single()
        if (existing) {
            return res.status(400).json({ error: 'Email already exists' })
        }

        const { data, error } = await supabase
            .from('admins')
            .insert({
                email: email.toLowerCase(),
                password: hashPassword(password),
                name: name || 'New Cashier',
                role: 'cashier',
                shop: shop || 'Meegoda'
            })
            .select('id, email, name, role, created_at, shop')
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

        const supabase = getAdminClient()
        const { error } = await supabase.from('admins').delete().eq('id', id).eq('role', 'cashier')

        if (error) throw error
        res.json({ success: true })
    } catch (error: any) {
        console.error('[Admin] Delete Cashier Error:', error)
        res.status(500).json({ error: error.message })
    }
}

export async function updateCashierHandler(req: Request, res: Response) {
    try {
        const { id } = req.params
        const { shop } = req.body

        const supabase = getAdminClient()
        const { data, error } = await supabase
            .from('admins')
            .update({ shop })
            .eq('id', id)
            .eq('role', 'cashier')
            .select('id, email, name, role, created_at, shop')
            .single()

        if (error) throw error
        res.json({ data })
    } catch (error: any) {
        console.error('[Admin] Update Cashier Error:', error)
        res.status(500).json({ error: error.message })
    }
}

export async function getTillsHandler(req: Request, res: Response) {
    try {
        const supabase = getAdminClient()
        const { data, error } = await supabase
            .from('pos_tills')
            .select('id, code_hint, label, shop, status, created_at, updated_at')
            .order('shop', { ascending: true })
            .order('label', { ascending: true })

        if (error) throw error
        res.json({ data })
    } catch (error: any) {
        console.error('[Admin] Get Tills Error:', error)
        res.status(error.statusCode || 500).json({ error: error.message })
    }
}

export async function createTillHandler(req: Request, res: Response) {
    try {
        const { code, label, shop, status } = req.body
        if (!code) {
            return res.status(400).json({ error: 'Till code is required' })
        }

        const normalizedCode = normalizeTillCode(String(code))
        validateTillCode(normalizedCode)

        const tillStatus = status || 'active'
        if (!VALID_TILL_STATUSES.has(tillStatus)) {
            return res.status(400).json({ error: 'Till status must be active or inactive' })
        }

        const supabase = getAdminClient()
        const { data, error } = await supabase
            .from('pos_tills')
            .insert({
                code_hash: hashSecret(normalizedCode),
                code_hint: normalizedCode,
                label: label?.trim() || `${normalizedCode} Till`,
                shop: shop || DEFAULT_SHOP,
                status: tillStatus,
            })
            .select('id, code_hint, label, shop, status, created_at, updated_at')
            .single()

        if (error) throw error
        res.json({ data })
    } catch (error: any) {
        console.error('[Admin] Create Till Error:', error)
        const message = error.code === '23505' ? 'Till code already exists' : error.message
        res.status(error.statusCode || (error.code === '23505' ? 400 : 500)).json({ error: message })
    }
}

export async function updateTillHandler(req: Request, res: Response) {
    try {
        const { id } = req.params
        const { code, label, shop, status } = req.body
        const updates: Record<string, any> = { updated_at: new Date().toISOString() }

        if (code !== undefined && String(code).trim()) {
            const normalizedCode = normalizeTillCode(String(code))
            validateTillCode(normalizedCode)
            updates.code_hash = hashSecret(normalizedCode)
            updates.code_hint = normalizedCode
        }

        if (label !== undefined) {
            const normalizedLabel = String(label).trim()
            if (!normalizedLabel) {
                return res.status(400).json({ error: 'Till label cannot be empty' })
            }
            updates.label = normalizedLabel
        }

        if (shop !== undefined) {
            updates.shop = shop || DEFAULT_SHOP
        }

        if (status !== undefined) {
            if (!VALID_TILL_STATUSES.has(status)) {
                return res.status(400).json({ error: 'Till status must be active or inactive' })
            }
            updates.status = status
        }

        if (Object.keys(updates).length === 1) {
            return res.status(400).json({ error: 'No till changes provided' })
        }

        const supabase = getAdminClient()
        const { data, error } = await supabase
            .from('pos_tills')
            .update(updates)
            .eq('id', id)
            .select('id, code_hint, label, shop, status, created_at, updated_at')
            .single()

        if (error) throw error
        res.json({ data })
    } catch (error: any) {
        console.error('[Admin] Update Till Error:', error)
        const message = error.code === '23505' ? 'Till code already exists' : error.message
        res.status(error.statusCode || (error.code === '23505' ? 400 : 500)).json({ error: message })
    }
}
