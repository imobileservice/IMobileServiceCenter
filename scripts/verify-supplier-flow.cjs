// Exercises the actual handlers with an in-memory database. No live data or credentials.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const crypto = require('node:crypto')

function load(file, dependencies = {}, globals = {}) {
  const filename = path.resolve(__dirname, '..', file)
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename, reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  })
  assert.equal((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, file)
  const exports = {}
  vm.runInNewContext(result.outputText, {
    exports, process: { env: {} }, console: { log() {}, warn() {}, error() {} }, ...globals,
    require(name) {
      if (name in dependencies) return dependencies[name]
      throw Error(`Unexpected import ${name} in ${file}`)
    },
  })
  return exports
}

function database(answer) {
  const queries = []
  const db = { queries, from(table) {
    const q = { table, operation: 'select', filters: [], columns: '', payload: null }
    const query = {
      select(columns) { q.columns = columns; return query },
      eq(key, value) { q.filters.push([key, value]); return query },
      ilike(key, value) { q.filters.push([key, value]); return query },
      in(key, values) { q.filters.push([key, values]); return query },
      or(value) { q.search = value; return query },
      order() { return query }, limit() { return query },
      insert(payload) { q.operation = 'insert'; q.payload = payload; return query },
      update(payload) { q.operation = 'update'; q.payload = payload; return query },
      delete() { q.operation = 'delete'; return query },
      single() { return execute() }, maybeSingle() { return execute() },
      then(resolve, reject) { return execute().then(resolve, reject) },
    }
    function execute() {
      queries.push(q)
      return Promise.resolve(answer(q))
    }
    return query
  } }
  return db
}
function response() {
  return { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v },
    status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
}
const plain = value => JSON.parse(JSON.stringify(value))
const missing = { code: '42P01', message: 'missing table' }
const shared = load('src/server/api/supplier/shop.shared.ts', {
  '../inventory/restock.shared': { isMissingSchema: error => error?.code === '42P01' },
})
const quantities = load('src/server/api/supplier/order-items.shared.ts')
let db
const getSupabaseAdmin = () => db
const auth = load('src/server/api/supplier/auth.ts', {
  crypto, '../inventory/supabase-admin': { getSupabaseAdmin }, './shop.shared': shared,
  '../utils/password': { verifyPassword: (password, stored) => password === stored },
})
const catalog = load('src/server/api/supplier/catalog.ts', {
  '../inventory/supabase-admin': { getSupabaseAdmin }, './shop.shared': shared,
})
const orders = load('src/server/api/supplier/orders.ts', {
  '../inventory/supabase-admin': { getSupabaseAdmin }, './shop.shared': shared, './order-items.shared': quantities,
})
const routes = []
const fakeRouter = {}
for (const method of ['get', 'post', 'put', 'delete']) fakeRouter[method] = (url, handler) => routes.push({ method, url, handler })
const cashierCatalog = load('src/server/api/utils/cashier-catalog-access.ts', {
  '../../../config/cashier-catalog-access': load('src/config/cashier-catalog-access.ts'),
  './inventory-guard': {}, './panel-session': {},
})
load('src/server/api/inventory/supplier-orders.controller.ts', {
  express: { Router: () => fakeRouter }, './supabase-admin': { getSupabaseAdmin },
  './restock.shared': shared, '../supplier/shop.shared': shared, '../supplier/order-items.shared': quantities,
  '../utils/cashier-catalog-access': cashierCatalog,
})
const shop = { id: 'shop-a', name: 'Shop A', email: 'a@example.test', portal_enabled: true, is_active: true,
  portal_password: 'fixture-password', category_access_mode: 'default' }
const product = { id: 'p1', name: 'Display', category_id: 'cat-a', price: 500, buy_price: 150.25,
  inv_stock: { qty_meegoda: 5, qty_padukka: 40, qty_padukka_new: 50 } }
let checks = 0
async function check(name, fn) { await fn(); checks++; }

async function main() {
  for (const state of ['active', 'disabled', 'inactive', 'wrong password', 'missing']) {
    await check(`Login: ${state}`, async () => {
      db = database(q => {
        if (q.table === 'inv_suppliers' && q.operation === 'select') return { data: state === 'missing' ? null : {
          ...shop, portal_enabled: state !== 'disabled', is_active: state !== 'inactive' } }
        return { data: null }
      })
      const res = response()
      await auth.loginSupplierHandler({ body: { email: ' A@EXAMPLE.TEST ', password: state === 'wrong password' ? 'wrong' : shop.portal_password }, headers: {}, socket: {} }, res)
      assert.equal(res.statusCode, state === 'active' ? 200 : 401)
      if (state === 'active') {
        assert.match(res.body.token, /^[a-f0-9]{64}$/)
        assert.ok(Date.parse(res.body.expiresAt) > Date.now())
        assert.equal(db.queries.find(q => q.table === 'supplier_sessions').payload.token_hash,
          crypto.createHash('sha256').update(res.body.token).digest('hex'))
        assert.equal(db.queries[0].filters[0][1], 'a@example.test')
      } else assert.equal(db.queries.filter(q => q.operation === 'insert').length, 0)
    })
  }
  for (const state of ['valid', 'expired', 'invalid expiry', 'revoked', 'disabled', 'inactive', 'no token']) {
    await check(`Session: ${state}`, async () => {
      db = database(q => {
        if (q.table === 'supplier_sessions' && q.operation === 'select') return { data: state === 'revoked' ? null : {
          id: 'session-a', supplier_id: shop.id, expires_at: state === 'invalid expiry' ? 'invalid' : new Date(Date.now() + (state === 'expired' ? -1000 : 100000)).toISOString() } }
        if (q.table === 'inv_suppliers') return { data: { ...shop, portal_enabled: state !== 'disabled', is_active: state !== 'inactive' } }
        return { data: null }
      })
      let continued = false
      const req = { headers: state === 'no token' ? {} : { authorization: 'Bearer fixture-token' } }
      const res = response()
      await auth.requireSupplier(req, res, () => { continued = true })
      assert.equal(continued, state === 'valid')
      assert.equal(res.statusCode, state === 'valid' ? 200 : ['disabled', 'inactive'].includes(state) ? 403 : 401)
      if (continued) assert.equal(req.supplier.id, shop.id)
    })
  }
  const guard = load('src/server/api/utils/inventory-guard.ts', { crypto,
    './panel-session': { getServiceClient: () => db, resolvePanelActor: async () => null } })
  for (const state of ['open', 'closed', 'expired', 'missing', 'invalid expiry']) {
    await check(`Till: ${state}`, async () => {
      db = database(() => ({ data: state === 'missing' ? null : { id: 'till-1', status: state === 'closed' ? 'closed' : 'open',
        expires_at: state === 'invalid expiry' ? 'invalid' : new Date(Date.now() + (state === 'expired' ? -1000 : 100000)).toISOString() } }))
      assert.equal(await guard.hasValidTillSession({ headers: { 'x-till-session': 'fixture-token' } }), state === 'open')
    })
  }
  for (const inStockOnly of [false, true]) {
    await check(`Catalog stock filter ${inStockOnly}`, async () => {
      db = database(q => {
        if (q.table === 'inv_supplier_default_categories') return { data: [{ category_id: 'cat-a' }] }
        if (q.table === 'categories') return { data: [{ id: 'cat-a', name: 'Displays' }] }
        return { data: [product, { ...product, id: 'padukka-only', inv_stock: { qty_meegoda: 0, qty_padukka: 40 } }] }
      })
      const res = response()
      await catalog.supplierCatalogHandler({ supplier: shop, query: inStockOnly ? { in_stock_only: 'true' } : {} }, res)
      assert.equal(res.headers['Cache-Control'], 'no-store')
      assert.deepEqual(plain(res.body.totals), { products: 2, in_stock: 1, out_of_stock: 1 })
      assert.equal(res.body.data.length, inStockOnly ? 1 : 2)
      assert.equal(res.body.data[0].inventory_price, 150.25)
      assert.equal(JSON.stringify(res.body).includes('qty_padukka'), false)
      assert.equal(db.queries.find(q => q.table === 'products').filters[0][1][0], 'cat-a')
    })
  }
  await check('Category isolation', async () => {
    db = database(() => ({ data: [{ category_id: 'cat-a' }] }))
    const res = response()
    await catalog.supplierCatalogHandler({ supplier: shop, query: { category_id: 'cat-b' } }, res)
    assert.equal(res.body.data.length, 0)
    assert.equal(db.queries.some(q => q.table === 'products'), false)
  })
  await check('Custom category mode', async () => {
    db = database(q => {
      assert.equal(q.table, 'inv_supplier_categories')
      assert.deepEqual(plain(q.filters), [['supplier_id', shop.id]])
      return { data: [{ category_id: 'custom' }] }
    })
    assert.deepEqual(plain(await shared.fetchAllowedCategoryIds(db, { ...shop, category_access_mode: 'custom' })), ['custom'])
  })
  await check('Missing category migration', async () => {
    db = database(() => ({ data: null, error: missing }))
    const res = response()
    await catalog.supplierCatalogHandler({ supplier: shop, query: {} }, res)
    assert.equal(res.body.migration_required, true)
  })
  const invalid = [[], [{ product_id: 'p1', quantity: 0 }], [{ product_id: 'p1', quantity: -1 }],
    [{ product_id: 'p1', quantity: 1.5 }], [{ product_id: 'p1', quantity: Infinity }],
    [{ product_id: 'p1', quantity: true }], [{ product_id: 'p1', quantity: 10000 }],
    [{ product_id: 'p1', quantity: 6000 }, { product_id: 'p1', quantity: 4000 }],
    Array.from({ length: 101 }, () => ({ product_id: 'p1', quantity: 1 }))]
  for (const handler of [orders.createSupplierOrderHandler, routes.find(r => r.method === 'post').handler]) {
    for (const items of invalid) await check('Invalid order quantity rejected before any database call', async () => {
      db = database(() => assert.fail('Invalid quantities cannot reach the database'))
      const res = response()
      await handler({ supplier: shop, body: { supplier_id: shop.id, items } }, res)
      assert.equal(res.statusCode, 400)
    })
  }
  for (const state of ['success', 'out of stock', 'wrong category', 'items failure']) {
    await check(`Portal order: ${state}`, async () => {
      db = database(q => {
        if (q.table === 'inv_supplier_default_categories') return { data: [{ category_id: 'cat-a' }] }
        if (q.table === 'products') return { data: [{ ...product, category_id: state === 'wrong category' ? 'cat-b' : 'cat-a',
          inv_stock: state === 'out of stock' ? { qty_meegoda: 0, qty_padukka: 99 } : product.inv_stock }, { ...product, id: 'p2' }] }
        if (q.table === 'inv_supplier_orders' && q.operation === 'insert') return { data: { id: 'order-1', order_number: 'SO-1', ...q.payload } }
        if (q.table === 'inv_supplier_order_items' && state === 'items failure') return { error: { message: 'Fixture insert failed' } }
        return { data: null }
      })
      const res = response()
      await orders.createSupplierOrderHandler({ supplier: shop, body: { supplier_id: 'other-shop', items: [
        { product_id: 'p1', quantity: 2 }, { product_id: 'p1', quantity: '3' }, { product_id: 'p2', quantity: 4 }] } }, res)
      assert.equal(res.statusCode, { success: 201, 'out of stock': 409, 'wrong category': 403, 'items failure': 500 }[state])
      const insert = db.queries.find(q => q.table === 'inv_supplier_orders' && q.operation === 'insert')
      if (insert) {
        assert.equal(insert.payload.supplier_id, shop.id)
        assert.equal(insert.payload.item_count, 2)
        assert.equal(insert.payload.total_qty, 9)
      } else assert.equal(db.queries.some(q => q.operation === 'insert'), false)
      if (state === 'items failure') assert.ok(db.queries.some(q => q.operation === 'delete' && q.table === 'inv_supplier_orders'))
      assert.equal(db.queries.some(q => q.table === 'inv_stock' && q.operation !== 'select'), false, 'Pending orders do not decrement stock')
    })
  }
  await check('Counter quantities and Meegoda stock flag', async () => {
    db = database(q => {
      if (q.table === 'inv_suppliers') return { data: shop }
      if (q.table === 'products') return { data: [{ ...product, stock: 99, inv_stock: { qty_meegoda: 0, qty_padukka: 99 } }] }
      if (q.table === 'inv_supplier_orders' && q.operation === 'insert') return { data: { id: 'order-1' } }
      return { data: null }
    })
    const res = response()
    await routes.find(r => r.method === 'post').handler({ body: { supplier_id: shop.id, items: [
      { product_id: 'p1', quantity: 2 }, { product_id: 'p1', quantity: 3 }] } }, res)
    assert.equal(res.statusCode, 201)
    const insert = db.queries.find(q => q.table === 'inv_supplier_orders' && q.operation === 'insert')
    assert.equal(insert.payload.item_count, 1)
    assert.equal(insert.payload.total_qty, 5)
    assert.equal(db.queries.find(q => q.table === 'inv_supplier_order_items').payload[0].was_in_stock, false)
  })
  await check('Admin totals are independent of list filter', async () => {
    db = database(q => ({ data: q.columns === 'status, total_qty'
      ? [{ status: 'pending', total_qty: 5 }, { status: 'pending', total_qty: '4' }, { status: 'completed', total_qty: 20 }]
      : [] }))
    const res = response()
    await routes.find(r => r.method === 'get' && r.url === '/').handler({ query: { status: 'completed' } }, res)
    assert.equal(res.body.data.length, 0)
    assert.equal(res.body.totals.pending, 2)
    assert.equal(res.body.totals.pending_units, 9)
    assert.equal(res.body.totals.completed, 1)
    assert.equal(res.body.totals.total, 3)
  })
  await check('Order history belongs to signed-in shop', async () => {
    db = database(q => { assert.deepEqual(plain(q.filters), [['supplier_id', shop.id]]); return { data: [] } })
    await orders.listSupplierOrdersHandler({ supplier: shop, query: { supplier_id: 'other-shop' } }, response())
  })
  for (const found of [true, false]) await check('Cancel only own pending orders', async () => {
    db = database(q => {
      assert.deepEqual(plain(q.filters), [['id', 'order-1'], ['supplier_id', shop.id], ['status', 'pending']])
      return { data: found ? { id: 'order-1', status: 'cancelled' } : null }
    })
    const res = response()
    await orders.cancelSupplierOrderHandler({ supplier: shop, params: { id: 'order-1' } }, res)
    assert.equal(res.statusCode, found ? 200 : 409)
  })
  let loggedOut = false
  let apiStatus = 403
  let apiPayload = { error: 'Product outside your category' }
  const service = load('src/lib/services/supplier-portal.service.ts', {
    '@/lib/utils/api': { getApiUrl: url => url },
    '@/lib/supplier-store': { useSupplierStore: { getState: () => ({ token: 'fixture', logout() { loggedOut = true } }) } },
  }, { URLSearchParams, fetch: async () => ({ ok: false, status: apiStatus, json: async () => apiPayload }) })
  await check('Product rejection does not log out shop', async () => {
    await assert.rejects(service.supplierPortalService.placeOrder({ items: [] }))
    assert.equal(loggedOut, false)
  })
  await check('Disabled account logs out shop', async () => {
    apiPayload = { code: 'SUPPLIER_ACCOUNT_DISABLED' }
    await assert.rejects(service.supplierPortalService.getSession())
    assert.equal(loggedOut, true)
  })
  console.log(`PASS: ${checks} supplier flow QA checks (auth, sessions, shop isolation, catalog, quantities, totals, counter orders, rollback, cancellation)`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
