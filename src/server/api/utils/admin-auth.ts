import { Request } from 'express'
import { getSupabaseAdmin } from '../inventory/supabase-admin'
import { verifyPassword } from './password'

/**
 * Re-checks an administrator's own credentials, for the handful of endpoints
 * that hand back something sensitive.
 *
 * The admin panel has no server-side session - /api/admin/login/verify returns
 * the admin row and the browser keeps it in a zustand store (see admin-store.ts,
 * which says as much). That is fine for deciding which screens to draw, and no
 * use at all for deciding who may read a password. So the endpoints that do give
 * one back ask for the admin's password again and check it here, the same way
 * the login screen does. A caller who only reached the API cannot answer it.
 *
 * Re-authenticating for a secret is also the right shape for people: it is the
 * "confirm your password to view" step every password manager asks for.
 */

const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000

/** email+IP -> recent failures. In memory: one process, and a restart is not a way in. */
const failures = new Map<string, { count: number; firstAt: number }>()

const keyFor = (email: string, req: Request) => `${email}|${req.ip || 'unknown'}`

export const isLockedOut = (email: string, req: Request) => {
  const entry = failures.get(keyFor(email, req))
  if (!entry) return false
  if (Date.now() - entry.firstAt > LOCKOUT_MS) {
    failures.delete(keyFor(email, req))
    return false
  }
  return entry.count >= MAX_ATTEMPTS
}

const recordFailure = (email: string, req: Request) => {
  const key = keyFor(email, req)
  const entry = failures.get(key)
  if (!entry || Date.now() - entry.firstAt > LOCKOUT_MS) {
    failures.set(key, { count: 1, firstAt: Date.now() })
    return
  }
  entry.count += 1
}

export interface VerifiedAdmin {
  id: string
  email: string
  name: string | null
  role: string
}

/**
 * The admin behind these credentials, or null.
 *
 * Null covers a wrong password, an unknown email and an account whose role is
 * not 'admin' - the caller must not be able to tell which, the same rule the
 * login handler follows.
 */
export const verifyAdminCredentials = async (
  email: string,
  password: string,
  req: Request
): Promise<VerifiedAdmin | null> => {
  const normalized = String(email || '').toLowerCase().trim()
  if (!normalized || !password) return null

  const supabase = getSupabaseAdmin()
  const { data: admin, error } = await supabase
    .from('admins')
    .select('id, email, name, password, role')
    .eq('email', normalized)
    .maybeSingle()

  if (error || !admin || !verifyPassword(String(password), admin.password)) {
    recordFailure(normalized, req)
    return null
  }

  const role = String(admin.role ?? '').trim().toLowerCase()
  if (role !== 'admin') {
    recordFailure(normalized, req)
    return null
  }

  failures.delete(keyFor(normalized, req))
  return { id: admin.id, email: admin.email, name: admin.name ?? null, role }
}
