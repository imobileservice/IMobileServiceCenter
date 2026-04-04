/**
 * Brevo REST API Email Service
 * 
 * Uses HTTPS (port 443) instead of SMTP ports (587/465/2525)
 * to bypass Railway's outbound SMTP port blocking.
 * 
 * Required env variable: BREVO_API_KEY (starts with 'xkeysib-')
 * Fallback env variable: SMTP_PASS (for backward compatibility)
 */

export const sendEmail = async ({
    to,
    subject,
    text,
    html,
    attachments,
}: {
    to: string
    subject: string
    text?: string
    html?: string
    attachments?: Array<{
        filename: string
        content: Buffer | string
        contentType?: string
    }>
}) => {
    // Prefer BREVO_API_KEY, fall back to SMTP_PASS for backward compatibility
    const apiKey = process.env.BREVO_API_KEY || process.env.SMTP_PASS

    const fromEmail = process.env.SMTP_FROM_EMAIL || 'no-reply@imobileservicecenter.lk'
    const fromName = process.env.SMTP_FROM_NAME || 'IMobile Service & Repair Center'

    if (!apiKey) {
        throw new Error('[Email] Missing BREVO_API_KEY environment variable. Get one from https://app.brevo.com → SMTP & API → API Keys')
    }

    console.log(`[Email] Sending via Brevo REST API to: ${to} | Subject: ${subject}`)
    console.log(`[Email] From: ${fromName} <${fromEmail}>`)
    console.log(`[Email] API Key prefix: ${apiKey.substring(0, 12)}...`)

    // Format attachments for Brevo API if present
    const formattedAttachments = attachments?.map(att => ({
        content: typeof att.content === 'string'
            ? Buffer.from(att.content).toString('base64')
            : att.content.toString('base64'),
        name: att.filename
    }))

    const payload: any = {
        sender: {
            name: fromName,
            email: fromEmail
        },
        to: [{ email: to }],
        subject: subject,
    }

    // Add content - at least one must be present
    if (html) payload.htmlContent = html
    if (text) payload.textContent = text
    if (!html && !text) payload.textContent = subject // fallback

    if (formattedAttachments?.length) {
        payload.attachment = formattedAttachments
    }

    try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': apiKey,
                'content-type': 'application/json'
            },
            body: JSON.stringify(payload)
        })

        const data = await response.json()

        if (!response.ok) {
            console.error('[Email] ❌ Brevo API Error Response:', JSON.stringify(data))
            console.error(`[Email] Status: ${response.status} ${response.statusText}`)
            throw new Error(`Brevo API Error (${response.status}): ${data.message || data.code || response.statusText}`)
        }

        console.log(`[Email] ✅ Email sent successfully! Message ID: ${data.messageId}`)
        return {
            messageId: data.messageId,
            response: `Brevo API OK (${response.status})`
        }
    } catch (fetchError: any) {
        // If it's already our formatted error, re-throw
        if (fetchError.message?.startsWith('Brevo API Error')) {
            throw fetchError
        }
        // Network-level errors
        console.error('[Email] ❌ Network error calling Brevo API:', fetchError.message)
        throw new Error(`Email delivery failed (network): ${fetchError.message}`)
    }
}
