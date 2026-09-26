/**
 * The assistant admin activity log.
 *
 * Everything an assistant does lands here, successes and refusals alike, plus
 * the screen-capture attempts their browser reports. It is what the
 * administrator's "Assistant Admins" screen reads to answer "what has this
 * person been doing".
 *
 * Deliberately never throws. A log write failing must not turn a working
 * product save into an error - the write is awaited only where the caller
 * genuinely wants ordering, and called with `void` elsewhere.
 */
import { Request } from 'express'
import { getClientIp, getServiceClient } from './panel-session'

export interface AuditEntry {
  assistantId?: string | null
  actorEmail?: string | null
  action: string
  resource?: string | null
  resourceId?: string | null
  success?: boolean
  detail?: Record<string, any> | null
  req?: Request
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const client = getServiceClient()
    await client.from('assistant_admin_audit').insert({
      assistant_id: entry.assistantId || null,
      actor_email: entry.actorEmail || null,
      action: entry.action,
      resource: entry.resource || null,
      resource_id: entry.resourceId ? String(entry.resourceId).slice(0, 200) : null,
      success: entry.success !== false,
      detail: entry.detail || null,
      ip_address: entry.req ? getClientIp(entry.req) : null,
      user_agent: entry.req ? String(entry.req.headers['user-agent'] || '').slice(0, 500) || null : null,
    })
  } catch (error: any) {
    console.warn('[AssistantAudit] Could not write entry:', error?.message || error)
  }
}

/**
 * Fields that must never reach the log, whatever a caller passes in. Payloads
 * are stored so an administrator can see what was proposed, and a payload is
 * just whatever JSON the browser sent.
 */
const REDACTED_KEYS = /pass|secret|token|otp|key|authorization/i

export function redact(payload: any, depth = 0): any {
  if (payload === null || payload === undefined) return payload
  if (depth > 4) return '[deep]'
  if (Array.isArray(payload)) return payload.slice(0, 50).map((item) => redact(item, depth + 1))
  if (typeof payload !== 'object') return payload

  const out: Record<string, any> = {}
  for (const [key, value] of Object.entries(payload)) {
    out[key] = REDACTED_KEYS.test(key) ? '[redacted]' : redact(value, depth + 1)
  }
  return out
}
