import { Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { sendEmail } from '../utils/email'

/**
 * POST /api/admin/login/init
 * Step 1: Validate credentials (email/password) and send WhatsApp OTP
 */
export async function initAdminLoginHandler(req: Request, res: Response) {
    console.log(`🔐 [Admin] Login init attempt for: ${req.body?.email}`)
    try {
        const { email, password } = req.body

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' })
        }

        // Normalize email to match verification handler
        const normalizedEmail = email.toLowerCase().trim()

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

        if (!supabaseUrl || !supabaseKey || !supabaseServiceKey) {
            return res.status(503).json({ error: 'Server configuration error (Supabase)' })
        }

        // 1. Fetch admin details from dedicated 'admins' table
        const adminClient = createClient(supabaseUrl, supabaseServiceKey)
        const { data: admin, error: adminError } = await adminClient
            .from('admins')
            .select('id, whatsapp, password')
            .eq('email', normalizedEmail)
            .single()

        if (adminError || !admin) {
            console.error('Admin fetch error:', adminError)
            return res.status(401).json({ error: 'Invalid email or password' })
        }

        // 2. Validate Password
        if (admin.password !== password) {
            return res.status(401).json({ error: 'Invalid email or password' })
        }

        // WhatsApp check removed as we are using Email OTP
        // if (!admin.whatsapp) { ... }

        const profile = admin

        // 3. Generate OTP
        const otp = crypto.randomInt(100000, 999999).toString()
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes from now

        // 4. Store OTP in admin_otps table
        // Clean up old OTPs first
        await adminClient
            .from('admin_otps')
            .delete()
            .eq('email', normalizedEmail)

        const { error: otpError } = await adminClient
            .from('admin_otps')
            .insert({
                email: normalizedEmail,
                otp,
                expires_at: expiresAt.toISOString(),
                used: false,
            })

        if (otpError) {
            console.error('OTP storage error:', otpError)
            return res.status(500).json({ error: 'Failed to generate OTP' })
        }

        // 5. Send OTP via WhatsApp (Twilio)
        // 5. Send OTP via Email (Non-blocking)
        // We trigger the email send but don't 'await' it to prevent Gateway Timeouts (502)
        sendEmail({
            to: normalizedEmail,
            subject: 'Admin Login Verification Code',
            text: `Your Admin Verification Code is: ${otp}. Valid for 10 minutes.`,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                </head>
                <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background: #0f172a; min-height: 100vh;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background: #0f172a; padding: 40px 20px;">
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
                                Admin Login Verification
                              </h2>
                              
                              <p style="margin: 0 0 30px 0; color: #cbd5e1; font-size: 16px; line-height: 1.6; text-align: center;">
                                You are attempting to access the IMobile Admin Panel. Please use the verification code below to complete your login.
                              </p>
                              
                              <!-- Token Display Box -->
                              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 40px 0;">
                                <tr>
                                  <td align="center">
                                    <div style="background: #1e293b; border: 2px solid #3b82f6; border-radius: 12px; padding: 35px 20px; box-shadow: 0 8px 32px rgba(59, 130, 246, 0.3);">
                                      <p style="margin: 0 0 15px 0; color: #94a3b8; font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px; text-align: center;">
                                        Your Verification Code
                                      </p>
                                      <div style="background: #0f172a; border-radius: 8px; padding: 25px; margin: 15px 0; border: 1px solid #334155;">
                                        <p style="margin: 0; color: #3b82f6; font-size: 42px; font-weight: 700; letter-spacing: 12px; text-align: center; font-family: 'Courier New', monospace; text-shadow: 0 0 20px rgba(59, 130, 246, 0.5);">
                                          ${otp}
                                        </p>
                                      </div>
                                      <p style="margin: 15px 0 0 0; color: #64748b; font-size: 12px; text-align: center; line-height: 1.5;">
                                        Valid for 10 minutes
                                      </p>
                                    </div>
                                  </td>
                                </tr>
                              </table>
                              
                              <!-- Instructions -->
                              <div style="background: #0f172a; border-radius: 8px; padding: 25px; margin: 30px 0; border: 1px solid #334155;">
                                <p style="margin: 0 0 15px 0; color: #94a3b8; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                                  🛡️ Security Notice
                                </p>
                                <ul style="margin: 0; padding-left: 20px; color: #cbd5e1; font-size: 14px; line-height: 1.8;">
                                  <li style="margin-bottom: 8px;">Never share this code with anyone</li>
                                  <li style="margin-bottom: 8px;">This code only works for the current login session</li>
                                  <li style="margin-bottom: 0;">If you didn't request this, please change your password</li>
                                </ul>
                              </div>
                            </td>
                          </tr>
                          
                          <!-- Footer -->
                          <tr>
                            <td style="background: #0f172a; padding: 30px; text-align: center; border-top: 1px solid #334155;">
                              <p style="margin: 0 0 10px 0; color: #64748b; font-size: 12px; line-height: 1.6;">
                                © 2024 IMobile Service Center.
                              </p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </body>
                </html>
            `
        }).then(() => {
            console.log(`[Email] OTP sent successfully to ${normalizedEmail}`)
        }).catch((emailError) => {
            console.error('[Email] Background OTP sending failed:', emailError.message)
            // Log full error in dev
            if (process.env.NODE_ENV === 'development') {
                console.error(emailError)
            }
        })

        // Return success immediately - the OTP is stored in DB so verify step will work
        // even if the email arrives a few seconds late or fails (can retry)
        return res.json({
            success: true,
            message: 'Credentials valid. Verification code sent.',
            // In development, send OTP in response for testing
            otp: process.env.NODE_ENV === 'development' ? otp : undefined
        })

    } catch (e: any) {
        console.error('Login Init Error:', e)
        return res.status(500).json({ error: 'Internal Server Error' })
    }
}

/**
 * POST /api/admin/login/verify
 * Step 2: Verify OTP and return Session
 */
export async function verifyAdminLoginHandler(req: Request, res: Response) {
    try {
        const { email, password, otp } = req.body

        if (!email || !password || !otp) {
            return res.status(400).json({ error: 'Email, password, and OTP are required' })
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

        if (!supabaseUrl || !supabaseKey || !supabaseServiceKey) {
            return res.status(503).json({ error: 'Server configuration error' })
        }

        const adminClient = createClient(supabaseUrl, supabaseServiceKey)

        const normalizedEmail = email.toLowerCase().trim()
        const normalizedOtp = String(otp).trim()

        // 1. Verify OTP - Fetch by email first to give better error messages
        console.log(`[Verify] Checking OTP for ${normalizedEmail}. Input: ${normalizedOtp}`)

        const { data: otpList, error: otpFetchError } = await adminClient
            .from('admin_otps')
            .select('*')
            .eq('email', normalizedEmail)
            .order('created_at', { ascending: false })
            .limit(1)

        if (otpFetchError) {
            console.error('[Verify] DB Error:', otpFetchError)
            return res.status(500).json({ error: 'Database error during verification' })
        }

        if (!otpList || otpList.length === 0) {
            console.warn(`[Verify] No OTP record found for ${normalizedEmail}`)
            return res.status(401).json({ error: 'No OTP request found for this email' })
        }

        const otpData = otpList[0]

        if (String(otpData.otp) !== normalizedOtp) {
            console.warn(`[Verify] OTP Mismatch. Expected: ${otpData.otp}, Received: ${normalizedOtp}`)
            return res.status(401).json({ error: 'Invalid verification code' })
        }

        if (otpData.used) {
            console.warn(`[Verify] OTP already used. ID: ${otpData.id}`)
            return res.status(401).json({ error: 'This code has already been used' })
        }

        // Check expiration
        if (new Date(otpData.expires_at) < new Date()) {
            return res.status(401).json({ error: 'OTP has expired' })
        }

        // Mark as used
        await adminClient
            .from('admin_otps')
            .update({ used: true })
            .eq('id', otpData.id)

        // 2. Fetch admin details (password was already validated in init step)
        console.log(`[Verify] Fetching admin details for ${normalizedEmail}`)
        const { data: admin, error: adminError } = await adminClient
            .from('admins')
            .select('id, email, whatsapp, password')
            .eq('email', normalizedEmail)
            .single()

        if (adminError || !admin) {
            console.error('[Verify] Admin fetch error:', adminError)
            return res.status(401).json({ error: 'Admin not found' })
        }

        // Verify password matches (double-check security)
        if (admin.password !== password) {
            console.error('[Verify] Password mismatch')
            return res.status(401).json({ error: 'Invalid credentials' })
        }

        console.log(`[Verify] ✅ Login successful for ${normalizedEmail}`)

        return res.json({
            success: true,
            admin: {
                id: admin.id,
                email: admin.email,
                whatsapp: admin.whatsapp
            },
            message: 'Login successful'
        })

    } catch (e: any) {
        console.error('Login Verify Error:', e)
        return res.status(500).json({ error: 'Internal Server Error' })
    }
}
