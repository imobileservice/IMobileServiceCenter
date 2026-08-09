import { Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { verifyPassword } from '../utils/password'

const POS_ROLES = new Set(['cashier', 'admin'])
const DEFAULT_SHOP = 'Meegoda'
const TILL_SESSION_HOURS = 6

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

/**
 * Find the account behind a POS login, in either table.
 *
 * Cashiers live in `cashiers` (20260805_split_cashiers_from_admins.sql) and
 * administrators in `admins`, but the POS accepts either (see POS_ROLES), so
 * both are read.
 *
 * `cashiers` wins a tie, and the tie is the important part. A stray period left
 * some people in BOTH tables with two different ids, and pos_tills stores a
 * `cashiers`.id - Cashier Management is what writes it. Resolving to the admins
 * row instead would hand the till check an id that could never match its own
 * assignment, which is exactly how "this till code is assigned to another
 * cashier" reached someone who had changed nothing.
 * 20260811_consolidate_cashier_accounts.sql removes the duplicates; this
 * ordering makes the login correct even before it is run.
 *
 * The role is lower-cased on the way out. It is compared against POS_ROLES and
 * against 'cashier' below, and the admins table used to hold both 'Admin' and
 * 'admin' - the capitalised spelling silently failed every one of those checks.
 */
async function findPosAccount(adminClient: any, normalizedEmail: string) {
    const columns = 'id, email, name, password, role, shop'

    const [{ data: cashier }, { data: admin }] = await Promise.all([
        adminClient.from('cashiers').select(columns).eq('email', normalizedEmail).maybeSingle(),
        adminClient.from('admins').select(columns).eq('email', normalizedEmail).maybeSingle(),
    ])

    if (cashier && admin) {
        console.warn(
            `[Cashier] ${normalizedEmail} exists in BOTH cashiers (${cashier.id}) and admins (${admin.id}). ` +
            'Using the cashiers row. Run 20260811_consolidate_cashier_accounts.sql to remove the duplicate.'
        )
    }

    const account = cashier || admin
    if (!account) return null

    return { ...account, role: String(account.role ?? '').trim().toLowerCase() }
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

        const account = await findPosAccount(adminClient, normalizedEmail)

        if (!account || !verifyPassword(String(password), account.password)) {
            await logPosAuthEvent(adminClient, req, {
                cashier_email: normalizedEmail,
                event_type: 'login_failed',
                success: false,
                reason: 'invalid_credentials',
            })
            return res.status(401).json({ error: 'Invalid email or password' })
        }

        if (!POS_ROLES.has(account.role)) {
            await logPosAuthEvent(adminClient, req, {
                cashier_email: normalizedEmail,
                cashier_id: account.id,
                role: account.role,
                event_type: 'login_failed',
                success: false,
                reason: 'unauthorized_role',
            })
            return res.status(403).json({ error: 'This account cannot access the POS terminal' })
        }

        const { data: till, error: tillError } = await adminClient
            .from('pos_tills')
            .select('id, code_hint, label, shop, status, assigned_cashier_id')
            .eq('code_hash', hashSecret(normalizedTillCode))
            .single()

        if (tillError || !till) {
            await logPosAuthEvent(adminClient, req, {
                cashier_email: normalizedEmail,
                cashier_id: account.id,
                role: account.role,
                event_type: 'login_failed',
                success: false,
                reason: 'invalid_till_code',
            })
            return res.status(401).json({ error: 'Invalid till code' })
        }

        if (till.status !== 'active') {
            await logPosAuthEvent(adminClient, req, {
                cashier_email: normalizedEmail,
                cashier_id: account.id,
                role: account.role,
                till_id: till.id,
                event_type: 'login_failed',
                success: false,
                reason: 'inactive_till',
            })
            return res.status(403).json({ error: 'This till is not active' })
        }

        /*
         * Who owns this till code.
         *
         * The assignment is enforced for cashiers only. An administrator may
         * open any active till: they already have the run of the admin panel,
         * so refusing them a till adds no protection and did the opposite of
         * protecting anyone - every till created through Cashier Management is
         * assigned to a cashier, which left the owner unable to open any of
         * them.
         */
        if (account.role === 'cashier') {
            if (!till.assigned_cashier_id) {
                await logPosAuthEvent(adminClient, req, {
                    cashier_email: normalizedEmail,
                    cashier_id: account.id,
                    role: account.role,
                    till_id: till.id,
                    event_type: 'login_failed',
                    success: false,
                    reason: 'unassigned_till_code',
                })
                return res.status(403).json({ error: 'This till code is not assigned to this cashier' })
            }

            if (till.assigned_cashier_id !== account.id) {
                // Is it really someone else's, or is it pointing at an id that
                // no longer exists? The two need different answers: one is "use
                // your own till", the other is "this data is broken, and no
                // amount of retyping the code will help".
                const { data: owner } = await adminClient
                    .from('cashiers')
                    .select('id, email')
                    .eq('id', till.assigned_cashier_id)
                    .maybeSingle()

                const reason = owner ? 'till_assigned_to_another_cashier' : 'till_assignment_stale'

                await logPosAuthEvent(adminClient, req, {
                    cashier_email: normalizedEmail,
                    cashier_id: account.id,
                    role: account.role,
                    till_id: till.id,
                    event_type: 'login_failed',
                    success: false,
                    reason,
                })

                if (!owner) {
                    console.error(
                        `[Cashier] Till ${till.code_hint} is assigned to ${till.assigned_cashier_id}, which is not a ` +
                        `cashier. ${normalizedEmail} is ${account.id}. This is the cross-table id drift fixed by ` +
                        'supabase/migrations/20260811_consolidate_cashier_accounts.sql - run it, or reassign the till ' +
                        'in Cashier Management.'
                    )
                    return res.status(409).json({
                        error: 'This till code is not set up correctly. Please ask an administrator to reassign it in Cashier Management.',
                    })
                }

                console.warn(
                    `[Cashier] ${normalizedEmail} tried till ${till.code_hint}, which belongs to ${owner.email}`
                )
                return res.status(403).json({ error: 'This till code is assigned to another cashier' })
            }
        } else if (till.assigned_cashier_id && till.assigned_cashier_id !== account.id) {
            console.log(
                `[Cashier] Administrator ${normalizedEmail} opening till ${till.code_hint}, which is assigned to a cashier`
            )
        }

        const accountShop = account.shop || DEFAULT_SHOP
        const effectiveShop = till.shop || accountShop

        if (account.role === 'cashier' && accountShop !== effectiveShop) {
            await logPosAuthEvent(adminClient, req, {
                cashier_email: normalizedEmail,
                cashier_id: account.id,
                role: account.role,
                till_id: till.id,
                event_type: 'login_failed',
                success: false,
                reason: 'shop_mismatch',
            })
            return res.status(403).json({ error: `This cashier is assigned to ${accountShop}, not ${effectiveShop}` })
        }

        const sessionToken = crypto.randomBytes(32).toString('hex')
        const sessionTokenHash = hashSecret(sessionToken)
        const now = Date.now()
        const openedAt = new Date(now).toISOString()
        const expiresAt = new Date(now + TILL_SESSION_HOURS * 60 * 60 * 1000).toISOString()

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
                cashier_id: account.id,
                cashier_email: account.email || normalizedEmail,
                cashier_name: account.name || 'Cashier',
                role: account.role,
                shop: effectiveShop,
                opening_float: Number(opening_float || 0),
                session_token_hash: sessionTokenHash,
                device_fingerprint: device_fingerprint || null,
                ip_address: getClientIp(req),
                user_agent: req.headers['user-agent'] || null,
                opened_at: openedAt,
                expires_at: expiresAt,
                last_seen_at: openedAt,
                status: 'open',
            })
            .select('id, till_id, shop, opening_float, opened_at, expires_at, status')
            .single()

        if (sessionError || !tillSession) {
            console.error('[Cashier] Failed to create till session:', sessionError)
            return res.status(500).json({ error: 'Failed to open till session' })
        }

        await logPosAuthEvent(adminClient, req, {
            cashier_email: normalizedEmail,
            cashier_id: account.id,
            role: account.role,
            till_id: till.id,
            event_type: 'login_success',
            success: true,
        })

        return res.json({
            success: true,
            cashier: {
                id: account.id,
                email: account.email || normalizedEmail,
                name: account.name || (account.role === 'admin' ? 'Admin' : 'Cashier'),
                role: account.role,
                shop: effectiveShop,
            },
            tillSession: {
                id: tillSession.id,
                token: sessionToken,
                status: tillSession.status,
                opened_at: tillSession.opened_at,
                expires_at: tillSession.expires_at,
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
