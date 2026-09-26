/**
 * Server-side sessions for the admin panel.
 *
 * Before this module the panel had no session at all: /api/admin/* trusted
 * whoever called it, and "who is signed in" lived only in a zustand store in
 * the browser. That is survivable while every account in the panel has the same
 * (total) authority. It stops being survivable the moment a weaker account
 * exists, because "an assistant may not touch orders" can only mean something
 * if the server knows the caller is an assistant.
 *
 * Shape:
 *   - The token is 32 random bytes, base64url. It is returned to the browser
 *     once and never stored anywhere on the server.
 *   - Only sha256(token) is written to panel_sessions, so a database dump does
 *     not hand anyone a working session.
 *   - Sessions carry both an absolute expiry and an idle timeout. Either one
 *     lapsing ends the session.
 *   - Every session can be revoked server-side: suspending or deleting an
 *     assistant drops their live sessions immediately rather than waiting for
 *     a token to age out.
 *
 * The token travels in the `x-panel-session` header (set by the browser-side
 * fetch interceptor in src/lib/session-fetch.ts) and, as a fallback for plain
 * navigations such as a PDF opened in a new tab, in a host-only httpOnly
 * cookie.
 */
import crypto from 'crypto'
import { Request, Response } from 'express'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { isProduction } from '../../env'

export const SESSION_COOKIE = 'imsc_panel_session'
export const SESSION_HEADER = 'x-panel-session'

export type ActorType = 'admin' | 'assistant'

export interface PanelActor {
  type: ActorType
  id: string
  email: string
  name: string | null
  /** Only ever populated for assistants; administrators are unrestricted. */
  permissions: Record<string, boolean>
  sessionId: string
  mustChangePassword: boolean
}

/** Absolute lifetime, from issue. */
const ABSOLUTE_TTL_MS: Record<ActorType, number> = {
  admin: 12 * 60 * 60 * 1000,
  assistant: 8 * 60 * 60 * 1000,
}

/**
 * Idle timeout. Shorter for assistants: their screens are the ones most likely
 * to be left open on a shared shop machine.
 */
const IDLE_TTL_MS: Record<ActorType, number> = {
  admin: 4 * 60 * 60 * 1000,
  assistant: 45 * 60 * 1000,
}

export function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw Object.assign(new Error('Server configuration error (Supabase)'), { status: 503 })
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export const hashToken = (token: string) =>
  crypto.createHash('sha256').update(String(token)).digest('hex')

/** PostgREST's "relation does not exist", however it phrases it today. */
function isMissingSessionTable(error: any) {
  if (!error) return false
  const code = String(error.code || '')
  const message = String(error.message || '')
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    /relation .*panel_sessions.* does not exist/i.test(message) ||
    /could not find the table .*panel_sessions/i.test(message)
  )
}

export function getClientIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for']
  if (Array.isArray(forwarded)) return forwarded[0] || null
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim() || null
  return req.socket?.remoteAddress || null
}

/**
 * The token as sent by the client, and which transport carried it.
 *
 * The transport matters. A cookie is attached by the browser to any request an
 * arbitrary page can cause, so a cookie-authenticated POST is a CSRF: some
 * other site could make the administrator's browser delete a product. A custom
 * header cannot be set cross-origin without the server's own CORS blessing, so
 * a header-authenticated request is necessarily one this application made.
 *
 * Callers therefore accept the cookie only for safe methods - see
 * requireHeaderTokenForWrites in panel-auth.ts.
 */
export function readSessionTokenWithSource(
  req: Request
): { token: string; source: 'header' | 'cookie' } | null {
  const header = req.headers[SESSION_HEADER]
  if (typeof header === 'string' && header.trim()) {
    return { token: header.trim(), source: 'header' }
  }

  const auth = req.headers.authorization
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    const value = auth.slice(7).trim()
    if (value) return { token: value, source: 'header' }
  }

  const cookie = (req as any).cookies?.[SESSION_COOKIE]
  if (typeof cookie === 'string' && cookie.trim()) {
    return { token: cookie.trim(), source: 'cookie' }
  }

  return null
}

export function readSessionToken(req: Request): string | null {
  return readSessionTokenWithSource(req)?.token ?? null
}

function setSessionCookie(res: Response, token: string, maxAgeMs: number) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    // The API and the site are separate origins in production (Railway vs the
    // shop domain), so the cookie has to be SameSite=None to be sent at all -
    // which browsers only accept alongside Secure.
    sameSite: isProduction() ? 'none' : 'lax',
    secure: isProduction(),
    maxAge: maxAgeMs,
    path: '/',
  })
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: isProduction() ? 'none' : 'lax',
    secure: isProduction(),
    path: '/',
  })
}

/**
 * Issue a session. Returns the raw token - this is the only moment it exists
 * outside the caller's browser.
 */
export async function createPanelSession(opts: {
  client: SupabaseClient
  req: Request
  res?: Response
  actorType: ActorType
  actorId: string
  actorEmail: string
}): Promise<{ token: string; expiresAt: string }> {
  const { client, req, res, actorType, actorId, actorEmail } = opts

  const token = crypto.randomBytes(32).toString('base64url')
  const ttl = ABSOLUTE_TTL_MS[actorType]
  const expiresAt = new Date(Date.now() + ttl)

  const { data, error } = await client
    .from('panel_sessions')
    .insert({
      actor_type: actorType,
      actor_id: actorId,
      actor_email: actorEmail,
      token_hash: hashToken(token),
      ip_address: getClientIp(req),
      user_agent: String(req.headers['user-agent'] || '').slice(0, 500) || null,
      expires_at: expiresAt.toISOString(),
    })
    .select('id')
    .single()

  if (error || !data) {
    // The single most likely cause on a first deploy: the migration that
    // creates this table has not been run yet, and without a session nobody -
    // administrator included - can use the panel. Say so in as many words
    // rather than leaving an operator with a 500 and a login screen.
    if (isMissingSessionTable(error)) {
      console.error(
        '[PanelSession] ❌ panel_sessions does not exist. Run ' +
        'supabase/migrations/20260910_assistant_admins.sql against this database - ' +
        'the admin panel cannot sign anyone in until it has been applied.'
      )
      throw Object.assign(
        new Error(
          'The sign-in database tables are missing. Run the 20260910_assistant_admins.sql ' +
          'migration in Supabase, then try again.'
        ),
        { status: 503 }
      )
    }

    console.error('[PanelSession] Could not create session:', error)
    throw Object.assign(new Error('Could not start a session'), { status: 500 })
  }

  if (res) setSessionCookie(res, token, ttl)

  return { token, expiresAt: expiresAt.toISOString() }
}

/** Keep the number of live sessions per account bounded. */
export async function revokeOtherSessions(
  client: SupabaseClient,
  actorType: ActorType,
  actorId: string,
  reason = 'new_login'
) {
  await client
    .from('panel_sessions')
    .update({ revoked_at: new Date().toISOString(), revoked_reason: reason })
    .eq('actor_type', actorType)
    .eq('actor_id', actorId)
    .is('revoked_at', null)
}

export async function revokeSessionByToken(client: SupabaseClient, token: string) {
  await client
    .from('panel_sessions')
    .update({ revoked_at: new Date().toISOString(), revoked_reason: 'logout' })
    .eq('token_hash', hashToken(token))
    .is('revoked_at', null)
}

export async function revokeAllSessions(
  client: SupabaseClient,
  actorType: ActorType,
  actorId: string,
  reason: string
) {
  await client
    .from('panel_sessions')
    .update({ revoked_at: new Date().toISOString(), revoked_reason: reason })
    .eq('actor_type', actorType)
    .eq('actor_id', actorId)
    .is('revoked_at', null)
}

/**
 * Resolve the caller from their token.
 *
 * Returns null for anything that is not a live session belonging to a live
 * account: no token, unknown token, revoked, past its absolute expiry, idle for
 * too long, or an account that has since been suspended or deleted. The account
 * row is re-read on every request on purpose - a suspension has to take effect
 * on the assistant's very next click, not when their token expires.
 */
export async function resolvePanelActor(req: Request): Promise<PanelActor | null> {
  const token = readSessionToken(req)
  if (!token) return null

  let client: SupabaseClient
  try {
    client = getServiceClient()
  } catch {
    return null
  }

  const { data: session, error } = await client
    .from('panel_sessions')
    .select('id, actor_type, actor_id, actor_email, expires_at, revoked_at, last_seen_at')
    .eq('token_hash', hashToken(token))
    .maybeSingle()

  if (error || !session) return null
  if (session.revoked_at) return null

  const now = Date.now()
  if (new Date(session.expires_at).getTime() <= now) return null

  const actorType = session.actor_type as ActorType
  const lastSeen = new Date(session.last_seen_at).getTime()
  if (Number.isFinite(lastSeen) && now - lastSeen > IDLE_TTL_MS[actorType]) {
    await client
      .from('panel_sessions')
      .update({ revoked_at: new Date().toISOString(), revoked_reason: 'idle_timeout' })
      .eq('id', session.id)
    return null
  }

  if (actorType === 'admin') {
    const { data: admin } = await client
      .from('admins')
      .select('id, email, name, role')
      .eq('id', session.actor_id)
      .maybeSingle()

    if (!admin || String(admin.role || '').trim().toLowerCase() !== 'admin') return null

    await touch(client, session.id)
    return {
      type: 'admin',
      id: admin.id,
      email: admin.email,
      name: admin.name ?? null,
      permissions: {},
      sessionId: session.id,
      mustChangePassword: false,
    }
  }

  const { data: assistant } = await client
    .from('assistant_admins')
    .select('id, email, name, status, email_verified, permissions, must_change_password')
    .eq('id', session.actor_id)
    .maybeSingle()

  if (!assistant) return null
  if (assistant.status !== 'active' || !assistant.email_verified) return null

  await touch(client, session.id)
  return {
    type: 'assistant',
    id: assistant.id,
    email: assistant.email,
    name: assistant.name ?? null,
    permissions: (assistant.permissions || {}) as Record<string, boolean>,
    sessionId: session.id,
    mustChangePassword: Boolean(assistant.must_change_password),
  }
}

/**
 * Push the idle window forward. Written at most once a minute: the timestamp is
 * only ever compared against a 45-minute window, so a write on every single
 * request would be pure load for no behavioural difference.
 */
const lastTouched = new Map<string, number>()
async function touch(client: SupabaseClient, sessionId: string) {
  const now = Date.now()
  const previous = lastTouched.get(sessionId) || 0
  if (now - previous < 60_000) return
  lastTouched.set(sessionId, now)

  // Keep the map from growing without bound on a long-lived process.
  if (lastTouched.size > 5000) {
    for (const [key, value] of lastTouched) {
      if (now - value > 24 * 60 * 60 * 1000) lastTouched.delete(key)
    }
  }

  await client
    .from('panel_sessions')
    .update({ last_seen_at: new Date(now).toISOString() })
    .eq('id', sessionId)
}
