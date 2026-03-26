/**
 * Get the API base URL for making backend requests
 * 
 * In development: Returns empty string (uses Vite proxy)
 * In production: Returns VITE_API_URL if set, otherwise falls back to site URL
 */
export function getApiBaseUrl(): string {
  // 1. If we're on localhost, use relative URLs (Vite proxy)
  if (typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return ''
  }

  // 2. In production/deployed environments, prioritize VITE_API_URL
  const envApiUrl = import.meta.env.VITE_API_URL
  if (envApiUrl) {
    return envApiUrl.startsWith("http") ? envApiUrl : `https://${envApiUrl}`
  }

  // 3. Absolute Fallback for production: Your known Railway backend URL
  // This is the most reliable way to prevent hitting the frontend domain
  return "https://imobileservicecenter-production.up.railway.app"
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

