import { Request, Response } from 'express'
import { createServerClient } from '@supabase/ssr'

/**
 * POST /api/auth/signin
 * MIGRATION: Converted from Next.js API route to Express handler
 */
export async function signinHandler(req: Request, res: Response, next?: any) {
  // Set Content-Type header immediately to ensure JSON
  if (!res.headersSent) {
    res.setHeader('Content-Type', 'application/json')
  }

  // Ensure we always return JSON
  const sendError = (status: number, error: string, details?: any) => {
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json')
      return res.status(status).json({
        error,
        ...details
      })
    } else {
      console.error('[api/auth/signin] Cannot send error - headers already sent')
    }
  }

  try {
    const { email, password } = req.body

    if (!email || !password) {
      return sendError(400, 'Email and password are required')
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      return sendError(503, 'Supabase not configured', {
        message: 'Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file'
      })
    }

    // Validate Supabase URL format
    if (!supabaseUrl.startsWith('http://') && !supabaseUrl.startsWith('https://')) {
      console.error('[api/auth/signin] Invalid URL format:', supabaseUrl.substring(0, 50))
      return sendError(500, 'Invalid Supabase URL format', {
        message: 'Supabase URL must start with http:// or https://',
        received: supabaseUrl.substring(0, 50) + '...'
      })
    }

    // Validate Supabase URL contains supabase.co
    if (!supabaseUrl.includes('.supabase.co') && !supabaseUrl.includes('supabase')) {
      console.error('[api/auth/signin] URL does not appear to be a Supabase URL:', supabaseUrl.substring(0, 50))
      return sendError(500, 'Invalid Supabase URL', {
        message: 'Supabase URL should contain ".supabase.co"',
        received: supabaseUrl.substring(0, 50) + '...'
      })
    }

    // Validate Supabase key format (should be a JWT)
    if (!supabaseKey.startsWith('eyJ')) {
      console.error('[api/auth/signin] Invalid key format - does not start with eyJ')
      return sendError(500, 'Invalid Supabase key format', {
        message: 'Supabase anon key should be a JWT token starting with eyJ',
        keyPreview: supabaseKey.substring(0, 20) + '...'
      })
    }

    // Create Supabase client with Express cookie handling
    let supabase
    try {
      // Use a simpler cookie handler to avoid issues
      const cookieStore = {
        get(name: string) {
          try {
            return req.cookies?.[name] || null
          } catch (e) {
            return null
          }
        },
        set(name: string, value: string, options: any) {
          try {
            if (!res.headersSent && name && value) {
              res.cookie(name, value, {
                ...options,
                httpOnly: options?.httpOnly ?? true,
                sameSite: options?.sameSite ?? (process.env.NODE_ENV === 'production' ? 'none' : 'lax'),
                secure: process.env.NODE_ENV === 'production',
                path: '/',
              })
            }
          } catch (e) {
            console.warn('[api/auth/signin] Failed to set cookie:', e)
          }
        },
        remove(name: string, options: any) {
          try {
            if (!res.headersSent && name) {
              res.clearCookie(name, {
                ...options,
                path: '/',
              })
            }
          } catch (e) {
            console.warn('[api/auth/signin] Failed to remove cookie:', e)
          }
        },
      }

      supabase = createServerClient(
        supabaseUrl,
        supabaseKey,
        {
          cookies: cookieStore,
          // Add explicit options to prevent issues
          auth: {
            persistSession: false, // We handle sessions via cookies
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        }
      )
    } catch (clientError: any) {
      console.error('[api/auth/signin] Failed to create Supabase client:', clientError)
      console.error('[api/auth/signin] Client error stack:', clientError?.stack)
      return sendError(500, 'Failed to initialize authentication service', {
        details: clientError?.message
      })
    }

      const start = Date.now()
      let data, error
      try {
        console.log('[api/auth/signin] Attempting sign-in with email:', email.substring(0, 10) + '...')
        console.log('[api/auth/signin] Cookies before sign-in:', Object.keys(req.cookies || {}))
        const result = await supabase.auth.signInWithPassword({ email, password })
        data = result.data
        error = result.error
        console.log('[api/auth/signin] Cookies after sign-in:', Object.keys(req.cookies || {}))
        console.log('[api/auth/signin] Response headers being sent:', !res.headersSent)
      
      // Log the raw error for debugging
      if (error) {
        console.error('[api/auth/signin] Supabase auth error:', {
          message: error.message?.substring(0, 100),
          status: error.status,
          name: error.name
        })
      }
      
      // Check if error message contains JSON parsing errors (means Supabase got HTML response)
      if (error && error.message && (
        error.message.includes('Unexpected token') || 
        error.message.includes('is not valid JSON') || 
        error.message.includes('Internal Server Error') ||
        error.message.includes('Internal s')
      )) {
        console.error('[api/auth/signin] Supabase configuration error detected:', error.message.substring(0, 100))
        console.error('[api/auth/signin] This usually means Supabase project is paused or credentials are wrong')
        return sendError(500, 'Supabase configuration error. Please verify your Supabase URL and API key in .env file.', {
          hint: 'supabase_config_error',
          details: 'The Supabase service returned an invalid response. Check that your project is active (not paused) in the Supabase dashboard.'
        })
      }
    } catch (authError: any) {
      console.error('[api/auth/signin] Auth call exception:', authError)
      console.error('[api/auth/signin] Auth error type:', typeof authError)
      console.error('[api/auth/signin] Auth error message:', authError?.message?.substring(0, 200))
      console.error('[api/auth/signin] Auth error stack:', authError?.stack?.substring(0, 300))
      
      // Check if the error is HTML or JSON parsing error
      const errorMsg = authError?.message || String(authError)
      if (errorMsg.includes('Unexpected token') || errorMsg.includes('is not valid JSON') || 
          errorMsg.includes('Internal Server Error') || errorMsg.includes('Internal s') ||
          errorMsg.startsWith('<') || errorMsg.includes('<!DOCTYPE')) {
        return sendError(500, 'Supabase configuration error. Please verify your Supabase URL and API key in .env file.', {
          hint: 'supabase_config_error',
          details: 'The Supabase service returned an invalid response. This usually means the project is paused or credentials are incorrect.'
        })
      }
      
      return sendError(500, 'Authentication service error', {
        details: errorMsg.substring(0, 200) // Limit error message length
      })
    }
    
    console.log('[api/auth/signin] duration(ms)=', Date.now() - start)
    console.log('[api/auth/signin] error=', error ? error.message?.substring(0, 50) : 'none', 'code=', error?.status)
    console.log('[api/auth/signin] hasData=', !!data, 'hasUser=', !!data?.user, 'hasSession=', !!data?.session)

    if (error) {
      // Check if error message contains JSON parsing errors (means Supabase got HTML response)
      if (error.message?.includes('Unexpected token') || error.message?.includes('is not valid JSON') || error.message?.includes('Internal Server Error')) {
        console.error('[api/auth/signin] Supabase configuration error detected:', error.message)
        return sendError(500, 'Supabase configuration error. Please verify your Supabase URL and API key in .env file.', {
          hint: 'supabase_config_error',
          details: 'The Supabase service returned an invalid response. Check that your project URL and anon key are correct.'
        })
      }
      
      // Supabase returns "Invalid login credentials" for both wrong password AND unverified email
      // We can't distinguish between them for security reasons, but we can provide helpful guidance
      if (error.message === 'Invalid login credentials' || error.message === 'invalid_credentials') {
        return sendError(401, 'Invalid login credentials. If you just created an account, please verify your email first.', {
          code: error.status,
          hint: 'check_email_verification'
        })
      }
      // Check for explicit email not confirmed error
      if (error.message?.includes('email_not_confirmed') || error.message?.includes('Email not confirmed')) {
        return sendError(401, 'Email not confirmed. Please verify your email address before signing in.', {
          code: error.status,
          hint: 'email_verification_required'
        })
      }
      return sendError(401, error.message || 'Authentication failed', {
        code: error.status
      })
    }

    if (!data || !data.user) {
      console.error('[api/auth/signin] No user data returned from Supabase')
      console.error('[api/auth/signin] Data:', JSON.stringify(data, null, 2))
      return sendError(500, 'Sign in succeeded but no user data returned', {
        details: 'Supabase returned success but no user object'
      })
    }

    // Log what we're about to return
    console.log('[api/auth/signin] Returning success response')
    console.log('[api/auth/signin] User ID:', data.user.id)
    console.log('[api/auth/signin] User email:', data.user.email)
    console.log('[api/auth/signin] Has session:', !!data.session)
    if (data.session) {
      console.log('[api/auth/signin] Session has access_token:', !!data.session.access_token)
      console.log('[api/auth/signin] Session has refresh_token:', !!data.session.refresh_token)
    }

    // Store session in database for persistence
    if (data.session && data.user && !res.headersSent) {
      try {
        console.log('[api/auth/signin] Storing session in database...')
        
        // Create a service role client to bypass RLS for session storage
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
        if (serviceRoleKey) {
          const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
          const adminClient = createSupabaseClient(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false }
          })
          
          // Calculate expiration time (default 1 hour if not provided)
          const expiresAt = data.session.expires_at 
            ? new Date(data.session.expires_at * 1000).toISOString()
            : new Date(Date.now() + 3600000).toISOString() // 1 hour from now
          
          // Upsert session in database (replace existing session for this user)
          const { error: dbError } = await adminClient
            .from('user_sessions')
            .upsert({
              user_id: data.user.id,
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
              expires_at: expiresAt,
            }, {
              onConflict: 'user_id'
            })
          
          if (dbError) {
            console.error('[api/auth/signin] ❌ Failed to store session in database:', dbError.message)
          } else {
            console.log('[api/auth/signin] ✅ Session stored in database successfully')
          }
        } else {
          console.warn('[api/auth/signin] ⚠️ Service role key not found - session not stored in database')
          console.warn('[api/auth/signin] Add SUPABASE_SERVICE_ROLE_KEY to .env for database session storage')
        }
      } catch (dbError: any) {
        console.error('[api/auth/signin] ❌ Error storing session in database:', dbError.message)
        // Don't fail sign-in if database storage fails
      }
    }

    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json')
      const response = { 
        user: data.user, 
        session: data.session 
      }
      console.log('[api/auth/signin] Sending response with user and session')
      return res.json(response)
    } else {
      console.error('[api/auth/signin] Cannot send success response - headers already sent')
      return
    }
  } catch (e: any) {
    console.error('[api/auth/signin] Unexpected failure:', e)
    console.error('[api/auth/signin] Stack:', e?.stack)
    return sendError(500, e?.message || 'Unexpected error during sign in', {
      ...(process.env.NODE_ENV === 'development' && { stack: e?.stack })
    })
  }
}

