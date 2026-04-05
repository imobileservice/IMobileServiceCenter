import { Request, Response } from 'express'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/auth/signup
 * MIGRATION: Converted from Next.js API route to Express handler
 */
export async function signupHandler(req: Request, res: Response) {
  const startTime = Date.now()
  try {
    const { email, password, name, whatsapp } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    // Load environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return res.status(503).json({
        error: 'Supabase not configured',
        message: 'Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file'
      })
    }

    // Auth client (for signing up the user)
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

    // Admin/Service client (for fast DB operations bypassing RLS)
    const adminClient = supabaseServiceKey 
      ? createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false } })
      : null

    console.log(`[api/auth/signup] Starting signup for: ${email}`)

    // 1. SIGN UP THE USER
    // We add a 15s server-side timeout to avoid blocking the whole process if Auth is slow
    let data: any
    let error: any

    try {
      const authTimeout = 15000
      const signUpPromise = supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || process.env.VITE_SITE_URL || 'http://localhost:3000'}/auth/callback`,
          data: { name: name || email, whatsapp: whatsapp || '' },
        },
      })

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Supabase Auth timed out (15s)')), authTimeout)
      })

      const result = await Promise.race([signUpPromise, timeoutPromise]) as any
      data = result.data
      error = result.error
    } catch (authException: any) {
      console.error('[api/auth/signup] Auth failure:', authException.message)
      return res.status(504).json({
        error: 'Authentication timeout',
        message: 'The authentication service is taking too long. Please try again in a moment.'
      })
    }

    if (error) {
      console.warn('[api/auth/signup] Supabase Auth Error:', error.message)
      if (error.message?.includes('already registered')) {
        return res.status(400).json({
          error: 'Account already exists',
          message: 'An account with this email already exists. Please sign in instead.'
        })
      }
      return res.status(400).json({ error: error.message || 'Signup failed' })
    }

    if (!data?.user) {
      return res.status(500).json({ error: 'Signup failed - No user data' })
    }

    const userId = data.user.id
    console.log(`[api/auth/signup] User created: ${userId} in ${Date.now() - startTime}ms`)

    // 2. DATABASE OPERATIONS (FAST - Using Admin Client)
    // We background EVERYTHING except the initial auth.signUp to ensure a fast response.
    // The user will be redirected to the verify-otp page.
    
    // Background task for Profile, OTP, and Email
    setImmediate(async () => {
      console.log(`[api/auth/signup] Starting background tasks for: ${userId}`)
      const db = adminClient || supabase
      
      // A. Profile Creation
      try {
        await db.from('profiles').upsert({
          id: userId,
          email: data.user.email || email,
          name: name || data.user.email || email,
          whatsapp: whatsapp || '',
        }, { onConflict: 'id' })
        console.log(`[api/auth/signup] [BKG] Profile upserted for ${userId}`)
      } catch (e: any) {
        console.error(`[api/auth/signup] [BKG] Profile upsert failed:`, e.message)
      }

      // B. OTP Generation & Insertion
      const otp = Math.floor(100000 + Math.random() * 900000).toString()
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      
      try {
        const { error: otpError } = await db.from('email_verification_otps').insert({
          email: data.user.email!.toLowerCase().trim(),
          otp,
          user_id: userId,
          expires_at: expiresAt.toISOString()
        })

        if (otpError) {
          console.error(`[api/auth/signup] [BKG] OTP Database Error:`, otpError.message)
        } else {
          console.log(`[api/auth/signup] [BKG] OTP record created for ${userId}`)
          
          // C. Send Verification Email (only if OTP was saved)
          try {
            const { sendEmail } = await import('../utils/email')
            console.log(`[api/auth/signup] [BKG] Sending email to: ${email}`)
            
            await sendEmail({
              to: data.user.email!,
              subject: 'Confirm Your Signup - IMobile Service Center',
              templateId: 'verification-code',
              templateVariables: {
                token: otp
              }
            })
            console.log(`[api/auth/signup] [BKG] ✅ Email sent for ${userId}`)
          } catch (mailErr: any) {
            console.error(`[api/auth/signup] [BKG] ⚠️ Email FAILED for ${userId}:`, mailErr.message)
          }
        }
      } catch (otpExc: any) {
        console.error(`[api/auth/signup] [BKG] OTP Exception for ${userId}:`, otpExc.message)
      }
    })

    // 4. RESPOND IMMEDIATELY
    console.log(`[api/auth/signup] ✅ Signup complete in ${Date.now() - startTime}ms. Responding to client.`)
    return res.json({
      user: data.user,
      session: data.session,
      message: 'Account created successfully. Please check your email.'
    })

  } catch (e: any) {
    console.error('[api/auth/signup] Critical crash:', e.message)
    return res.status(500).json({ error: 'Unexpected signup error' })
  }
}

