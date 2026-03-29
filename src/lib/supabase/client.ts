import { createBrowserClient } from '@supabase/ssr'

/**
 * Creates a Supabase client for browser/client-side usage.
 * 
 * Uses import.meta.env for environment variable access (Vite handles this natively).
 */

/**
 * Clear all Supabase-related cache that might contain old/wrong URLs
 */
export function clearSupabaseCache() {
  if (typeof window === 'undefined') return

  try {
    const wrongUrls = ['pjflufiupampcwohoyqj', 'pjflufiupampcwohoygj']

    // Clear localStorage - only remove items that contain OLD/wrong project IDs
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (key.includes('supabase') || key.includes('sb-') || key.startsWith('sb-'))) {
        const value = localStorage.getItem(key) || ''
        if (wrongUrls.some(wrong => value.includes(wrong) || key.includes(wrong))) {
          keysToRemove.push(key)
        }
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key))

    // Clear sessionStorage
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key && (key.includes('supabase') || key.includes('sb-'))) {
        sessionStorage.removeItem(key)
      }
    }

    // Clear cookies
    document.cookie.split(";").forEach(cookie => {
      const eqPos = cookie.indexOf("=")
      const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim()
      if (name.includes('supabase') || name.includes('sb-')) {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`
      }
    })
  } catch (error) {
    console.warn('Failed to clear Supabase cache:', error)
  }
}

// Module-level singleton to prevent "Multiple GoTrueClient instances" warnings and deadlocks
let supabaseInstance: any = null;

export function createClient() {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  // Use import.meta.env — Vite statically replaces these at build time
  const supabaseUrl =
    import.meta.env.VITE_SUPABASE_URL ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_URL

  const supabaseAnonKey =
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Validate environment variables
  if (!supabaseUrl || !supabaseAnonKey) {
    const errorMsg =
      'Supabase environment variables are not configured.\n\n' +
      'Please check your .env file and ensure:\n' +
      '1. VITE_SUPABASE_URL is set\n' +
      '2. VITE_SUPABASE_ANON_KEY is set\n' +
      '3. You have restarted your dev server after adding/changing .env\n\n' +
      'Current status:\n' +
      `- SUPABASE_URL: ${supabaseUrl ? '✓ Set' : '✗ Missing'}\n` +
      `- SUPABASE_ANON_KEY: ${supabaseAnonKey ? '✓ Set' : '✗ Missing'}\n\n`

    console.warn(errorMsg)

    // In development mode, return a placeholder client to prevent app crash
    const isDev = import.meta.env.DEV

    if (isDev) {
      console.warn('⚠️ Running in development mode without Supabase config. App will load but Supabase features will not work.')
      console.warn('💡 To fix: Create a .env file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')

      try {
        return createBrowserClient('https://placeholder.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTIwMDAsImV4cCI6MTk2MDc2ODAwMH0.placeholder', {
          cookieOptions: { maxAge: 60 * 60 * 24 * 30 },
          db: { schema: 'public' },
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        } as any)
      } catch (e) {
        console.error('Failed to create placeholder client:', e)
        return {} as any
      }
    }

    // In production, throw error
    throw new Error('Supabase environment variables are not configured')
  }

  try {
    supabaseInstance = createBrowserClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          if (typeof document === 'undefined') return ''
          const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
          if (match) return decodeURIComponent(match[2])

          // CRITICAL FIX: Fallback to localStorage for PKCE verifier and auth state
          // The cookie can get lost during the Google OAuth redirect chain
          // (browser cookie policies, SameSite restrictions, cross-origin issues)
          // Without this fallback, exchangeCodeForSession() hangs forever
          if (name.includes('code-verifier') || name.includes('auth-token')) {
            const stored = localStorage.getItem(name)
            if (stored) {
              console.log(`[Supabase] ⚠️ Cookie '${name}' not in document.cookie, recovered from localStorage`)
              return stored
            }
          }
          return ''
        },
        set(name: string, value: string, options: any) {
          if (typeof document === 'undefined') return

          const cookieOptions = {
            path: options?.path || '/',
            maxAge: options?.maxAge || 60 * 60 * 24 * 30, // Default 30 days
            sameSite: options?.sameSite || (import.meta.env.PROD ? 'lax' : 'lax'),
            secure: options?.secure !== undefined ? options.secure : import.meta.env.PROD,
            domain: options?.domain
          }

          let cookieStr = `${name}=${encodeURIComponent(value)}`
          cookieStr += `; Path=${cookieOptions.path}`
          cookieStr += `; Max-Age=${cookieOptions.maxAge}`
          cookieStr += `; SameSite=${cookieOptions.sameSite}`
          if (cookieOptions.secure) cookieStr += `; Secure`
          if (cookieOptions.domain) cookieStr += `; Domain=${cookieOptions.domain}`

          document.cookie = cookieStr

          // CRITICAL: Backup ALL auth-related cookies in localStorage
          // This is essential for PKCE flow recovery when cookies get lost during OAuth redirect
          if (name.includes('code-verifier') || name.includes('auth-token') || name.includes('state')) {
            try { localStorage.setItem(name, value) } catch { /* quota */ }
          }
        },
        remove(name: string, options: any) {
          if (typeof document === 'undefined') return
          const path = options?.path || '/'
          const domain = options?.domain ? `; Domain=${options.domain}` : ''
          document.cookie = `${name}=; Path=${path}; Max-Age=0${domain}`

          if (name.includes('code-verifier') || name.includes('auth-token') || name.includes('state')) {
            try { localStorage.removeItem(name) } catch { /* ok */ }
          }
        }
      },
      cookieOptions: {
        path: '/',
        secure: import.meta.env.PROD,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
      },
      db: { schema: 'public' },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false, // We handle this manually in AuthCallback
      },
    } as any)
    
    return supabaseInstance;
  } catch (error: any) {
    console.error('Failed to create Supabase client:', error)
    throw new Error(`Failed to initialize Supabase client: ${error.message}`)
  }
}
