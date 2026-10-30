/**
 * Product-bearing inventory routes require a live panel or till session.
 * Other legacy inventory routes retain the INVENTORY_API_STRICT switch.
 * Till identity is resolved from its hashed token and cached on the request.
 */
import crypto from 'crypto'
import { NextFunction, Request, Response } from 'express'
import { getServiceClient, resolvePanelActor } from './panel-session'

export const TILL_SESSION_HEADER = 'x-till-session'

const isStrict = () => String(process.env.INVENTORY_API_STRICT).trim().toLowerCase() === 'true'

export interface VerifiedTillSession {
  id: string
  cashier_id: string
  cashier_email: string
  cashier_name: string
  role: string
  shop: string
  expires_at: string
}

declare global {
  namespace Express {
    interface Request {
      verifiedTillSession?: VerifiedTillSession
      tillSessionChecked?: boolean
      cashierCatalogRestricted?: boolean
    }
  }
}

/** An open, unexpired till session matching the presented token. */
export async function getVerifiedTillSession(req: Request): Promise<VerifiedTillSession | null> {
  if (req.tillSessionChecked) return req.verifiedTillSession || null
  req.tillSessionChecked = true
  const header = req.headers[TILL_SESSION_HEADER]
  const headerToken = Array.isArray(header) ? header[0] : header
  const bodyToken = req.body?.pos_session_token
  const token = headerToken || bodyToken
  if (!token || typeof token !== 'string' || !token.trim()) return null
  if (headerToken && bodyToken && headerToken !== bodyToken) return null
  if (bodyToken && !req.body?.pos_session_id) return null

  try {
    const client = getServiceClient()
    let query = client
      .from('pos_till_sessions')
      .select('id, status, expires_at, cashier_id, cashier_email, cashier_name, role, shop')
      .eq('session_token_hash', crypto.createHash('sha256').update(token.trim()).digest('hex'))
    if (req.body?.pos_session_id) query = query.eq('id', req.body.pos_session_id)
    const { data, error } = await query.maybeSingle()

    if (error || !data || data.status !== 'open' || new Date(data.expires_at).getTime() <= Date.now() || !Number.isFinite(new Date(data.expires_at).getTime())) return null
    req.verifiedTillSession = data
    return data
  } catch (error: any) {
    console.warn('[InventoryGuard] Till session lookup failed:', error?.message)
    return null
  }
}

export async function hasValidTillSession(req: Request): Promise<boolean> {
  return Boolean(await getVerifiedTillSession(req))
}

export async function guardInventoryApi(req: Request, res: Response, next: NextFunction) {
  let authorised = false

  try {
    const actor = await resolvePanelActor(req)
    if (actor) {
      req.actor = actor
      authorised = true
    } else {
      authorised = await hasValidTillSession(req)
    }
  } catch (error: any) {
    console.warn('[InventoryGuard] Could not resolve caller:', error?.message)
  }

  if (authorised) return next()

  // Product-bearing inventory endpoints always require a verified session.
  // Omitting a restricted till token must never reveal the unrestricted catalogue.
  const privateCatalog = /^\/(products|categories|stock|sales|reports|purchases)(\/|$)/i.test(req.path)
  if (!isStrict() && !privateCatalog) {
    console.warn(
      `[InventoryGuard] would refuse ${req.method} /api/inventory${req.path} - no panel or till session. ` +
      'Set INVENTORY_API_STRICT=true once these stop appearing.'
    )
    return next()
  }

  return res.status(401).json({ error: 'Sign in to continue', code: 'NO_SESSION' })
}
