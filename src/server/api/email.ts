import { Router, Request, Response } from 'express'
import { asyncHandler } from './utils/async-handler'
import { sendEmail } from './utils/email'

const router = Router()

// POST /api/email/send
router.post('/send', asyncHandler(async (req: Request, res: Response) => {
    const { to, subject, html, text } = req.body

    if (!to || !subject || (!html && !text)) {
        return res.status(400).json({ error: 'Missing required fields' })
    }

    try {
        const info = await sendEmail({ to, subject, html, text })
        return res.json({ success: true, messageId: info.messageId })
    } catch (error: any) {
        console.error('[Email] Error sending email:', error)
        return res.status(500).json({ error: 'Failed to send email', details: error.message })
    }
}))

export default router
