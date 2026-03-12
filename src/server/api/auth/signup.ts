import { Request, Response } from 'express'
import { createServerClient } from '@supabase/ssr'

/**
 * POST /api/auth/signup
 * MIGRATION: Converted from Next.js API route to Express handler
 */
export async function signupHandler(req: Request, res: Response) {
  try {
    const { email, password, name, whatsapp } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    // Create Supabase client with Express cookie handling
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      return res.status(503).json({
        error: 'Supabase not configured',
        message: 'Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file'
      })
    }

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

    console.log('[api/auth/signup] Processing signup for:', email)

    // Sign up with Supabase
    // We removed the expensive listUsers() check to prevent 20s timeouts
    // Supabase will handle the duplicate check natively
    let data: any
    let error: any

    try {
      const result = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || process.env.VITE_SITE_URL || 'http://localhost:3000'}/auth/callback`,
          data: {
            name: name || email,
            whatsapp: whatsapp || '',
          },
        },
      })
      data = result.data
      error = result.error
    } catch (authError: any) {
      console.error('[api/auth/signup] Auth call exception:', authError)
      const errorMsg = authError?.message || String(authError)
      return res.status(500).json({
        error: 'Authentication service error',
        message: errorMsg.substring(0, 200)
      })
    }

    if (error) {
      console.warn('[api/auth/signup] Supabase Auth Error:', error.message)
      // Check if error is about duplicate account
      if (error.message?.includes('already registered') ||
        error.message?.includes('User already registered') ||
        error.message?.includes('email address is already registered') ||
        error.message?.includes('Email already registered')) {
        return res.status(400).json({
          error: 'Account already exists',
          message: 'An account with this email already exists. Please sign in instead.',
          code: 'ACCOUNT_EXISTS',
          hint: 'Use the sign in page to access your account'
        })
      }

      return res.status(400).json({
        error: error.message || 'Signup failed',
        code: error.status || error.code
      })
    }

    if (!data?.user) {
      return res.status(500).json({ error: 'Signup failed - No user data returned' })
    }

    console.log('[api/auth/signup] Supabase account created:', data.user.id)

    // Best-effort profile creation
    try {
      await supabase
        .from('profiles')
        .upsert(
          {
            id: data.user.id,
            email: data.user.email || email,
            name: name || data.user.email || email,
            whatsapp: whatsapp || '',
          },
          { onConflict: 'id' }
        )
    } catch (profileErr: any) {
        console.warn('[api/auth/signup] Profile upsert failed (non-critical):', profileErr.message)
    }

    // Send custom email verification OTP
    try {
      const { sendEmail } = await import('../utils/email')

      // Generate 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString()
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

      // Save OTP to database
      await supabase.from('email_verification_otps').insert({
        email: data.user.email!.toLowerCase().trim(),
        otp,
        user_id: data.user.id,
        expires_at: expiresAt.toISOString()
      })

      console.log('[api/auth/signup] Enqueueing professional verification email via Resend')

      // Send verification email asynchronously
      setImmediate(async () => {
        try {
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
                        <!-- Header with Gradient -->
                        <tr>
                          <td style="background: linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%); padding: 40px 30px; text-align: center;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px; text-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);">
                              IMOBILE
                            </h1>
                            <p style="margin: 8px 0 0 0; color: #e0f2fe; font-size: 14px; font-weight: 500;">
                              IMobile Service Center
                            </p>
                          </td>
                        </tr>
                        
                        <!-- Main Content -->
                        <tr>
                          <td style="padding: 50px 40px; background: #1e293b;">
                            <h2 style="margin: 0 0 20px 0; color: #f1f5f9; font-size: 24px; font-weight: 600; text-align: center;">
                              Confirm Your Signup
                            </h2>
                            
                            <p style="margin: 0 0 30px 0; color: #cbd5e1; font-size: 16px; line-height: 1.6; text-align: center;">
                              Welcome to IMobile Service Center! Please verify your email address by entering the verification code below.
                            </p>
                            
                            <!-- Token Display Box -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin: 40px 0;">
                              <tr>
                                <td align="center">
                                  <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border: 2px solid #3b82f6; border-radius: 12px; padding: 35px 20px; box-shadow: 0 8px 32px rgba(59, 130, 246, 0.3), inset 0 0 20px rgba(59, 130, 246, 0.1);">
                                    <p style="margin: 0 0 15px 0; color: #94a3b8; font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px; text-align: center;">
                                      Your Verification Code
                                    </p>
                                    <div style="background: #0f172a; border-radius: 8px; padding: 25px; margin: 15px 0; border: 1px solid #334155;">
                                      <p style="margin: 0; color: #3b82f6; font-size: 42px; font-weight: 700; letter-spacing: 12px; text-align: center; font-family: 'Courier New', monospace; text-shadow: 0 0 20px rgba(59, 130, 246, 0.5);">
                                        ${otp}
                                      </p>
                                    </div>
                                    <p style="margin: 15px 0 0 0; color: #64748b; font-size: 12px; text-align: center; line-height: 1.5;">
                                      Enter this code on the verification page to complete your registration
                                    </p>
                                  </div>
                                </td>
                              </tr>
                            </table>
                            
                            <!-- Instructions -->
                            <div style="background: #0f172a; border-radius: 8px; padding: 25px; margin: 30px 0; border: 1px solid #334155;">
                              <p style="margin: 0 0 15px 0; color: #94a3b8; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                                📧 Instructions
                              </p>
                              <ul style="margin: 0; padding-left: 20px; color: #cbd5e1; font-size: 14px; line-height: 1.8;">
                                <li style="margin-bottom: 8px;">Go to the verification page on our website</li>
                                <li style="margin-bottom: 8px;">Enter the 6-digit code shown above</li>
                                <li style="margin-bottom: 0;">This code will expire in 24 hours</li>
                              </ul>
                            </div>
                          </td>
                        </tr>
                        
                        <!-- Footer -->
                        <tr>
                          <td style="background: #0f172a; padding: 30px; text-align: center; border-top: 1px solid #334155;">
                            <p style="margin: 0 0 10px 0; color: #64748b; font-size: 12px; line-height: 1.6;">
                              If you didn't create an account with IMobile Service Center, please ignore this email.
                            </p>
                            <p style="margin: 0; color: #475569; font-size: 11px;">
                              © 2024 IMobile Service Center. All rights reserved.
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </body>
              </html>
            `,
            text: `Your IMobile verification code is: ${otp}\n\nThis code will expire in 24 hours.`
          });
          console.log('[api/auth/signup] ✅ Professional verification email sent successfully')
        } catch (emailErr: any) {
          console.error('[api/auth/signup] ⚠️ Verification email FAILED:', emailErr.message)
        }
      });
    } catch (err: any) {
      console.warn('[api/auth/signup] Failed to initialize email sending:', err.message)
    }

    return res.json({
      user: data.user,
      session: data.session,
      message: 'Account created successfully. Please check your email for verification code.'
    })
  } catch (e: any) {
    console.error('[api/auth/signup] Critical failure:', e)
    return res.status(500).json({
      error: 'Unexpected error during signup',
      message: e?.message || 'Unknown error'
    })
  }
}

