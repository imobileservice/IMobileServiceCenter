import { lazy, type ComponentType } from 'react'

const CHUNK_RELOAD_KEY_PREFIX = 'imobile:chunk-reload:'
const CHUNK_RELOAD_TTL_MS = 10 * 60 * 1000

const CHUNK_ERROR_PATTERNS = [
  'Failed to fetch dynamically imported module',
  'Importing a module script failed',
  'error loading dynamically imported module',
  'ChunkLoadError',
  'Loading chunk',
  'Unable to preload CSS',
]

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
  const assetMatch = message.match(/https?:\/\/[^\s)'"<>]+\/assets\/[^\s)'"<>]+/)
  return assetMatch?.[0] || message.slice(0, 180)
}

function getReloadKey(error: unknown) {
  return `${CHUNK_RELOAD_KEY_PREFIX}${getChunkErrorId(error)}`
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export function isChunkLoadError(error: unknown) {
  const message = getErrorMessage(error)
  return CHUNK_ERROR_PATTERNS.some((pattern) => message.includes(pattern))
}

export function markChunkReloadAttempt(error: unknown) {
  if (typeof window === 'undefined') return false

  const key = getReloadKey(error)
  const now = Date.now()

  try {
    const previous = Number(window.sessionStorage.getItem(key) || 0)
    if (previous && now - previous < CHUNK_RELOAD_TTL_MS) {
      return false
    }

    window.sessionStorage.setItem(key, String(now))
    return true
  } catch {
    return true
  }
}

export function reloadForChunkError() {
  if (typeof window === 'undefined') return

  window.setTimeout(() => {
    window.location.reload()
  }, 100)
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
        if (isChunkLoadError(secondError) && markChunkReloadAttempt(secondError)) {
          reloadForChunkError()
          return await new Promise<{ default: T }>(() => {
            // Keep React suspended while the browser loads the current build.
          })
        }

        throw secondError
      }
    }
  })
}
