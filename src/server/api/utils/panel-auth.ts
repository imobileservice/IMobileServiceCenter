/**
 * Authorisation middleware for the admin panel.
 *
 * Two rules, both enforced here rather than in the UI:
 *
 *   requireAdmin      - a live session belonging to a row in `admins`.
 *   requireAssistant  - a live session belonging to an active, email-verified
 *                       row in `assistant_admins`, holding a named permission.
 *
 * The sidebar hiding a link is a convenience. This file is the boundary: an
 * assistant who types /admin/orders into the address bar, or curls
 * /api/admin/data/orders with their own session token, gets a 403 from here.
 */
import { NextFunction, Request, Response } from 'express'
import { PanelActor, readSessionTokenWithSource, resolvePanelActor } from './panel-session'
import { recordAudit } from './assistant-audit'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Refuse a write that is authenticated only by the session cookie.
 *
 * The cookie exists so a plain navigation - a PDF opened in a new tab - can be
 * authorised, and for nothing else. A browser attaches it to any cross-site
 * request too, so accepting it on a POST or DELETE would mean any page the
 * signed-in administrator visits could make their browser change this shop's
 * data. The `x-panel-session` header cannot be forged that way, so writes must
 * carry it.
 *
 * Returns true when the request has been answered and the caller should stop.
 */
function rejectCookieOnlyWrite(req: Request, res: Response): boolean {
  if (SAFE_METHODS.has(req.method)) return false

  const presented = readSessionTokenWithSource(req)
  if (!presented || presented.source === 'header') return false

  console.warn(
    `[PanelAuth] Refused cookie-only ${req.method} ${req.originalUrl} from ${req.headers.origin || 'unknown origin'}`
  )
  res.status(401).json({
    error: 'Sign in again to continue',
    code: 'HEADER_TOKEN_REQUIRED',
  })
  return true
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor?: PanelActor
    }
  }
}

/**
 * Resolve the caller if they present a token, without requiring one.
 * Handlers that serve both account kinds use this and branch on req.actor.
 */
export async function attachActor(req: Request, _res: Response, next: NextFunction) {
  try {
    // A cookie-only write is left unauthenticated rather than rejected here, so
    // the handler answers it the same way it answers a request with no session
    // at all. See rejectCookieOnlyWrite for why the cookie is not enough.
    const presented = readSessionTokenWithSource(req)
    if (presented && presented.source === 'cookie' && !SAFE_METHODS.has(req.method)) {
      return next()
    }

    req.actor = (await resolvePanelActor(req)) || undefined
  } catch (error) {
    console.warn('[PanelAuth] Could not resolve actor:', error)
  }
  next()
}

/** Full administrator only. */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (rejectCookieOnlyWrite(req, res)) return

  const actor = req.actor ?? (await resolvePanelActor(req)) ?? undefined
  req.actor = actor

  if (!actor) {
    return res.status(401).json({ error: 'Sign in to continue', code: 'NO_SESSION' })
  }

  if (actor.type !== 'admin') {
    // An assistant reaching an administrator-only route is worth recording:
    // it is either a bug in their UI or someone probing the API by hand.
    void recordAudit({
      assistantId: actor.id,
      actorEmail: actor.email,
      action: 'access.denied',
      resource: 'admin_route',
      resourceId: `${req.method} ${req.originalUrl}`,
      success: false,
      detail: { reason: 'administrator only' },
      req,
    })
    return res.status(403).json({ error: 'Administrator access required', code: 'FORBIDDEN' })
  }

  next()
}

/**
 * Assistant admin holding `permission`.
 *
 * An administrator is also allowed through - the assistant endpoints are a
 * strict subset of what an administrator can already do, and letting the owner
 * open the same screens to check on them is useful rather than dangerous.
 */
export function requireAssistant(permission?: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (rejectCookieOnlyWrite(req, res)) return

    const actor = req.actor ?? (await resolvePanelActor(req)) ?? undefined
    req.actor = actor

    if (!actor) {
      return res.status(401).json({ error: 'Sign in to continue', code: 'NO_SESSION' })
    }

    if (actor.type === 'admin') return next()

    // A password reset by an administrator parks the account here: the only
    // thing reachable is the change-password endpoint, which sets its own route
    // up before this middleware runs.
    if (actor.mustChangePassword) {
      return res.status(403).json({
        error: 'Set a new password before continuing',
        code: 'PASSWORD_CHANGE_REQUIRED',
      })
    }

    if (permission && actor.permissions?.[permission] !== true) {
      void recordAudit({
        assistantId: actor.id,
        actorEmail: actor.email,
        action: 'permission.denied',
        resource: permission,
        resourceId: `${req.method} ${req.originalUrl}`,
        success: false,
        detail: { permission },
        req,
      })
      return res.status(403).json({
        error: 'You do not have permission for this action',
        code: 'PERMISSION_DENIED',
        permission,
      })
    }

    next()
  }
}

/**
 * Gate for the legacy /api/admin router.
 *
 * Every route under /api/admin is administrator-only, with two exceptions that
 * cannot carry a session by their nature:
 *
 *   /login/*                  - this is how a session is obtained.
 *   /orders/:id/delivery-bill - opened with window.open() from the cashier
 *                               terminal, and a new tab cannot attach a header.
 *
 * ADMIN_API_OPEN=true disables the gate. It exists only as an emergency lever
 * for an operator locked out by a misconfiguration; it leaves the whole panel
 * API unauthenticated and logs loudly on every request that uses it.
 */
const EXEMPT_PATTERNS: RegExp[] = [
  /^\/login(\/|$)/,
  /^\/orders\/[^/]+\/delivery-bill$/,
]

export async function guardAdminApi(req: Request, res: Response, next: NextFunction) {
  const path = req.path || ''

  if (EXEMPT_PATTERNS.some((pattern) => pattern.test(path))) return next()

  if (String(process.env.ADMIN_API_OPEN).trim().toLowerCase() === 'true') {
    console.warn(
      `[PanelAuth] ⚠️ ADMIN_API_OPEN is set - ${req.method} ${req.originalUrl} served WITHOUT authentication. ` +
      'Unset it as soon as the panel can sign in again.'
    )
    return next()
  }

  return requireAdmin(req, res, next)
}
