import { lazy, type ComponentType } from 'react'

declare global {
  interface Window {
    __imobileUpdate?: { check: (recover?: boolean, manual?: boolean) => Promise<boolean> }
  }
}

const EXTENSION_URL_PATTERN = /(?:chrome|chrome-untrusted|moz|safari-web|safari|ms-browser|extension):\/\//i
const CHUNK_ERROR_PATTERN = /Failed to fetch dynamically imported module|Importing a module script failed|Expected a JavaScript-or-Wasm module script|Strict MIME type checking|error loading dynamically imported module|ChunkLoadError|Loading chunk|Unable to preload CSS/i

export function isChunkLoadError(error: unknown) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  if (EXTENSION_URL_PATTERN.test(message)) return false
  return CHUNK_ERROR_PATTERN.test(message) ||
    (/\/assets\/[^\s]+\.(?:js|mjs|css)/i.test(message) && /failed|fetch|load|module|mime|404/i.test(message))
}

export async function recoverFromChunkError(error: unknown) {
  if (!isChunkLoadError(error) || typeof window === 'undefined') return false
  return window.__imobileUpdate?.check(true) ?? false
}

export function forceChunkRecoveryReload() {
  if (typeof window === 'undefined') return
  // A deliberate reload should navigate immediately, without waiting on the
  // update checker or downloading the release twice.
  window.location.reload()
}

export function lazyWithRetry<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await factory()
    } catch (error) {
      if (await recoverFromChunkError(error)) {
        // The release is ready and the browser is navigating exactly once.
        return await new Promise<{ default: T }>(() => {})
      }
      throw error
    }
  })
}
