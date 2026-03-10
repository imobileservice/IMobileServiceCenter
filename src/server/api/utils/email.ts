import nodemailer from 'nodemailer'

const getTransport = () => {
    const port = Number(process.env.SMTP_PORT) || 587
    const secure = port === 465 // true for SSL (465), false for STARTTLS (587)

    console.log('[Email] Creating transport:', {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port,
        secure,
        user: process.env.SMTP_USER ? `${process.env.SMTP_USER.substring(0, 5)}...` : 'NOT SET',
        passSet: !!process.env.SMTP_PASS
    })

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port,
        secure,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
        tls: {
            rejectUnauthorized: false,
            // Removed 'ciphers: SSLv3' - was breaking TLS on modern servers
        },
        connectionTimeout: 15000, // 15 seconds
        greetingTimeout: 10000,
        socketTimeout: 20000,
        family: 4 // Force IPv4
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
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.error('[Email] SMTP credentials not configured! SMTP_USER or SMTP_PASS env var is missing.')
        throw new Error('Email service not configured: Missing SMTP credentials')
    }

    const from = process.env.SMTP_FROM || `"IMobile Service Center" <${process.env.SMTP_USER}>`
    const transport = getTransport()

    // Verify connection before sending
    try {
        await transport.verify()
        console.log('[Email] SMTP connection verified successfully')
    } catch (verifyError: any) {
        console.error('[Email] SMTP connection verification failed:', verifyError.message)
        throw new Error(`Email service connection failed: ${verifyError.message}`)
    }

    console.log(`[Email] Sending email to: ${to}, subject: ${subject}`)
    const info = await transport.sendMail({
        from,
        to,
        subject,
        text,
        html,
        attachments,
    })

    console.log('[Email] Message sent successfully! ID:', info.messageId, '| Response:', info.response)
    return info
}

