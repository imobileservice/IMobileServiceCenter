// Browser-like deployment simulations with no network or database access.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname, '../src/lib/app-update.js'), 'utf8')
const KEY = 'imobile:update:last-reload'

function browser(options = {}) {
  const settings = { current: 'old', latest: 'new', shell: 'new', assetType: 'valid', ...options }
  const storage = settings.storage || new Map()
  const calls = [], navigations = [], events = {}, timers = new Map()
  let timerId = 0, versionReads = 0
  const href = settings.href || 'https://example.com/admin/suppliers?tab=shops#pending'
  const win = {
    location: { href, origin: 'https://example.com', replace: value => navigations.push(value) },
    sessionStorage: {
      getItem(key) { if (settings.blockStorage) throw Error('Storage blocked'); return storage.get(key) || null },
      setItem(key, value) { if (settings.blockStorage) throw Error('Storage blocked'); storage.set(key, value) },
    },
    history: { state: {}, replaceState() {} },
    setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId },
    clearTimeout: id => timers.delete(id),
    setInterval: fn => { events.interval = fn },
    addEventListener: (name, fn) => { events[name] = fn },
  }
  const doc = {
    visibilityState: 'visible', title: 'App',
    documentElement: { classList: { toggle() {}, add() {} }, style: {} },
    querySelector: () => ({ getAttribute: () => settings.current }),
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener: (name, fn) => { events[name] = fn },
  }
  const navigator = { onLine: !settings.offline }
  const context = {
    window: win, document: doc, navigator, URL, AbortController,
    DOMParser: class {
      parseFromString(html) {
        const data = JSON.parse(html)
        return { querySelector: selector => ({ getAttribute: () => selector.startsWith('meta') ? data.id : `/assets/entry-${data.id}.js` }) }
      }
    },
    fetch: async (url, init) => {
      calls.push({ url, init })
      if (settings.hang) return new Promise(() => {})
      if (settings.networkError) throw Error('Offline')
      const pathname = new URL(url).pathname
      let type, body
      if (pathname === '/build-version.json') {
        assert.equal(init.cache, 'no-store')
        ++versionReads
        const id = settings.confirmation && versionReads > 1 ? settings.confirmation : settings.latest
        type = settings.metadataType || 'application/json'
        body = { id, assets: settings.assets || [`/assets/entry-${id}.js`, `/assets/styles-${id}.css`] }
      } else if (pathname.startsWith('/assets/')) {
        if (settings.navigateWhileWarming) win.location.href = settings.navigateWhileWarming
        assert.equal(init.cache, 'reload', 'Warm the actual browser cache entry')
        assert.equal(new URL(url).search, '', 'Asset URLs must match the next page exactly')
        type = settings.assetType === 'html' ? 'text/html' : pathname.endsWith('.css') ? 'text/css' : 'application/javascript'
        body = 'asset'
      } else {
        assert.equal(init.cache, 'reload')
        type = 'text/html'
        body = JSON.stringify({ id: settings.shell })
      }
      return {
        ok: !(settings.missingAsset && pathname.startsWith('/assets/')) && pathname !== settings.missingPath,
        headers: { get: () => type }, json: async () => body,
        text: async () => body, arrayBuffer: async () => new ArrayBuffer(1),
      }
    },
  }
  vm.runInNewContext(source, context)
  return { ...context, settings, storage, calls, navigations, events, timers, update: win.__imobileUpdate }
}

async function main() {
  let checks = 0
  const check = (condition, message) => { assert.ok(condition, message); ++checks }

  let b = browser()
  const pending = b.update.check()
  check(pending === b.update.check(true), 'Entry failure and background update share one check')
  check(await pending, 'Ready release refreshes')
  check(b.navigations.length === 1, 'Exactly one navigation')
  const destination = new URL(b.navigations[0])
  check(destination.pathname === '/admin/suppliers' && destination.searchParams.get('tab') === 'shops' && destination.hash === '#pending', 'Keep deep link, filters and hash')
  check(destination.searchParams.get('imobile_build_refresh') === 'new', 'Reload carries a loop guard')
  await b.update.check(true)
  check(b.navigations.length === 1, 'Duplicate errors cannot trigger another reload')
  const savedStorage = b.storage
  b = browser({ navigateWhileWarming: 'https://example.com/shop?search=display#results' })
  check(await b.update.check(), 'An update can finish after client navigation')
  const moved = new URL(b.navigations[0])
  check(moved.pathname === '/shop' && moved.searchParams.get('search') === 'display' && moved.hash === '#results', 'Refresh the visitor’s current route after warming')

  b = browser({ current: 'new', latest: 'new', shell: 'new', storage: savedStorage })
  check(!(await b.update.check(true)), 'The refreshed release cannot reload itself')
  check(b.navigations.length === 0, 'Reload budget survives navigation')
  b = browser({ current: 'new', latest: 'new', href: destination.toString(), blockStorage: true })
  check(!(await b.update.check(true)), 'URL loop guard works when sessionStorage is blocked')

  b = browser({ current: 'new', latest: 'new', shell: 'new' })
  check(!(await b.update.check()) && b.calls.length === 1, 'Current release does not reload or refetch assets')
  b = browser({ shell: 'old' })
  check(!(await b.update.check()) && !b.navigations.length, 'Mixed HTML and metadata never reload')
  b.settings.shell = 'new'
  check(await b.update.check(), 'Wait for a complete deploy, then refresh once')

  for (const options of [{ missingAsset: true }, { assetType: 'html' }, { networkError: true }, { metadataType: 'text/html' }]) {
    b = browser(options)
    check(!(await b.update.check(true)) && !b.navigations.length, 'Missing, poisoned or unavailable files never trigger a blind reload')
  }
  b = browser({ assets: ['/assets/entry-new.js', '/assets/styles-new.css', '/assets/route-new.js'], missingPath: '/assets/route-new.js' })
  check(!(await b.update.check()) && !b.navigations.length, 'A missing lazy route prevents a premature reload')
  b = browser({ confirmation: 'newer' })
  check(!(await b.update.check()) && !b.navigations.length, 'A deploy changing during preflight is retried without a reload')
  b = browser({ offline: true })
  check(!(await b.update.check(true)) && !b.calls.length, 'Offline browsers keep the current page')
  b = browser({ assets: ['/assets/entry-new.js', 'https://other.example.com/assets/bad.js'] })
  check(!(await b.update.check()) && b.calls.every(call => new URL(call.url).origin === 'https://example.com'), 'Only this origin can receive asset requests')

  b = browser({ hang: true })
  const hanging = b.update.check(true)
  b.timers.forEach(timer => timer.fn())
  check(!(await hanging) && !b.navigations.length, 'Stalled requests finish without a permanent recovery spinner')
  b = browser()
  b.events.error({ target: { src: 'chrome-extension://extension/assets/script.js' }, message: 'Failed to fetch dynamically imported module' })
  await new Promise(resolve => setImmediate(resolve))
  check(!b.calls.length, 'Extension resource failures are ignored even with a generic error message')
  b = browser()
  b.events.error({ target: { src: 'chrome-extension://extension/assets/script.js' }, message: 'Failed to fetch dynamically imported module: chrome-extension://extension/assets/script.js' })
  check(!b.calls.length, 'Extension failures never refresh the website')

  // Exercise actual React.lazy recovery, not just the standalone bootstrap.
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/chunk-recovery.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  vm.runInNewContext(code, { exports, window: { __imobileUpdate: { check: async () => false } }, require: () => ({ lazy: fn => fn }) })
  const error = new Error('Failed to fetch dynamically imported module: /assets/deleted.js')
  await assert.rejects(exports.lazyWithRetry(async () => { throw error })(), error)
  ++checks
  check(!exports.isChunkLoadError('Failed to fetch dynamically imported module: chrome-extension://extension/assets/script.js'), 'React recovery also ignores extensions')
  console.log(`PASS: ${checks} deployment update and reload-loop regression checks`)
}

main().catch(error => { console.error(error); process.exitCode = 1 })
