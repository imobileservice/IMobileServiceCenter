/**
 * Attach the signed-in session to every call this app makes to its own API.
 *
 * The panel's API calls are spread across three dozen service modules and page
 * components, each with its own bare `fetch(getApiUrl(...))`. Threading a token
 * through all of them by hand would mean the next call site someone adds is
 * unauthenticated and nobody notices until it 401s in production. So the token
 * is attached once, here, by wrapping window.fetch at boot.
 *
 * What gets attached, and to what:
 *
 *   /api/admin/*      x-panel-session: the administrator's token, or the
 *                     assistant's for the routes they share
 *   /api/assistant/*  x-panel-session: the assistant's token
 *   /api/inventory/*  x-panel-session (admin or assistant, whichever is signed
 *                     in) and x-till-session for a POS session
 *
 * Requests to anywhere else are passed through untouched - a token must never
 * leak to a third-party host, so the URL is resolved and matched against this
 * application's own API base before anything is added.
 */
import { getApiBaseUrl } from '@/lib/utils/api'

export const PANEL_SESSION_HEADER = 'x-panel-session'
export const TILL_SESSION_HEADER = 'x-till-session'

/**
 * Tokens live in sessionStorage, not localStorage.
 *
 * sessionStorage is per-tab and dies with the tab, which matches how a session
 * on a shared shop machine should behave: closing the browser ends it, and a
 * second tab opened by someone else does not inherit it.
 */
const ADMIN_TOKEN_KEY = 'imsc.panel.admin.token'
const ASSISTANT_TOKEN_KEY = 'imsc.panel.assistant.token'
const TILL_TOKEN_KEY = 'imsc.pos.till.token'

function readStorage(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key)
  } catch {
    // Private mode, or storage disabled by policy. The cookie fallback still
    // authorises plain navigations; everything else asks for a fresh sign-in.
    return null
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) window.sessionStorage.removeItem(key)
    else window.sessionStorage.setItem(key, value)
  } catch {
    /* nothing to do - see readStorage */
  }
}

export const adminSessionToken = {
  get: () => readStorage(ADMIN_TOKEN_KEY),
  set: (token: string | null) => writeStorage(ADMIN_TOKEN_KEY, token),
}

export const assistantSessionToken = {
  get: () => readStorage(ASSISTANT_TOKEN_KEY),
  set: (token: string | null) => writeStorage(ASSISTANT_TOKEN_KEY, token),
}

export const tillSessionToken = {
  get: () => readStorage(TILL_TOKEN_KEY),
  set: (token: string | null) => writeStorage(TILL_TOKEN_KEY, token),
}

/** Absolute URL for whatever fetch() was handed. */
function resolveUrl(input: RequestInfo | URL): string {
  try {
    if (typeof input === 'string') return new URL(input, window.location.href).href
    if (input instanceof URL) return input.href
    return new URL((input as Request).url, window.location.href).href
  } catch {
    return ''
  }
}

/** Is this a call to our own API, and if so which part of it? */
function classify(url: string): 'admin' | 'assistant' | 'inventory' | null {
  if (!url) return null

  let path: string
  try {
    const parsed = new URL(url)
    const apiBase = getApiBaseUrl()

    if (apiBase) {
      // Deployed: the API lives on its own host. Anything else is a third party.
      const base = new URL(apiBase, window.location.href)
      if (parsed.origin !== base.origin && parsed.origin !== window.location.origin) return null
    } else if (parsed.origin !== window.location.origin) {
      return null
    }

    path = parsed.pathname
  } catch {
    return null
  }

  if (path.startsWith('/api/admin')) return 'admin'
  if (path.startsWith('/api/assistant')) return 'assistant'
  if (path.startsWith('/api/inventory')) return 'inventory'
  return null
}

let installed = false

/**
 * Wrap window.fetch. Idempotent, and safe to call before React renders.
 */
export function installSessionFetch() {
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') return
  installed = true

  const originalFetch = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const kind = classify(resolveUrl(input))
    if (!kind) return originalFetch(input as any, init)

    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined))

    // The panel token: whichever of the two matches the surface being called.
    // On /api/admin an assistant's token is sent when there is no
    // administrator's: the assistant uses the admin Add Product dialog, and the
    // server lets it through only on the routes that dialog needs
    // (ASSISTANT_SHARED_ROUTES in server/api/utils/panel-auth.ts) - everywhere
    // else it is refused as not an administrator. On /api/inventory either
    // will do. The administrator's is preferred when a browser holds both.
    const panelToken =
      kind === 'assistant'
        ? assistantSessionToken.get()
        : adminSessionToken.get() || assistantSessionToken.get()

    if (panelToken && !headers.has(PANEL_SESSION_HEADER)) {
      headers.set(PANEL_SESSION_HEADER, panelToken)
    }

    if (kind === 'inventory') {
      const till = tillSessionToken.get()
      if (till && !headers.has(TILL_SESSION_HEADER)) headers.set(TILL_SESSION_HEADER, till)
    }

    return originalFetch(input as any, {
      ...init,
      headers,
      // So the httpOnly session cookie rides along as a fallback. The server
      // accepts it for reads only; writes must carry the header above.
      credentials: init?.credentials ?? 'include',
    })
  }
}

/** Drop every panel token from this tab. Used on sign-out. */
export function clearPanelTokens() {
  adminSessionToken.set(null)
  assistantSessionToken.set(null)
}
