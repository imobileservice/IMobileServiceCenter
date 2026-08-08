import { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import { getSupabaseAdmin } from '../inventory/supabase-admin'
import { verifyPassword } from '../utils/password'

const SESSION_HOURS = 12

const hashToken = (value: string) => crypto.createHash('sha256').update(value).digest('hex')

const getClientIp = (req: Request) => {
  const forwardedFor = req.headers['x-forwarded-for']
  if (Array.isArray(forwardedFor)) return forwardedFor[0]
  if (typeof forwardedFor === 'string') return forwardedFor.split(',')[0]?.trim()
  return req.socket.remoteAddress || null
}

/**
 * The bearer token from the portal, if any.
 *
 * Sent in a header rather than a cookie because the portal is served from
 * imobileservicecenter.lk while this API answers on a Railway domain - a
 * cross-site cookie needs SameSite=None and gets dropped by the stricter
 * browser defaults. The POS terminal carries its till session the same way.
 */
const readToken = (req: Request) => {
  const header = req.headers.authorization
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim()
  }
  const alt = req.headers['x-supplier-token']
  return typeof alt === 'string' ? alt.trim() : ''
}

export interface SupplierRequest extends Request {
  supplier?: { id: string; name: string; email: string }
}

/**
 * Resolves the session and pins the supplier id onto the request.
 *
 * This is the whole security model of the portal. Every downstream handler
 * reads req.supplier.id and NEVER a supplier id from the URL or body, so one
 * supplier cannot ask for another's products, costs or replies by editing a
 * request. Anything mounted behind this middleware is safe by construction;
 * anything that takes an :id from the caller is not.
 */
export async function requireSupplier(req: SupplierRequest, res: Response, next: NextFunction) {
  try {
    const token = readToken(req)
    if (!token) return res.status(401).json({ error: 'Not signed in' })

    const supabase = getSupabaseAdmin()
    const { data: session } = await supabase
      .from('supplier_sessions')
      .select('id, supplier_id, expires_at')
      .eq('token_hash', hashToken(token))
      .maybeSingle()

    if (!session) return res.status(401).json({ error: 'Not signed in' })

    if (new Date(session.expires_at) < new Date()) {
      await supabase.from('supplier_sessions').delete().eq('id', session.id)
      return res.status(401).json({ error: 'Your session has expired. Please sign in again.' })
    }

    const { data: supplier } = await supabase
      .from('inv_suppliers')
      .select('id, name, email, portal_enabled, is_active')
      .eq('id', session.supplier_id)
      .maybeSingle()

    // Access is re-checked on every request, not just at login, so switching
    // portal_enabled off in the admin panel takes effect immediately instead of
    // when the token happens to expire.
    if (!supplier || !supplier.portal_enabled || supplier.is_active === false) {
      await supabase.from('supplier_sessions').delete().eq('id', session.id)
      return res.status(403).json({ error: 'This supplier account is no longer active' })
    }

    await supabase
      .from('supplier_sessions')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', session.id)

    req.supplier = { id: supplier.id, name: supplier.name, email: supplier.email }
    next()
  } catch (error: any) {
    console.error('[Supplier] Session check failed:', error)
    res.status(500).json({ error: 'Could not verify your session' })
  }
}

/** POST /api/supplier/login */
export async function loginSupplierHandler(req: Request, res: Response) {
  try {
    const { email, password } = req.body || {}
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    const normalizedEmail = String(email).toLowerCase().trim()
    const supabase = getSupabaseAdmin()

    const { data: supplier, error } = await supabase
      .from('inv_suppliers')
      .select('id, name, email, portal_password, portal_enabled, is_active')
      .ilike('email', normalizedEmail)
      .maybeSingle()

    // One message for every failure below - wrong password, portal switched
    // off, no such supplier. Anything more specific tells an outsider which of
    // your supplier emails are real accounts.
    const reject = () => res.status(401).json({ error: 'Invalid email or password' })

    if (error || !supplier) return reject()
    if (!supplier.portal_enabled || supplier.is_active === false) return reject()
    if (!supplier.portal_password) return reject()
    if (!verifyPassword(String(password), supplier.portal_password)) return reject()

    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString()

    const { error: sessionError } = await supabase.from('supplier_sessions').insert({
      supplier_id: supplier.id,
      token_hash: hashToken(token),
      expires_at: expiresAt,
      ip_address: getClientIp(req),
      user_agent: req.headers['user-agent'] || null,
    })

    if (sessionError) {
      console.error('[Supplier] Could not open session:', sessionError)
      return res.status(500).json({ error: 'Could not start your session' })
    }

    await supabase
      .from('inv_suppliers')
      .update({ portal_last_login_at: new Date().toISOString() })
      .eq('id', supplier.id)

    console.log(`[Supplier] ✅ Portal login: ${supplier.name} <${supplier.email}>`)

    return res.json({
      success: true,
      token,
      expiresAt,
      supplier: { id: supplier.id, name: supplier.name, email: supplier.email },
    })
  } catch (error: any) {
    console.error('[Supplier] Login error:', error)
    return res.status(500).json({ error: 'Internal Server Error' })
  }
}

/** POST /api/supplier/logout */
export async function logoutSupplierHandler(req: Request, res: Response) {
  try {
    const token = readToken(req)
    if (token) {
      await getSupabaseAdmin().from('supplier_sessions').delete().eq('token_hash', hashToken(token))
    }
    // Always a success: the client clears its own state either way, and a
    // failed logout must never leave the supplier stuck on a dead session.
    return res.json({ success: true })
  } catch (error: any) {
    console.error('[Supplier] Logout error:', error)
    return res.json({ success: true })
  }
}

/** GET /api/supplier/session - lets the portal restore a refresh. */
export async function supplierSessionHandler(req: SupplierRequest, res: Response) {
  return res.json({ success: true, supplier: req.supplier })
}
