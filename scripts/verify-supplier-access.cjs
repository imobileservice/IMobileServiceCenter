// Isolated access tests: no credentials, network calls, or database writes.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function load(file, dependencies = {}) {
  const filename = path.resolve(__dirname, '..', file)
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  })
  assert.equal((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, file)
  const exports = {}
  vm.runInNewContext(result.outputText, {
    exports, console, process: { env: { ADMIN_API_OPEN: 'true', INVENTORY_API_STRICT: 'false' } },
    require(name) {
      if (name in dependencies) return dependencies[name]
      throw Error(`Unexpected import: ${name} in ${file}`)
    },
  })
  return exports
}

const features = load('src/config/features.ts')
let actor = null
let source = 'header'
const panelAuth = load('src/server/api/utils/panel-auth.ts', {
  './panel-session': { resolvePanelActor: async () => actor, readSessionTokenWithSource: () => actor ? { source, token: 'test-token' } : null },
  './assistant-audit': { recordAudit: async () => {} },
})
const { requireSupplierShopOwner } = load('src/server/api/utils/supplier-shop-access.ts', {
  '../../../config/features': features,
  './panel-auth': panelAuth,
})

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
}

async function main() {
  const cases = [
    ['anonymous', null, 'GET', 'header', 401],
    ['supplier/till token without an admin session', null, 'POST', 'header', 401],
    ['other admin', { type: 'admin', email: 'other@example.com' }, 'GET', 'header', 403],
    ['assistant using owner email', { type: 'assistant', email: 'dexlanka@gmail.com' }, 'GET', 'header', 403],
    ['owner', { type: 'admin', email: 'dexlanka@gmail.com' }, 'GET', 'header', 200],
    ['owner email normalization', { type: 'admin', email: ' DexLanka@Gmail.com ' }, 'GET', 'header', 200],
    ['owner write', { type: 'admin', email: 'dexlanka@gmail.com' }, 'POST', 'header', 200],
    ['owner cookie-only write', { type: 'admin', email: 'dexlanka@gmail.com' }, 'DELETE', 'cookie', 401],
    ['invalid or revoked owner session', null, 'GET', 'header', 401],
  ]
  for (const [name, identity, method, transport, expected] of cases) {
    actor = identity
    source = transport
    const res = response()
    let continued = false
    await requireSupplierShopOwner({ method, headers: {}, originalUrl: '/api/inventory/suppliers' }, res, () => { continued = true })
    assert.equal(res.statusCode, expected, name)
    assert.equal(continued, expected === 200, name)
  }
  assert.equal(features.SUPPLIER_SHOP_ENABLED, false, 'Supplier and cashier access stays disabled')

  let access = { allowed: false, checking: false }
  const element = (type, props) => ({ type, props: props || {} })
  const jsx = { jsx: element, jsxs: element, Fragment: 'Fragment' }
  const sharedDependencies = {
    'react/jsx-runtime': jsx,
    'react': { useState: () => [false, () => {}] },
    '@/components/supplier-shop-access': { useSupplierShopAccess: () => access },
  }
  const app = load('src/App.tsx', {
    ...sharedDependencies,
    'react': { Suspense: 'Suspense' },
    'react-router-dom': { Routes: 'Routes', Route: 'Route', Navigate: 'Navigate' },
    './lib/chunk-recovery': { lazyWithRetry: fn => fn.toString() },
    '@/components/supplier-guard': 'SupplierGuard',
    './config/features': features,
  })
  for (const allowed of [false, true]) {
    access = { allowed, checking: false }
    const routes = app.default().props.children.props.children
    const supplierPage = routes.find(r => r && r.props.path === '/admin/suppliers')
    assert.equal(supplierPage.props.element.type === 'Navigate', !allowed)
    for (const url of ['/supplier', '/supplier/login', '/cashier/supplier-orders']) {
      assert.equal(routes.find(r => r && r.props.path === url).props.element.type, 'Navigate', url)
    }
  }

  const sidebar = load('src/components/admin-sidebar.tsx', {
    ...sharedDependencies,
    'react-router-dom': { Link: 'Link', useLocation: () => ({ pathname: '/admin/dashboard' }) },
    'framer-motion': { motion: { button: 'button', aside: 'aside', div: 'div' } },
    'lucide-react': new Proxy({}, { get: (_, name) => `Icon:${String(name)}` }),
    '@/lib/admin-store': { useAdminStore: selector => selector({ logout() {} }) },
    '@/components/ui/button': { Button: 'Button' },
  })
  function shopLinks(node) {
    if (Array.isArray(node)) return node.reduce((count, child) => count + shopLinks(child), 0)
    if (!node || typeof node !== 'object') return 0
    return (node.type === 'Link' && node.props.to === '/admin/suppliers' ? 1 : 0) + shopLinks(node.props?.children)
  }
  access = { allowed: false, checking: false }
  assert.equal(shopLinks(sidebar.default()), 0, 'Both desktop and mobile hide the link from nonowners')
  access = { allowed: true, checking: false }
  assert.equal(shopLinks(sidebar.default()), 2, 'Both desktop and mobile show the link to the verified owner')
  console.log(`PASS: ${cases.length} API access cases, owner-only page access, desktop/mobile navigation, and blocked supplier/cashier pages`)
}

main().catch(error => { console.error(error); process.exitCode = 1 })
