/**
 * Acceptance test for the assistant admin feature, end to end over HTTP.
 *
 * Checks the things that would be embarrassing to get wrong: that the admin API
 * refuses an unauthenticated caller, that an assistant cannot reach an
 * administrator's routes, that an unconfirmed email cannot sign in, that an
 * edit really does wait for approval, and that withdrawing a permission or
 * suspending an account takes effect on the very next request.
 *
 * How to run it
 * -------------
 *   1. Apply supabase/migrations/20260910_assistant_admins.sql first. Without
 *      it every check fails with "Sign in to continue".
 *   2. Start the API with email switched off, so the run sends no mail and the
 *      login falls back to the development one-time code:
 *
 *        RESEND_API_KEY= npm run dev:server
 *
 *      (NODE_ENV must not be 'production' - the development code is never
 *      returned in production, by design.)
 *   3. npm run verify:assistant
 *
 * It writes to whatever database .env points at. It creates one assistant
 * account and one product, both clearly named, and deletes them again in a
 * finally block whether the run passes or fails.
 */
import 'dotenv/config'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

const BASE = 'http://localhost:4000'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const db = createClient(url, key, { auth: { persistSession: false } })

const TEST_EMAIL = `assistant-e2e-${Date.now()}@example.com`
const TEST_PASSWORD = 'E2e-Test-Passw0rd!x'
const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex')

let pass = 0
let fail = 0

function check(label: string, condition: boolean, detail?: any) {
  if (condition) {
    pass++
    console.log(`  ✓ ${label}`)
  } else {
    fail++
    console.log(`  ✗ ${label}`, detail === undefined ? '' : JSON.stringify(detail).slice(0, 300))
  }
}

async function api(path: string, options: any = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { 'x-panel-session': options.token } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const json = await response.json().catch(() => ({}))
  return { status: response.status, json }
}

async function main() {
  let assistantId: string | null = null
  let productId: string | null = null
  let adminSessionToken: string | null = null

  try {
    /* --- an administrator session, minted directly (the real one needs an emailed code) --- */
    const { data: admin } = await db.from('admins').select('id, email').limit(1).single()
    if (!admin) throw new Error('No row in admins to test with')

    adminSessionToken = crypto.randomBytes(32).toString('base64url')
    await db.from('panel_sessions').insert({
      actor_type: 'admin',
      actor_id: admin.id,
      actor_email: admin.email,
      token_hash: sha256(adminSessionToken),
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    })
    console.log(`\nAdministrator under test: ${admin.email}\n`)

    console.log('1. The gate')
    check('admin route without a session is 401', (await api('/api/admin/assistants')).status === 401)
    check(
      'admin route with a session is 200',
      (await api('/api/admin/assistants', { token: adminSessionToken })).status === 200
    )
    check(
      'a garbage token is 401',
      (await api('/api/admin/assistants', { token: 'not-a-real-token' })).status === 401
    )

    console.log('\n2. Creating an assistant admin')
    const weak = await api('/api/admin/assistants', {
      method: 'POST',
      token: adminSessionToken,
      body: { email: TEST_EMAIL, password: 'short1A!' },
    })
    check('a weak password is refused', weak.status === 400, weak.json)

    const created = await api('/api/admin/assistants', {
      method: 'POST',
      token: adminSessionToken,
      body: { email: TEST_EMAIL, password: TEST_PASSWORD, name: 'E2E Assistant' },
    })
    check('account created', created.status === 200, created.json)
    assistantId = created.json?.data?.id
    check('created as pending', created.json?.data?.status === 'pending')
    check('created unverified', created.json?.data?.email_verified === false)

    const duplicate = await api('/api/admin/assistants', {
      method: 'POST',
      token: adminSessionToken,
      body: { email: TEST_EMAIL, password: TEST_PASSWORD },
    })
    check('a duplicate address is refused', duplicate.status === 409, duplicate.json)

    console.log('\n3. Sign-in is blocked before the email is confirmed')
    const early = await api('/api/assistant/login/init', {
      method: 'POST',
      body: { email: TEST_EMAIL, password: TEST_PASSWORD },
    })
    check('unverified sign-in refused', early.status === 403 && early.json.code === 'EMAIL_NOT_VERIFIED', early.json)

    console.log('\n4. Confirming the email')
    const verifyToken = crypto.randomBytes(32).toString('base64url')
    await db.from('assistant_admin_tokens').insert({
      assistant_id: assistantId,
      token_hash: sha256(verifyToken),
      purpose: 'email_verification',
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    })

    const badVerify = await api('/api/assistant/verify-email', {
      method: 'POST',
      body: { token: 'wrong-token' },
    })
    check('a wrong confirmation token is refused', badVerify.status === 400)

    const verified = await api('/api/assistant/verify-email', {
      method: 'POST',
      body: { token: verifyToken },
    })
    check('email confirmed', verified.status === 200, verified.json)

    const reused = await api('/api/assistant/verify-email', {
      method: 'POST',
      body: { token: verifyToken },
    })
    check('the confirmation link is single-use', reused.status === 400 && reused.json.code === 'ALREADY_USED', reused.json)

    console.log('\n5. Signing in')
    const wrongPassword = await api('/api/assistant/login/init', {
      method: 'POST',
      body: { email: TEST_EMAIL, password: 'Completely-Wrong-1!' },
    })
    check('a wrong password is 401', wrongPassword.status === 401)

    const init = await api('/api/assistant/login/init', {
      method: 'POST',
      body: { email: TEST_EMAIL, password: TEST_PASSWORD },
    })
    check('code issued', init.status === 200 && !!init.json.devOtp, init.json)
    const otp = init.json.devOtp

    const wrongCode = await api('/api/assistant/login/verify', {
      method: 'POST',
      body: { email: TEST_EMAIL, password: TEST_PASSWORD, otp: '000000' },
    })
    check('a wrong code is 401', wrongCode.status === 401)

    const loggedIn = await api('/api/assistant/login/verify', {
      method: 'POST',
      body: { email: TEST_EMAIL, password: TEST_PASSWORD, otp },
    })
    check('signed in', loggedIn.status === 200 && !!loggedIn.json.token, loggedIn.json)
    const token: string = loggedIn.json.token

    const replay = await api('/api/assistant/login/verify', {
      method: 'POST',
      body: { email: TEST_EMAIL, password: TEST_PASSWORD, otp },
    })
    check('the code cannot be replayed', replay.status === 401)

    console.log('\n6. What the assistant may and may not reach')
    check('own session readable', (await api('/api/assistant/session', { token })).status === 200)
    check('overview readable', (await api('/api/assistant/overview', { token })).status === 200)
    check('products readable', (await api('/api/assistant/products', { token })).status === 200)

    const orders = await api('/api/admin/data/orders', { token })
    check('admin orders refused (403)', orders.status === 403, orders.json)

    const customers = await api('/api/admin/data/customers', { token })
    check('admin customers refused (403)', customers.status === 403)

    const listAssistants = await api('/api/admin/assistants', { token })
    check('assistant management refused (403)', listAssistants.status === 403)

    console.log('\n7. Creating a product (allowed outright)')
    const { data: category } = await db.from('categories').select('id, name').limit(1).single()
    check('a category exists to test with', !!category)

    const productCreate = await api('/api/assistant/products', {
      method: 'POST',
      token,
      body: {
        name: `E2E TEST PRODUCT ${Date.now()}`,
        category_id: category!.id,
        price: 1000,
        sell_price: 1000,
        qty_meegoda: 3,
        qty_padukka: 2,
        qty_padukka_new: 0,
        stock: 5,
        // Not in the allowlist - must be dropped rather than written.
        id: '00000000-0000-0000-0000-000000000000',
        created_at: '1999-01-01T00:00:00Z',
      },
    })
    check('product created', productCreate.status === 200, productCreate.json)
    productId = productCreate.json?.data?.id
    check('the injected id was ignored', productId !== '00000000-0000-0000-0000-000000000000')

    console.log('\n8. Editing needs approval')
    const directEdit = await fetch(`${BASE}/api/admin/products/${productId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-panel-session': token },
      body: JSON.stringify({ name: 'SHOULD NOT APPLY' }),
    })
    check('a direct admin edit with an assistant token is 403', directEdit.status === 403)

    const editRequest = await api(`/api/assistant/products/${productId}/edit-request`, {
      method: 'POST',
      token,
      body: { payload: { name: 'E2E RENAMED BY APPROVAL', price: 2500 }, note: 'e2e test' },
    })
    check('edit request accepted', editRequest.status === 200, editRequest.json)
    const requestId = editRequest.json?.data?.id

    const { data: unchanged } = await db.from('products').select('name').eq('id', productId).single()
    check('the product is untouched while pending', unchanged?.name !== 'E2E RENAMED BY APPROVAL', unchanged)

    const secondRequest = await api(`/api/assistant/products/${productId}/edit-request`, {
      method: 'POST',
      token,
      body: { payload: { name: 'another' } },
    })
    check('a second pending request on the same row is refused', secondRequest.status === 409)

    console.log('\n9. The administrator approves')
    const queue = await api('/api/admin/assistant-requests?status=pending', { token: adminSessionToken })
    check('the request is in the queue', queue.json?.data?.some((r: any) => r.id === requestId), queue.json)

    const approve = await api(`/api/admin/assistant-requests/${requestId}/approve`, {
      method: 'POST',
      token: adminSessionToken,
      body: { note: 'approved by e2e' },
    })
    check('approved', approve.status === 200, approve.json)

    const { data: applied } = await db.from('products').select('name, price').eq('id', productId).single()
    check('the change was applied on approval', applied?.name === 'E2E RENAMED BY APPROVAL', applied)

    console.log('\n10. Stock adjustment')
    const adjust = await api(`/api/assistant/inventory/stock/${productId}`, {
      method: 'PUT',
      token,
      body: { qty_meegoda: 10, qty_padukka: 1, qty_padukka_new: 0 },
    })
    check('stock adjusted', adjust.status === 200 && adjust.json?.data?.quantity === 11, adjust.json)

    console.log('\n11. Permissions are enforced by the server')
    await api(`/api/admin/assistants/${assistantId}`, {
      method: 'PUT',
      token: adminSessionToken,
      body: { permissions: { 'dashboard.view': true, 'products.view': true } },
    })

    const deniedCreate = await api('/api/assistant/products', {
      method: 'POST',
      token,
      body: { name: 'should be refused', category_id: category!.id },
    })
    check('a withdrawn permission refuses immediately', deniedCreate.status === 403, deniedCreate.json)

    const deniedStock = await api(`/api/assistant/inventory/stock/${productId}`, {
      method: 'PUT',
      token,
      body: { qty_meegoda: 99 },
    })
    check('withdrawn stock permission refuses too', deniedStock.status === 403)

    console.log('\n12. Suspension ends the session at once')
    await api(`/api/admin/assistants/${assistantId}/status`, {
      method: 'POST',
      token: adminSessionToken,
      body: { status: 'suspended' },
    })

    const afterSuspend = await api('/api/assistant/overview', { token })
    check('the live session stops working', afterSuspend.status === 401, afterSuspend.json)

    const suspendedLogin = await api('/api/assistant/login/init', {
      method: 'POST',
      body: { email: TEST_EMAIL, password: TEST_PASSWORD },
    })
    check('a suspended account cannot sign in', suspendedLogin.status === 403, suspendedLogin.json)

    console.log('\n13. The activity log recorded it')
    const activity = await api('/api/admin/assistant-activity?limit=100', { token: adminSessionToken })
    const actions = (activity.json?.data || []).map((entry: any) => entry.action)
    check('login recorded', actions.includes('login.success'))
    check('product creation recorded', actions.includes('product.create'))
    check('stock adjustment recorded', actions.includes('stock.adjust'))
    check('refusals recorded', actions.includes('permission.denied') || actions.includes('access.denied'))
  } catch (error: any) {
    fail++
    console.error('\n✗ Unhandled failure:', error?.message || error)
  } finally {
    console.log('\nCleaning up…')
    if (productId) {
      await db.from('inv_stock').delete().eq('product_id', productId)
      await db.from('products').delete().eq('id', productId)
    }
    if (assistantId) await db.from('assistant_admins').delete().eq('id', assistantId)
    if (adminSessionToken) {
      await db.from('panel_sessions').delete().eq('token_hash', sha256(adminSessionToken))
    }
    console.log(`\n${pass} passed, ${fail} failed`)
    process.exit(fail === 0 ? 0 : 1)
  }
}

main()
