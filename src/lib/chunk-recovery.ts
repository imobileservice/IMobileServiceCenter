import { lazy, type ComponentType } from 'react'

const CHUNK_RECOVERY_KEY = 'imobile:chunk-recovery'
const CHUNK_REFRESH_PARAM = 'imobile_build_refresh'
const CHUNK_RELOAD_TTL_MS = 2 * 60 * 1000
const CHUNK_RELOAD_MAX_ATTEMPTS = 3

const CHUNK_ERROR_PATTERNS = [
  'Failed to fetch dynamically imported module',
  'Importing a module script failed',
  'Expected a JavaScript-or-Wasm module script',
  'Strict MIME type checking',
  'error loading dynamically imported module',
  'ChunkLoadError',
  'Loading chunk',
  'Unable to preload CSS',
]

const ASSET_URL_PATTERN = /(?:https?:\/\/[^\s)'"<>]+)?\/assets\/[^\s)'"<>]+\.(?:js|mjs|css)(?:\?[^\s)'"<>]*)?/i

let recoveryScheduled = false
let reloadTimerId: number | undefined
let recoveryListenersInstalled = false

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n${error.stack || ''}`
  }

  if (typeof error === 'string') {
    return error
  }

  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function getChunkErrorId(error: unknown) {
  const message = getErrorMessage(error)
  const assetMatch = message.match(ASSET_URL_PATTERN)
  return assetMatch?.[0] || message.slice(0, 180)
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function getStoredRecoveryState(now: number) {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(CHUNK_RECOVERY_KEY) || 'null') as {
      firstAttemptAt?: number
      attempts?: number
      lastErrorId?: string
    } | null

    if (
      parsed &&
      typeof parsed.firstAttemptAt === 'number' &&
      typeof parsed.attempts === 'number' &&
      now - parsed.firstAttemptAt < CHUNK_RELOAD_TTL_MS
    ) {
      return parsed
    }
  } catch {
    // Ignore malformed storage; a fresh recovery window is safer.
  }

  return { firstAttemptAt: now, attempts: 0, lastErrorId: undefined }
}

function getFailedResourceUrl(target: EventTarget | null) {
  if (target instanceof HTMLScriptElement) return target.src
  if (target instanceof HTMLLinkElement) return target.href
  return ''
}

function isAssetUrl(value: string) {
  return ASSET_URL_PATTERN.test(value)
}

function cleanRecoveryQueryParam() {
  if (typeof window === 'undefined') return

  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has(CHUNK_REFRESH_PARAM)) return

    url.searchParams.delete(CHUNK_REFRESH_PARAM)
    window.history.replaceState(
      window.history.state,
      document.title,
      `${url.pathname}${url.search}${url.hash}`
    )
  } catch {
    // Keeping the cache-busting query in the URL is harmless if cleanup fails.
  }
}

function getFreshBuildUrl() {
  const nextUrl = new URL(window.location.href)
  nextUrl.searchParams.set(CHUNK_REFRESH_PARAM, String(Date.now()))
  return nextUrl.toString()
}

function clearChunkRecoveryState() {
  recoveryScheduled = false

  if (reloadTimerId !== undefined) {
    window.clearTimeout(reloadTimerId)
    reloadTimerId = undefined
  }

  try {
    window.sessionStorage.removeItem(CHUNK_RECOVERY_KEY)
  } catch {
    // Storage can be unavailable in private or restricted browsing modes.
  }
}

export function isChunkLoadError(error: unknown) {
  const message = getErrorMessage(error)
  const hasKnownPattern = CHUNK_ERROR_PATTERNS.some((pattern) => message.includes(pattern))
  const hasAssetUrl = isAssetUrl(message)
  const hasLoadFailureWords = /failed|fetch|load|loading|module|mime|html|404/i.test(message)

  return hasKnownPattern || (hasAssetUrl && hasLoadFailureWords)
}

export function markChunkReloadAttempt(error: unknown) {
  if (typeof window === 'undefined') return false
  if (recoveryScheduled) return true

  const now = Date.now()
  const errorId = getChunkErrorId(error)

  try {
    let state = getStoredRecoveryState(now)

    if ((state.attempts || 0) >= CHUNK_RELOAD_MAX_ATTEMPTS && state.lastErrorId !== errorId) {
      state = { firstAttemptAt: now, attempts: 0, lastErrorId: undefined }
    }

    if ((state.attempts || 0) >= CHUNK_RELOAD_MAX_ATTEMPTS) {
      return false
    }

    window.sessionStorage.setItem(
      CHUNK_RECOVERY_KEY,
      JSON.stringify({
        firstAttemptAt: state.firstAttemptAt || now,
        attempts: (state.attempts || 0) + 1,
        lastErrorId: errorId,
      })
    )
    recoveryScheduled = true
    return true
  } catch {
    recoveryScheduled = true
    return true
  }
}

export function reloadForChunkError() {
  if (typeof window === 'undefined') return
  if (reloadTimerId !== undefined) return

  reloadTimerId = window.setTimeout(() => {
    window.location.replace(getFreshBuildUrl())
  }, 100)
}

export function forceChunkRecoveryReload() {
  if (typeof window === 'undefined') return

  clearChunkRecoveryState()
  window.location.replace(getFreshBuildUrl())
}

export function requestChunkRecovery(error: unknown) {
  if (!isChunkLoadError(error) || !markChunkReloadAttempt(error)) {
    return false
  }

  reloadForChunkError()
  return true
}

export function installChunkRecovery() {
  if (typeof window === 'undefined' || recoveryListenersInstalled) return

  recoveryListenersInstalled = true
  cleanRecoveryQueryParam()

  window.addEventListener('vite:preloadError', (event) => {
    const preloadEvent = event as Event & { payload?: unknown }
    if (requestChunkRecovery(preloadEvent.payload || preloadEvent)) {
      event.preventDefault()
    }
  })

  window.addEventListener('unhandledrejection', (event) => {
    if (requestChunkRecovery(event.reason)) {
      event.preventDefault()
    }
  })

  window.addEventListener(
    'error',
    (event) => {
      const targetUrl = getFailedResourceUrl(event.target)
      const reason =
        event instanceof ErrorEvent
          ? event.error || event.message || targetUrl
          : targetUrl

      if ((targetUrl && isAssetUrl(targetUrl)) || isChunkLoadError(reason)) {
        const recoveryReason =
          targetUrl && isAssetUrl(targetUrl)
            ? `Failed to load module asset: ${targetUrl}`
            : reason
        if (requestChunkRecovery(recoveryReason)) {
          event.preventDefault()
        }
      }
    },
    true
  )
}

export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await factory()
    } catch (firstError) {
      if (!isChunkLoadError(firstError)) {
        throw firstError
      }

      try {
        await delay(600)
        return await factory()
      } catch (secondError) {
        if (requestChunkRecovery(secondError)) {
          return await new Promise<{ default: T }>(() => {
            // Keep React suspended while the browser loads the current build.
          })
        }

        throw secondError
      }
    }
  })
}
