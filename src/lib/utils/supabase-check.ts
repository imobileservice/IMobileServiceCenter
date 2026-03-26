/**
 * Utility to check if Supabase is properly configured
 * This can be used for debugging authentication issues
 */

export function checkSupabaseConfig(): { 
  isConfigured: boolean
  errors: string[]
  url?: string
  hasKey: boolean
  details: {
    urlPresent: boolean
    keyPresent: boolean
    urlValid: boolean
    keyValid: boolean
  }
} {
  const errors: string[] = []
  // MIGRATION: Support both Vite (VITE_*) and Next.js (NEXT_PUBLIC_*) env var names
  const url = 
    import.meta.env.VITE_SUPABASE_URL ?? 
    import.meta.env.NEXT_PUBLIC_SUPABASE_URL ??
    import.meta.env.SUPABASE_URL
  const key = 
    import.meta.env.VITE_SUPABASE_ANON_KEY ?? 
    import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    import.meta.env.SUPABASE_ANON_KEY

  const details = {
    urlPresent: !!url,
    keyPresent: !!key,
    urlValid: false,
    keyValid: false,
  }

  if (!url) {
    errors.push('VITE_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is not set in environment variables')
  } else {
    details.urlValid = url.startsWith('http')
    if (!details.urlValid) {
      errors.push('Supabase URL appears to be invalid (should start with http/https)')
    } else if (!url.includes('supabase.co') && !url.includes('supabase')) {
      errors.push('Supabase URL does not appear to be a valid Supabase URL')
    }
  }

  if (!key) {
    errors.push('VITE_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set in environment variables')
  } else {
    details.keyValid = key.length > 100 && key.startsWith('eyJ')
    if (!details.keyValid) {
      errors.push('Supabase anon key appears to be invalid (should be a JWT token starting with eyJ)')
    }
  }

  return {
    isConfigured: errors.length === 0,
    errors,
    url: url || undefined,
    hasKey: !!key,
    details,
  }
}

