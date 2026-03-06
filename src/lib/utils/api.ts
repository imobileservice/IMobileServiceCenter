/**
 * Get the API base URL for making backend requests
 * 
 * In development: Returns empty string (uses Vite proxy)
 * In production: Returns VITE_API_URL if set, otherwise falls back to site URL
 */
export function getApiBaseUrl(): string {
  // In development, use relative URLs which will go through Vite proxy
  if (import.meta.env.DEV || import.meta.env.MODE === 'development') {
    // Use relative URLs - Vite proxy will handle routing to port 4000
    return ''
  }

  // In production, prioritize VITE_API_URL, but fallback to known hardcoded Railway backend URL
  const apiUrl = import.meta.env.VITE_API_URL || "imobileservicecenter-production.up.railway.app"
  if (apiUrl) {
    return apiUrl.startsWith("http") ? apiUrl : `https://${apiUrl}`
  }

  // Last fallback - use current origin (not ideal for production)
  if (typeof window !== 'undefined') {
    return window.location.origin
  }

  return ''
}

/**
 * Build a full API URL from an endpoint path
 * 
 * @param endpoint - API endpoint path (e.g., '/api/auth/signin')
 * @returns Full URL for the API endpoint
 */
export function getApiUrl(endpoint: string): string {
  // If endpoint is already a full URL, return it
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint
  }

  const apiBase = getApiBaseUrl()

  // Ensure endpoint starts with /
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`

  // If we have an API base URL, prepend it
  if (apiBase) {
    return `${apiBase}${normalizedEndpoint}`
  }

  // Otherwise return relative URL (for dev/Vite proxy)
  return normalizedEndpoint
}

