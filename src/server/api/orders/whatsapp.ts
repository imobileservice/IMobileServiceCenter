import { Request, Response } from 'express'
import { asyncHandler } from '../utils/async-handler'

/**
 * POST /api/orders/whatsapp
 * Send WhatsApp message to customer
 */
export const sendWhatsAppHandler = asyncHandler(async (req: Request, res: Response) => {
    const { to, message, from } = req.body

    if (!to || !message) {
        return res.status(400).json({ error: 'Missing required fields: to, message' })
    }

    // Check if Twilio is configured
    const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN
    const twilioWhatsAppFrom = process.env.TWILIO_WHATSAPP_FROM

    if (twilioAccountSid && twilioAuthToken && twilioWhatsAppFrom) {
        try {
            const twilioModule = await import('twilio')
            const twilio = twilioModule.default(twilioAccountSid, twilioAuthToken)

            const formattedTo = to.startsWith('+') ? to : `+${to}`

            await twilio.messages.create({
                from: `whatsapp:${twilioWhatsAppFrom}`,
                to: `whatsapp:${formattedTo}`,
                body: message,
            })

            return res.json({
                success: true,
                message: 'WhatsApp message sent successfully'
            })
        } catch (twilioError: any) {
            console.error('Twilio WhatsApp error:', twilioError)
            return res.status(500).json({
                error: 'Failed to send WhatsApp message',
                details: twilioError.message
            })
        }
    } else {
        // Fallback: Log the message (for development/testing)
        console.log('📱 WhatsApp Message (not sent - Twilio not configured):')
        console.log(`  To: ${to}`)
        console.log(`  Message: ${message}`)

        return res.json({
            success: true,
            message: 'WhatsApp message logged (Twilio not configured)'
        })
    }
})
