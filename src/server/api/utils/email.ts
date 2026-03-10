import nodemailer from 'nodemailer'

const getTransport = () => {
    // Gmail usually works better on 587 with STARTTLS in cloud environments
    const port = Number(process.env.SMTP_PORT) || 587
    const secure = port === 465

    console.log('[Email] Configuring transport:', {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port,
        secure,
        user: process.env.SMTP_USER ? `${process.env.SMTP_USER.substring(0, 5)}...` : 'NOT SET'
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
            rejectUnauthorized: false, // Helps some handshake issues
            minVersion: 'TLSv1.2'
        },
        connectionTimeout: 20000,
        greetingTimeout: 20000,
        socketTimeout: 30000,
        // family: 4 forces DNS resolution to prioritize IPv4
        // We also pass it in connection options for some environments
        family: 4
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

