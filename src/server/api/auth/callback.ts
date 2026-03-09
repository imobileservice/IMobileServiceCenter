import { Request, Response } from 'express'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/auth/callback
 * MIGRATION: Converted from Next.js auth callback route to Express handler
 * Enhanced with duplicate account prevention and account linking
 */
export async function callbackHandler(req: Request, res: Response) {
  try {
    const { code } = req.query

    if (!code) {
      return res.redirect('/auth/error?error=missing_code&message=Authorization code is missing')
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VITE_SITE_URL || 'https://imobileservicecenter.lk'
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return res.redirect(`${siteUrl}/auth/error?error=supabase_not_configured&message=Supabase environment variables are not set`)
    }

    // Create Supabase client with Express cookie handling
    const supabase = createServerClient(
      supabaseUrl,
      supabaseKey,
      {
        cookies: {
          get(name: string) {
            return req.cookies?.[name]
          },
          set(name: string, value: string, options: any) {
            res.cookie(name, value, {
              ...options,
              httpOnly: options?.httpOnly ?? true,
              sameSite: options?.sameSite ?? (process.env.NODE_ENV === 'production' ? 'none' : 'lax'),
              secure: process.env.NODE_ENV === 'production',
              path: '/',
            })
          },
          remove(name: string, options: any) {
            res.clearCookie(name, options)
          },
        },
      }
    )

    // Check for existing account BEFORE exchanging code (if we can get email from code)
    // Note: We can't get email from code directly, so we'll check after exchange
    // But we'll handle duplicates more aggressively

    // Exchange code for session
    let data: any
    let error: any

    try {
      const result = await supabase.auth.exchangeCodeForSession(code as string)
      data = result.data
      error = result.error
    } catch (exchangeError: any) {
      console.error('[api/auth/callback] Exchange code exception:', exchangeError)

      // Check for network/DNS errors
      if (exchangeError.message?.includes('Failed to fetch') ||
        exchangeError.message?.includes('ERR_NAME_NOT_RESOLVED') ||
        exchangeError.message?.includes('ENOTFOUND')) {
        return res.redirect(`${siteUrl}/auth/error?error=supabase_connection&message=` +
          encodeURIComponent(
            'Cannot connect to Supabase. Please check:\n' +
            '1. Your Supabase project is active (not paused)\n' +
            '2. VITE_SUPABASE_URL is correct in your .env file\n' +
            '3. The URL matches your Supabase Dashboard'
          ))
      }

      return res.redirect(`${siteUrl}/auth/error?error=${encodeURIComponent(exchangeError?.message || 'Failed to exchange code for session')}`)
    }

    if (error) {
      console.error('[api/auth/callback] Exchange code error:', error)

      // Check if error is about user already exists or email conflict
      if (error.message?.includes('already registered') ||
        error.message?.includes('User already registered') ||
        error.message?.includes('email address is already registered') ||
        error.message?.includes('Email already registered')) {
        return res.redirect(`${siteUrl}/signin?error=account_exists&message=` +
          encodeURIComponent('An account with this email already exists. Please sign in with your password instead.'))
      }

      // Check for network errors
      if (error.message?.includes('Failed to fetch') ||
        error.message?.includes('ERR_NAME_NOT_RESOLVED')) {
        return res.redirect(`${siteUrl}/auth/error?error=supabase_connection&message=` +
          encodeURIComponent('Cannot connect to Supabase. Please check your Supabase URL configuration.'))
      }

      return res.redirect(`${siteUrl}/auth/error?error=${encodeURIComponent(error.message)}`)
    }

    if (!data?.user || !data?.session) {
      return res.redirect(`${siteUrl}/auth/error?error=no_session&message=Failed to create session`)
    }

    const oauthEmail = data.user.email
    const oauthUserId = data.user.id

    // CRITICAL: Check if an account with this email already exists (but different user ID)
    // This prevents duplicate accounts when user signs up with email/password first, then tries Google OAuth
    if (oauthEmail && supabaseServiceKey) {
      try {
        // Use service role key to check all users (admin access)
        const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
          auth: { persistSession: false, autoRefreshToken: false }
        })

        // List all users to find duplicates
        const { data: users, error: listError } = await adminClient.auth.admin.listUsers()

        if (!listError && users?.users) {
          // Find users with the same email but different ID
          const existingUsers = users.users.filter(
            (u: any) => u.email?.toLowerCase() === oauthEmail?.toLowerCase() && u.id !== oauthUserId
          )

          if (existingUsers.length > 0) {
            const existingUser = existingUsers[0]
            console.log('[api/auth/callback] ⚠️ DUPLICATE ACCOUNT DETECTED')
            console.log('[api/auth/callback] Existing user ID:', existingUser.id)
            console.log('[api/auth/callback] OAuth user ID:', oauthUserId)
            console.log('[api/auth/callback] Email:', oauthEmail)

            // Check if existing account is email/password or OAuth
            const hasEmailPassword = existingUser.identities?.some((id: any) => id.provider === 'email')
            const hasOAuth = existingUser.identities?.some((id: any) => id.provider !== 'email')

            // Sign out the current OAuth session
            await supabase.auth.signOut()

            // Delete the duplicate OAuth account
            try {
              await adminClient.auth.admin.deleteUser(oauthUserId)
              console.log('[api/auth/callback] ✅ Deleted duplicate OAuth account')
            } catch (deleteError: any) {
              console.error('[api/auth/callback] Error deleting duplicate account:', deleteError)
            }

            // Redirect with appropriate message
            if (hasEmailPassword && !hasOAuth) {
              // Existing account is email/password only
              return res.redirect(
                `${siteUrl}/signin?error=account_exists&message=` +
                encodeURIComponent(
                  'An account with this email already exists. Please sign in with your email and password instead of Google.'
                )
              )
            } else if (hasOAuth) {
              // Existing account already has OAuth
              return res.redirect(
                `${siteUrl}/signin?error=account_exists&message=` +
                encodeURIComponent(
                  'An account with this email already exists. Please use the correct sign-in method.'
                )
              )
            } else {
              // Generic message
              return res.redirect(
                `${siteUrl}/signin?error=account_exists&message=` +
                encodeURIComponent(
                  'An account with this email already exists. Please sign in instead.'
                )
              )
            }
          }
        }
      } catch (checkError: any) {
        console.error('[api/auth/callback] Error checking for existing account:', checkError)
        // If check fails, we'll continue but log the error
        // This prevents blocking legitimate OAuth sign-ins if admin API is unavailable
      }
    }

    // Ensure profile exists for the OAuth user
    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', oauthUserId)
        .maybeSingle()

      if (profileError && profileError.code !== 'PGRST116') {
        console.error('[api/auth/callback] Profile check error:', profileError)
      }

      if (!profile) {
        // Create profile if it doesn't exist
        const { error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: oauthUserId,
            email: oauthEmail || '',
            name: data.user.user_metadata?.name || data.user.user_metadata?.full_name || oauthEmail?.split('@')[0] || 'User',
            whatsapp: data.user.user_metadata?.whatsapp || '',
          })

        if (insertError) {
          console.error('[api/auth/callback] Profile creation error:', insertError)
        }
      }
    } catch (profileErr: any) {
      console.error('[api/auth/callback] Profile handling error:', profileErr)
    }

    // Store session in database for persistence
    if (data?.session && data?.user && supabaseServiceKey) {
      console.log('[api/auth/callback] Storing session in database...')
      try {
        const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
          auth: { persistSession: false, autoRefreshToken: false }
        })

        const expiresAt = data.session.expires_at
          ? new Date(data.session.expires_at * 1000).toISOString()
          : new Date(Date.now() + 3600000).toISOString()

        await adminClient.from('user_sessions').upsert({
          user_id: data.user.id,
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: expiresAt,
        }, { onConflict: 'user_id' })
        console.log('[api/auth/callback] ✅ Session stored in DB')
      } catch (err) {
        console.error('[api/auth/callback] Error storing session:', err)
      }
    }

    // If we have a session, the user is now authenticated
    if (data?.session) {
      return res.redirect(`${siteUrl}/?oauth=success`)
    }

    return res.redirect(`${siteUrl}/`)
  } catch (e: any) {
    console.error('[api/auth/callback] Unexpected error:', e)
    const fallbackSiteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VITE_SITE_URL || 'https://imobileservicecenter.lk'
    return res.redirect(`${fallbackSiteUrl}/auth/error?error=${encodeURIComponent(e?.message || 'Unexpected error')}`)
  }
}

