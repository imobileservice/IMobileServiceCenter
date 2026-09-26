/**
 * The administrator's own session endpoints.
 *
 * The session itself is created at the end of /login/verify; these two exist so
 * the panel can ask "am I still signed in?" on load and give the token back
 * when the administrator signs out.
 */
import { Request, Response } from 'express'
import {
  clearSessionCookie,
  getServiceClient,
  readSessionToken,
  revokeSessionByToken,
} from '../utils/panel-session'

/**
 * GET /api/admin/session
 *
 * Reached only through guardAdminApi, so arriving here at all means the caller
 * holds a live administrator session - a 401 from the gate is the answer to
 * "no" and this body is the answer to "yes".
 */
export async function adminSessionHandler(req: Request, res: Response) {
  const actor = req.actor
  if (!actor) return res.status(401).json({ error: 'Sign in to continue', code: 'NO_SESSION' })

  return res.json({
    data: {
      id: actor.id,
      email: actor.email,
      name: actor.name,
      type: actor.type,
      role: 'admin',
    },
  })
}

/** POST /api/admin/logout */
export async function adminLogoutHandler(req: Request, res: Response) {
  try {
    const token = readSessionToken(req)
    if (token) await revokeSessionByToken(getServiceClient(), token)
  } catch (error: any) {
    console.warn('[Admin] Logout cleanup failed:', error?.message)
  }

  clearSessionCookie(res)
  return res.json({ success: true })
}
