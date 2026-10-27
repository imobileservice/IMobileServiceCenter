// Local regression checks. All database requests are intercepted; no real orders or emails.
import assert from 'node:assert/strict'
import { inflateSync } from 'node:zlib'
import express from 'express'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { defaultDeliveryFee, orderTotals, parseDeliveryFee } from '../src/lib/utils/order-totals'

async function main() {
  process.env.VITE_SUPABASE_URL = 'https://delivery-fee-test.invalid'
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.VITE_SUPABASE_URL
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
  process.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  process.env.ADMIN_API_OPEN = 'false'
  const nativeFetch = globalThis.fetch
  let setting: any = null
  let settingsFail = false
  const storedOrders: any[] = []
  const storedSales: any[] = []
  let deliveryRpcMissing = false
  let lastSaleArgs: any
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  })
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    if (url.hostname === '127.0.0.1') return nativeFetch(input, init)
    assert.equal(url.hostname, 'delivery-fee-test.invalid', 'Unexpected external request')
    const method = init?.method || 'GET'
    if (url.pathname === '/auth/v1/user') return json({ id: 'customer-test', email: 'customer@example.test' })
    if (url.pathname === '/rest/v1/admin_settings') {
      if (settingsFail) return json({ message: 'Test database unavailable' }, 500)
      if (method === 'GET') {
        const single = new Headers(init?.headers).get('Accept')?.includes('vnd.pgrst.object')
        return single ? (setting ? json(setting) : json({ code: 'PGRST116' }, 406)) : json(setting ? [setting] : [])
      }
      const body = JSON.parse(String(init?.body))
      setting = { ...setting, key: 'delivery_fee', ...body }
      return json(setting)
    }
    if (url.pathname === '/rest/v1/orders' && method === 'POST') {
      const row = { ...JSON.parse(String(init?.body)), id: `order-${storedOrders.length}`, created_at: '2026-10-26T00:00:00Z' }
      storedOrders.push(row)
      return json(row, 201)
    }
    if (url.pathname === '/rest/v1/order_items' && method === 'POST') return json(null, 201)
    if (['/rest/v1/inv_customers', '/rest/v1/inv_suppliers'].includes(url.pathname)) {
      return json(url.searchParams.get('id') === 'eq.missing' ? [] : [{ id: 'recipient-test', is_active: true }])
    }
    if (url.pathname === '/rest/v1/inv_sales') return json(storedSales)
    if (url.pathname === '/rest/v1/inv_stock_movements') return json([])
    if (url.pathname.startsWith('/rest/v1/rpc/process_sale')) {
      const delivery = url.pathname.endsWith('process_sale_with_delivery')
      if (delivery && deliveryRpcMissing) return json({ code: 'PGRST202', message: 'Missing RPC' }, 404)
      lastSaleArgs = JSON.parse(String(init?.body))
      const amount = lastSaleArgs.p_items.reduce((sum: number, item: any) => sum + item.price * item.quantity, 0)
      const row = {
        id: `sale-${storedSales.length}`, sale_id: `sale-${storedSales.length}`, total_amount: amount,
        delivery_fee: delivery ? lastSaleArgs.p_delivery_fee : 0,
        net_amount: amount - lastSaleArgs.p_discount + lastSaleArgs.p_tax + (delivery ? lastSaleArgs.p_delivery_fee : 0),
      }
      storedSales.push(row)
      return json(row)
    }
    throw new Error(`Unexpected test request: ${method} ${url.pathname}`)
  }

  const { getSettingHandler, updateSettingHandler } = await import('../src/server/api/admin/settings')
  const { getDeliveryFeeHandler } = await import('../src/server/api/orders/delivery-fee')
  const { createOrderHandler } = await import('../src/server/api/orders/create')
  const { invoiceService } = await import('../src/server/api/services/invoice-service')
  const { guardAdminApi } = await import('../src/server/api/utils/panel-auth')
  const { generateInvoicePDF, generateDeliveryBillPDF } = await import('../src/server/api/utils/invoice-generator')
  const { default: OrderSummary } = await import('../src/components/order-summary')
  const { default: PosReceipt } = await import('../src/components/cashier/pos-receipt')
  const { default: salesRouter } = await import('../src/server/api/inventory/sales.controller')
  invoiceService.sendInvoice = async () => ({ success: true })
  const app = express()
  app.use(express.json())
  app.get('/fee', getDeliveryFeeHandler)
  // Inject an authenticated administrator only on the isolated test settings route.
  app.use('/settings', (req, _res, next) => {
    if (req.headers['x-test-admin'] === 'yes') req.actor = {
      type: 'admin', id: 'admin-test', email: 'admin@example.test', name: 'Test',
      permissions: {}, sessionId: 'test', mustChangePassword: false,
    }
    next()
  }, guardAdminApi)
  app.get('/settings/:key', getSettingHandler)
  app.put('/settings/:key', updateSettingHandler)
  app.post('/orders', createOrderHandler)
  app.use('/sales', salesRouter)
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const port = (server.address() as any).port
  const api = async (path: string, body?: unknown, admin = true) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: body === undefined ? 'GET' : ['/orders', '/sales'].includes(path) ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-session-token': 'test-customer', ...(admin ? { 'x-test-admin': 'yes' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: response.status, body: await response.json() as any }
  }
  try {
    for (const bad of [-1, '-1', '', ' ', '1.234', 'NaN', null, true, Infinity, 100000000]) {
      assert.throws(() => parseDeliveryFee(bad))
      assert.equal((await api('/settings/delivery_fee', { value: bad })).status, 400)
    }
    assert.equal((await api('/settings/delivery_fee', { value: '350.25' }, false)).status, 401)
    assert.equal((await api('/fee')).body.delivery_fee, 500)
    assert.equal((await api('/settings/delivery_fee', { value: '350.25' })).status, 201)
    assert.equal((await api('/settings/delivery_fee')).body.data.value, '350.25')
    assert.equal((await api('/fee')).body.delivery_fee, 350.25)

    const order = {
      order_number: 'TEST-DELIVERY', subtotal: 20000, shipping: 350.25, total: 1, tax: 0,
      payment_method: 'cash_on_delivery', customer_name: 'Test Customer',
      customer_email: 'customer@example.test', shipping_address: 'Test address', status: 'pending',
    }
    const items = [{ product_id: null, product_name: 'Test item', price: 20000, quantity: 1 }]
    const placed = await api('/orders', { order, items })
    assert.equal(placed.status, 201)
    assert.equal(placed.body.data.total, 20350.25, 'Fee applies even above the old free-shipping threshold')
    const pickup = await api('/orders', { order: { ...order, payment_method: 'visit_shop', shipping: 0 }, items })
    assert.equal(pickup.status, 201)
    assert.equal(pickup.body.data.shipping, 0)
    assert.equal(pickup.body.data.total, 20000)
    assert.deepEqual(orderTotals({ subtotal: 0.1, tax: 0, payment_method: 'cash_on_delivery' }, 0.2), { shipping: 0.2, total: 0.3 })
    assert.equal(defaultDeliveryFee(350.25, 'visit_shop'), 0)
    assert.equal((await api('/settings/delivery_fee', { value: '750.50' })).status, 200)
    assert.equal((await api('/orders', { order, items })).status, 409, 'Stale or tampered fee must be rejected')
    assert.equal(storedOrders.length, 2)
    assert.equal(storedOrders[0].total, 20350.25, 'Changing defaults must preserve existing bills')
    const updated = await api('/orders', { order: { ...order, shipping: 750.50 }, items })
    assert.equal(updated.body.data.total, 20750.5)
    assert.equal((await api('/settings/delivery_fee', { value: '0' })).status, 200)
    assert.equal((await api('/fee')).body.delivery_fee, 0)
    settingsFail = true
    assert.equal((await api('/orders', { order, items })).status, 500)
    assert.equal(storedOrders.length, 3, 'Unavailable configuration must not silently charge a fallback fee')
    settingsFail = false

    // Extract PDFKit text from compressed content streams without extra dependencies.
    const pdfText = (pdf: Buffer) => {
      const raw = pdf.toString('latin1')
      let text = ''
      for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
        let content: string
        try { content = inflateSync(Buffer.from(match[1], 'latin1')).toString() } catch { continue }
        for (const hex of content.matchAll(/<([0-9a-f]+)>/gi)) text += Buffer.from(hex[1], 'hex').toString('latin1')
      }
      return text
    }
    for (const generate of [generateInvoicePDF, generateDeliveryBillPDF]) {
      const delivery = pdfText(await generate(storedOrders[0], items))
      assert.match(delivery, /Delivery fee/)
      assert.match(delivery, /350\.25/)
      assert.match(delivery, /20,350\.25/)
      const walkIn = pdfText(await generate(storedOrders[1], items))
      assert.match(walkIn, /Delivery fee.*0\.00.*20,000\.00/s)
    }
    const cartItems = [{ id: 'item', quantity: 2, products: { name: 'Test', price: 500 } }]
    const summary = (paymentMethod: string) => renderToStaticMarkup(createElement(OrderSummary, {
      cartItems, paymentMethod, deliveryFee: 350.25,
    }))
    assert.match(summary('cash_on_delivery'), /1,350\.25/)
    assert.match(summary('visit_shop'), /Delivery fee<\/span><span>Rs\. 0\.00/)
    assert.doesNotMatch(summary('visit_shop'), /1,350\.25/)
    for (const variant of ['original', 'reprint'] as const) {
      const receipt = renderToStaticMarkup(createElement(PosReceipt, {
        sale: { total_amount: 1000, net_amount: 1000 }, variant,
      }))
      assert.match(receipt, /Delivery fee<\/span><span[^>]*>0\.00/)
    }
    await api('/settings/delivery_fee', { value: '350.25' })
    const sale = {
      supplier_id: 'shop-test', customer_name: 'Developer', delivery_fee: 350.25,
      payment_method: 'cash', source: 'pos', items: [{ product_id: 'product-test', price: 2950, quantity: 1 }],
    }
    const deliveredSale = await api('/sales', sale)
    assert.equal(deliveredSale.status, 201)
    assert.equal(deliveredSale.body.data.delivery_fee, 350.25)
    assert.equal(deliveredSale.body.data.net_amount, 3300.25)
    assert.equal(lastSaleArgs.p_supplier_id, 'shop-test')
    assert.equal(lastSaleArgs.p_customer_id, null, 'Shop id must not use the customer foreign key')
    const savedSale = (await api('/sales')).body.data[0]
    for (const variant of ['original', 'reprint'] as const) {
      const receipt = renderToStaticMarkup(createElement(PosReceipt, { sale: savedSale, variant }))
      assert.match(receipt, /Delivery fee<\/span><span[^>]*>350\.25/)
      assert.match(receipt, /3,300\.25/)
    }
    const savedCustomer = await api('/sales', { ...sale, supplier_id: undefined, customer_id: 'customer-test' })
    assert.equal(savedCustomer.body.data.net_amount, 3300.25)
    const walkInSale = await api('/sales', { ...sale, supplier_id: undefined, delivery_fee: 999 })
    assert.equal(walkInSale.status, 201)
    assert.equal(walkInSale.body.data.delivery_fee, 0)
    assert.equal(walkInSale.body.data.net_amount, 2950)
    assert.equal((await api('/sales', { ...sale, delivery_fee: 0 })).status, 409)
    assert.equal((await api('/sales', { ...sale, supplier_id: 'missing' })).status, 400)
    assert.equal((await api('/sales', { ...sale, customer_id: 'customer-test' })).status, 400)
    deliveryRpcMissing = true
    assert.equal((await api('/sales', sale)).status, 503)
    assert.equal(storedSales.length, 3, 'Failed or outdated checkout must not create a sale')
    deliveryRpcMissing = false
    const customSale = await api('/sales', { ...sale, delivery_fee: 125.50, delivery_fee_override: true })
    assert.equal(customSale.status, 201)
    assert.equal(customSale.body.data.net_amount, 3075.50)
    assert.equal(customSale.body.data.delivery_fee, 125.50)
    const freeSale = await api('/sales', { ...sale, delivery_fee: 0, delivery_fee_override: true })
    assert.equal(freeSale.body.data.net_amount, 2950)
    for (const value of [-1, '1.234', null, '']) {
      assert.equal((await api('/sales', { ...sale, delivery_fee: value, delivery_fee_override: true })).status, 400)
    }
    assert.equal((await api('/fee')).body.delivery_fee, 350.25, 'Cashier override must not change admin default')
    assert.equal((await api('/sales', sale)).body.data.delivery_fee, 350.25, 'The next sale uses the admin default')
    console.log('PASS: cashier custom fee, zero fee, invalid fees, default preserved and next sale default.')
    console.log('PASS: POS selected shop and customer fees, walk-in zero, saved totals, originals/reprints, stale quotes and missing migration without partial sales.')
    console.log('PASS: delivery fee validation, admin access, persistence, checkout totals, walk-in zero, stale fees, existing bills, failure handling, and both PDF formats.')
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    globalThis.fetch = nativeFetch
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
