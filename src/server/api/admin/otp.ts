import { Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

/**
 * POST /api/admin/otp/generate
 * Generate OTP for admin login
 */
export async function generateOtpHandler(req: Request, res: Response) {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({
        error: 'Email is required',
      })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Invalid email format',
      })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return res.status(503).json({
        error: 'Supabase not configured',
        message: 'Please set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file',
      })
    }

    // Use service role key for admin operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes from now

    // Delete any existing unused OTPs for this email
    await supabase
      .from('admin_otps')
      .delete()
      .eq('email', email)
      .eq('used', false)

    // Hash the OTP before storing it for security
    const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');

    // Insert new OTP hash
    const { data, error } = await supabase
      .from('admin_otps')
      .insert({
        email,
        otp: hashedOtp,
        expires_at: expiresAt.toISOString(),
        used: false,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating OTP:', error)
      return res.status(500).json({
        error: 'Failed to generate OTP',
        details: error.message,
      })
    }

    // In production, send OTP via email/SMS
    // For now, we'll return it (remove this in production!)
    console.log(`[ADMIN OTP] Generated OTP for ${email}: ${otp}`)

    return res.json({
      success: true,
      message: 'OTP generated successfully',
      expiresIn: 600, // 10 minutes in seconds
    })
  } catch (e: any) {
    console.error('Error in generateOtpHandler:', e)
    return res.status(500).json({
      error: e?.message || 'Unexpected error generating OTP',
    })
  }
}

/**
 * POST /api/admin/otp/verify
 * Verify OTP and authenticate admin
 */
export async function verifyOtpHandler(req: Request, res: Response) {
  try {
    const { email, otp } = req.body

    if (!email || !otp) {
      return res.status(400).json({
        error: 'Email and OTP are required',
      })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return res.status(503).json({
        error: 'Supabase not configured',
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Hash the incoming OTP to compare with the stored hash
    const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');

    // Find OTP by hash
    const { data: otpData, error: fetchError } = await supabase
      .from('admin_otps')
      .select('*')
      .eq('email', email)
      .eq('otp', hashedOtp)
      .eq('used', false)
      .single()

    if (fetchError || !otpData) {
      return res.status(401).json({
        error: 'Invalid or expired OTP',
      })
    }

    // Check if OTP is expired
    const expiresAt = new Date(otpData.expires_at)
    if (expiresAt < new Date()) {
      return res.status(401).json({
        error: 'OTP has expired',
      })
    }

    // Mark OTP as used
    await supabase
      .from('admin_otps')
      .update({ used: true })
      .eq('id', otpData.id)

    // Create admin session (you can customize this)
    // For now, we'll just return success
    // In production, create a proper session token

    return res.json({
      success: true,
      message: 'OTP verified successfully',
      user: {
        email,
        role: 'admin',
      },
    })
  } catch (e: any) {
    console.error('Error in verifyOtpHandler:', e)
    return res.status(500).json({
      error: e?.message || 'Unexpected error verifying OTP',
    })
  }
}

