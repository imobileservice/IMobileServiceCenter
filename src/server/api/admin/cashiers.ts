import { Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { hashPassword } from '../utils/password'

const DEFAULT_SHOP = 'Meegoda'
const VALID_TILL_STATUSES = new Set(['active', 'inactive'])
const TILL_SELECT = 'id, code_hint, label, shop, status, assigned_cashier_id, created_at, updated_at'

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

async function getTillCashier(supabase: any, cashierId: string) {
    if (!cashierId?.trim()) {
        throw Object.assign(new Error('Assign this till code to a cashier'), { statusCode: 400 })
    }

    const { data, error } = await supabase
        .from('admins')
        .select('id, email, name, role, shop')
        .eq('id', cashierId)
        .eq('role', 'cashier')
        .single()

    if (error || !data) {
        throw Object.assign(new Error('Assigned cashier was not found'), { statusCode: 400 })
    }

    return data
}

function getCashierShop(cashier: any) {
    return cashier?.shop || DEFAULT_SHOP
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
            .select(TILL_SELECT)
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
        const { code, label, shop, status, assigned_cashier_id } = req.body
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
        const assignedCashier = await getTillCashier(supabase, String(assigned_cashier_id || ''))
        const assignedShop = getCashierShop(assignedCashier)
        const tillShop = shop || assignedShop

        if (tillShop !== assignedShop) {
            return res.status(400).json({ error: `This cashier is assigned to ${assignedShop}. The till shop must match.` })
        }

        const { data, error } = await supabase
            .from('pos_tills')
            .insert({
                code_hash: hashSecret(normalizedCode),
                code_hint: normalizedCode,
                label: label?.trim() || `${normalizedCode} Till`,
                shop: tillShop,
                status: tillStatus,
                assigned_cashier_id: assignedCashier.id,
            })
            .select(TILL_SELECT)
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
        const { code, label, shop, status, assigned_cashier_id } = req.body
        const updates: Record<string, any> = { updated_at: new Date().toISOString() }
        const supabase = getAdminClient()

        const { data: existingTill, error: existingError } = await supabase
            .from('pos_tills')
            .select('id, shop, status, assigned_cashier_id')
            .eq('id', id)
            .single()

        if (existingError || !existingTill) {
            return res.status(404).json({ error: 'Till code not found' })
        }

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

        const effectiveAssignedCashierId = assigned_cashier_id !== undefined
            ? String(assigned_cashier_id || '').trim()
            : existingTill.assigned_cashier_id
        const effectiveStatus = status !== undefined ? status : existingTill.status
        let assignedCashier: any = null

        if (assigned_cashier_id !== undefined) {
            assignedCashier = await getTillCashier(supabase, effectiveAssignedCashierId)
            updates.assigned_cashier_id = assignedCashier.id
        } else if (effectiveAssignedCashierId) {
            assignedCashier = await getTillCashier(supabase, effectiveAssignedCashierId)
        }

        if (effectiveStatus === 'active' && !effectiveAssignedCashierId) {
            return res.status(400).json({ error: 'Active till codes must be assigned to a cashier' })
        }

        if (assignedCashier) {
            const assignedShop = getCashierShop(assignedCashier)
            const effectiveShop = shop !== undefined ? (shop || DEFAULT_SHOP) : (existingTill.shop || DEFAULT_SHOP)

            if (effectiveShop !== assignedShop) {
                return res.status(400).json({ error: `This cashier is assigned to ${assignedShop}. The till shop must match.` })
            }
        }

        if (Object.keys(updates).length === 1) {
            return res.status(400).json({ error: 'No till changes provided' })
        }

        const { data, error } = await supabase
            .from('pos_tills')
            .update(updates)
            .eq('id', id)
            .select(TILL_SELECT)
            .single()

        if (error) throw error
        res.json({ data })
    } catch (error: any) {
        console.error('[Admin] Update Till Error:', error)
        const message = error.code === '23505' ? 'Till code already exists' : error.message
        res.status(error.statusCode || (error.code === '23505' ? 400 : 500)).json({ error: message })
    }
}
