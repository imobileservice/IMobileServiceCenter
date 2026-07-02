import { Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { verifyPassword } from '../utils/password'

const POS_ROLES = new Set(['cashier', 'admin'])
const DEFAULT_SHOP = 'Meegoda'

function getSupabaseConfig() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Server configuration error (Supabase)')
    }

    return { supabaseUrl, supabaseServiceKey }
}

function normalizeEmail(email: string) {
    return email.toLowerCase().trim()
}

function normalizeTillCode(tillCode: string) {
    return tillCode.trim().toUpperCase()
}

function hashSecret(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex')
}

function getClientIp(req: Request) {
    const forwardedFor = req.headers['x-forwarded-for']
    if (Array.isArray(forwardedFor)) return forwardedFor[0]
    if (typeof forwardedFor === 'string') return forwardedFor.split(',')[0]?.trim()
    return req.socket.remoteAddress || null
}

async function logPosAuthEvent(adminClient: any, req: Request, event: {
    cashier_email?: string
    cashier_id?: string
    role?: string
    till_id?: string
    event_type: string
    success: boolean
    reason?: string
}) {
    try {
        await adminClient.from('pos_auth_events').insert({
            cashier_email: event.cashier_email || null,
            cashier_id: event.cashier_id || null,
            role: event.role || null,
            till_id: event.till_id || null,
            event_type: event.event_type,
            success: event.success,
            reason: event.reason || null,
            ip_address: getClientIp(req),
            user_agent: req.headers['user-agent'] || null,
        })
    } catch (error) {
        console.warn('[Cashier] Failed to write POS auth event:', error)
    }
}

/**
 * POST /api/cashier/login
 * Direct POS login without email OTP. Validates cashier/admin credentials,
 * validates the till code, then opens a till session for auditability.
 */
export async function loginCashierHandler(req: Request, res: Response) {
    const attemptedEmail = req.body?.email ? normalizeEmail(String(req.body.email)) : undefined
    console.log(`[Cashier] POS login attempt for: ${attemptedEmail || 'unknown'}`)

    let adminClient: any

    try {
        const { email, password, till_code, opening_float, device_fingerprint } = req.body

        if (!email || !password || !till_code) {
            return res.status(400).json({ error: 'Email, password, and till code are required' })
        }

        const normalizedEmail = normalizeEmail(String(email))
        const normalizedTillCode = normalizeTillCode(String(till_code))

        const { supabaseUrl, supabaseServiceKey } = getSupabaseConfig()
        adminClient = createClient(supabaseUrl, supabaseServiceKey)

        const { data: admin, error: adminError } = await adminClient
            .from('admins')
            .select('id, email, name, password, role, shop')
            .eq('email', normalizedEmail)
            .single()

        if (adminError || !admin || !verifyPassword(String(password), admin.password)) {
            await logPosAuthEvent(adminClient, req, {
                cashier_email: normalizedEmail,
                event_type: 'login_failed',
                success: false,
                reason: 'invalid_credentials',
            })
            return res.status(401).json({ error: 'Invalid email or password' })
        }

        if (!POS_ROLES.has(admin.role)) {
            await logPosAuthEvent(adminClient, req, {
                cashier_email: normalizedEmail,
                cashier_id: admin.id,
                role: admin.role,
                event_type: 'login_failed',
                success: false,
                reason: 'unauthorized_role',
            })
            return res.status(403).json({ error: 'This account cannot access the POS terminal' })
        }

        const { data: till, error: tillError } = await adminClient
            .from('pos_tills')
            .select('id, code_hint, label, shop, status')
            .eq('code_hash', hashSecret(normalizedTillCode))
            .single()

        if (tillError || !till) {
            await logPosAuthEvent(adminClient, req, {
                cashier_email: normalizedEmail,
                cashier_id: admin.id,
                role: admin.role,
                event_type: 'login_failed',
                success: false,
                reason: 'invalid_till_code',
            })
            return res.status(401).json({ error: 'Invalid till code' })
        }

        if (till.status !== 'active') {
            await logPosAuthEvent(adminClient, req, {
                cashier_email: normalizedEmail,
                cashier_id: admin.id,
                role: admin.role,
                till_id: till.id,
                event_type: 'login_failed',
                success: false,
                reason: 'inactive_till',
            })
            return res.status(403).json({ error: 'This till is not active' })
        }

        const accountShop = admin.shop || DEFAULT_SHOP
        const effectiveShop = till.shop || accountShop

        if (admin.role === 'cashier' && accountShop !== effectiveShop) {
            await logPosAuthEvent(adminClient, req, {
                cashier_email: normalizedEmail,
                cashier_id: admin.id,
                role: admin.role,
                till_id: till.id,
                event_type: 'login_failed',
                success: false,
                reason: 'shop_mismatch',
            })
            return res.status(403).json({ error: `This cashier is assigned to ${accountShop}, not ${effectiveShop}` })
        }

        const sessionToken = crypto.randomBytes(32).toString('hex')
        const sessionTokenHash = hashSecret(sessionToken)
        const openedAt = new Date().toISOString()

        await adminClient
            .from('pos_till_sessions')
            .update({
                status: 'forced_closed',
                closed_at: openedAt,
                closed_by: normalizedEmail,
            })
            .eq('till_id', till.id)
            .eq('status', 'open')

        const { data: tillSession, error: sessionError } = await adminClient
            .from('pos_till_sessions')
            .insert({
                till_id: till.id,
                cashier_id: admin.id,
                cashier_email: admin.email || normalizedEmail,
                cashier_name: admin.name || 'Cashier',
                role: admin.role,
                shop: effectiveShop,
                opening_float: Number(opening_float || 0),
                session_token_hash: sessionTokenHash,
                device_fingerprint: device_fingerprint || null,
                ip_address: getClientIp(req),
                user_agent: req.headers['user-agent'] || null,
                opened_at: openedAt,
                last_seen_at: openedAt,
                status: 'open',
            })
            .select('id, till_id, shop, opening_float, opened_at, status')
            .single()

        if (sessionError || !tillSession) {
            console.error('[Cashier] Failed to create till session:', sessionError)
            return res.status(500).json({ error: 'Failed to open till session' })
        }

        await logPosAuthEvent(adminClient, req, {
            cashier_email: normalizedEmail,
            cashier_id: admin.id,
            role: admin.role,
            till_id: till.id,
            event_type: 'login_success',
            success: true,
        })

        return res.json({
            success: true,
            cashier: {
                id: admin.id,
                email: admin.email || normalizedEmail,
                name: admin.name || (admin.role === 'admin' ? 'Admin' : 'Cashier'),
                role: admin.role,
                shop: effectiveShop,
            },
            tillSession: {
                id: tillSession.id,
                token: sessionToken,
                status: tillSession.status,
                opened_at: tillSession.opened_at,
                opening_float: Number(tillSession.opening_float || 0),
                till: {
                    id: till.id,
                    code: till.code_hint,
                    label: till.label,
                    shop: effectiveShop,
                },
            },
            message: 'POS till session opened',
        })

    } catch (error: any) {
        console.error('[Cashier] POS login error:', error)
        if (adminClient && attemptedEmail) {
            await logPosAuthEvent(adminClient, req, {
                cashier_email: attemptedEmail,
                event_type: 'login_failed',
                success: false,
                reason: 'server_error',
            })
        }
        return res.status(error.message?.includes('Supabase') ? 503 : 500).json({ error: error.message || 'Internal Server Error' })
    }
}

/**
 * POST /api/cashier/logout
 * Closes the active till session. Local logout still proceeds even if this fails.
 */
export async function logoutCashierHandler(req: Request, res: Response) {
    try {
        const { session_id, session_token, closing_float, closed_by } = req.body

        if (!session_id || !session_token) {
            return res.status(400).json({ error: 'Session id and token are required' })
        }

        const { supabaseUrl, supabaseServiceKey } = getSupabaseConfig()
        const adminClient = createClient(supabaseUrl, supabaseServiceKey)
        const tokenHash = hashSecret(String(session_token))

        const { data: session, error: sessionError } = await adminClient
            .from('pos_till_sessions')
            .select('id, session_token_hash, status, cashier_email, till_id')
            .eq('id', session_id)
            .single()

        if (sessionError || !session || session.session_token_hash !== tokenHash) {
            return res.status(401).json({ error: 'Invalid till session' })
        }

        const closedAt = new Date().toISOString()
        await adminClient
            .from('pos_till_sessions')
            .update({
                status: 'closed',
                closed_at: closedAt,
                closing_float: closing_float === undefined || closing_float === null ? null : Number(closing_float),
                closed_by: closed_by || session.cashier_email,
                last_seen_at: closedAt,
            })
            .eq('id', session_id)

        await logPosAuthEvent(adminClient, req, {
            cashier_email: session.cashier_email,
            till_id: session.till_id,
            event_type: 'logout',
            success: true,
        })

        return res.json({ success: true })
    } catch (error: any) {
        console.error('[Cashier] POS logout error:', error)
        return res.status(500).json({ error: error.message || 'Internal Server Error' })
    }
}
