import { Request, Response } from 'express'
import { createServerClient } from '@supabase/ssr'

/**
 * GET /api/auth/session
 * Returns the current session if one exists (from cookies)
 */
export async function sessionHandler(req: Request, res: Response) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      return res.status(503).json({
        error: 'Supabase not configured',
        message: 'Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file'
      })
    }

    // Strategy: Check database first, then fallback to cookies
    console.log('[api/auth/session] Checking database for session...')
    
    // Try to get session from database using a token in request
    // First, check if we have a session token in headers or query
    const sessionToken = req.headers['x-session-token'] as string || req.query.token as string
    
    if (sessionToken) {
      try {
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
        if (serviceRoleKey) {
          const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
          const adminClient = createSupabaseClient(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false }
          })
          
          // Find session by access_token
          const { data: dbSession, error: dbError } = await adminClient
            .from('user_sessions')
            .select('*')
            .eq('access_token', sessionToken)
            .gt('expires_at', new Date().toISOString()) // Not expired
            .single()
          
          if (!dbError && dbSession) {
            console.log('[api/auth/session] ✅ Session found in database')
            
            // Get user info from Supabase auth
            const { createClient: createSupabaseClient2 } = await import('@supabase/supabase-js')
            const authClient = createSupabaseClient2(supabaseUrl, supabaseKey, {
              auth: { persistSession: false, autoRefreshToken: false }
            })
            
            // Verify token and get user
            const { data: { user }, error: userError } = await authClient.auth.getUser(dbSession.access_token)
            
            if (!userError && user) {
              return res.json({
                user: user,
                session: {
                  access_token: dbSession.access_token,
                  refresh_token: dbSession.refresh_token,
                  expires_at: Math.floor(new Date(dbSession.expires_at).getTime() / 1000),
                  expires_in: Math.floor((new Date(dbSession.expires_at).getTime() - Date.now()) / 1000),
                  token_type: 'bearer',
                }
              })
            }
          }
        }
      } catch (dbError: any) {
        console.warn('[api/auth/session] Database check failed:', dbError.message)
      }
    }
    
    // Fallback: Check cookies (original method)
    console.log('[api/auth/session] Checking cookies for session...')
    console.log('[api/auth/session] Cookie names:', req.cookies ? Object.keys(req.cookies) : 'no cookies')
    
    // Create Supabase client with Express cookie handling
    const supabase = createServerClient(
      supabaseUrl,
      supabaseKey,
      {
        cookies: {
          get(name: string) {
            const value = req.cookies?.[name] || null
            if (value) {
              console.log(`[api/auth/session] Found cookie: ${name.substring(0, 20)}...`)
            }
            return value
          },
          set(name: string, value: string, options: any) {
            if (!res.headersSent && name && value) {
              res.cookie(name, value, {
                ...options,
                httpOnly: options?.httpOnly ?? true,
                sameSite: options?.sameSite ?? (process.env.NODE_ENV === 'production' ? 'none' : 'lax'),
                secure: process.env.NODE_ENV === 'production',
                path: '/',
              })
            }
          },
          remove(name: string, options: any) {
            if (!res.headersSent && name) {
              res.clearCookie(name, {
                ...options,
                path: '/',
              })
            }
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    )

    // Get session from cookies
    const { data: { session }, error } = await supabase.auth.getSession()

    if (error) {
      console.error('[api/auth/session] Error getting session:', error)
      console.error('[api/auth/session] Error details:', JSON.stringify(error, null, 2))
      return res.status(500).json({
        error: 'Failed to get session',
        message: error.message
      })
    }

    console.log('[api/auth/session] Session check:', {
      hasSession: !!session,
      hasUser: !!session?.user,
      userId: session?.user?.id,
    })

    if (session?.user) {
      return res.json({
        user: session.user,
        session: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
          expires_in: session.expires_in,
          token_type: session.token_type,
        }
      })
    } else {
      return res.status(401).json({
        error: 'No active session',
        message: 'User is not authenticated'
      })
    }
  } catch (error: any) {
    console.error('[api/auth/session] Unexpected error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: error?.message || 'Unexpected error occurred'
    })
  }
}

