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
                <div style="font-family: sans-serif; padding: 20px;">
                    <h2>Admin Verification Code</h2>
                    <p>Your verification code is:</p>
                    <h1 style="color: #333; letter-spacing: 5px;">${otp}</h1>
                    <p>This code is valid for 10 minutes.</p>
                    <p>If you didn't request this code, please ignore this email.</p>
                </div>
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
