// Inlined before the entry module. Entry failures, lazy imports and background
// update checks share one metadata request and reload budget. Ordinary browser
// reloads load the app directly, without a preflight or a full-cache purge.
;(function () {
  if (window.__imobileUpdate) return
  // Apply the saved theme before CSS loads to avoid a white flash on reload.
  try {
    var theme = window.localStorage.getItem('theme') || 'dark'
    var dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    document.documentElement.style.backgroundColor = dark ? '#0a0a0a' : '#ffffff'
  } catch (_) {
    document.documentElement.classList.add('dark')
  }
  var meta = document.querySelector('meta[name="imobile-build"]')
  var currentBuild = meta && meta.getAttribute('content')
  if (!currentBuild) return

  var KEY = 'imobile:update:last-reload'
  var PARAM = 'imobile_build_refresh'
  var arrivingBuild = new URL(window.location.href).searchParams.get(PARAM)
  var pending = null
  var navigating = false
  var resourceFailed = false
  var attemptedBuild = null
  var loaded = false
  var departing = false
  var nextCheckAt = Infinity
  var activeController = null
  var patterns = /Failed to fetch dynamically imported module|Importing a module script failed|Expected a JavaScript-or-Wasm module script|Strict MIME type checking|error loading dynamically imported module|ChunkLoadError|Loading chunk|Unable to preload CSS/i
  var extensions = /(?:chrome|chrome-untrusted|moz|safari-web|safari|ms-browser|extension):\/\//i

  function alreadyReloaded(id) {
    if (arrivingBuild === id || attemptedBuild === id) return true
    try { return window.sessionStorage.getItem(KEY) === id } catch (_) { return false }
  }

  function showEntryFailure() {
    var root = document.getElementById('root')
    if (!root || root.childNodes.length) return
    var message = document.createElement('p')
    message.textContent = 'The site is updating. Please try again shortly.'
    var button = document.createElement('button')
    button.textContent = 'Try again'
    button.style.cssText = 'padding:10px 18px;border:0;border-radius:8px;cursor:pointer'
    button.addEventListener('click', function () { window.location.reload() })
    root.style.cssText = 'min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui;text-align:center;padding:24px;box-sizing:border-box'
    root.appendChild(message)
    root.appendChild(button)
  }

  // Only fetch the small release metadata, never the page being refreshed or
  // every route's JS/CSS. Bound the body read as well as the connection.
  function version() {
    var url = new URL('/build-version.json', window.location.origin)
    url.searchParams.set('imobile_cb', String(Date.now()))
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    activeController = controller
    var timer
    var timeout = new Promise(function (_, reject) {
      timer = window.setTimeout(function () {
        if (controller) controller.abort()
        reject(new Error('Update check timed out'))
      }, 2000)
    })
    var request = fetch(url.toString(), {
      cache: 'no-store', credentials: 'same-origin',
      signal: controller ? controller.signal : undefined,
    }).then(function (response) {
      if (!response.ok) throw new Error('Release is not ready')
      var type = response.headers.get('content-type') || ''
      if (!/application\/json/i.test(type)) throw new Error('Invalid release metadata')
      return response.json()
    })
    return Promise.race([request, timeout]).then(function (value) {
      window.clearTimeout(timer)
      activeController = null
      return value
    }, function (error) {
      window.clearTimeout(timer)
      activeController = null
      throw error
    })
  }

  function check(recover, manual) {
    resourceFailed = resourceFailed || Boolean(recover)
    if (navigating) return Promise.resolve(true)
    if (departing) return Promise.resolve(false)
    if (pending) return pending
    if (navigator.onLine === false) return Promise.resolve(false)
    nextCheckAt = Date.now() + 30000

    pending = version().then(function (release) {
      if (!release || typeof release.id !== 'string' || !/^[\w-]{1,100}$/.test(release.id)) return false
      if (departing) return false
      if (release.id === currentBuild && !resourceFailed) return false
      if (!manual && alreadyReloaded(release.id)) return false
      attemptedBuild = release.id
      try { window.sessionStorage.setItem(KEY, release.id) } catch (_) { /* URL marker is the fallback. */ }
      navigating = true
      var destination = new URL(window.location.href)
      destination.searchParams.set(PARAM, release.id)
      window.location.replace(destination.toString())
      return true
    }).catch(function () {
      // Keep the working page on failed checks. Retry quietly later.
      return false
    }).then(function (reloaded) {
      pending = null
      if (!reloaded && resourceFailed) showEntryFailure()
      return reloaded
    })
    return pending
  }

  window.__imobileUpdate = { check: check }

  function assetUrl(value) {
    if (!value || extensions.test(value)) return false
    try {
      var url = new URL(value, window.location.origin)
      return url.origin === window.location.origin && /^\/assets\/.+\.(js|mjs|css)$/.test(url.pathname)
    } catch (_) { return false }
  }

  function failed(error) {
    var message = error && (error.message || String(error))
    return message && !extensions.test(message) && patterns.test(message)
  }

  window.addEventListener('error', function (event) {
    var target = event.target
    var resource = target && (target.src || target.href)
    if (resource) {
      if (assetUrl(resource)) void check(true)
      return
    }
    if (failed(event.error || event.message)) void check(true)
  }, true)
  window.addEventListener('unhandledrejection', function (event) {
    if (failed(event.reason)) void check(true)
  })
  window.addEventListener('vite:preloadError', function (event) {
    // Let React receive the rejection; cancelling it makes lazy imports undefined.
    if (failed(event.payload)) void check(true)
  })

  function refresh() {
    if (loaded && !departing && document.visibilityState === 'visible' && Date.now() >= nextCheckAt) void check()
  }
  window.setInterval(refresh, 30000)
  window.addEventListener('focus', refresh)
  window.addEventListener('online', refresh)
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) { departing = false; loaded = true; refresh() }
  })
  window.addEventListener('beforeunload', function (event) {
    departing = true
    if (activeController) activeController.abort()
    // A checkout confirmation can cancel navigation; keep checks available if
    // the visitor chooses to stay on the page.
    window.setTimeout(function () {
      if (event.defaultPrevented || event.returnValue) departing = false
    }, 0)
  })
  document.addEventListener('visibilitychange', refresh)
  window.addEventListener('load', function () {
    loaded = true
    nextCheckAt = Date.now() + 30000
    // Some browsers report a CSS MIME failure only as an empty stylesheet.
    document.querySelectorAll('link[rel="stylesheet"]').forEach(function (link) {
      if (!assetUrl(link.href)) return
      try {
        if (!link.sheet || link.sheet.cssRules.length === 0) void check(true)
      } catch (_) { /* Cross-origin stylesheet rules are not readable. */ }
    })
    // Keep the URL guard if storage is blocked, including private browsers.
    try {
      if (arrivingBuild && window.sessionStorage.getItem(KEY) === arrivingBuild) {
        var url = new URL(window.location.href)
        url.searchParams.delete(PARAM)
        window.history.replaceState(window.history.state, document.title, url.pathname + url.search + url.hash)
      }
    } catch (_) {}
  })
})()
