export function makeFetchWithTimeout(defaultTimeoutMs = 12000) {
  return async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), defaultTimeoutMs)
    try {
      const response = await fetch(input, {
        // Explicit network options to avoid browser defaults interfering
        mode: 'cors',
        credentials: 'omit',
        redirect: 'follow',
        cache: 'no-store',
        keepalive: false,
        // Preserve any caller-provided options
        ...init,
        // Ensure our AbortController is used (caller may provide one; prefer theirs)
        signal: init.signal ?? controller.signal,
      })
      return response
    } finally {
      clearTimeout(timeout)
    }
  }
}


