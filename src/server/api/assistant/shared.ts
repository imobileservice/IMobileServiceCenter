/**
 * Pieces shared between the assistant's own routes and the administrator's
 * management of them.
 */
import crypto from 'crypto'
import { SupabaseClient } from '@supabase/supabase-js'

/**
 * The complete set of things an assistant admin can be granted.
 *
 * This list is the authority: a permission key that is not here is refused by
 * setPermissions, so a typo in the admin UI cannot silently create a
 * permission that no route ever checks (and which therefore reads as "granted"
 * to a human looking at the screen while meaning nothing at all).
 *
 * Note what is absent, and stays absent: orders, customers, messages,
 * suppliers, cashiers, revenue, settings, hero slides. Those are not
 * permissions an assistant can be given - there is no route that would accept
 * them.
 */
export const PERMISSION_KEYS = [
  'dashboard.view',
  'products.view',
  'products.create',
  'products.edit_request',
  'products.delete_request',
  'categories.view',
  'categories.create',
  'categories.edit_request',
  'categories.delete_request',
  'inventory.view',
  'inventory.adjust',
] as const

export type PermissionKey = (typeof PERMISSION_KEYS)[number]

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  'dashboard.view': 'See the product & inventory dashboard',
  'products.view': 'Browse products',
  'products.create': 'Add new products',
  'products.edit_request': 'Request product edits (needs approval)',
  'products.delete_request': 'Request product deletions (needs approval)',
  'categories.view': 'Browse categories',
  'categories.create': 'Add new categories',
  'categories.edit_request': 'Request category edits (needs approval)',
  'categories.delete_request': 'Request category deletions (needs approval)',
  'inventory.view': 'See stock levels',
  'inventory.adjust': 'Adjust stock quantities',
}

export const DEFAULT_PERMISSIONS: Record<string, boolean> = Object.fromEntries(
  PERMISSION_KEYS.map((key) => [key, true])
)

/** Drop anything not in PERMISSION_KEYS; coerce the rest to real booleans. */
export function sanitizePermissions(input: any): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const key of PERMISSION_KEYS) {
    out[key] = input?.[key] === true
  }
  return out
}

export const OTP_TTL_MINUTES = 10
export const OTP_TTL_MS = OTP_TTL_MINUTES * 60 * 1000
export const OTP_MAX_ATTEMPTS = 5
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000

export const VERIFICATION_TTL_HOURS = 48
export const VERIFICATION_TTL_MS = VERIFICATION_TTL_HOURS * 60 * 60 * 1000

/** After this many failed password attempts the account is locked for a while. */
export const MAX_FAILED_LOGINS = 5
export const LOCKOUT_MS = 15 * 60 * 1000

export const sha256 = (value: string) =>
  crypto.createHash('sha256').update(String(value).trim()).digest('hex')

export const normalizeEmail = (email: string) => String(email || '').toLowerCase().trim()

/** admin@example.com -> a****n@example.com */
export const maskEmail = (email: string) => {
  const [local, domain] = String(email).split('@')
  if (!domain) return email
  if (local.length <= 2) return `${local[0]}***@${domain}`
  return `${local[0]}${'*'.repeat(Math.min(local.length - 2, 6))}${local[local.length - 1]}@${domain}`
}

export function siteUrl() {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VITE_SITE_URL ||
    'https://imobileservicecenter.lk'
  return raw.replace(/\/+$/, '')
}

/**
 * Password rules for assistant accounts.
 *
 * An administrator types this password in themselves and hands it over, so it
 * is exactly the kind of credential that ends up as "Shop@123". Twelve
 * characters with three character classes is enough to make that awkward
 * without pushing anyone towards writing it on the counter.
 */
export function validatePassword(password: string): string | null {
  const value = String(password || '')
  if (value.length < 12) return 'Password must be at least 12 characters'
  if (value.length > 200) return 'Password must be under 200 characters'

  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length
  if (classes < 3) {
    return 'Password must combine at least three of: lower case, upper case, numbers, symbols'
  }

  if (/^(?:password|admin|welcome|imobile|assistant)/i.test(value)) {
    return 'Password is too easy to guess'
  }

  return null
}

/**
 * Is this address already an account anywhere?
 *
 * Checked across all three tables. An address that is already an administrator
 * or a cashier must not also become an assistant: POS login resolves an account
 * by looking in several tables, and a duplicate would let the weaker password
 * stand in for the stronger account.
 */
export async function emailIsTaken(
  client: SupabaseClient,
  email: string,
  exceptAssistantId?: string
): Promise<boolean> {
  const normalized = normalizeEmail(email)

  const [{ data: admin }, { data: cashier }, { data: assistant }] = await Promise.all([
    client.from('admins').select('id').ilike('email', normalized).maybeSingle(),
    client.from('cashiers').select('id').ilike('email', normalized).maybeSingle(),
    client.from('assistant_admins').select('id').ilike('email', normalized).maybeSingle(),
  ])

  if (admin || cashier) return true
  if (assistant && assistant.id !== exceptAssistantId) return true
  return false
}

/** The columns that may ever leave the server for an assistant account. */
export const ASSISTANT_PUBLIC_COLUMNS =
  'id, email, name, whatsapp, role, status, email_verified, email_verified_at, permissions, must_change_password, failed_attempts, locked_until, last_login_at, created_by, created_at, updated_at'
