import { Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { sendEmail } from '../utils/email'

/**
 * POST /api/cashier/login/init
 * Step 1: Validate credentials (email/password) and send OTP
 */
export async function initCashierLoginHandler(req: Request, res: Response) {
    console.log(`🔐 [Cashier] Login init attempt for: ${req.body?.email}`)
    try {
        const { email, password } = req.body

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' })
        }

        const normalizedEmail = email.toLowerCase().trim()

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

        if (!supabaseUrl || !supabaseKey || !supabaseServiceKey) {
            return res.status(503).json({ error: 'Server configuration error (Supabase)' })
        }

        const adminClient = createClient(supabaseUrl, supabaseServiceKey)
        const { data: admin, error: adminError } = await adminClient
            .from('admins')
            .select('id, name, password, role')
            .eq('email', normalizedEmail)
            .single()

        if (adminError || !admin) {
            console.error('Cashier fetch error:', adminError)
            return res.status(401).json({ error: 'Invalid email or password' })
        }

        // Validate Password
        if (admin.password !== password) {
            return res.status(401).json({ error: 'Invalid email or password' })
        }

        // Must be cashier or admin
        if (admin.role !== 'cashier' && admin.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized role.' })
        }

        // 3. Generate OTP
        const otp = crypto.randomInt(100000, 999999).toString()
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 1 WEEK

        // 4. Store OTP in cashier_otp table (NEW)
        await adminClient.from('cashier_otp').delete().eq('email', normalizedEmail)

        // Hashing for security
        const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex')

        const { error: otpError } = await adminClient
            .from('cashier_otp')
            .insert({
                email: normalizedEmail,
                otp: hashedOtp,
                expires_at: expiresAt.toISOString(),
                used: false,
            })

        if (otpError) {
            console.error('OTP storage error:', otpError)
            return res.status(500).json({ error: 'Failed to generate OTP' })
        }

        // 5. Send OTP via Email (await so errors are visible in logs)
        try {
            await sendEmail({
                to: normalizedEmail,
                subject: 'Cashier Terminal Verification Code',
                text: `Your IMobile Cashier Verification Code is: ${otp}. Valid for 1 week.`,
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
                    <body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#0f172a;">
                      <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
                        <tr><td align="center">
                          <table width="560" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;overflow:hidden;border:1px solid #334155;">
                            <tr><td style="background:linear-gradient(135deg,#3b82f6,#06b6d4);padding:32px 30px;text-align:center;">
                              <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;">IMOBILE CASHIER TERMINAL</h1>
                              <p style="margin:6px 0 0;color:#e0f2fe;font-size:13px;">POS System Access Code</p>
                            </td></tr>
                            <tr><td style="padding:40px 40px;text-align:center;">
                              <p style="margin:0 0 24px;color:#cbd5e1;font-size:15px;">Your cashier terminal access code:</p>
                              <div style="background:#0f172a;border:2px solid #3b82f6;border-radius:12px;padding:30px 20px;margin:0 auto;">
                                <p style="margin:0;color:#3b82f6;font-size:48px;font-weight:700;letter-spacing:14px;font-family:'Courier New',monospace;">${otp}</p>
                                <p style="margin:12px 0 0;color:#64748b;font-size:12px;">Valid for 1 week</p>
                              </div>
                              <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;">If you did not request this, please contact your manager immediately.</p>
                            </td></tr>
                            <tr><td style="background:#0f172a;padding:20px 30px;text-align:center;border-top:1px solid #334155;">
                              <p style="margin:0;color:#64748b;font-size:11px;">© 2024 IMobile Service & Repair Center</p>
                            </td></tr>
                          </table>
                        </td></tr>
                      </table>
                    </body>
                    </html>
                `
            })
            console.log(`[Email] ✅ Cashier OTP sent successfully to ${normalizedEmail}`)
        } catch (emailErr: any) {
            console.error(`[Email] ❌ FAILED to send cashier OTP to ${normalizedEmail}:`, emailErr.message)
        }

        return res.json({
            success: true,
            message: 'Credentials valid. Verification code sent.',
            otp: process.env.NODE_ENV === 'development' ? otp : undefined
        })

    } catch (e: any) {
        console.error('Cashier Login Init Error:', e)
        return res.status(500).json({ error: 'Internal Server Error' })
    }
}

/**
 * POST /api/cashier/login/verify
 * Step 2: Verify OTP and return Session
 */
export async function verifyCashierLoginHandler(req: Request, res: Response) {
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

        // Hashing to compare
        const hashedOtp = crypto.createHash('sha256').update(normalizedOtp).digest('hex')

        // 1. Verify OTP
        const { data: otpList, error: otpFetchError } = await adminClient
            .from('cashier_otp')
            .select('*')
            .eq('email', normalizedEmail)
            .eq('otp', hashedOtp)
            .order('created_at', { ascending: false })
            .limit(1)

        if (otpFetchError || !otpList || otpList.length === 0) {
            return res.status(401).json({ error: 'Invalid or expired verification code' })
        }

        const otpData = otpList[0]

        if (otpData.used) {
            return res.status(401).json({ error: 'This code has already been used' })
        }

        if (new Date(otpData.expires_at) < new Date()) {
            return res.status(401).json({ error: 'OTP has expired' })
        }

        // Mark as used
        await adminClient.from('cashier_otp').update({ used: true }).eq('id', otpData.id)

        // 2. Fetch admin details
        const { data: admin, error: adminError } = await adminClient
            .from('admins')
            .select('id, email, name, role, password')
            .eq('email', normalizedEmail)
            .single()

        if (adminError || !admin || admin.password !== password) {
            return res.status(401).json({ error: 'Invalid credentials' })
        }

        // Must be cashier or admin
        if (admin.role !== 'cashier' && admin.role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized role.' })
        }

        console.log(`[Verify] ✅ Cashier Login successful for ${normalizedEmail}`)

        return res.json({
            success: true,
            cashier: {
                id: admin.id,
                email: admin.email,
                name: admin.name || 'Cashier',
                role: admin.role
            },
            message: 'Login successful'
        })

    } catch (e: any) {
        console.error('Login Verify Error:', e)
        return res.status(500).json({ error: 'Internal Server Error' })
    }
}
