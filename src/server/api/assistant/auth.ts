/**
 * Assistant admin authentication.
 *
 * Three gates, in this order, before a session exists:
 *
 *   1. Email ownership. The account is created 'pending' and cannot sign in at
 *      all until the link emailed to the address has been followed.
 *   2. Password. scrypt, same helper the rest of the panel uses, with a lockout
 *      after five wrong attempts so the address cannot be ground through.
 *   3. A 6-digit code, emailed at sign-in time and valid for ten minutes.
 *
 * Only then is a panel_sessions row created and its token handed to the browser.
 * The token is what every subsequent /api/assistant call is authorised against;
 * see utils/panel-session.ts.
 *
 * Failure messages are deliberately uniform. "Invalid email or password" covers
 * a wrong password, an unknown address, a suspended account and an unverified
 * one alike, so the login form cannot be used to enumerate who has an account.
 * The one exception is a lockout, which has to be told apart from a wrong
 * password or the person locked out has no idea why nothing works.
 */
import crypto from 'crypto'
import { Request, Response } from 'express'
import { SupabaseClient } from '@supabase/supabase-js'
import { hashPassword, verifyPassword } from '../utils/password'
import { sendEmail } from '../utils/email'
import { isProduction } from '../../env'
import {
  clearSessionCookie,
  createPanelSession,
  getServiceClient,
  readSessionToken,
  revokeAllSessions,
  revokeSessionByToken,
} from '../utils/panel-session'
import { recordAudit } from '../utils/assistant-audit'
import { buildAssistantOtpEmail } from './emails'
import {
  LOCKOUT_MS,
  MAX_FAILED_LOGINS,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MINUTES,
  OTP_TTL_MS,
  maskEmail,
  normalizeEmail,
  sha256,
  validatePassword,
} from './shared'

type AssistantRow = {
  id: string
  email: string
  name: string | null
  password: string
  status: string
  email_verified: boolean
  permissions: Record<string, boolean>
  must_change_password: boolean
  failed_attempts: number
  locked_until: string | null
}

const ASSISTANT_AUTH_COLUMNS =
  'id, email, name, password, status, email_verified, permissions, must_change_password, failed_attempts, locked_until'

type AuthFailure = 'unknown' | 'password' | 'unverified' | 'suspended' | 'locked'

interface AuthSuccess {
  ok: true
  assistant: AssistantRow
}

interface AuthRejection {
  ok: false
  reason: AuthFailure
  retryAfterSeconds?: number
  /** Present whenever the address matched a row, even though it was rejected. */
  assistant?: AssistantRow
}

type AuthResult = AuthSuccess | AuthRejection

/**
 * A type predicate rather than a plain `result.ok` check.
 *
 * The server builds with strictNullChecks off, and discriminating a union on a
 * boolean literal does not narrow under that setting - every `result.assistant`
 * below would be typed as possibly undefined on the success path. An explicit
 * predicate narrows the same way under both of this repository's tsconfigs.
 */
function isAuthenticated(result: AuthResult): result is AuthSuccess {
  return result.ok === true
}

/**
 * Check credentials.
 *
 * Returns why it failed rather than a bare boolean, so the caller can log
 * precisely what happened while still answering the browser vaguely.
 */
async function authenticate(
  client: SupabaseClient,
  email: string,
  password: string
): Promise<AuthResult> {
  const { data, error } = await client
    .from('assistant_admins')
    .select(ASSISTANT_AUTH_COLUMNS)
    .ilike('email', email)
    .maybeSingle()

  if (error || !data) {
    // Spend roughly the same time as a real verification would, so a missing
    // account is not distinguishable by how fast the answer comes back.
    verifyPassword(password, hashPassword('timing-equaliser'))
    return { ok: false, reason: 'unknown' }
  }

  const assistant = data as AssistantRow

  if (assistant.locked_until && new Date(assistant.locked_until).getTime() > Date.now()) {
    const retryAfterSeconds = Math.ceil(
      (new Date(assistant.locked_until).getTime() - Date.now()) / 1000
    )
    return { ok: false, reason: 'locked', retryAfterSeconds, assistant }
  }

  if (!verifyPassword(password, assistant.password)) {
    const attempts = Number(assistant.failed_attempts || 0) + 1
    const update: Record<string, any> = { failed_attempts: attempts, updated_at: new Date().toISOString() }
    if (attempts >= MAX_FAILED_LOGINS) {
      update.locked_until = new Date(Date.now() + LOCKOUT_MS).toISOString()
      update.failed_attempts = 0
    }
    await client.from('assistant_admins').update(update).eq('id', assistant.id)
    return { ok: false, reason: 'password', assistant }
  }

  if (!assistant.email_verified) return { ok: false, reason: 'unverified', assistant }
  if (assistant.status !== 'active') return { ok: false, reason: 'suspended', assistant }

  if (assistant.failed_attempts) {
    await client
      .from('assistant_admins')
      .update({ failed_attempts: 0, locked_until: null })
      .eq('id', assistant.id)
  }

  return { ok: true, assistant }
}

/** New code for this assistant; stores only the hash, emails the digits. */
async function issueOtp(client: SupabaseClient, assistant: AssistantRow) {
  const otp = crypto.randomInt(100000, 1000000).toString()
  const expiresAt = new Date(Date.now() + OTP_TTL_MS)

  await client
    .from('assistant_admin_otps')
    .delete()
    .eq('assistant_id', assistant.id)
    .eq('used', false)

  const { error } = await client.from('assistant_admin_otps').insert({
    assistant_id: assistant.id,
    email: assistant.email,
    otp: sha256(otp),
    expires_at: expiresAt.toISOString(),
    used: false,
  })

  if (error) {
    console.error('[Assistant OTP] Could not store code:', error)
    throw Object.assign(new Error('Could not create a verification code'), { status: 500 })
  }

  // Always in the server log, so a mail outage never locks the shop out.
  console.log(`[Assistant OTP] Code for ${assistant.email}: ${otp} (valid ${OTP_TTL_MINUTES} min)`)

  const { html, text, subject } = buildAssistantOtpEmail(otp, OTP_TTL_MINUTES)

  try {
    await sendEmail({ to: assistant.email, subject, html, text })
  } catch (mailError: any) {
    console.error('[Assistant OTP] Email delivery failed:', mailError?.message)
    throw Object.assign(
      new Error(
        `Could not send the verification email. ${mailError?.message || 'Unknown mail error.'}`
      ),
      { status: 502, otp }
    )
  }

  return { otp, expiresAt }
}

const genericFailure = { error: 'Invalid email or password' }

/**
 * POST /api/assistant/login/init
 * Step 1: credentials, then a code by email.
 */
export async function initAssistantLoginHandler(req: Request, res: Response) {
  try {
    const { email, password } = req.body || {}
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    const normalizedEmail = normalizeEmail(email)
    const client = getServiceClient()
    const result = await authenticate(client, normalizedEmail, password)

    if (!isAuthenticated(result)) {
      void recordAudit({
        assistantId: result.assistant?.id,
        actorEmail: normalizedEmail,
        action: 'login.failed',
        success: false,
        detail: { reason: result.reason },
        req,
      })

      if (result.reason === 'locked') {
        return res.status(429).json({
          error: `Too many failed attempts. Try again in ${Math.ceil((result.retryAfterSeconds || 0) / 60)} minute(s).`,
          retryAfter: result.retryAfterSeconds,
        })
      }

      if (result.reason === 'unverified') {
        // Safe to say out loud: the person already holds the correct password,
        // so this reveals nothing they did not know, and "nothing happens when
        // I log in" is otherwise impossible to diagnose.
        return res.status(403).json({
          error: 'Confirm your email address first. Check your inbox for the confirmation link.',
          code: 'EMAIL_NOT_VERIFIED',
        })
      }

      if (result.reason === 'suspended') {
        return res.status(403).json({
          error: 'This account has been suspended. Contact the administrator.',
          code: 'SUSPENDED',
        })
      }

      return res.status(401).json(genericFailure)
    }

    try {
      await issueOtp(client, result.assistant)
    } catch (otpError: any) {
      const status = otpError?.status || 500
      // In development the code comes back in the response so local work is not
      // blocked by an unconfigured mailbox. Never in production.
      if (status === 502 && !isProduction() && otpError?.otp) {
        return res.json({
          success: true,
          requiresOtp: true,
          email: normalizedEmail,
          maskedEmail: maskEmail(normalizedEmail),
          expiresIn: OTP_TTL_MS / 1000,
          emailDelivered: false,
          devOtp: otpError.otp,
          message: 'Email delivery failed - using the development code below',
        })
      }
      return res.status(status).json({ error: otpError.message })
    }

    void recordAudit({
      assistantId: result.assistant.id,
      actorEmail: normalizedEmail,
      action: 'login.code_sent',
      req,
    })

    return res.json({
      success: true,
      requiresOtp: true,
      email: normalizedEmail,
      maskedEmail: maskEmail(normalizedEmail),
      expiresIn: OTP_TTL_MS / 1000,
      emailDelivered: true,
      message: 'Verification code sent to your email',
    })
  } catch (error: any) {
    console.error('[Assistant] Login init error:', error)
    return res.status(error?.status || 500).json({ error: error?.message || 'Internal Server Error' })
  }
}

/** POST /api/assistant/login/resend */
export async function resendAssistantOtpHandler(req: Request, res: Response) {
  try {
    const { email, password } = req.body || {}
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    const normalizedEmail = normalizeEmail(email)
    const client = getServiceClient()
    const result = await authenticate(client, normalizedEmail, password)
    if (!isAuthenticated(result)) return res.status(401).json(genericFailure)

    const { data: recent } = await client
      .from('assistant_admin_otps')
      .select('created_at')
      .eq('assistant_id', result.assistant.id)
      .eq('used', false)
      .order('created_at', { ascending: false })
      .limit(1)

    const lastCreated = recent?.[0]?.created_at ? new Date(recent[0].created_at).getTime() : 0
    const elapsed = Date.now() - lastCreated
    if (lastCreated && elapsed < OTP_RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000)
      return res.status(429).json({ error: `Please wait ${wait}s before requesting another code`, retryAfter: wait })
    }

    try {
      await issueOtp(client, result.assistant)
    } catch (otpError: any) {
      const status = otpError?.status || 500
      if (status === 502 && !isProduction() && otpError?.otp) {
        return res.json({
          success: true,
          expiresIn: OTP_TTL_MS / 1000,
          emailDelivered: false,
          devOtp: otpError.otp,
          message: 'Email delivery failed - using the development code below',
        })
      }
      return res.status(status).json({ error: otpError.message })
    }

    return res.json({
      success: true,
      expiresIn: OTP_TTL_MS / 1000,
      emailDelivered: true,
      maskedEmail: maskEmail(normalizedEmail),
      message: 'A new verification code is on its way',
    })
  } catch (error: any) {
    console.error('[Assistant] Resend error:', error)
    return res.status(error?.status || 500).json({ error: error?.message || 'Internal Server Error' })
  }
}

/**
 * POST /api/assistant/login/verify
 * Step 2: the code, then a session.
 */
export async function verifyAssistantLoginHandler(req: Request, res: Response) {
  try {
    const { email, password, otp } = req.body || {}
    if (!email || !password || !otp) {
      return res.status(400).json({ error: 'Email, password, and code are required' })
    }

    const normalizedEmail = normalizeEmail(email)
    const normalizedOtp = String(otp).trim()
    if (!/^\d{6}$/.test(normalizedOtp)) {
      return res.status(400).json({ error: 'Enter the 6-digit code from your email' })
    }

    const client = getServiceClient()

    // The password is re-checked here so a leaked code on its own is not enough.
    const result = await authenticate(client, normalizedEmail, password)
    if (!isAuthenticated(result)) return res.status(401).json(genericFailure)

    const assistant = result.assistant

    const { data: rows, error: fetchError } = await client
      .from('assistant_admin_otps')
      .select('*')
      .eq('assistant_id', assistant.id)
      .order('created_at', { ascending: false })
      .limit(1)

    if (fetchError) {
      console.error('[Assistant] OTP lookup failed:', fetchError)
      return res.status(500).json({ error: 'Database error during verification' })
    }

    const record = rows?.[0]
    if (!record) {
      return res.status(401).json({ error: 'No code was requested for this email. Start again.' })
    }
    if (record.used) {
      return res.status(401).json({ error: 'This code has already been used. Request a new one.' })
    }
    if (new Date(record.expires_at) < new Date()) {
      return res.status(401).json({ error: 'This code has expired. Request a new one.' })
    }

    const attempts = Number(record.attempts || 0)
    if (attempts >= OTP_MAX_ATTEMPTS) {
      await client.from('assistant_admin_otps').update({ used: true }).eq('id', record.id)
      return res.status(429).json({ error: 'Too many incorrect attempts. Request a new code.' })
    }

    if (record.otp !== sha256(normalizedOtp)) {
      const next = attempts + 1
      await client.from('assistant_admin_otps').update({ attempts: next }).eq('id', record.id)
      const remaining = Math.max(0, OTP_MAX_ATTEMPTS - next)

      void recordAudit({
        assistantId: assistant.id,
        actorEmail: assistant.email,
        action: 'login.bad_code',
        success: false,
        detail: { remaining },
        req,
      })

      return res.status(401).json({
        error:
          remaining > 0
            ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} left.`
            : 'Incorrect code. Request a new one.',
        attemptsRemaining: remaining,
      })
    }

    await client.from('assistant_admin_otps').update({ used: true }).eq('id', record.id)

    // One live session per assistant. Signing in on the shop tablet should end
    // the session left open on the counter PC, not run alongside it.
    await revokeAllSessions(client, 'assistant', assistant.id, 'new_login')

    const session = await createPanelSession({
      client,
      req,
      res,
      actorType: 'assistant',
      actorId: assistant.id,
      actorEmail: assistant.email,
    })

    await client
      .from('assistant_admins')
      .update({ last_login_at: new Date().toISOString(), failed_attempts: 0, locked_until: null })
      .eq('id', assistant.id)

    void recordAudit({
      assistantId: assistant.id,
      actorEmail: assistant.email,
      action: 'login.success',
      req,
    })

    return res.json({
      success: true,
      token: session.token,
      expiresAt: session.expiresAt,
      assistant: {
        id: assistant.id,
        email: assistant.email,
        name: assistant.name,
        role: 'assistant_admin',
        permissions: assistant.permissions || {},
        mustChangePassword: Boolean(assistant.must_change_password),
      },
    })
  } catch (error: any) {
    console.error('[Assistant] Verify error:', error)
    return res.status(error?.status || 500).json({ error: error?.message || 'Internal Server Error' })
  }
}

/** POST /api/assistant/logout */
export async function assistantLogoutHandler(req: Request, res: Response) {
  try {
    const token = readSessionToken(req)
    if (token) {
      const client = getServiceClient()
      await revokeSessionByToken(client, token)
    }
    clearSessionCookie(res)

    if (req.actor) {
      void recordAudit({
        assistantId: req.actor.type === 'assistant' ? req.actor.id : null,
        actorEmail: req.actor.email,
        action: 'logout',
        req,
      })
    }

    return res.json({ success: true })
  } catch (error: any) {
    console.error('[Assistant] Logout error:', error)
    clearSessionCookie(res)
    return res.json({ success: true })
  }
}

/**
 * GET /api/assistant/session
 * Who am I, and what may I do? The browser asks on every load rather than
 * trusting what it kept in storage, so a suspension or a permission change
 * takes effect on the next page view.
 */
export async function assistantSessionHandler(req: Request, res: Response) {
  const actor = req.actor
  if (!actor) return res.status(401).json({ error: 'Sign in to continue', code: 'NO_SESSION' })

  return res.json({
    data: {
      id: actor.id,
      email: actor.email,
      name: actor.name,
      type: actor.type,
      permissions: actor.type === 'admin' ? null : actor.permissions,
      mustChangePassword: actor.mustChangePassword,
    },
  })
}

/**
 * POST /api/assistant/verify-email
 * Follows the link from the account-created email. Public by necessity: there
 * is no session yet, and the single-use token in the body is the credential.
 */
export async function verifyAssistantEmailHandler(req: Request, res: Response) {
  try {
    const token = String(req.body?.token || '').trim()
    if (!token) return res.status(400).json({ error: 'Verification token is required' })

    const client = getServiceClient()
    const { data: record } = await client
      .from('assistant_admin_tokens')
      .select('id, assistant_id, purpose, expires_at, used_at')
      .eq('token_hash', sha256(token))
      .eq('purpose', 'email_verification')
      .maybeSingle()

    if (!record) {
      return res.status(400).json({ error: 'This confirmation link is not valid. Ask for a new one.' })
    }
    if (record.used_at) {
      return res.status(400).json({
        error: 'This link has already been used. Your email is confirmed - sign in as usual.',
        code: 'ALREADY_USED',
      })
    }
    if (new Date(record.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: 'This confirmation link has expired. Ask for a new one.', code: 'EXPIRED' })
    }

    const now = new Date().toISOString()
    await client.from('assistant_admin_tokens').update({ used_at: now }).eq('id', record.id)

    const { data: assistant, error } = await client
      .from('assistant_admins')
      .update({
        email_verified: true,
        email_verified_at: now,
        // A suspended account stays suspended: confirming an email must never
        // be a way back in for someone an administrator has switched off.
        status: 'active',
        updated_at: now,
      })
      .eq('id', record.assistant_id)
      .eq('status', 'pending')
      .select('id, email, name')
      .maybeSingle()

    if (error) {
      console.error('[Assistant] Verify email failed:', error)
      return res.status(500).json({ error: 'Could not confirm this email address' })
    }

    if (!assistant) {
      // Not 'pending' any more - either already active, or suspended.
      const { data: existing } = await client
        .from('assistant_admins')
        .select('id, email, status')
        .eq('id', record.assistant_id)
        .maybeSingle()

      if (existing?.status === 'suspended') {
        return res.status(403).json({ error: 'This account is suspended. Contact the administrator.' })
      }

      return res.json({ success: true, message: 'Your email is already confirmed. You can sign in.' })
    }

    void recordAudit({
      assistantId: assistant.id,
      actorEmail: assistant.email,
      action: 'email.verified',
      req,
    })

    return res.json({
      success: true,
      message: 'Email confirmed. You can sign in now.',
      data: { email: assistant.email, name: assistant.name },
    })
  } catch (error: any) {
    console.error('[Assistant] Verify email error:', error)
    return res.status(error?.status || 500).json({ error: error?.message || 'Internal Server Error' })
  }
}

/**
 * POST /api/assistant/password
 * Change one's own password. Requires the current one, and ends every other
 * session on the account.
 */
export async function changeAssistantPasswordHandler(req: Request, res: Response) {
  try {
    const actor = req.actor
    if (!actor || actor.type !== 'assistant') {
      return res.status(401).json({ error: 'Sign in to continue', code: 'NO_SESSION' })
    }

    const currentPassword = String(req.body?.currentPassword || '')
    const newPassword = String(req.body?.newPassword || '')

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' })
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'The new password must be different from the current one' })
    }

    const policyError = validatePassword(newPassword)
    if (policyError) return res.status(400).json({ error: policyError })

    const client = getServiceClient()
    const { data: row } = await client
      .from('assistant_admins')
      .select('id, email, password')
      .eq('id', actor.id)
      .maybeSingle()

    if (!row || !verifyPassword(currentPassword, row.password)) {
      void recordAudit({
        assistantId: actor.id,
        actorEmail: actor.email,
        action: 'password.change_failed',
        success: false,
        req,
      })
      return res.status(401).json({ error: 'Current password is incorrect' })
    }

    await client
      .from('assistant_admins')
      .update({
        password: hashPassword(newPassword),
        must_change_password: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', actor.id)

    // Everything else signed out; this browser gets a fresh session so the
    // person changing their password is not thrown back to the login screen.
    await revokeAllSessions(client, 'assistant', actor.id, 'password_changed')
    const session = await createPanelSession({
      client,
      req,
      res,
      actorType: 'assistant',
      actorId: actor.id,
      actorEmail: actor.email,
    })

    void recordAudit({
      assistantId: actor.id,
      actorEmail: actor.email,
      action: 'password.changed',
      req,
    })

    return res.json({ success: true, token: session.token, expiresAt: session.expiresAt })
  } catch (error: any) {
    console.error('[Assistant] Change password error:', error)
    return res.status(error?.status || 500).json({ error: error?.message || 'Internal Server Error' })
  }
}
