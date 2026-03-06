import nodemailer from 'nodemailer'

const getTransport = () => {
    const port = Number(process.env.SMTP_PORT) || 587
    const secure = port === 465 // true for 465, false for other ports

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port,
        secure,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
        // Resilience settings for Gmail/serverless
        tls: {
            rejectUnauthorized: false, // Fixes some self-signed cert issues
            ciphers: 'SSLv3'
        },
        connectionTimeout: 10000, // 10 seconds
        family: 4 // Force IPv4 (fixes many Gmail resolution issues)
    } as any)
}

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
    const from = process.env.SMTP_FROM || '"IMobile Service Center" <noreply@imobile.com>'

    const info = await getTransport().sendMail({
        from,
        to,
        subject,
        text,
        html,
        attachments,
    })

    console.log('[Email] Message sent: %s', info.messageId)
    return info
}
