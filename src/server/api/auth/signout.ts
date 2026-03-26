import { Request, Response } from 'express'

/**
 * POST /api/auth/signout
 * Deletes the session from the database
 */
export async function signoutHandler(req: Request, res: Response) {
  try {
    const sessionToken = req.headers['x-session-token'] as string || req.body?.token
    
    if (!sessionToken) {
      return res.status(400).json({
        error: 'Session token required'
      })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(503).json({
        error: 'Supabase not configured'
      })
    }

    // Delete session from database
    const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
    const adminClient = createSupabaseClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })

    const { error: deleteError } = await adminClient
      .from('user_sessions')
      .delete()
      .eq('access_token', sessionToken)

    if (deleteError) {
      console.error('[api/auth/signout] Error deleting session:', deleteError)
      return res.status(500).json({
        error: 'Failed to delete session',
        message: deleteError.message
      })
    }

    return res.json({
      success: true,
      message: 'Session deleted'
    })
  } catch (error: any) {
    console.error('[api/auth/signout] Unexpected error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: error?.message || 'Unexpected error occurred'
    })
  }
}

