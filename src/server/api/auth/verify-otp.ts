import { Request, Response } from 'express'
import { createServerClient } from '@supabase/ssr'

/**
 * POST /api/auth/verify-otp
 * MIGRATION: Converted from Next.js API route to Express handler
 */
export async function verifyOtpHandler(req: Request, res: Response) {
  try {
    const { email, token, type } = req.body

    if (!email || !token) {
      return res.status(400).json({ error: 'Email and code are required' })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      return res.status(503).json({
        error: 'Supabase not configured',
        message: 'Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file'
      })
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

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: (type as any) || 'signup',
    })

    if (error) {
      return res.status(400).json({ error: error.message, code: error.status })
    }

    return res.json({ user: data.user, session: data.session })
  } catch (e: any) {
    return res.status(500).json({
      error: e?.message || 'Unexpected error during verification',
    })
  }
}

