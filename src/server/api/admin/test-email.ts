import { Request, Response } from 'express'
import { sendEmail } from '../utils/email'

export async function testEmailHandler(req: Request, res: Response) {
    const { to } = req.query
    const testEmail = (to as string) || process.env.SMTP_USER || 'test@example.com'
    
    console.log(`📧 [Test] Attempting SMTP test to: ${testEmail}`)
    
    try {
        const info = await sendEmail({
            to: testEmail,
            subject: 'IMobile SMTP Test - Production Diagnostics',
            text: 'This is a test email from the IMobile Service Center backend. If you received this, your SMTP configuration is working correctly.',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4;">
                    <h2 style="color: #3b82f6;">IMobile SMTP Test</h2>
                    <p>This is a diagnostic test email to verify your production SMTP settings.</p>
                    <hr/>
                    <p><b>Server Time:</b> ${new Date().toISOString()}</p>
                    <p><b>SMTP Host:</b> ${process.env.SMTP_HOST}</p>
                    <p><b>Status:</b> ✅ WORKING</p>
                </div>
            `
        })
        
        return res.json({
            success: true,
            message: `Test email sent successfully to ${testEmail}`,
            info: {
                messageId: info.messageId,
                response: info.response
            }
        })
    } catch (err: any) {
        console.error('📧 [Test] SMTP Test FAILED:', err.message)
        return res.status(500).json({
            success: false,
            error: 'SMTP Test Failed',
            details: err.message,
            config: {
                host: process.env.SMTP_HOST,
                port: process.env.SMTP_PORT,
                user: process.env.SMTP_USER
            }
        })
    }
}
