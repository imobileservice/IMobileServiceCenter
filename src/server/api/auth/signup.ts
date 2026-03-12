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
    // We perform the OTP insertion before responding so the verification page works.
    // We background the profile creation as it's less critical.
    
    // Background profile creation
    setImmediate(async () => {
      try {
        const db = adminClient || supabase
        await db.from('profiles').upsert({
          id: userId,
          email: data.user.email || email,
          name: name || data.user.email || email,
          whatsapp: whatsapp || '',
        }, { onConflict: 'id' })
        console.log('[api/auth/signup] Profile upserted in background')
      } catch (e: any) {
        console.warn('[api/auth/signup] Background profile upsert failed:', e.message)
      }
    })

    // Prepare OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

    try {
      const db = adminClient || supabase
      const { error: otpError } = await db.from('email_verification_otps').insert({
        email: data.user.email!.toLowerCase().trim(),
        otp,
        user_id: userId,
        expires_at: expiresAt.toISOString()
      })

      if (otpError) {
        console.error('[api/auth/signup] OTP Database Error:', otpError.message)
        // We continue, but the user might need to resend OTP
      } else {
        console.log(`[api/auth/signup] OTP record created in ${Date.now() - startTime}ms`)
      }
    } catch (otpExc: any) {
      console.error('[api/auth/signup] OTP insertion exception:', otpExc.message)
    }

    // 3. BACKGROUND EMAIL SENDING
    setImmediate(async () => {
      try {
        const { sendEmail } = await import('../utils/email')
        console.log(`[api/auth/signup] Sending verification email to: ${email}`)
        
        await sendEmail({
          to: data.user.email!,
          subject: 'Confirm Your Signup - IMobile Service Center',
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); min-height: 100vh;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 40px 20px;">
                <tr>
                  <td align="center">
                    <table width="600" cellpadding="0" cellspacing="0" style="background: #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); border: 1px solid #334155;">
                      <!-- Header -->
                      <tr>
                        <td style="background: linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%); padding: 40px 30px; text-align: center;">
                          <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px; text-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);">IMOBILE</h1>
                          <p style="margin: 8px 0 0 0; color: #e0f2fe; font-size: 14px; font-weight: 500;">IMobile Service Center</p>
                        </td>
                      </tr>
                      <!-- Content -->
                      <tr>
                        <td style="padding: 50px 40px; background: #1e293b;">
                          <h2 style="margin: 0 0 20px 0; color: #f1f5f9; font-size: 24px; font-weight: 600; text-align: center;">Confirm Your Signup</h2>
                          <p style="margin: 0 0 30px 0; color: #cbd5e1; font-size: 16px; line-height: 1.6; text-align: center;">Welcome! Use the verification code below to complete your registration.</p>
                          <table width="100%" cellpadding="0" cellspacing="0" style="margin: 40px 0;">
                            <tr>
                              <td align="center">
                                <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border: 2px solid #3b82f6; border-radius: 12px; padding: 35px 20px;">
                                  <p style="margin: 0 0 15px 0; color: #94a3b8; font-size: 13px; font-weight: 500; text-transform: uppercase;">Verification Code</p>
                                  <div style="background: #0f172a; border-radius: 8px; padding: 25px; border: 1px solid #334155;">
                                    <p style="margin: 0; color: #3b82f6; font-size: 42px; font-weight: 700; letter-spacing: 12px; font-family: 'Courier New', monospace;">${otp}</p>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <!-- Footer -->
                      <tr>
                        <td style="background: #0f172a; padding: 30px; text-align: center; border-top: 1px solid #334155;">
                          <p style="margin: 0; color: #475569; font-size: 11px;">© 2024 IMobile Service Center.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body>
            </html>
          `,
          text: `Your IMobile verification code is: ${otp}`
        })
        console.log('[api/auth/signup] ✅ Verification email sent')
      } catch (mailErr: any) {
        console.error('[api/auth/signup] ⚠️ Verification email FAILED:', mailErr.message)
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

