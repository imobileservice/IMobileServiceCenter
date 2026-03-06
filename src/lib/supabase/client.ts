import { createBrowserClient } from '@supabase/ssr'

/**
 * Creates a Supabase client for browser/client-side usage.
 * 
 * Uses process.env for environment variable access.
 * Vite automatically replaces process.env.VITE_* at build time.
 * Node.js uses process.env natively.
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

export function createClient() {
  // Helper to safely get env vars from either import.meta.env (Vite) or process.env (Node)
  const getEnv = (key: string) => {
    // Check Vite env first (with typeof guard to prevent Node errors)
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      const val = (import.meta as any).env[key]
      if (val !== undefined) return val
    }
    // Fallback to Node process.env (with typeof guard to prevent browser errors)
    if (typeof process !== 'undefined' && process.env) {
      return process.env[key]
    }
    return undefined
  }

  const supabaseUrl =
    getEnv('VITE_SUPABASE_URL') ||
    getEnv('NEXT_PUBLIC_SUPABASE_URL') ||
    getEnv('SUPABASE_URL')

  const supabaseAnonKey =
    getEnv('VITE_SUPABASE_ANON_KEY') ||
    getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') ||
    getEnv('SUPABASE_ANON_KEY')

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
      `- SUPABASE_ANON_KEY: ${supabaseAnonKey ? '✓ Set' : '✗ Missing'}\n\n`

    console.warn(errorMsg)

    // In development mode, return a placeholder client to prevent app crash
    const isDev = process.env.NODE_ENV === 'development'

    if (isDev) {
      console.warn('⚠️ Running in development mode without Supabase config. App will load but Supabase features will not work.')
      console.warn('💡 To fix: Create a .env file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')

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
        console.error('Failed to create placeholder client:', e)
        return {} as any
      }
    }

    // In production, throw error
    throw new Error('Supabase environment variables are not configured')
  }

  try {
    return createBrowserClient(supabaseUrl, supabaseAnonKey, {
      cookies: {},
      cookieOptions: {
        maxAge: 60 * 60 * 24 * 30,
      },
      db: { schema: 'public' },
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
