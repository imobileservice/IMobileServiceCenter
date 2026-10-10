// Browser-like deployment simulations with no network or database access.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname, '../src/lib/app-update.js'), 'utf8')
const KEY = 'imobile:update:last-reload'

function browser(options = {}) {
  const settings = { current: 'old', latest: 'new', shell: 'new', now: 1000, ...options }
  const storage = settings.storage || new Map()
  const calls = [], navigations = [], events = {}, timers = new Map()
  let timerId = 0
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
    Date: { now: () => settings.now },
    fetch: async (url, init) => {
      calls.push({ url, init })
      if (settings.hang) return new Promise(() => {})
      if (settings.networkError) throw Error('Offline')
      const pathname = new URL(url).pathname
      assert.equal(pathname, '/build-version.json', 'Never fetch the HTML page or download every release asset')
      assert.equal(init.cache, 'no-store')
      if (settings.moveWhileChecking) win.location.href = settings.moveWhileChecking
      const body = { id: settings.latest, assets: settings.assets || ['/assets/unused-route.js'] }
      return {
        ok: !settings.metadataError,
        headers: { get: () => settings.metadataType || 'application/json' },
        json: async () => body,
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
  check(b.calls.length === 1, 'Update recovery uses only one small metadata request')
  b = browser({ moveWhileChecking: 'https://example.com/shop?search=display#results' })
  check(await b.update.check(), 'An update can finish after client navigation')
  const moved = new URL(b.navigations[0])
  check(moved.pathname === '/shop' && moved.searchParams.get('search') === 'display' && moved.hash === '#results', 'Refresh the visitor’s current route')

  b = browser({ current: 'new', latest: 'new', shell: 'new', storage: savedStorage })
  check(!(await b.update.check(true)), 'The refreshed release cannot reload itself')
  check(b.navigations.length === 0, 'Reload budget survives navigation')
  b = browser({ current: 'new', latest: 'new', href: destination.toString(), blockStorage: true })
  check(!(await b.update.check(true)), 'URL loop guard works when sessionStorage is blocked')

  b = browser({ current: 'new', latest: 'new', shell: 'new' })
  check(!(await b.update.check()) && b.calls.length === 1, 'Current release does not reload or refetch assets')
  for (const options of [{ networkError: true }, { metadataType: 'text/html' }, { metadataError: true }, { latest: '../invalid' }, { latest: '' }]) {
    b = browser(options)
    check(!(await b.update.check(true)) && !b.navigations.length, 'Unavailable or invalid metadata keeps the current page')
  }
  b = browser({ current: 'new', latest: 'new' })
  check(await b.update.check(true), 'An actual failed module can recover the same release once')
  const sameReleaseStorage = b.storage
  b = browser({ current: 'new', latest: 'new', storage: sameReleaseStorage })
  check(!(await b.update.check(true)), 'Same-release recovery cannot loop after navigation')

  // Browser Reload, load/pageshow, focus and visibility must not start a
  // preflight while the new document and its real resources are loading.
  b = browser({ current: 'new', latest: 'new' })
  b.events.focus()
  b.events.interval()
  b.events.pageshow({ persisted: false })
  check(!b.calls.length, 'No startup checks before page load')
  b.events.load()
  b.events.pageshow({ persisted: false })
  b.events.focus()
  b.events.visibilitychange()
  b.events.interval()
  check(!b.calls.length && !b.navigations.length, 'Normal reload loads directly without any update requests')
  b.settings.now += 30000
  b.events.focus()
  b.events.interval()
  await new Promise(resolve => setImmediate(resolve))
  check(b.calls.length === 1 && !b.navigations.length, 'Background checks are delayed and shared across events')
  b.events.focus()
  check(b.calls.length === 1, 'Repeated focus does not poll again immediately')
  b.events.beforeunload({ defaultPrevented: false, returnValue: '' })
  b.settings.now += 30000
  b.events.interval()
  check(b.calls.length === 1 && !(await b.update.check(true)), 'Update checker never interrupts a normal browser refresh')

  b = browser()
  const leaving = b.update.check()
  b.events.beforeunload({ defaultPrevented: false, returnValue: '' })
  check(!(await leaving) && !b.navigations.length, 'An in-flight check cannot navigate after a manual refresh starts')
  b = browser({ current: 'new', latest: 'new' })
  b.events.load()
  const cancelled = { defaultPrevented: true, returnValue: 'stay' }
  b.events.beforeunload(cancelled)
  b.timers.forEach(timer => { if (timer.ms === 0) timer.fn() })
  b.settings.now += 30000
  b.events.focus()
  await new Promise(resolve => setImmediate(resolve))
  check(b.calls.length === 1, 'Cancelling a checkout navigation restores background checks')

  b = browser({ offline: true })
  check(!(await b.update.check(true)) && !b.calls.length, 'Offline browsers keep the current page')
  b = browser({ assets: ['/assets/entry-new.js', 'https://other.example.com/assets/bad.js'] })
  check(await b.update.check() && b.calls.length === 1 && b.calls.every(call => new URL(call.url).origin === 'https://example.com'), 'Manifest asset lists never trigger extra or cross-origin downloads')

  b = browser({ hang: true })
  const hanging = b.update.check(true)
  check([...b.timers.values()].every(timer => timer.ms <= 2000), 'Metadata recovery has a short timeout')
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
  let manualReloads = 0
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/chunk-recovery.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  vm.runInNewContext(code, { exports, window: { __imobileUpdate: { check: async () => false }, location: { reload: () => ++manualReloads } }, require: () => ({ lazy: fn => fn }) })
  exports.forceChunkRecoveryReload()
  check(manualReloads === 1, 'Reload Page navigates immediately without awaiting a metadata request')
  const error = new Error('Failed to fetch dynamically imported module: /assets/deleted.js')
  await assert.rejects(exports.lazyWithRetry(async () => { throw error })(), error)
  ++checks
  check(!exports.isChunkLoadError('Failed to fetch dynamically imported module: chrome-extension://extension/assets/script.js'), 'React recovery also ignores extensions')
  console.log(`PASS: ${checks} deployment update and reload-loop regression checks`)
}

main().catch(error => { console.error(error); process.exitCode = 1 })
