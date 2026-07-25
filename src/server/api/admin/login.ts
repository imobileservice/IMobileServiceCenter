import { Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { sendEmail } from '../utils/email'
import { verifyPassword } from '../utils/password'

const OTP_TTL_MS = 10 * 60 * 1000 // 10 minutes
const OTP_MAX_ATTEMPTS = 5

// In-memory brute-force guard for the verify step (per email, resets on OTP re-issue)
const verifyAttempts = new Map<string, { count: number; firstAttemptAt: number }>()

function registerFailedAttempt(email: string) {
    const now = Date.now()
    const entry = verifyAttempts.get(email)

    if (!entry || now - entry.firstAttemptAt > OTP_TTL_MS) {
        verifyAttempts.set(email, { count: 1, firstAttemptAt: now })
        return 1
    }

    entry.count += 1
    return entry.count
}

function isLockedOut(email: string) {
    const entry = verifyAttempts.get(email)
    if (!entry) return false

    if (Date.now() - entry.firstAttemptAt > OTP_TTL_MS) {
        verifyAttempts.delete(email)
        return false
    }

    return entry.count >= OTP_MAX_ATTEMPTS
}

/**
 * POST /api/admin/login/init
 * Step 1: Validate credentials (email/password), then email a one-time code.
 */
export async function initAdminLoginHandler(req: Request, res: Response) {
    console.log(`🔐 [Admin] Login init attempt for: ${req.body?.email}`)
    try {
        const { email, password } = req.body

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' })
        }

        // Normalize email to match verification handler
        const normalizedEmail = String(email).toLowerCase().trim()

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
            .select('id, email, name, whatsapp, password')
            .eq('email', normalizedEmail)
            .single()

        if (adminError || !admin) {
            console.error('Admin fetch error:', adminError)
            return res.status(401).json({ error: 'Invalid email or password' })
        }

        // 2. Validate Password
        if (!verifyPassword(password, admin.password)) {
            return res.status(401).json({ error: 'Invalid email or password' })
        }

        // 3. Generate a fresh 6-digit OTP (upper bound is exclusive)
        const otp = crypto.randomInt(100000, 1000000).toString()
        const expiresAt = new Date(Date.now() + OTP_TTL_MS)

        // 4. Replace any previous codes for this email, storing only the SHA-256 hash
        await adminClient
            .from('admin_otps')
            .delete()
            .eq('email', normalizedEmail)

        const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex')

        const { data: otpRow, error: otpError } = await adminClient
            .from('admin_otps')
            .insert({
                email: normalizedEmail,
                otp: hashedOtp,
                expires_at: expiresAt.toISOString(),
                used: false,
            })
            .select('id')
            .single()

        if (otpError || !otpRow) {
            console.error('[Admin] OTP storage error:', otpError)
            return res.status(500).json({ error: 'Failed to generate verification code' })
        }

        // A new code invalidates the previous lockout window
        verifyAttempts.delete(normalizedEmail)

        // 5. Email the code. Never leave an unusable OTP row behind if delivery fails.
        try {
            await sendEmail({
                to: normalizedEmail,
                subject: 'Admin Login Verification Code',
                templateId: 'admin-verification-code',
                templateVariables: {
                    token: otp,
                },
            })
            console.log(`[Admin] ✅ OTP email sent to ${normalizedEmail}`)
        } catch (emailError: any) {
            console.error(`[Admin] ❌ Failed to send OTP email to ${normalizedEmail}:`, emailError?.message)

            await adminClient
                .from('admin_otps')
                .delete()
                .eq('id', otpRow.id)

            const isQuota = /quota|rate.?limit|429/i.test(emailError?.message || '')
            return res.status(isQuota ? 429 : 502).json({
                error: isQuota
                    ? 'Verification email could not be sent: the email sending quota has been reached. Please try again later.'
                    : 'Failed to send verification email.',
                details: emailError?.message,
            })
        }

        return res.json({
            success: true,
            requiresOtp: true,
            expiresIn: Math.floor(OTP_TTL_MS / 1000),
            message: 'Credentials valid. Verification code sent to your email.',
            // Development convenience only - never exposed when NODE_ENV !== 'development'
            otp: process.env.NODE_ENV === 'development' ? otp : undefined,
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

        const normalizedEmail = String(email).toLowerCase().trim()
        const normalizedOtp = String(otp).trim()

        if (isLockedOut(normalizedEmail)) {
            console.warn(`[Verify] Too many failed attempts for ${normalizedEmail}`)
            return res.status(429).json({ error: 'Too many incorrect codes. Please request a new one.' })
        }

        // 1. Verify OTP - Fetch by email first to give better error messages
        console.log(`[Verify] Checking OTP for ${normalizedEmail}`)

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

        if (otpData.used) {
            console.warn(`[Verify] OTP already used. ID: ${otpData.id}`)
            return res.status(401).json({ error: 'This code has already been used' })
        }

        // Check expiration before comparing, so an expired code reports accurately
        if (new Date(otpData.expires_at) < new Date()) {
            return res.status(401).json({ error: 'OTP has expired' })
        }

        // Codes are stored as SHA-256 hashes; compare digests in constant time
        const hashedInput = crypto.createHash('sha256').update(normalizedOtp).digest('hex')
        const storedHash = String(otpData.otp || '')

        const otpMatches = storedHash.length === hashedInput.length &&
            crypto.timingSafeEqual(Buffer.from(storedHash), Buffer.from(hashedInput))

        if (!otpMatches) {
            const attempts = registerFailedAttempt(normalizedEmail)
            console.warn(`[Verify] OTP mismatch for ${normalizedEmail} (attempt ${attempts}/${OTP_MAX_ATTEMPTS})`)
            return res.status(401).json({
                error: attempts >= OTP_MAX_ATTEMPTS
                    ? 'Too many incorrect codes. Please request a new one.'
                    : 'Invalid verification code',
            })
        }

        // Mark as used
        await adminClient
            .from('admin_otps')
            .update({ used: true })
            .eq('id', otpData.id)

        verifyAttempts.delete(normalizedEmail)

        // 2. Fetch admin details (password was already validated in init step)
        console.log(`[Verify] Fetching admin details for ${normalizedEmail}`)
        const { data: admin, error: adminError } = await adminClient
            .from('admins')
            .select('id, email, name, whatsapp, password')
            .eq('email', normalizedEmail)
            .single()

        if (adminError || !admin) {
            console.error('[Verify] Admin fetch error:', adminError)
            return res.status(401).json({ error: 'Admin not found' })
        }

        // Verify password matches (double-check security)
        if (!verifyPassword(password, admin.password)) {
            console.error('[Verify] Password mismatch')
            return res.status(401).json({ error: 'Invalid credentials' })
        }

        console.log(`[Verify] ✅ Login successful for ${normalizedEmail}`)

        const adminPayload = {
            id: admin.id,
            email: admin.email || normalizedEmail,
            name: admin.name || 'Admin',
            whatsapp: admin.whatsapp
        }

        return res.json({
            success: true,
            admin: adminPayload,
            // `user` kept as an alias so older clients reading data.user keep working
            user: adminPayload,
            message: 'Login successful'
        })

    } catch (e: any) {
        console.error('Login Verify Error:', e)
        return res.status(500).json({ error: 'Internal Server Error' })
    }
}
