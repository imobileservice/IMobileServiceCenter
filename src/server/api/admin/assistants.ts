/**
 * The administrator's side of assistant admin accounts.
 *
 * Creating them, setting what they may do, reading everything they have done,
 * and approving or refusing the edits and deletions they have asked for.
 *
 * Every route in this file is mounted behind requireAdmin. An assistant reaching
 * any of it - including "list assistants", which would otherwise be a neat way
 * to discover colleagues' addresses - gets a 403 and a line in the audit log.
 */
import crypto from 'crypto'
import { Request, Response } from 'express'
import { SupabaseClient } from '@supabase/supabase-js'
import { hashPassword } from '../utils/password'
import { sendEmail } from '../utils/email'
import { getServiceClient, revokeAllSessions } from '../utils/panel-session'
import { recordAudit, redact } from '../utils/assistant-audit'
import {
  deleteCategoryRecord,
  deleteProductRecord,
  updateCategoryRecord,
  updateProductRecord,
} from '../utils/product-write'
import {
  buildAssistantPasswordResetEmail,
  buildAssistantRequestDecisionEmail,
  buildAssistantVerificationEmail,
} from '../assistant/emails'
import {
  ASSISTANT_PUBLIC_COLUMNS,
  DEFAULT_PERMISSIONS,
  PERMISSION_LABELS,
  VERIFICATION_TTL_HOURS,
  VERIFICATION_TTL_MS,
  emailIsTaken,
  normalizeEmail,
  sanitizePermissions,
  sha256,
  siteUrl,
  validatePassword,
} from '../assistant/shared'

const LOGIN_URL = () => `${siteUrl()}/assistant/login`

/**
 * Create a fresh confirmation link.
 *
 * Any earlier unused token for the account is dropped first, so a re-send
 * genuinely replaces the previous link rather than leaving two live.
 */
async function issueVerificationToken(client: SupabaseClient, assistantId: string) {
  const token = crypto.randomBytes(32).toString('base64url')

  await client
    .from('assistant_admin_tokens')
    .delete()
    .eq('assistant_id', assistantId)
    .eq('purpose', 'email_verification')
    .is('used_at', null)

  const { error } = await client.from('assistant_admin_tokens').insert({
    assistant_id: assistantId,
    token_hash: sha256(token),
    purpose: 'email_verification',
    expires_at: new Date(Date.now() + VERIFICATION_TTL_MS).toISOString(),
  })

  if (error) {
    console.error('[Admin/Assistants] Could not store verification token:', error)
    throw Object.assign(new Error('Could not create a confirmation link'), { status: 500 })
  }

  return `${siteUrl()}/assistant/verify-email?token=${encodeURIComponent(token)}`
}

/* ------------------------------------------------------------------ */
/* Accounts                                                            */
/* ------------------------------------------------------------------ */

/** GET /api/admin/assistants */
export async function listAssistantsHandler(_req: Request, res: Response) {
  try {
    const client = getServiceClient()

    const [{ data: assistants, error }, { data: pending }, { data: sessions }] = await Promise.all([
      client
        .from('assistant_admins')
        .select(ASSISTANT_PUBLIC_COLUMNS)
        .order('created_at', { ascending: false }),
      client.from('assistant_admin_requests').select('assistant_id').eq('status', 'pending'),
      client
        .from('panel_sessions')
        .select('actor_id, last_seen_at, expires_at')
        .eq('actor_type', 'assistant')
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString()),
    ])

    if (error) throw error

    const pendingByAssistant = new Map<string, number>()
    for (const row of pending || []) {
      pendingByAssistant.set(row.assistant_id, (pendingByAssistant.get(row.assistant_id) || 0) + 1)
    }

    const liveByAssistant = new Map<string, string>()
    for (const row of sessions || []) {
      const current = liveByAssistant.get(row.actor_id)
      if (!current || row.last_seen_at > current) liveByAssistant.set(row.actor_id, row.last_seen_at)
    }

    return res.json({
      data: (assistants || []).map((assistant: any) => ({
        ...assistant,
        pending_requests: pendingByAssistant.get(assistant.id) || 0,
        active_session_last_seen: liveByAssistant.get(assistant.id) || null,
        is_online: Boolean(liveByAssistant.get(assistant.id)),
      })),
      permissionLabels: PERMISSION_LABELS,
    })
  } catch (error: any) {
    console.error('[Admin/Assistants] List error:', error)
    return res.status(error?.status || 500).json({ error: error?.message || 'Could not load assistants' })
  }
}

/**
 * GET /api/admin/assistants/:id
 * The full picture of one assistant: account, live sessions, their requests and
 * their activity log.
 */
export async function getAssistantHandler(req: Request, res: Response) {
  try {
    const client = getServiceClient()
    const id = String(req.params.id)

    const { data: assistant, error } = await client
      .from('assistant_admins')
      .select(ASSISTANT_PUBLIC_COLUMNS)
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    if (!assistant) return res.status(404).json({ error: 'Assistant not found' })

    const [{ data: audit }, { data: requests }, { data: sessions }] = await Promise.all([
      client
        .from('assistant_admin_audit')
        .select('*')
        .eq('assistant_id', id)
        .order('created_at', { ascending: false })
        .limit(200),
      client
        .from('assistant_admin_requests')
        .select('*')
        .eq('assistant_id', id)
        .order('created_at', { ascending: false })
        .limit(100),
      client
        .from('panel_sessions')
        .select('id, ip_address, user_agent, created_at, last_seen_at, expires_at')
        .eq('actor_type', 'assistant')
        .eq('actor_id', id)
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('last_seen_at', { ascending: false }),
    ])

    return res.json({
      data: {
        assistant,
        audit: audit || [],
        requests: requests || [],
        sessions: sessions || [],
      },
      permissionLabels: PERMISSION_LABELS,
    })
  } catch (error: any) {
    console.error('[Admin/Assistants] Get error:', error)
    return res.status(error?.status || 500).json({ error: error?.message || 'Could not load the assistant' })
  }
}

/**
 * POST /api/admin/assistants
 *
 * The administrator supplies the address and a password of their choosing. The
 * account is created 'pending' and a confirmation link is emailed; the password
 * does not work until that link is followed, so a typo in the address produces
 * an account nobody can use rather than an account someone else can.
 *
 * The password is never emailed. It is handed over in person, which is the only
 * channel this shop actually has, and is far safer than mail either way.
 */
export async function createAssistantHandler(req: Request, res: Response) {
  const admin = req.actor
  try {
    const email = normalizeEmail(req.body?.email)
    const password = String(req.body?.password || '')
    const name = String(req.body?.name || '').trim() || email.split('@')[0]
    const whatsapp = String(req.body?.whatsapp || '').trim() || null

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address' })
    }

    const policyError = validatePassword(password)
    if (policyError) return res.status(400).json({ error: policyError })

    const client = getServiceClient()

    if (await emailIsTaken(client, email)) {
      return res.status(409).json({ error: 'That email address already has an account' })
    }

    const permissions = req.body?.permissions
      ? sanitizePermissions(req.body.permissions)
      : { ...DEFAULT_PERMISSIONS }

    const { data: assistant, error } = await client
      .from('assistant_admins')
      .insert({
        email,
        password: hashPassword(password),
        name,
        whatsapp,
        role: 'assistant_admin',
        status: 'pending',
        email_verified: false,
        permissions,
        created_by: admin?.id || null,
      })
      .select(ASSISTANT_PUBLIC_COLUMNS)
      .single()

    if (error) {
      // The unique index is the last word on duplicates, and it catches the
      // race that the check above cannot.
      if (String(error.code) === '23505') {
        return res.status(409).json({ error: 'That email address already has an account' })
      }
      throw error
    }

    let emailDelivered = true
    let verifyUrl: string | null = null

    try {
      verifyUrl = await issueVerificationToken(client, assistant.id)
      const { html, text, subject } = buildAssistantVerificationEmail({
        name,
        verifyUrl,
        expiresInHours: VERIFICATION_TTL_HOURS,
        loginUrl: LOGIN_URL(),
      })
      await sendEmail({ to: email, subject, html, text })
    } catch (mailError: any) {
      // The account is already created; a mail failure must not lose it. The
      // administrator is told, and can re-send from the same screen.
      emailDelivered = false
      console.error('[Admin/Assistants] Verification email failed:', mailError?.message)
    }

    await recordAudit({
      assistantId: assistant.id,
      actorEmail: admin?.email,
      action: 'assistant.created',
      resource: 'assistant',
      resourceId: assistant.id,
      detail: { email, name, permissions, emailDelivered },
      req,
    })

    return res.json({
      data: assistant,
      emailDelivered,
      message: emailDelivered
        ? `Account created. A confirmation link was sent to ${email} and expires in ${VERIFICATION_TTL_HOURS} hours.`
        : 'Account created, but the confirmation email could not be sent. Use "Resend confirmation" once email is working.',
    })
  } catch (error: any) {
    console.error('[Admin/Assistants] Create error:', error)
    return res.status(error?.status || 500).json({ error: error?.message || 'Could not create the assistant' })
  }
}

/** PUT /api/admin/assistants/:id - name, whatsapp and permissions. */
export async function updateAssistantHandler(req: Request, res: Response) {
  const admin = req.actor
  try {
    const client = getServiceClient()
    const id = String(req.params.id)

    const update: Record<string, any> = { updated_at: new Date().toISOString() }
    if (req.body?.name !== undefined) update.name = String(req.body.name).trim().slice(0, 120)
    if (req.body?.whatsapp !== undefined) {
      update.whatsapp = String(req.body.whatsapp).trim().slice(0, 40) || null
    }
    if (req.body?.permissions !== undefined) {
      update.permissions = sanitizePermissions(req.body.permissions)
    }

    // The email address is intentionally not editable. Changing it would move
    // an account onto an address nobody has proven ownership of; delete the
    // account and create the right one instead.
    const { data, error } = await client
      .from('assistant_admins')
      .update(update)
      .eq('id', id)
      .select(ASSISTANT_PUBLIC_COLUMNS)
      .maybeSingle()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Assistant not found' })

    await recordAudit({
      assistantId: id,
      actorEmail: admin?.email,
      action: 'assistant.updated',
      resource: 'assistant',
      resourceId: id,
      detail: redact(update),
      req,
    })

    return res.json({ data })
  } catch (error: any) {
    console.error('[Admin/Assistants] Update error:', error)
    return res.status(error?.status || 500).json({ error: error?.message || 'Could not update the assistant' })
  }
}

/**
 * POST /api/admin/assistants/:id/status
 * Suspend or re-activate. Suspending drops every live session at once, so the
 * assistant is signed out on their next click rather than at token expiry.
 */
export async function setAssistantStatusHandler(req: Request, res: Response) {
  const admin = req.actor
  try {
    const status = String(req.body?.status || '')
    if (!['active', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'Status must be active or suspended' })
    }

    const client = getServiceClient()
    const id = String(req.params.id)

    const { data: existing } = await client
      .from('assistant_admins')
      .select('id, email, email_verified, status')
      .eq('id', id)
      .maybeSingle()

    if (!existing) return res.status(404).json({ error: 'Assistant not found' })

    if (status === 'active' && !existing.email_verified) {
      return res.status(400).json({
        error: 'This account has not confirmed its email address yet. Re-send the confirmation link instead.',
        code: 'EMAIL_NOT_VERIFIED',
      })
    }

    const { data, error } = await client
      .from('assistant_admins')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(ASSISTANT_PUBLIC_COLUMNS)
      .single()

    if (error) throw error

    if (status === 'suspended') {
      await revokeAllSessions(client, 'assistant', id, 'suspended')
    }

    await recordAudit({
      assistantId: id,
      actorEmail: admin?.email,
      action: status === 'suspended' ? 'assistant.suspended' : 'assistant.reactivated',
      resource: 'assistant',
      resourceId: id,
      detail: { from: existing.status, to: status },
      req,
    })

    return res.json({ data })
  } catch (error: any) {
    console.error('[Admin/Assistants] Status error:', error)
    return res.status(error?.status || 500).json({ error: error?.message || 'Could not change the status' })
  }
}

/**
 * POST /api/admin/assistants/:id/password
 * Set a new password. The assistant is forced to replace it on next sign-in,
 * so the administrator never keeps a working credential for someone else.
 */
export async function resetAssistantPasswordHandler(req: Request, res: Response) {
  const admin = req.actor
  try {
    const password = String(req.body?.password || '')
    const policyError = validatePassword(password)
    if (policyError) return res.status(400).json({ error: policyError })

    const client = getServiceClient()
    const id = String(req.params.id)

    const { data, error } = await client
      .from('assistant_admins')
      .update({
        password: hashPassword(password),
        must_change_password: true,
        failed_attempts: 0,
        locked_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, email, name')
      .maybeSingle()

    if (error) throw error
    if (!data) return res.status(404).json({ error: 'Assistant not found' })

    await revokeAllSessions(client, 'assistant', id, 'password_reset')

    try {
      const { html, text, subject } = buildAssistantPasswordResetEmail({
        name: data.name || data.email,
        loginUrl: LOGIN_URL(),
      })
      await sendEmail({ to: data.email, subject, html, text })
    } catch (mailError: any) {
      console.warn('[Admin/Assistants] Password reset notice not delivered:', mailError?.message)
    }

    await recordAudit({
      assistantId: id,
      actorEmail: admin?.email,
      action: 'assistant.password_reset',
      resource: 'assistant',
      resourceId: id,
      req,
    })

    return res.json({
      success: true,
      message:
        'Password set and all sessions signed out. Give the new password to the assistant in person - it is not emailed.',
    })
  } catch (error: any) {
    console.error('[Admin/Assistants] Password reset error:', error)
    return res.status(error?.status || 500).json({ error: error?.message || 'Could not reset the password' })
  }
}

/** POST /api/admin/assistants/:id/resend-verification */
export async function resendAssistantVerificationHandler(req: Request, res: Response) {
  const admin = req.actor
  try {
    const client = getServiceClient()
    const id = String(req.params.id)

    const { data: assistant } = await client
      .from('assistant_admins')
      .select('id, email, name, email_verified')
      .eq('id', id)
      .maybeSingle()

    if (!assistant) return res.status(404).json({ error: 'Assistant not found' })
    if (assistant.email_verified) {
      return res.status(400).json({ error: 'This address is already confirmed' })
    }

    const verifyUrl = await issueVerificationToken(client, id)
    const { html, text, subject } = buildAssistantVerificationEmail({
      name: assistant.name || assistant.email,
      verifyUrl,
      expiresInHours: VERIFICATION_TTL_HOURS,
      loginUrl: LOGIN_URL(),
    })

    try {
      await sendEmail({ to: assistant.email, subject, html, text })
    } catch (mailError: any) {
      return res.status(502).json({
        error: `Could not send the confirmation email. ${mailError?.message || 'Unknown mail error.'}`,
      })
    }

    await recordAudit({
      assistantId: id,
      actorEmail: admin?.email,
      action: 'assistant.verification_resent',
      resource: 'assistant',
      resourceId: id,
      req,
    })

    return res.json({
      success: true,
      message: `A new confirmation link was sent to ${assistant.email}. It expires in ${VERIFICATION_TTL_HOURS} hours.`,
    })
  } catch (error: any) {
    console.error('[Admin/Assistants] Resend verification error:', error)
    return res.status(error?.status || 500).json({ error: error?.message || 'Could not resend the confirmation' })
  }
}

/** POST /api/admin/assistants/:id/revoke-sessions */
export async function revokeAssistantSessionsHandler(req: Request, res: Response) {
  const admin = req.actor
  try {
    const client = getServiceClient()
    const id = String(req.params.id)
    await revokeAllSessions(client, 'assistant', id, 'revoked_by_admin')

    await recordAudit({
      assistantId: id,
      actorEmail: admin?.email,
      action: 'assistant.sessions_revoked',
      resource: 'assistant',
      resourceId: id,
      req,
    })

    return res.json({ success: true, message: 'Signed out of every device.' })
  } catch (error: any) {
    console.error('[Admin/Assistants] Revoke sessions error:', error)
    return res.status(error?.status || 500).json({ error: error?.message || 'Could not revoke sessions' })
  }
}

/**
 * DELETE /api/admin/assistants/:id
 *
 * The account, its sessions, tokens, codes and pending requests go with it
 * (ON DELETE CASCADE). The audit rows do too - they are attributed to an
 * assistant who no longer exists - so the log line written here, on the
 * administrator's own record, is what survives to say the account was removed.
 */
export async function deleteAssistantHandler(req: Request, res: Response) {
  const admin = req.actor
  try {
    const client = getServiceClient()
    const id = String(req.params.id)

    const { data: assistant } = await client
      .from('assistant_admins')
      .select('id, email, name')
      .eq('id', id)
      .maybeSingle()

    if (!assistant) return res.status(404).json({ error: 'Assistant not found' })

    await revokeAllSessions(client, 'assistant', id, 'deleted')

    const { error } = await client.from('assistant_admins').delete().eq('id', id)
    if (error) throw error

    await recordAudit({
      assistantId: null,
      actorEmail: admin?.email,
      action: 'assistant.deleted',
      resource: 'assistant',
      resourceId: id,
      detail: { email: assistant.email, name: assistant.name },
      req,
    })

    return res.json({ success: true })
  } catch (error: any) {
    console.error('[Admin/Assistants] Delete error:', error)
    return res.status(error?.status || 500).json({ error: error?.message || 'Could not delete the assistant' })
  }
}

/* ------------------------------------------------------------------ */
/* The approval queue                                                  */
/* ------------------------------------------------------------------ */

/** GET /api/admin/assistant-requests?status=pending */
export async function listAssistantRequestsHandler(req: Request, res: Response) {
  try {
    const client = getServiceClient()
    let query = client
      .from('assistant_admin_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300)

    const status = String(req.query.status || '').trim()
    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) throw error

    return res.json({ data: data || [] })
  } catch (error: any) {
    console.error('[Admin/Assistants] List requests error:', error)
    return res.status(error?.status || 500).json({ error: error?.message || 'Could not load requests' })
  }
}

async function notifyDecision(
  client: SupabaseClient,
  request: any,
  approved: boolean,
  reviewNote: string | null
) {
  try {
    const { data: assistant } = await client
      .from('assistant_admins')
      .select('email, name')
      .eq('id', request.assistant_id)
      .maybeSingle()

    if (!assistant?.email) return

    const { html, text, subject } = buildAssistantRequestDecisionEmail({
      name: assistant.name || assistant.email,
      approved,
      resource: request.resource,
      label: request.resource_label || request.resource_id,
      action: request.action === 'delete' ? 'delete' : 'edit',
      reviewNote,
    })
    await sendEmail({ to: assistant.email, subject, html, text })
  } catch (error: any) {
    console.warn('[Admin/Assistants] Decision email not delivered:', error?.message)
  }
}

/**
 * POST /api/admin/assistant-requests/:id/approve
 *
 * Applies the queued change now, against the row as it stands now - not against
 * the snapshot taken when the assistant asked. If the product has been renamed
 * or deleted in the meantime, that is what the administrator is approving a
 * change to, and a delete of something already gone reports itself rather than
 * pretending to have worked.
 *
 * The status is only moved to 'approved' after the write succeeds. A failure
 * lands as 'failed' with the reason attached, so the queue never claims a
 * change was applied when it was not.
 */
export async function approveAssistantRequestHandler(req: Request, res: Response) {
  const admin = req.actor
  try {
    const client = getServiceClient()
    const id = String(req.params.id)
    const reviewNote = String(req.body?.note || '').trim().slice(0, 1000) || null

    const { data: request } = await client
      .from('assistant_admin_requests')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (!request) return res.status(404).json({ error: 'Request not found' })
    if (request.status !== 'pending') {
      return res.status(409).json({ error: `This request was already ${request.status}` })
    }

    let result: { ok: boolean; status?: number; error?: string }

    if (request.resource === 'product') {
      result =
        request.action === 'delete'
          ? await deleteProductRecord(client, request.resource_id)
          : await updateProductRecord(client, request.resource_id, request.payload || {})
    } else {
      result =
        request.action === 'delete'
          ? await deleteCategoryRecord(client, request.resource_id)
          : await updateCategoryRecord(client, request.resource_id, request.payload || {})
    }

    const now = new Date().toISOString()

    if (!result.ok) {
      await client
        .from('assistant_admin_requests')
        .update({
          status: 'failed',
          apply_error: result.error || 'Unknown error',
          review_note: reviewNote,
          reviewed_by: admin?.id || null,
          reviewed_by_email: admin?.email || null,
          reviewed_at: now,
          updated_at: now,
        })
        .eq('id', id)

      await recordAudit({
        assistantId: request.assistant_id,
        actorEmail: admin?.email,
        action: 'request.apply_failed',
        resource: request.resource,
        resourceId: request.resource_id,
        success: false,
        detail: { requestId: id, error: result.error },
        req,
      })

      return res.status(result.status || 500).json({
        error: `Approved, but the change could not be applied: ${result.error}`,
        code: 'APPLY_FAILED',
      })
    }

    const { data: updated } = await client
      .from('assistant_admin_requests')
      .update({
        status: 'approved',
        review_note: reviewNote,
        reviewed_by: admin?.id || null,
        reviewed_by_email: admin?.email || null,
        reviewed_at: now,
        updated_at: now,
        apply_error: null,
      })
      .eq('id', id)
      .select()
      .single()

    await recordAudit({
      assistantId: request.assistant_id,
      actorEmail: admin?.email,
      action: `${request.resource}.${request.action}_approved`,
      resource: request.resource,
      resourceId: request.resource_id,
      detail: { requestId: id, payload: redact(request.payload), reviewNote },
      req,
    })

    void notifyDecision(client, request, true, reviewNote)

    return res.json({ data: updated, message: 'Approved and applied.' })
  } catch (error: any) {
    console.error('[Admin/Assistants] Approve error:', error)
    return res.status(error?.status || 500).json({ error: error?.message || 'Could not approve the request' })
  }
}

/** POST /api/admin/assistant-requests/:id/reject */
export async function rejectAssistantRequestHandler(req: Request, res: Response) {
  const admin = req.actor
  try {
    const client = getServiceClient()
    const id = String(req.params.id)
    const reviewNote = String(req.body?.note || '').trim().slice(0, 1000) || null

    const now = new Date().toISOString()
    const { data, error } = await client
      .from('assistant_admin_requests')
      .update({
        status: 'rejected',
        review_note: reviewNote,
        reviewed_by: admin?.id || null,
        reviewed_by_email: admin?.email || null,
        reviewed_at: now,
        updated_at: now,
      })
      .eq('id', id)
      .eq('status', 'pending')
      .select()
      .maybeSingle()

    if (error) throw error
    if (!data) return res.status(409).json({ error: 'That request is no longer pending' })

    await recordAudit({
      assistantId: data.assistant_id,
      actorEmail: admin?.email,
      action: `${data.resource}.${data.action}_rejected`,
      resource: data.resource,
      resourceId: data.resource_id,
      detail: { requestId: id, reviewNote },
      req,
    })

    void notifyDecision(client, data, false, reviewNote)

    return res.json({ data, message: 'Request declined. Nothing was changed.' })
  } catch (error: any) {
    console.error('[Admin/Assistants] Reject error:', error)
    return res.status(error?.status || 500).json({ error: error?.message || 'Could not decline the request' })
  }
}

/**
 * GET /api/admin/assistant-activity
 * The combined log across every assistant, newest first.
 */
export async function assistantActivityHandler(req: Request, res: Response) {
  try {
    const client = getServiceClient()
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 1000)

    const { data, error } = await client
      .from('assistant_admin_audit')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    return res.json({ data: data || [] })
  } catch (error: any) {
    console.error('[Admin/Assistants] Activity error:', error)
    return res.status(error?.status || 500).json({ error: error?.message || 'Could not load activity' })
  }
}
