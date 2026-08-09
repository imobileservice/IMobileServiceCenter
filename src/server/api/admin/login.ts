import { Request, Response } from 'express'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { verifyPassword } from '../utils/password'
import { sendEmail } from '../utils/email'
import { buildAdminOtpEmail } from './otp-email'
// Shared so a whitespace-padded NODE_ENV cannot quietly turn this into the
// development path, which returns the one-time code to the caller.
import { isProduction } from '../../env'

const OTP_TTL_MINUTES = 10
const OTP_TTL_MS = OTP_TTL_MINUTES * 60 * 1000
const MAX_ATTEMPTS = 5
const RESEND_COOLDOWN_MS = 60 * 1000

const hashOtp = (otp: string) => crypto.createHash('sha256').update(String(otp).trim()).digest('hex')

/** admin@example.com -> a****n@example.com, so the UI can confirm where the code went. */
const maskEmail = (email: string) => {
    const [local, domain] = email.split('@')
    if (!domain) return email
    if (local.length <= 2) return `${local[0]}***@${domain}`
    return `${local[0]}${'*'.repeat(Math.min(local.length - 2, 6))}${local[local.length - 1]}@${domain}`
}

const getAdminClient = (): SupabaseClient | null => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseServiceKey) return null
    return createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    })
}

/**
 * Fetch the admin row and check the password.
 *
 * Returns null when the credentials are wrong OR when the account is not an
 * administrator. The admin panel is for role='admin' and nothing else.
 *
 * 20260811_consolidate_cashier_accounts.sql also enforces this in the database -
 * `admins` carries a CHECK that pins role to 'admin', so a cashier cannot even
 * be stored here. This check is the belt to that migration's braces: it holds on
 * a database where the migration has not been run yet, and it keeps holding if
 * someone relaxes the constraint later.
 *
 * The rejection is deliberately indistinguishable from a wrong password. A
 * cashier probing the admin login should not learn that their credentials were
 * correct and only their role fell short.
 */
const authenticateAdmin = async (client: SupabaseClient, email: string, password: string) => {
    const { data: admin, error } = await client
        .from('admins')
        .select('id, email, name, whatsapp, password, role')
        .eq('email', email)
        .maybeSingle()

    if (error || !admin) return null
    if (!verifyPassword(password, admin.password)) return null

    const role = String(admin.role ?? '').trim().toLowerCase()
    if (role !== 'admin') {
        // Logged, because this is the one failure an operator will be asked
        // about: "my password is right and it still says it is wrong".
        console.warn(`[Admin] Refused admin-panel login for ${email}: role is '${role || 'unset'}', not 'admin'`)
        return null
    }

    return { ...admin, role }
}

/**
 * Creates a fresh code for this admin, stores only its hash and emails it.
 * Throws when the email could not be delivered.
 */
const issueOtp = async (client: SupabaseClient, email: string) => {
    const otp = crypto.randomInt(100000, 1000000).toString()
    const expiresAt = new Date(Date.now() + OTP_TTL_MS)

    // Any earlier code for this admin becomes invalid.
    await client.from('admin_otps').delete().eq('email', email).eq('used', false)

    const { error: insertError } = await client.from('admin_otps').insert({
        email,
        otp: hashOtp(otp),
        expires_at: expiresAt.toISOString(),
        used: false,
    })

    if (insertError) {
        console.error('[Admin OTP] Failed to store code:', insertError)
        throw Object.assign(new Error('Could not create a verification code'), { status: 500 })
    }

    // Always available to whoever can read the server logs, so a mail outage
    // never locks the shop out of its own admin panel.
    console.log(`[Admin OTP] Code for ${email}: ${otp} (valid ${OTP_TTL_MINUTES} min)`)

    const { html, text, subject } = buildAdminOtpEmail(otp, OTP_TTL_MINUTES)

    try {
        await sendEmail({ to: email, subject, html, text })
    } catch (mailError: any) {
        console.error('[Admin OTP] Email delivery failed:', mailError?.message)
        // Carry the provider's own wording through. The caller has already passed
        // the password check, and a generic "could not send" hid the one detail
        // that identified the fault ("You can only send testing emails to your
        // own email address") behind logs nobody was reading.
        throw Object.assign(
            new Error(
                `Could not send the verification email. ${mailError?.message || 'Unknown mail error.'}`
            ),
            { status: 502, otp }
        )
    }

    return { otp, expiresAt }
}

/**
 * POST /api/admin/login/init
 * Step 1: validate email + password, then email a one-time code.
 */
export async function initAdminLoginHandler(req: Request, res: Response) {
    console.log(`🔐 [Admin] Login init attempt for: ${req.body?.email}`)
    try {
        const { email, password } = req.body

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' })
        }

        const normalizedEmail = String(email).toLowerCase().trim()

        const adminClient = getAdminClient()
        if (!adminClient) {
            return res.status(503).json({ error: 'Server configuration error (Supabase)' })
        }

        const admin = await authenticateAdmin(adminClient, normalizedEmail, password)
        if (!admin) {
            return res.status(401).json({ error: 'Invalid email or password' })
        }

        try {
            await issueOtp(adminClient, normalizedEmail)
        } catch (otpError: any) {
            const status = otpError?.status || 500
            // In development the code is returned so local work is not blocked by
            // an unconfigured mailbox. Never in production.
            if (status === 502 && !isProduction() && otpError?.otp) {
                return res.json({
                    success: true,
                    requiresOtp: true,
                    email: normalizedEmail,
                    maskedEmail: maskEmail(normalizedEmail),
                    expiresIn: OTP_TTL_MS / 1000,
                    emailDelivered: false,
                    devOtp: otpError.otp,
                    message: 'Email delivery failed - using the development code below',
                })
            }
            return res.status(status).json({ error: otpError.message })
        }

        console.log(`[Admin] ✅ Verification code sent to ${normalizedEmail}`)

        return res.json({
            success: true,
            requiresOtp: true,
            email: normalizedEmail,
            maskedEmail: maskEmail(normalizedEmail),
            expiresIn: OTP_TTL_MS / 1000,
            emailDelivered: true,
            message: 'Verification code sent to your email',
        })
    } catch (e: any) {
        console.error('Login Init Error:', e)
        return res.status(500).json({ error: 'Internal Server Error' })
    }
}

/**
 * POST /api/admin/login/resend
 * Re-sends the code. Credentials are re-checked so this cannot be used to
 * spam an admin's inbox.
 */
export async function resendAdminOtpHandler(req: Request, res: Response) {
    try {
        const { email, password } = req.body

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' })
        }

        const normalizedEmail = String(email).toLowerCase().trim()

        const adminClient = getAdminClient()
        if (!adminClient) {
            return res.status(503).json({ error: 'Server configuration error (Supabase)' })
        }

        const admin = await authenticateAdmin(adminClient, normalizedEmail, password)
        if (!admin) {
            return res.status(401).json({ error: 'Invalid email or password' })
        }

        // Cooldown so the button cannot be hammered.
        const { data: recent } = await adminClient
            .from('admin_otps')
            .select('created_at')
            .eq('email', normalizedEmail)
            .eq('used', false)
            .order('created_at', { ascending: false })
            .limit(1)

        const lastCreatedAt = recent?.[0]?.created_at ? new Date(recent[0].created_at).getTime() : 0
        const elapsed = Date.now() - lastCreatedAt
        if (lastCreatedAt && elapsed < RESEND_COOLDOWN_MS) {
            return res.status(429).json({
                error: `Please wait ${Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000)}s before requesting another code`,
                retryAfter: Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000),
            })
        }

        try {
            await issueOtp(adminClient, normalizedEmail)
        } catch (otpError: any) {
            const status = otpError?.status || 500
            if (status === 502 && !isProduction() && otpError?.otp) {
                return res.json({
                    success: true,
                    expiresIn: OTP_TTL_MS / 1000,
                    emailDelivered: false,
                    devOtp: otpError.otp,
                    message: 'Email delivery failed - using the development code below',
                })
            }
            return res.status(status).json({ error: otpError.message })
        }

        return res.json({
            success: true,
            expiresIn: OTP_TTL_MS / 1000,
            emailDelivered: true,
            maskedEmail: maskEmail(normalizedEmail),
            message: 'A new verification code is on its way',
        })
    } catch (e: any) {
        console.error('Login Resend Error:', e)
        return res.status(500).json({ error: 'Internal Server Error' })
    }
}

/**
 * POST /api/admin/login/verify
 * Step 2: check the code and return the admin session.
 */
export async function verifyAdminLoginHandler(req: Request, res: Response) {
    try {
        const { email, password, otp } = req.body

        if (!email || !password || !otp) {
            return res.status(400).json({ error: 'Email, password, and code are required' })
        }

        const normalizedEmail = String(email).toLowerCase().trim()
        const normalizedOtp = String(otp).trim()

        if (!/^\d{6}$/.test(normalizedOtp)) {
            return res.status(400).json({ error: 'Enter the 6-digit code from your email' })
        }

        const adminClient = getAdminClient()
        if (!adminClient) {
            return res.status(503).json({ error: 'Server configuration error' })
        }

        // Password is re-validated so a leaked code alone is not enough.
        const admin = await authenticateAdmin(adminClient, normalizedEmail, password)
        if (!admin) {
            return res.status(401).json({ error: 'Invalid email or password' })
        }

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
            return res.status(401).json({ error: 'No code was requested for this email. Start again.' })
        }

        const otpData = otpList[0]

        if (otpData.used) {
            return res.status(401).json({ error: 'This code has already been used. Request a new one.' })
        }

        if (new Date(otpData.expires_at) < new Date()) {
            return res.status(401).json({ error: 'This code has expired. Request a new one.' })
        }

        const attempts = Number(otpData.attempts || 0)
        if (attempts >= MAX_ATTEMPTS) {
            await adminClient.from('admin_otps').update({ used: true }).eq('id', otpData.id)
            return res.status(429).json({ error: 'Too many incorrect attempts. Request a new code.' })
        }

        // Stored as a SHA-256 hash; the plain comparison keeps codes issued by
        // the older handler working until they expire.
        const matches = otpData.otp === hashOtp(normalizedOtp) || String(otpData.otp) === normalizedOtp

        if (!matches) {
            const nextAttempts = attempts + 1
            const { error: attemptError } = await adminClient
                .from('admin_otps')
                .update({ attempts: nextAttempts })
                .eq('id', otpData.id)

            // Column missing (migration not run yet) - the code still works, just without the counter.
            if (attemptError) console.warn('[Verify] Could not record attempt:', attemptError.message)

            const remaining = Math.max(0, MAX_ATTEMPTS - nextAttempts)
            return res.status(401).json({
                error: remaining > 0
                    ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} left.`
                    : 'Incorrect code. Request a new one.',
                attemptsRemaining: remaining,
            })
        }

        await adminClient.from('admin_otps').update({ used: true }).eq('id', otpData.id)

        console.log(`[Verify] ✅ Login successful for ${normalizedEmail}`)

        return res.json({
            success: true,
            admin: {
                id: admin.id,
                email: admin.email,
                name: admin.name,
                whatsapp: admin.whatsapp,
                role: admin.role,
            },
            message: 'Login successful',
        })
    } catch (e: any) {
        console.error('Login Verify Error:', e)
        return res.status(500).json({ error: 'Internal Server Error' })
    }
}
