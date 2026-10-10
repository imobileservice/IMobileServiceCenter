// Inlined before the entry module. Entry failures, lazy imports and background
// update checks all use the same readiness check and reload budget.
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
    button.addEventListener('click', function () { void check(true, true) })
    root.style.cssText = 'min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui;text-align:center;padding:24px;box-sizing:border-box'
    root.appendChild(message)
    root.appendChild(button)
  }

  // Bound both the request and reading its body, including browsers without
  // AbortController. A slow connection must never suspend recovery forever.
  function read(url, kind, cache) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    var timer
    var timeout = new Promise(function (_, reject) {
      timer = window.setTimeout(function () {
        if (controller) controller.abort()
        reject(new Error('Update check timed out'))
      }, 10000)
    })
    var request = fetch(url, {
      cache: cache || 'no-store', credentials: 'same-origin',
      signal: controller ? controller.signal : undefined,
    }).then(function (response) {
      if (!response.ok) throw new Error('Release is not ready')
      var type = response.headers.get('content-type') || ''
      if (kind === 'json' && !/application\/json/i.test(type)) throw new Error('Invalid release metadata')
      if (kind === 'html' && !/text\/html/i.test(type)) throw new Error('Invalid app shell')
      if (kind === 'js' && !/javascript|ecmascript/i.test(type)) throw new Error('Invalid script')
      if (kind === 'css' && !/text\/css/i.test(type)) throw new Error('Invalid stylesheet')
      return kind === 'json' ? response.json() : kind === 'html' ? response.text() : response.arrayBuffer()
    })
    return Promise.race([request, timeout]).then(function (value) {
      window.clearTimeout(timer)
      return value
    }, function (error) {
      window.clearTimeout(timer)
      throw error
    })
  }

  function version() {
    var url = new URL('/build-version.json', window.location.origin)
    url.searchParams.set('imobile_cb', String(Date.now()))
    return read(url.toString(), 'json')
  }

  function warmAssets(assets) {
    var index = 0
    var stopped = false
    function next() {
      if (stopped || index >= assets.length) return Promise.resolve()
      var url = new URL(assets[index++], window.location.origin)
      if (url.origin !== window.location.origin || !/^\/assets\/.+\.(js|mjs|css)$/.test(url.pathname)) {
        stopped = true
        return Promise.reject(new Error('Invalid release asset'))
      }
      // Refresh the exact entry used on navigation, with bounded concurrency
      // so slow phones can warm every route without flooding their connection.
      return read(url.toString(), /\.css$/.test(url.pathname) ? 'css' : 'js', 'reload').then(next, function (error) {
        stopped = true
        throw error
      })
    }
    return Promise.all([next(), next(), next(), next()])
  }

  function check(recover, manual) {
    resourceFailed = resourceFailed || Boolean(recover)
    if (navigating) return Promise.resolve(true)
    if (pending) return pending
    if (navigator.onLine === false) return Promise.resolve(false)

    pending = version().then(function (release) {
      if (!release || typeof release.id !== 'string' || !/^[\w-]{1,100}$/.test(release.id)) return false
      if (release.id === currentBuild && !resourceFailed) return false
      if (!manual && alreadyReloaded(release.id)) return false
      if (!Array.isArray(release.assets) || !release.assets.length) return false

      var nextUrl = new URL(window.location.href)
      nextUrl.searchParams.set(PARAM, release.id)
      return read(nextUrl.toString(), 'html', 'reload').then(function (html) {
        var shell = new DOMParser().parseFromString(html, 'text/html')
        var marker = shell.querySelector('meta[name="imobile-build"]')
        if (!marker || marker.getAttribute('content') !== release.id) return false
        var entry = shell.querySelector('script[type="module"][src]')
        if (!entry || release.assets.indexOf(new URL(entry.getAttribute('src'), window.location.origin).pathname) < 0) return false

        return warmAssets(release.assets).then(version).then(function (latest) {
          if (!latest || latest.id !== release.id) return false
          attemptedBuild = release.id
          try { window.sessionStorage.setItem(KEY, release.id) } catch (_) { /* URL marker is the fallback. */ }
          navigating = true
          // The visitor may have changed pages while the files were warming.
          var destination = new URL(window.location.href)
          destination.searchParams.set(PARAM, release.id)
          window.location.replace(destination.toString())
          return true
        })
      })
    }).catch(function () {
      // Offline, partial releases and invalid assets keep the current page.
      // Retry readiness in the background instead of repeatedly reloading.
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
    if (document.visibilityState === 'visible') void check()
  }
  window.setInterval(refresh, 30000)
  window.addEventListener('focus', refresh)
  window.addEventListener('online', refresh)
  window.addEventListener('pageshow', refresh)
  document.addEventListener('visibilitychange', refresh)
  window.addEventListener('load', function () {
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
    refresh()
  })
})()
