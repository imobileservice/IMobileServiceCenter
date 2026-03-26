import { createClient, clearSupabaseCache } from '../client'
import { getApiUrl } from '../../utils/api'
import { getAuthTokenFast } from '../utils/auth-helpers'

export const authService = {
  // Sign up
  async signUp(email: string, password: string, name?: string, whatsapp?: string, captchaToken?: string) {
    // Route through our server API to avoid client-side network issues
    const controller = new AbortController()
    const networkTimeout = setTimeout(() => controller.abort(), 25000) // 25s network timeout

    let res: Response
    try {
      res = await fetch(getApiUrl('/api/auth/signup'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
        body: JSON.stringify({ email, password, name, whatsapp }),
      })
    } catch (fetchErr: any) {
      clearTimeout(networkTimeout)
      if (fetchErr?.name === 'AbortError') {
        throw new Error('Signup network request timed out. Please check your connection and try again.')
      }
      throw new Error(`Network error during signup: ${fetchErr?.message || 'Unknown error'}`)
    } finally {
      clearTimeout(networkTimeout)
    }

    // Check content type before parsing JSON
    const contentType = res.headers.get('content-type')
    let apiData: any = {}

    if (contentType && contentType.includes('application/json')) {
      try {
        apiData = await res.json()
      } catch (jsonError) {
        // If JSON parsing fails, try to get text for debugging
        const text = await res.text().catch(() => 'Unknown error')
        console.error('Failed to parse JSON response:', text)
        throw new Error(`Server returned invalid JSON: ${text.substring(0, 100)}`)
      }
    } else {
      // Server returned non-JSON (probably HTML error page)
      const text = await res.text().catch(() => 'Unknown error')
      console.error('Server returned non-JSON response:', text.substring(0, 200))
      throw new Error(`Server error: Received ${contentType || 'unknown'} instead of JSON. This usually means the backend server crashed. Check server logs.`)
    }

    if (!res.ok) {
      // Preserve the original error message from the API
      console.error('[authService.signUp] API returned error status:', res.status)
      console.error('[authService.signUp] Error data:', apiData)
      const error = new Error(apiData?.error || 'Signup failed')
      if (apiData?.code) {
        (error as any).code = apiData.code
      }
      if (res.status) {
        (error as any).status = res.status
      }
      throw error
    }

    const data = apiData

    // If signup returned a session (email confirmations disabled), set client session
    // CRITICAL: We do NOT await this. Setting the session on the client is for persistence,
    // but it should not block the signup flow from resolving.
    if (data?.session?.access_token && data?.session?.refresh_token) {
      setTimeout(async () => {
        try {
          const supabase = createClient()
          await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          })
          console.log('[authService] ✅ Client session set in background')
        } catch (setErr) {
          console.warn('[authService] ⚠️ Background setSession failed:', setErr)
        }
      }, 0)
    }

    // Ensure profile is created immediately if user exists
    if (data.user) {
      try {
        console.log('Signup succeeded via server API')
      } catch (profileErr) {
        console.warn('Profile creation attempt failed (non-critical):', profileErr)
        // Don't throw - trigger should handle it
      }
    }

    // The profile is automatically created by the database trigger
    // If we have whatsapp or name, we'll update it after ensuring the profile exists
    // Run profile update ENTIRELY in background - do NOT block the return
    if (data.user && (whatsapp || name)) {
      setTimeout(async () => {
        const updates: { name?: string; whatsapp?: string } = {}
        if (name) updates.name = name
        if (whatsapp) updates.whatsapp = whatsapp

        for (let i = 0; i < 3; i++) {
          try {
            await new Promise(resolve => setTimeout(resolve, 1500 * (i + 1)))
            await this.updateProfile(data.user!.id, updates)
            console.log('[authService] Background profile update succeeded')
            return
          } catch (err: any) {
            console.warn(`[authService] Background profile update attempt ${i + 1}/3:`, err?.message)
          }
        }
      }, 0)
    }

    // Return data immediately - don't wait for profile update
    return data
  },

  // Sign in
  async signIn(email: string, password: string, captchaToken?: string, signal?: AbortSignal) {
    try {
      if (typeof window !== 'undefined') {
        let res: Response
        try {
          res = await fetch(getApiUrl('/api/auth/signin'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            cache: 'no-store',
            signal,
            body: JSON.stringify({ email, password }),
          })
        } catch (fetchError: any) {
          // Network error - API server might not be running
          if (fetchError?.name === 'AbortError') {
            // Check if it's the connection timeout or the user's timeout
            if (signal?.aborted) {
              throw fetchError // User's timeout
            }
            // Connection timeout - server not responding
            const networkError = new Error(
              'Unable to connect to the authentication server. The API server may not be running.\n\n' +
              'Please start the API server in a separate terminal:\n' +
              '  npm run dev:server\n\n' +
              'This will start the server on port 4000. Then try signing in again.'
            )
            networkError.name = 'NetworkError'
            throw networkError
          }
          const networkError = new Error(
            'Unable to connect to the server. Please ensure:\n' +
            '1. The API server is running (npm run dev:server)\n' +
            '2. The server is accessible at http://localhost:4000\n' +
            '3. Your network connection is working'
          )
          networkError.name = 'NetworkError'
          throw networkError
        }

        // Check content type to ensure we're getting JSON
        const contentType = res.headers.get('content-type')
        let apiData: any = {}

        if (contentType && contentType.includes('application/json')) {
          try {
            apiData = await res.json()
          } catch (jsonError) {
            // If JSON parsing fails, try to get text for debugging
            const text = await res.text().catch(() => 'Unknown error')
            console.error('Failed to parse JSON response:', text)
            throw new Error(`Server returned invalid JSON: ${text.substring(0, 100)}`)
          }
        } else {
          // Server returned non-JSON (probably HTML error page)
          const text = await res.text().catch(() => 'Unknown error')
          console.error('Server returned non-JSON response:', text.substring(0, 200))
          throw new Error(`Server error: Received ${contentType || 'unknown'} instead of JSON. This usually means the backend server crashed. Check server logs.`)
        }

        // Log the response for debugging
        console.log('[authService.signIn] API response status:', res.status)
        console.log('[authService.signIn] API response data:', {
          hasUser: !!apiData?.user,
          hasSession: !!apiData?.session,
          userId: apiData?.user?.id,
          userEmail: apiData?.user?.email,
          sessionHasAccessToken: !!apiData?.session?.access_token,
        })

        if (!res.ok) {
          // Preserve the original error message from the API
          console.error('[authService.signIn] API returned error status:', res.status)
          console.error('[authService.signIn] Error data:', apiData)
          const error = new Error(apiData?.error || 'Sign in failed')
          if (apiData?.code) {
            (error as any).code = apiData.code
          }
          if (res.status) {
            (error as any).status = res.status
          }
          throw error
        }

        // Validate response has required data
        if (!apiData?.user) {
          console.error('[authService.signIn] API returned success but no user data')
          console.error('[authService.signIn] Full response:', JSON.stringify(apiData, null, 2))
          throw new Error('Sign in succeeded but no user data returned from server')
        }

        // Set the session in the client for persistence
        // Try to set it, but don't block if it takes too long
        if (apiData?.session && apiData.session.access_token && apiData.session.refresh_token) {
          console.log('[authService.signIn] Setting client session...')
          const supabase = createClient()

            // Try to set session with reasonable timeout
            // If it fails, the backend has the session in cookies, and initialize() will recover it
            ; (async () => {
              try {
                const timeout = new Promise((_, reject) =>
                  setTimeout(() => reject(new Error('Timeout')), 3000)
                )

                const result = await Promise.race([
                  supabase.auth.setSession({
                    access_token: apiData.session.access_token,
                    refresh_token: apiData.session.refresh_token,
                  }),
                  timeout
                ]) as any

                if (result?.error) {
                  console.warn('[authService.signIn] ⚠️ setSession error:', result.error.message)
                } else {
                  console.log('[authService.signIn] ✅ Session set and persisted in client')
                }
              } catch (err: any) {
                // Non-fatal - session is in backend cookies, will be recovered on refresh
                if (err.message === 'Timeout') {
                  console.warn('[authService.signIn] ⚠️ setSession timed out - session will be recovered from backend on refresh')
                } else {
                  console.warn('[authService.signIn] ⚠️ setSession failed (non-fatal):', err.message)
                }
              }
            })()
        }

        // Store access_token in localStorage for database session lookup
        if (apiData?.session?.access_token) {
          try {
            localStorage.setItem('supabase_session_token', apiData.session.access_token)
            console.log('[authService.signIn] ✅ Session token stored in localStorage')
          } catch (storageError: any) {
            console.warn('[authService.signIn] ⚠️ Failed to store token in localStorage:', storageError.message)
          }
        }

        console.log('[authService.signIn] ✅ Returning apiData')
        return apiData
      }

      const supabase = createClient()
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      return data
    } catch (error: any) {
      console.error("Auth service sign in error:", error)
      console.error("Error type:", error?.constructor?.name)
      console.error("Error message:", error?.message)

      // Re-throw with more context if needed
      if (error?.message?.includes("Failed to fetch") || error?.message?.includes("NetworkError") || error?.code === "ECONNREFUSED") {
        const networkError = new Error("Network error: Unable to connect to Supabase. Please check:\n1. Your internet connection\n2. Your Supabase URL is correct in .env.local\n3. Your Supabase project is active (not paused)")
        networkError.name = "NetworkError"
        throw networkError
      }

      // If it's already a Supabase error, throw it as-is
      if (error?.status || error?.message) {
        throw error
      }

      // Otherwise, wrap it
      throw new Error(error?.message || "Unknown error during sign in")
    }
  },

  // Sign out
  async signOut() {
    // Clear localStorage first to prevent refresh token attempts
    try {
      if (typeof window !== 'undefined') {
        const storedToken = localStorage.getItem('supabase_session_token')
        localStorage.removeItem('supabase_session_token')

        // Clear all Supabase-related localStorage items
        const keysToRemove: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && (key.includes('supabase') || key.includes('sb-'))) {
            keysToRemove.push(key)
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key))

        // Also delete from database if we have a token
        if (storedToken) {
          // Call backend to delete session from database
          await fetch(getApiUrl('/api/auth/signout'), {
            method: 'POST',
            headers: { 'x-session-token': storedToken },
            credentials: 'include',
          }).catch(() => { }) // Ignore errors
        }
      }
    } catch (e) {
      // Ignore localStorage errors
      console.warn('Error clearing localStorage during signout:', e)
    }

    // Try to sign out from Supabase, but don't fail if it errors (e.g., network issues)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signOut()
      if (error && !error.message?.includes('Failed to fetch') && !error.message?.includes('ERR_NAME_NOT_RESOLVED')) {
        // Only throw if it's not a network error (network errors are expected if Supabase is down)
        throw error
      }
    } catch (e: any) {
      // If signout fails due to network issues, that's okay - we've already cleared localStorage
      if (!e?.message?.includes('Failed to fetch') && !e?.message?.includes('ERR_NAME_NOT_RESOLVED')) {
        throw e
      }
      console.warn('Supabase signout failed (likely network issue), but localStorage was cleared:', e?.message)
    }
  },

  // Get current user
  async getCurrentUser() {
    const supabase = createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) throw error
    return user
  },

  // Get user profile
  async getProfile(userId: string) {
    // Try backend API first
    if (typeof window !== 'undefined') {
      try {
        const { getApiUrl } = await import('../../utils/api')
        const storedToken = await getAuthTokenFast(true)
        const headers: HeadersInit = {}
        if (storedToken) headers['x-session-token'] = storedToken

        const response = await fetch(getApiUrl('/api/profile'), {
          headers,
          credentials: 'include',
          signal: AbortSignal.timeout(10000),
        })

        if (response.ok) {
          const payload = await response.json()
          return payload.data
        }
      } catch (e: any) {
        if (!e.message?.includes('timeout') && e.name !== 'AbortError') {
          console.warn('[authService] Profile API failed, using direct Supabase:', e.message)
        }
      }
    }
    const supabase = createClient()
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) throw error
    return data
  },

  // Update profile
  async updateProfile(userId: string, updates: {
    name?: string
    whatsapp?: string
    avatar_url?: string
    checkout_status?: 'success' | 'pending' | 'cancel'
  }) {
    const supabase = createClient()

    // First, try to get the current user to ensure we're authenticated
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user || user.id !== userId) {
      throw new Error('Unauthorized: Cannot update profile for this user')
    }

    // Try to update the profile
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single()

    if (error) {
      console.error('Profile update error:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        userId,
        updates,
      })

      // If profile doesn't exist, try to create it
      if (error.code === 'PGRST116' || error.message?.includes('No rows')) {
        console.log('Profile does not exist, creating new profile...')
        const { data: newProfile, error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: userId,
            email: user.email || '',
            ...updates,
          })
          .select()
          .single()

        if (insertError) {
          console.error('Failed to create profile:', insertError)
          throw new Error(`Failed to create profile: ${insertError.message}`)
        }

        return newProfile
      }

      throw error
    }

    return data
  },

  // Reset password
  async resetPassword(email: string, redirectUrl?: string) {
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl || (typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : ''),
    })
    if (error) throw error
  },

  // Resend email confirmation
  async resendEmailConfirmation(email: string, captchaToken?: string) {
    const supabase = createClient()
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email,
      options: {
        emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined,
        captchaToken: captchaToken || undefined,
      },
    })
    if (error) throw error
  },

  // Update password
  async updatePassword(newPassword: string) {
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    })
    if (error) throw error
  },

  // Sign in with Google OAuth
  async signInWithGoogle() {
    try {
      // First, validate Supabase configuration
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (!supabaseUrl || !supabaseKey) {
        throw new Error(
          'Supabase is not configured. Please check your .env file:\n\n' +
          'Required variables:\n' +
          '- VITE_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL\n' +
          '- VITE_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY\n\n' +
          'After adding them, restart your development server.'
        )
      }

      // Validate URL format
      if (!supabaseUrl.startsWith('https://') || !supabaseUrl.includes('.supabase.co')) {
        throw new Error(
          `Invalid Supabase URL format: ${supabaseUrl}\n\n` +
          'Expected format: https://xxxxx.supabase.co\n\n' +
          'Please check your .env file and ensure the URL is correct.\n' +
          'Get the correct URL from: Supabase Dashboard → Settings → API'
        )
      }

      // Clear any old/cached Supabase sessions that might have wrong URL
      console.log('🧹 Clearing old Supabase cache...')
      clearSupabaseCache()

      // Test if Supabase URL is reachable (quick check)
      try {
        const testUrl = `${supabaseUrl}/rest/v1/`
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 3000)

        await fetch(testUrl, {
          method: 'HEAD',
          signal: controller.signal,
          headers: {
            'apikey': supabaseKey,
          }
        }).catch(() => {
          // Ignore fetch errors - just checking if URL resolves
        })

        clearTimeout(timeoutId)
      } catch (testError: any) {
        if (testError.name === 'AbortError' || testError.message?.includes('Failed to fetch') || testError.message?.includes('ERR_NAME_NOT_RESOLVED')) {
          throw new Error(
            `Cannot connect to Supabase: ${supabaseUrl}\n\n` +
            'Possible causes:\n' +
            '1. ❌ Wrong Supabase URL in .env file\n' +
            '2. ❌ Supabase project is paused (free tier pauses after inactivity)\n' +
            '3. ❌ Supabase project was deleted\n' +
            '4. ❌ Network/DNS issue\n\n' +
            'How to fix:\n' +
            '1. Go to https://supabase.com/dashboard\n' +
            '2. Check if your project is active (not paused)\n' +
            '3. If paused, click "Restore project"\n' +
            '4. Copy the correct URL from Settings → API\n' +
            '5. Update your .env file\n' +
            '6. Restart your server'
          )
        }
      }

      const supabase = createClient()

      // Validate Supabase client was created successfully
      if (!supabase || !supabase.auth) {
        throw new Error(
          'Failed to create Supabase client. Please check your environment variables.'
        )
      }

      // Sign out used to hang silently under some cookie configurations, 
      // removed since it's not strictly necessary before a fresh OAuth redirect.

      const siteUrl = import.meta.env.VITE_SITE_URL || import.meta.env.NEXT_PUBLIC_SITE_URL || window.location.origin
      // CRITICAL: Ensure redirect URL is the APP URL, not Supabase URL
      const redirectTo = `${siteUrl}/auth/callback`

      // Validate redirect URL doesn't point to Supabase
      if (redirectTo.includes('.supabase.co')) {
        throw new Error(
          'Invalid redirect URL configuration. Redirect URL should point to your app, not Supabase.\n\n' +
          `Current redirect: ${redirectTo}\n` +
          `Site URL: ${siteUrl}\n\n` +
          'Please set VITE_SITE_URL in your .env file to your app URL (e.g., http://localhost:3000)'
        )
      }

      console.log('🔐 Initiating Google OAuth sign-in...')
      console.log('📍 Redirect URL:', redirectTo)
      console.log('🌐 Site URL:', siteUrl)
      console.log('🔗 Supabase URL:', supabaseUrl)
      console.log('✅ Supabase client created successfully')

      // CRITICAL: Use skipBrowserRedirect: false to ensure proper redirect handling
      // and explicitly set redirectTo to our app callback, not Supabase
      console.log('🚀 [auth.ts] calling supabase.auth.signInWithOAuth with Google! redirectTo=', redirectTo)
      const oauthResult = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectTo,
          skipBrowserRedirect: false,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      })
      
      console.log('📥 [auth.ts] signInWithOAuth returned:', JSON.stringify(oauthResult, null, 2))
      const { data, error } = oauthResult

      if (error) {
        console.error('❌ Google OAuth error:', error)
        console.error('Error details:', {
          message: error.message,
          status: error.status,
          name: error.name,
        })

        // Check for network/DNS errors
        if (error.message?.includes('Failed to fetch') ||
          error.message?.includes('ERR_NAME_NOT_RESOLVED') ||
          error.message?.includes('network') ||
          error.message?.includes('ENOTFOUND')) {
          throw new Error(
            'Cannot connect to Supabase for OAuth.\n\n' +
            'The Supabase URL appears to be incorrect or unreachable:\n' +
            `${supabaseUrl}\n\n` +
            'Please check:\n' +
            '1. ✅ Your Supabase project is active (not paused)\n' +
            '2. ✅ VITE_SUPABASE_URL is correct in your .env file\n' +
            '3. ✅ The URL matches your Supabase Dashboard\n' +
            '4. ✅ Your internet connection is working\n\n' +
            'Get the correct URL from: Supabase Dashboard → Settings → API'
          )
        }

        // Check for provider configuration errors
        if (error.message?.includes('provider is not enabled') ||
          error.message?.includes('Unsupported provider') ||
          error.message?.includes('not configured')) {
          throw new Error(
            'Google OAuth is not properly configured in Supabase.\n\n' +
            'Setup steps:\n' +
            '1. Go to Supabase Dashboard → Authentication → Providers\n' +
            '2. Find "Google" provider\n' +
            '3. Toggle it ON (enable it)\n' +
            '4. Enter your Google Client ID\n' +
            '5. Enter your Google Client Secret\n' +
            '6. Add redirect URL: ' + redirectTo + '\n' +
            '7. Click "Save"\n' +
            '8. Wait 10-30 seconds for changes to propagate\n' +
            '9. Try again\n\n' +
            'Get Google credentials from: Google Cloud Console → APIs & Services → Credentials'
          )
        }

        // Generic error
        throw new Error(
          `Google OAuth failed: ${error.message}\n\n` +
          'If this persists, check:\n' +
          '1. Google OAuth is enabled in Supabase\n' +
          '2. Redirect URL is configured correctly\n' +
          '3. Google Client ID and Secret are correct'
        )
      }

      if (!data?.url) {
        throw new Error(
          'Google OAuth initiation failed: No redirect URL returned.\n\n' +
          'This usually means:\n' +
          '1. Google OAuth is not enabled in Supabase\n' +
          '2. Google Client ID/Secret are missing or incorrect\n' +
          '3. Redirect URL is not configured in Supabase'
        )
      }

      console.log('✅ Google OAuth initiated successfully')
      console.log('🔗 Redirecting to:', data.url)
      return data
    } catch (err: any) {
      // Catch any errors during client creation or OAuth initiation
      console.error('❌ Google OAuth sign-in failed:', err)

      // Re-throw with better context if it's already a formatted error
      if (err.message && (err.message.includes('\n') || err.message.length > 50)) {
        throw err
      }

      // Format unknown errors
      throw new Error(
        `Google sign-in failed: ${err?.message || 'Unknown error'}\n\n` +
        'Please check:\n' +
        '1. Supabase configuration in .env file\n' +
        '2. Google OAuth is enabled in Supabase Dashboard\n' +
        '3. Redirect URL is configured correctly'
      )
    }
  },
}
