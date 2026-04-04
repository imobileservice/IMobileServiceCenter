import { Request, Response } from 'express'
import { sendEmail } from '../utils/email'

export async function testEmailHandler(req: Request, res: Response) {
    const { to } = req.query
    const testEmail = (to as string) || 'dexlanka@gmail.com'
    
    console.log(`📧 [Test] Attempting email test to: ${testEmail}`)
    
    try {
        const info = await sendEmail({
            to: testEmail,
            subject: 'IMobile Email Test - Production',
            text: 'If you received this, your email configuration is working!',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4;">
                    <h2 style="color: #3b82f6;">IMobile Email Test ✅</h2>
                    <p>Your production email is working correctly via <b>Resend API</b>.</p>
                    <hr/>
                    <p><b>Server Time:</b> ${new Date().toISOString()}</p>
                    <p><b>Method:</b> Resend REST API (HTTPS)</p>
                </div>
            `
        })
        
        return res.json({
            success: true,
            message: `Test email sent to ${testEmail}`,
            info
        })
    } catch (err: any) {
        console.error('📧 [Test] Email Test FAILED:', err.message)
        return res.status(500).json({
            success: false,
            error: 'Email Test Failed',
            details: err.message,
            help: 'Get a free API key at https://resend.com'
        })
    }
}
