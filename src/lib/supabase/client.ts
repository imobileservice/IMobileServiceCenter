import { createBrowserClient } from '@supabase/ssr'

/**
 * Creates a Supabase client for browser/client-side usage.
 * 
 * MIGRATION: Updated for Vite compatibility while preserving environment variable names.
 * Reads from both VITE_* (Vite standard) and NEXT_PUBLIC_* (compatibility) prefixes.
 * 
 * For server-side usage, use lib/supabase/server.ts instead.
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
        // Only remove if it contains a known wrong/old project ID
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

export function createClient() {
  // MIGRATION: Support both Vite (VITE_*) and Next.js (NEXT_PUBLIC_*) env var names
  // This preserves existing .env files without requiring immediate changes
  const supabaseUrl =
    import.meta.env.VITE_SUPABASE_URL ??
    import.meta.env.NEXT_PUBLIC_SUPABASE_URL ??
    import.meta.env.SUPABASE_URL ??
    (typeof process !== 'undefined' && process.env ? process.env.NEXT_PUBLIC_SUPABASE_URL : undefined) ??
    (typeof process !== 'undefined' && process.env ? process.env.VITE_SUPABASE_URL : undefined)

  const supabaseAnonKey =
    import.meta.env.VITE_SUPABASE_ANON_KEY ??
    import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    import.meta.env.SUPABASE_ANON_KEY ??
    (typeof process !== 'undefined' && process.env ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY : undefined) ??
    (typeof process !== 'undefined' && process.env ? process.env.VITE_SUPABASE_ANON_KEY : undefined)

  // Validate environment variables
  if (!supabaseUrl || !supabaseAnonKey) {
    const errorMsg =
      'Supabase environment variables are not configured.\n\n' +
      'Please check your .env file and ensure:\n' +
      '1. VITE_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is set\n' +
      '2. VITE_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is set\n' +
      '3. You have restarted your dev server after adding/changing .env\n\n' +
      'Current status:\n' +
      `- SUPABASE_URL: ${supabaseUrl ? '✓ Set' : '✗ Missing'}\n` +
      `- SUPABASE_ANON_KEY: ${supabaseAnonKey ? '✓ Set' : '✗ Missing'}\n\n` +
      `Debug info:\n` +
      `- import.meta.env keys: ${Object.keys(import.meta.env).filter(k => k.includes('SUPABASE')).join(', ') || 'none'}\n` +
      `- VITE_SUPABASE_URL: ${import.meta.env.VITE_SUPABASE_URL ? 'found' : 'not found'}\n` +
      `- NEXT_PUBLIC_SUPABASE_URL: ${import.meta.env.NEXT_PUBLIC_SUPABASE_URL ? 'found' : 'not found'}`

    console.warn(errorMsg)

    // In development mode, return a placeholder client to prevent app crash
    // The app will still work for UI, but Supabase features won't function
    if (import.meta.env.DEV || import.meta.env.MODE === 'development') {
      console.warn('⚠️ Running in development mode without Supabase config. App will load but Supabase features will not work.')
      console.warn('💡 To fix: Create a .env file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')

      // Return a placeholder client that won't crash
      try {
        return createBrowserClient('https://placeholder.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTIwMDAsImV4cCI6MTk2MDc2ODAwMH0.placeholder', {
          cookies: {},
          cookieOptions: { maxAge: 60 * 60 * 24 * 30 },
          db: { schema: 'public' },
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        } as any)
      } catch (e) {
        // If even placeholder fails, return a minimal mock
        console.error('Failed to create placeholder client:', e)
        return {} as any
      }
    }

    // In production, throw error
    throw new Error('Supabase environment variables are not configured')
  }

  try {
    // createBrowserClient from @supabase/ssr works with Vite
    // It properly handles cookie-based authentication and session management
    return createBrowserClient(supabaseUrl, supabaseAnonKey, {
      // When passing custom options to createBrowserClient, @supabase/ssr expects
      // a cookies object to exist. Providing an empty object lets the library
      // fall back to document.cookie handling instead of throwing when it tries
      // to access cookies.get.
      cookies: {},
      // Extend auth cookie lifetime so users stay signed in for ~30 days
      cookieOptions: {
        // 30 days in seconds
        maxAge: 60 * 60 * 24 * 30,
      },
      db: { schema: 'public' },
      // Use the browser's native fetch; custom wrappers can break SDK internals that
      // expect standard Headers/Response behavior.
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    } as any)
  } catch (error: any) {
    console.error('Failed to create Supabase client:', error)
    throw new Error(`Failed to initialize Supabase client: ${error.message}`)
  }
}
