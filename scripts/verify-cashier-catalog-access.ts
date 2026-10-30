// Isolated access checks: all Supabase calls are intercepted; no live writes or emails.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import express from 'express'
import { CASHIER_ALLOWED_CATEGORIES, isRestrictedCashier, RESTRICTED_MEEGODA_CASHIER_ID, RESTRICTED_CASHIER_PAGES } from '../src/config/cashier-catalog-access'

async function main() {
  process.env.VITE_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://cashier-access-test.invalid'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
  process.env.INVENTORY_API_STRICT = 'false'
  process.env.ADMIN_API_OPEN = 'true'
  const [display, ribbon] = CASHIER_ALLOWED_CATEGORIES
  const products = [
    { id: 'display', name: 'Samsung Display', category_id: display.id, barcode: '000206', price: 2950, inv_stock: [], product_images: [] },
    { id: 'ribbon', name: 'Power Ribbon', category_id: ribbon.id, barcode: '000207', price: 250, inv_stock: [], product_images: [] },
    { id: 'hidden', name: 'Restricted Charger', category_id: 'accessories', barcode: '000208', price: 500, inv_stock: [], product_images: [] },
  ]
  const categories = [...CASHIER_ALLOWED_CATEGORIES, { id: 'accessories', name: 'Accessories' }]
  const sessions = [
    { token: 'hashan', cashier_id: RESTRICTED_MEEGODA_CASHIER_ID, role: 'cashier', shop: 'Meegoda' },
    { token: 'other', cashier_id: 'another-cashier', role: 'cashier', shop: 'Meegoda' },
    { token: 'padukka', cashier_id: 'padukka-cashier', role: 'cashier', shop: 'Padukka' },
    { token: 'admin-till', cashier_id: 'owner', role: 'admin', shop: 'Meegoda' },
    { token: 'expired', cashier_id: RESTRICTED_MEEGODA_CASHIER_ID, role: 'cashier', shop: 'Meegoda' },
    { token: 'closed', cashier_id: RESTRICTED_MEEGODA_CASHIER_ID, role: 'cashier', shop: 'Meegoda' },
  ].map(row => ({ ...row, id: `${row.token}-session`, cashier_email: `${row.token}@example.test`, cashier_name: row.token,
    status: row.token === 'closed' ? 'closed' : 'open',
    expires_at: new Date(Date.now() + (row.token === 'expired' ? -60000 : 3600000)).toISOString(),
    session_token_hash: crypto.createHash('sha256').update(row.token).digest('hex') }))
  const sales = [
    { id: 'allowed-sale', invoice_number: 'INV-ALLOWED', net_amount: 2950, inv_sale_items: [{ id: 'line-a', product_id: 'display', quantity: 1 }] },
    { id: 'hidden-sale', invoice_number: 'INV-HIDDEN', net_amount: 500, inv_sale_items: [{ id: 'line-b', product_id: 'hidden', quantity: 1 }] },
    { id: 'mixed-sale', invoice_number: 'INV-MIXED', net_amount: 3450, inv_sale_items: [{ product_id: 'display' }, { product_id: 'hidden' }] },
  ]
  const nativeFetch = globalThis.fetch
  const supplierOrders = [
    { id: 'allowed-order', status: 'pending', total_qty: 2, inv_supplier_order_items: [{ product_id: 'display', product_name: 'Samsung Display', quantity: 2 }] },
    { id: 'hidden-order', status: 'pending', total_qty: 3, inv_supplier_order_items: [{ product_id: 'hidden', quantity: 3 }] },
    { id: 'mixed-order', status: 'confirmed', total_qty: 4, inv_supplier_order_items: [{ product_id: 'display' }, { product_id: 'hidden' }] },
  ]
  let orderWrites = 0
  let writes = 0
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    if (url.hostname === '127.0.0.1') return nativeFetch(input, init)
    assert.equal(url.hostname, 'cashier-access-test.invalid', 'Unexpected external request')
    const table = url.pathname.split('/').pop()
    if (url.pathname.includes('/rpc/')) {
      assert.ok(['process_sale', 'process_return_item'].includes(table!))
      const args = JSON.parse(String(init?.body))
      assert.equal(args.p_created_by, 'hashan@example.test', 'Writes use the verified cashier identity')
      if (table === 'process_sale') assert.equal(args.p_pos_session_id, 'hashan-session')
      else assert.match(args.p_notes, /POS session hashan-session/)
      writes++
      return json({ sale_id: 'new-sale', success: true, refund_amount: 100, shop: 'Meegoda' })
    }
    if (table === 'inv_supplier_orders' && init?.method === 'POST') {
      const order = { ...JSON.parse(String(init.body)), id: 'counter-order', inv_supplier_order_items: [] }
      supplierOrders.push(order)
      orderWrites++
      return json({ id: order.id })
    }
    if (table === 'inv_supplier_order_items' && init?.method === 'POST') {
      for (const item of JSON.parse(String(init.body))) {
        supplierOrders.find(order => order.id === item.order_id)!.inv_supplier_order_items.push(item)
      }
      orderWrites++
      return new Response(null, { status: 201 })
    }
    if (init?.method === 'PATCH') {
      if (table !== 'inv_supplier_orders') return new Response(null, { status: 204 })
      const order = supplierOrders.find(order => `eq.${order.id}` === url.searchParams.get('id'))!
      Object.assign(order, JSON.parse(String(init.body)))
      orderWrites++
      return json({ id: order.id })
    }
    let rows: any[] = []
    if (table === 'pos_till_sessions') rows = sessions
    else if (table === 'products') rows = products
    else if (table === 'categories') rows = categories
    else if (table === 'inv_sales') rows = sales
    else if (table === 'inv_supplier_orders') rows = supplierOrders
    else if (table === 'inv_suppliers') rows = [{ id: 'shop', name: 'Test Shop', is_active: true }]
    else if (table === 'panel_sessions') rows = [{ id: 'panel', actor_type: 'admin', actor_id: 'owner',
      token_hash: crypto.createHash('sha256').update('admin-panel').digest('hex'),
      expires_at: new Date(Date.now() + 3600000).toISOString(), last_seen_at: new Date().toISOString() }]
    else if (table === 'admins') rows = [{ id: 'owner', role: 'admin', email: 'owner@example.test', name: 'Owner' }]
    else if (!['inv_stock_movements', 'phone_models', 'product_phone_models', 'product_compatibility'].includes(table!)) {
      throw new Error(`Unexpected test table: ${table}`)
    }
    for (const [key, value] of url.searchParams) {
      if (value.startsWith('eq.')) rows = rows.filter(row => String(row[key]) === value.slice(3))
      if (value.startsWith('in.(')) {
        const accepted = value.slice(4, -1).split(',').map(item => item.replace(/^"|"$/g, ''))
        rows = rows.filter(row => accepted.includes(String(row[key])))
      }
    }
    const accept = new Headers(init?.headers).get('Accept') || ''
    return accept.includes('vnd.pgrst.object')
      ? rows.length === 1 ? json(rows[0]) : json({ code: 'PGRST116', message: 'Not found' }, 406)
      : json(rows)
  }
  const { attachCashierCatalogAccess } = await import('../src/server/api/utils/cashier-catalog-access')
  const { guardInventoryApi } = await import('../src/server/api/utils/inventory-guard')
  const { requireSupplierShopStaff } = await import('../src/server/api/utils/supplier-shop-access')
  const { default: inventoryRouter } = await import('../src/server/api/inventory')
  const app = express()
  app.use(express.json())
  app.use('/api', (req, res, next) => { void attachCashierCatalogAccess(req, res, next).catch(next) })
  app.use('/api/inventory/supplier-orders', (req, res, next) => { void requireSupplierShopStaff(req, res, next).catch(next) })
  app.use('/api/inventory', guardInventoryApi, inventoryRouter)
  app.get('/api/admin/data/orders', (_req, res) => res.json({ data: ['unrestricted-order'] }))
  app.get('/api/admin/orders/:id/delivery-bill', (_req, res) => res.json({ data: 'PDF' }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const port = (server.address() as any).port
  const call = async (path: string, token?: string, body?: unknown, panel?: string, method?: string) => {
    const response = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method: method || (body === undefined ? 'GET' : 'POST'),
      headers: { 'Content-Type': 'application/json', ...(token ? { 'x-till-session': token } : {}), ...(panel ? { 'x-panel-session': panel } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: response.status, body: await response.json() as any }
  }
  try {
    assert.ok(isRestrictedCashier({ id: RESTRICTED_MEEGODA_CASHIER_ID, role: 'cashier', shop: 'Meegoda' }))
    assert.ok(RESTRICTED_CASHIER_PAGES.has('/cashier/supplier-orders'))
    assert.ok(!isRestrictedCashier({ id: 'another-cashier', role: 'cashier', shop: 'Meegoda' }))
    assert.ok(!isRestrictedCashier({ id: RESTRICTED_MEEGODA_CASHIER_ID, role: 'admin', shop: 'Meegoda' }))
    assert.deepEqual((await call('/inventory/products', 'hashan')).body.data.map((row: any) => row.id), ['display', 'ribbon'])
    assert.deepEqual((await call('/inventory/categories', 'hashan')).body.data.map((row: any) => row.name), ['Display', 'On Off Ribbon'])
    assert.equal((await call('/inventory/products?category=accessories', 'hashan')).body.data.length, 0)
    assert.equal((await call('/inventory/products?search=Charger&cashier_id=another-cashier&shop=Padukka', 'hashan')).body.data.some((row: any) => row.id === 'hidden'), false)
    assert.equal((await call('/inventory/products/hidden', 'hashan')).status, 404)
    assert.equal((await call('/inventory/products/barcode/000208', 'hashan')).status, 404)
    assert.equal((await call('/inventory/products/barcode/000206', 'hashan')).status, 200)
    assert.equal((await call('/inventory/products', 'hashan', undefined, 'admin-panel')).body.data.length, 2, 'A shared browser admin login must not override a restricted till')
    assert.deepEqual((await call('/inventory/sales', 'hashan')).body.data.map((row: any) => row.invoice_number), ['INV-ALLOWED'])
    assert.equal((await call('/inventory/sales/invoice/INV-MIXED', 'hashan')).status, 404)
    assert.equal((await call('/inventory/sales/hidden-sale', 'hashan')).status, 404)
    assert.equal((await call('/inventory/sales/today/summary', 'hashan')).body.data.total_sales, 1)
    const sale = { payment_method: 'cash', items: [{ product_id: 'hidden', quantity: 1, price: 500 }] }
    assert.equal((await call('/inventory/sales', 'hashan', sale)).status, 403)
    assert.equal(writes, 0)
    assert.equal((await call('/inventory/sales', 'hashan', { ...sale, items: [{ product_id: 'display', quantity: 1, price: 2950 }] })).status, 201)
    assert.equal((await call('/inventory/sales/return', 'hashan', { invoice_number: 'INV-HIDDEN', product_id: 'hidden', quantity: 1, condition: 'good' })).status, 403)
    assert.equal((await call('/inventory/sales/return', 'hashan', { invoice_number: 'INV-ALLOWED', product_id: 'display', quantity: 1, condition: 'good' })).status, 200)
    const orderList = await call('/inventory/supplier-orders', 'hashan')
    assert.equal(orderList.status, 200)
    assert.deepEqual(orderList.body.data.map((order: any) => order.id), ['allowed-order'])
    assert.equal(orderList.body.totals.total, 1)
    assert.equal(orderList.body.totals.pending_units, 2)
    assert.equal((await call('/inventory/supplier-orders/allowed-order', 'hashan')).body.data.items[0].product_name, 'Samsung Display')
    for (const id of ['hidden-order', 'mixed-order']) {
      assert.equal((await call(`/inventory/supplier-orders/${id}`, 'hashan')).status, 404)
      assert.equal((await call(`/inventory/supplier-orders/${id}`, 'hashan', { status: 'confirmed' }, undefined, 'PUT')).status, 404)
    }
    assert.equal((await call('/inventory/supplier-orders', 'hashan', { supplier_id: 'shop', items: [{ product_id: 'hidden', quantity: 1 }] })).status, 403)
    assert.equal(orderWrites, 0, 'Hidden products and orders must cause no writes')
    assert.equal((await call('/inventory/supplier-orders/allowed-order', 'hashan', { status: 'confirmed' }, undefined, 'PUT')).status, 200)
    assert.equal(supplierOrders[0].status, 'confirmed')
    assert.equal((await call('/inventory/supplier-orders/allowed-order', 'hashan', { status: 'cancelled' }, undefined, 'PUT')).status, 403)
    assert.equal((await call('/inventory/supplier-orders/allowed-order', 'hashan', undefined, undefined, 'DELETE')).status, 403)
    const counter = await call('/inventory/supplier-orders', 'hashan', { supplier_id: 'shop', items: [{ product_id: 'ribbon', quantity: 2 }] })
    assert.equal(counter.status, 201)
    assert.equal(counter.body.data.items[0].product_name, 'Power Ribbon')
    assert.equal((await call('/inventory/supplier-orders')).status, 401)
    assert.equal((await call('/inventory/supplier-orders', 'other')).body.data.length, 4)
    console.log('PASS: Supplier Orders visible; allowed order details/slips, creation and status updates; hidden/mixed orders and counters protected; cancellation/deletion denied; other cashiers unchanged.')
    for (const path of ['/inventory/stock', '/inventory/reports/top-products', '/admin/data/orders', '/admin/orders/INV-HIDDEN/delivery-bill']) {
      assert.equal((await call(path, 'hashan')).status, 403, path)
    }
    assert.equal((await call('/inventory/products')).status, 401)
    assert.equal((await call('/INVENTORY/PRODUCTS')).status, 401)
    assert.equal((await call('/INVENTORY/PRODUCTS', 'hashan')).body.data.length, 2)
    assert.equal((await call('/ADMIN/data/orders', 'hashan')).status, 403)
    assert.equal((await call('/admin/orders/INV-HIDDEN/delivery-bill')).status, 401)
    for (const token of ['invalid', 'expired', 'closed']) assert.equal((await call('/inventory/products', token)).status, 401)
    for (const token of ['other', 'padukka', 'admin-till']) {
      assert.equal((await call('/inventory/products', token)).body.data.length, 3, `${token} retains its catalogue`)
      assert.equal((await call('/inventory/categories', token)).body.data.length, 3)
      assert.equal((await call('/inventory/sales', token)).body.data.length, 3)
    }
    assert.equal((await call('/inventory/products', undefined, undefined, 'admin-panel')).body.data.length, 3)
    assert.equal((await call('/inventory/sales', undefined, { ...sale, pos_session_id: 'hashan-session', pos_session_token: 'hashan' })).status, 403, 'Body-only till identity is also restricted')
    assert.equal((await call('/inventory/sales', 'hashan', { ...sale, pos_session_id: 'other-session', pos_session_token: 'other' })).status, 401, 'Conflicting till tokens are refused')
    console.log('PASS: exact cashier identity; two allowed categories; search, barcode and direct product access; mixed invoices; sale/return validation; summaries; denied alternate routes; missing/invalid sessions; body/dual identities; other cashiers and admin unchanged.')
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    globalThis.fetch = nativeFetch
  }
  // Exercise the browser fetch wrapper without opening a browser or using live APIs.
  const storage = new Map<string, string>()
  let sentHeaders = new Headers()
  const previousWindow = (globalThis as any).window
  const fakeWindow = {
    location: { href: 'http://localhost/cashier/pos', origin: 'http://localhost', hostname: 'localhost', pathname: '/cashier/pos' },
    sessionStorage: { getItem: (key: string) => storage.get(key) || null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) },
    fetch: async (_input: unknown, init?: RequestInit) => { sentHeaders = new Headers(init?.headers); return json({}) },
  }
  ;(globalThis as any).window = fakeWindow
  try {
    const { installSessionFetch, adminSessionToken, tillSessionToken } = await import('../src/lib/session-fetch')
    adminSessionToken.set('admin-panel')
    tillSessionToken.set('hashan')
    installSessionFetch()
    await fakeWindow.fetch('/api/inventory/products')
    assert.equal(sentHeaders.get('x-till-session'), 'hashan')
    assert.equal(sentHeaders.has('x-panel-session'), false)
    await fakeWindow.fetch('/api/admin/data/orders')
    assert.equal(sentHeaders.get('x-till-session'), 'hashan')
    assert.equal(sentHeaders.has('x-panel-session'), false)
    fakeWindow.location.pathname = '/admin/products'
    await fakeWindow.fetch('/api/inventory/products')
    assert.equal(sentHeaders.get('x-panel-session'), 'admin-panel')
    assert.equal(sentHeaders.has('x-till-session'), false)
    console.log('PASS: cashier pages prefer till identity; admin pages retain panel identity.')
  } finally {
    if (previousWindow === undefined) delete (globalThis as any).window
    else (globalThis as any).window = previousWindow
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
