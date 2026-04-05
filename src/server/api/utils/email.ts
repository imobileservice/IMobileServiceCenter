/**
 * Resend Email Service
 * 
 * Uses Resend REST API over HTTPS (port 443).
 * Works perfectly on Railway, Cloudflare, Vercel, etc.
 * 
 * Free tier: 100 emails/day, 3,000/month
 * Sign up: https://resend.com
 * 
 * Required env variable: RESEND_API_KEY
 */

export const sendEmail = async ({
    to,
    subject,
    text,
    html,
    templateId,
    templateVariables,
    attachments,
}: {
    to: string
    subject?: string
    text?: string
    html?: string
    templateId?: string
    templateVariables?: Record<string, any>
    attachments?: Array<{
        filename: string
        content: Buffer | string
        contentType?: string
    }>
}) => {
    const apiKey = process.env.RESEND_API_KEY

    // Default sender - use 'onboarding@resend.dev' for testing before domain verification
    const fromEmail = process.env.EMAIL_FROM || 'IMobile Service Center <onboarding@resend.dev>'

    if (!apiKey) {
        throw new Error('[Email] Missing RESEND_API_KEY. Get one free at https://resend.com')
    }

    console.log(`[Email] Sending via Resend API to: ${to} | Subject: ${subject || templateId}`)

    // Build request payload
    const payload: any = {
        from: fromEmail,
        to: [to],
    }

    if (subject) payload.subject = subject

    if (templateId) {
        payload.template = {
            id: templateId,
            variables: templateVariables || {}
        }
    } else {
        if (html) payload.html = html
        if (text) payload.text = text
        if (!html && !text && subject) payload.text = subject
    }

    // Format attachments for Resend API
    if (attachments?.length) {
        payload.attachments = attachments.map(att => ({
            filename: att.filename,
            content: typeof att.content === 'string'
                ? Buffer.from(att.content).toString('base64')
                : att.content.toString('base64'),
        }))
    }

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        })

        const data = await response.json()

        if (!response.ok) {
            console.error('[Email] ❌ Resend API Error:', JSON.stringify(data))
            throw new Error(`Resend Error (${response.status}): ${data.message || data.name || response.statusText}`)
        }

        console.log(`[Email] ✅ Email sent! ID: ${data.id}`)
        return {
            messageId: data.id,
            response: `Resend OK (${response.status})`
        }
    } catch (err: any) {
        if (err.message?.startsWith('Resend Error')) throw err
        console.error('[Email] ❌ Network error:', err.message)
        throw new Error(`Email delivery failed: ${err.message}`)
    }
}
