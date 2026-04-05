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
            templateId: 'verification-code',
            templateVariables: {
                token: otp
            }
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
