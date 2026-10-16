import { useEffect, useRef } from 'react'
import { getApiUrl } from '@/lib/utils/api'

const UPDATE_EVENTS = [
  'productUpdated',
  'categoryUpdated',
  'orderUpdated',
  'customerUpdated',
  'messageUpdated',
  'adminUpdated',
  'inventoryUpdated',
]

const VERSION_POLL_MS = 3000

let watchers = 0
let versionTimer: number | undefined
let lastVersion: string | null = null

// The server bumps this version on every successful write, so one tiny request
// tells every open screen that a sale or stock change happened elsewhere.
async function checkServerVersion() {
  if (document.visibilityState !== 'visible') return
  try {
    const res = await fetch(getApiUrl('/api/updates/version'), { cache: 'no-store' })
    if (!res.ok) return
    const { version } = await res.json()
    const next = String(version)
    if (lastVersion !== null && next !== lastVersion) {
      window.dispatchEvent(new CustomEvent('inventoryUpdated', { detail: { source: 'server' } }))
    }
    lastVersion = next
  } catch {
    // Offline or an older server without the endpoint; interval polling still applies.
  }
}

export function useServerChangeWatcher(enabled = true) {
  useEffect(() => {
    if (!enabled) return
    if (watchers++ === 0) {
      void checkServerVersion()
      versionTimer = window.setInterval(checkServerVersion, VERSION_POLL_MS)
    }
    return () => {
      if (--watchers === 0) {
        window.clearInterval(versionTimer)
        versionTimer = undefined
      }
    }
  }, [enabled])
}

interface AutoRefreshOptions {
  intervalMs?: number
  enabled?: boolean
}

/**
 * Keeps a screen's data current without a manual reload.
 *
 * In-browser events only reach tabs of the same browser, so changes made on
 * another device (a cashier sale, a customer order, another admin) are picked
 * up through the server's change version within a few seconds, with interval
 * polling as a fallback and an immediate refresh when the tab regains focus.
 */
export function useAutoRefresh(
  refresh: () => unknown,
  { intervalMs = 15000, enabled = true }: AutoRefreshOptions = {}
) {
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  useServerChangeWatcher(enabled)

  useEffect(() => {
    if (!enabled) return

    let inFlight = false
    let queued = false
    let lastRun = Date.now()

    // A change that lands mid-fetch may not be in that response, so run once more after it.
    const run = async () => {
      if (inFlight) {
        queued = true
        return
      }
      inFlight = true
      lastRun = Date.now()
      try {
        await refreshRef.current()
      } catch (error) {
        console.error('Auto refresh failed:', error)
      } finally {
        inFlight = false
        if (queued) {
          queued = false
          void run()
        }
      }
    }

    const tick = () => {
      if (document.visibilityState === 'visible') void run()
    }

    // Focus and visibilitychange often fire together; collapse them into one fetch.
    const onResume = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRun > 2000) void run()
    }

    const onStorage = (e: StorageEvent) => {
      if (!e.key || !e.newValue) return
      if (UPDATE_EVENTS.includes(e.key) || e.key.startsWith('adminUpdate_')) void run()
    }

    const timer = window.setInterval(tick, intervalMs)
    UPDATE_EVENTS.forEach((name) => window.addEventListener(name, tick))
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', onResume)
    window.addEventListener('online', onResume)
    document.addEventListener('visibilitychange', onResume)

    return () => {
      window.clearInterval(timer)
      UPDATE_EVENTS.forEach((name) => window.removeEventListener(name, tick))
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', onResume)
      window.removeEventListener('online', onResume)
      document.removeEventListener('visibilitychange', onResume)
    }
  }, [intervalMs, enabled])
}
