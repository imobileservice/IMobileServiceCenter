import { Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '../utils/email'

/**
 * POST /api/auth/verify-email
 * Verify email with OTP code
 */
export async function verifyEmailHandler(req: Request, res: Response) {
    try {
        const { email, otp } = req.body

        if (!email || !otp) {
            return res.status(400).json({ error: 'Email and OTP are required' })
        }

        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

        if (!supabaseUrl || !supabaseServiceKey) {
            return res.status(503).json({ error: 'Supabase not configured' })
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
            auth: { persistSession: false, autoRefreshToken: false }
        })

        // Normalize email
        const emailLower = email.toLowerCase().trim()

        // Find valid OTP
        const { data: otpRecord, error: otpError } = await supabase
            .from('email_verification_otps')
            .select('*')
            .eq('email', emailLower)
            .eq('otp', otp)
            .eq('verified', false)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(1)
            .single()

        if (otpError || !otpRecord) {
            return res.status(400).json({
                error: 'Invalid or expired OTP',
                message: 'Please check your OTP code or request a new one'
            })
        }

        // Mark OTP as verified
        await supabase
            .from('email_verification_otps')
            .update({ verified: true, updated_at: new Date().toISOString() })
            .eq('id', otpRecord.id)

        // If user_id exists, update user's email_confirmed_at
        if (otpRecord.user_id) {
            const { error: updateError } = await supabase.auth.admin.updateUserById(
                otpRecord.user_id,
                { email_confirm: true }
            )

            if (updateError) {
                console.error('[verify-email] Error confirming user email:', updateError)
            }
        }

        return res.json({
            success: true,
            message: 'Email verified successfully',
            user_id: otpRecord.user_id
        })
    } catch (e: any) {
        console.error('[verify-email] Error:', e)
        return res.status(500).json({
            error: e?.message || 'Unexpected error during email verification'
        })
    }
}

/**
 * POST /api/auth/resend-verification
 * Resend verification email
 */
export async function resendVerificationHandler(req: Request, res: Response) {
    try {
        const { email } = req.body

        if (!email) {
            return res.status(400).json({ error: 'Email is required' })
        }

        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

        if (!supabaseUrl || !supabaseServiceKey) {
            return res.status(503).json({ error: 'Supabase not configured' })
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
            auth: { persistSession: false, autoRefreshToken: false }
        })

        const emailLower = email.toLowerCase().trim()

        // Find user by email
        const { data: users } = await supabase.auth.admin.listUsers()
        const user = users?.users?.find(u => u.email?.toLowerCase().trim() === emailLower)

        if (!user) {
            return res.status(404).json({ error: 'User not found' })
        }

        // Check if already verified
        if (user.email_confirmed_at) {
            return res.status(400).json({
                error: 'Email already verified',
                message: 'This email address has already been verified'
            })
        }

        // Generate new OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString()
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

        // Save OTP to database
        await supabase.from('email_verification_otps').insert({
            email: emailLower,
            otp,
            user_id: user.id,
            expires_at: expiresAt.toISOString()
        })

        // Send verification email
        await sendEmail({
            to: email,
            subject: 'Verify Your Email - IMobile Service Center',
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
                  <tr>
                    <td style="background: linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%); padding: 40px 30px; text-align: center;">
                      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px; text-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);">IMOBILE</h1>
                      <p style="margin: 8px 0 0 0; color: #e0f2fe; font-size: 14px; font-weight: 500;">IMobile Service Center</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 50px 40px; background: #1e293b;">
                      <h2 style="margin: 0 0 20px 0; color: #f1f5f9; font-size: 24px; font-weight: 600; text-align: center;">Verify Your Email</h2>
                      <p style="margin: 0 0 30px 0; color: #cbd5e1; font-size: 16px; line-height: 1.6; text-align: center;">Welcome to IMobile Service Center! Please verify your email address by entering the verification code below.</p>
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 40px 0;">
                        <tr>
                          <td align="center">
                            <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border: 2px solid #3b82f6; border-radius: 12px; padding: 35px 20px; box-shadow: 0 8px 32px rgba(59, 130, 246, 0.3), inset 0 0 20px rgba(59, 130, 246, 0.1);">
                              <p style="margin: 0 0 15px 0; color: #94a3b8; font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px; text-align: center;">Your Verification Code</p>
                              <div style="background: #0f172a; border-radius: 8px; padding: 25px; margin: 15px 0; border: 1px solid #334155;">
                                <p style="margin: 0; color: #3b82f6; font-size: 42px; font-weight: 700; letter-spacing: 12px; text-align: center; font-family: 'Courier New', monospace; text-shadow: 0 0 20px rgba(59, 130, 246, 0.5);">${otp}</p>
                              </div>
                              <p style="margin: 15px 0 0 0; color: #64748b; font-size: 12px; text-align: center; line-height: 1.5;">Enter this code on the verification page to complete your registration</p>
                            </div>
                          </td>
                        </tr>
                      </table>
                      <div style="background: #0f172a; border-radius: 8px; padding: 25px; margin: 30px 0; border: 1px solid #334155;">
                        <p style="margin: 0 0 15px 0; color: #94a3b8; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">📧 Instructions</p>
                        <ul style="margin: 0; padding-left: 20px; color: #cbd5e1; font-size: 14px; line-height: 1.8;">
                          <li style="margin-bottom: 8px;">Go to the verification page on our website</li>
                          <li style="margin-bottom: 8px;">Enter the 6-digit code shown above</li>
                          <li style="margin-bottom: 0;">This code will expire in 24 hours</li>
                        </ul>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="background: #0f172a; padding: 30px; text-align: center; border-top: 1px solid #334155;">
                      <p style="margin: 0 0 10px 0; color: #64748b; font-size: 12px; line-height: 1.6;">If you didn't create an account with IMobile Service Center, please ignore this email.</p>
                      <p style="margin: 0; color: #475569; font-size: 11px;">© 2024 IMobile Service Center. All rights reserved.</p>
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
        })

        return res.json({
            success: true,
            message: 'Verification email sent successfully'
        })
    } catch (e: any) {
        console.error('[resend-verification] Error:', e)
        return res.status(500).json({
            error: e?.message || 'Unexpected error sending verification email'
        })
    }
}
