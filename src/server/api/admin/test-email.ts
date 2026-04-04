import { Request, Response } from 'express'
import { sendEmail } from '../utils/email'

export async function testEmailHandler(req: Request, res: Response) {
    const { to } = req.query
    const testEmail = (to as string) || process.env.SMTP_USER || 'test@example.com'
    
    console.log(`📧 [Test] Attempting email test to: ${testEmail}`)
    
    try {
        const info = await sendEmail({
            to: testEmail,
            subject: 'IMobile Email Test - Production Diagnostics',
            text: 'This is a test email from the IMobile Service Center backend. If you received this, your email configuration is working correctly.',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4;">
                    <h2 style="color: #3b82f6;">IMobile Email Test</h2>
                    <p>This is a diagnostic test email to verify your production email settings.</p>
                    <hr/>
                    <p><b>Server Time:</b> ${new Date().toISOString()}</p>
                    <p><b>Method:</b> Brevo REST API (HTTPS)</p>
                    <p><b>Status:</b> ✅ WORKING</p>
                </div>
            `
        })
        
        return res.json({
            success: true,
            message: `Test email sent successfully to ${testEmail}`,
            info: {
                messageId: info.messageId,
                method: 'Brevo REST API (HTTPS port 443)'
            }
        })
    } catch (err: any) {
        console.error('📧 [Test] Email Test FAILED:', err.message)
        return res.status(500).json({
            success: false,
            error: 'Email Test Failed',
            details: err.message,
            config: {
                hasApiKey: !!(process.env.BREVO_API_KEY || process.env.SMTP_PASS),
                apiKeyPrefix: (process.env.BREVO_API_KEY || process.env.SMTP_PASS || '').substring(0, 12) + '...',
                method: 'Brevo REST API'
            }
        })
    }
}
