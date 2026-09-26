/**
 * Optional authentication for /api/inventory.
 *
 * Why this is opt-in, when nothing else here is:
 *
 *   /api/inventory has always been open, and it is what the POS runs on. A
 *   guard that turns on by itself would, on the first deploy, stop the shop
 *   selling things - during trading hours, with no obvious cause visible from
 *   the till. That is a worse outcome than the exposure it fixes, so the switch
 *   is the operator's to throw.
 *
 * What it costs to throw it: nothing on the client side. The browser already
 * attaches whichever session it holds (src/lib/session-fetch.ts sends the panel
 * token for admin and assistant screens, and the till token for the POS), so
 * turning this on is a single environment variable:
 *
 *   INVENTORY_API_STRICT=true
 *
 * Verify first by watching for the [InventoryGuard] "would refuse" lines this
 * middleware logs while it is off. When there are none during a normal trading
 * day, every caller is presenting a session and the switch is safe to throw.
 *
 * Accepted callers: an administrator, an assistant admin, or an open till
 * session from the POS.
 */
import crypto from 'crypto'
import { NextFunction, Request, Response } from 'express'
import { getServiceClient, resolvePanelActor } from './panel-session'

export const TILL_SESSION_HEADER = 'x-till-session'

const isStrict = () => String(process.env.INVENTORY_API_STRICT).trim().toLowerCase() === 'true'

/** An open, unexpired till session matching the presented token. */
async function hasValidTillSession(req: Request): Promise<boolean> {
  const header = req.headers[TILL_SESSION_HEADER]
  const token = Array.isArray(header) ? header[0] : header
  if (!token || typeof token !== 'string' || !token.trim()) return false

  try {
    const client = getServiceClient()
    const { data } = await client
      .from('pos_till_sessions')
      .select('id, status, expires_at')
      .eq('session_token_hash', crypto.createHash('sha256').update(token.trim()).digest('hex'))
      .maybeSingle()

    if (!data) return false
    if (data.status !== 'open') return false
    return new Date(data.expires_at).getTime() > Date.now()
  } catch (error: any) {
    console.warn('[InventoryGuard] Till session lookup failed:', error?.message)
    return false
  }
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

  if (!isStrict()) {
    console.warn(
      `[InventoryGuard] would refuse ${req.method} /api/inventory${req.path} - no panel or till session. ` +
      'Set INVENTORY_API_STRICT=true once these stop appearing.'
    )
    return next()
  }

  return res.status(401).json({ error: 'Sign in to continue', code: 'NO_SESSION' })
}
