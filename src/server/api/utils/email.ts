import nodemailer from 'nodemailer' // Updated for Railway Redeployment
import dns from 'dns'

const getTransport = async () => {
    const host = process.env.SMTP_HOST
    const portStr = process.env.SMTP_PORT
    const user = process.env.SMTP_USER
    const pass = process.env.SMTP_PASS

    // Fail loudly if SMTP is not configured - prevents silent failures
    if (!host || !user || !pass) {
        const missing = [!host && 'SMTP_HOST', !user && 'SMTP_USER', !pass && 'SMTP_PASS'].filter(Boolean).join(', ')
        throw new Error(`[Email] SMTP not configured. Missing environment variables: ${missing}. Check your .env file or Railway environment variables.`)
    }

    const port = parseInt(portStr || '587')
    const secure = port === 465 // true for SSL (465), false for STARTTLS (587)

    console.log(`[Email] Configuring SMTP: host=${host}, port=${port}, secure=${secure}, user=${user}`)

    // FORCE IPv4: Manually resolve hostname to avoid IPv6 connectivity issues
    let resolvedHost = host
    try {
        const addresses = await new Promise<string[]>((resolve, reject) => {
            dns.resolve4(host, (err, addresses) => {
                if (err || !addresses.length) reject(err || new Error('No IPv4 addresses found'))
                else resolve(addresses)
            })
        })
        resolvedHost = addresses[0]
        console.log(`[Email] Resolved ${host} → IPv4: ${resolvedHost}`)
    } catch (dnsError: any) {
        console.warn(`[Email] DNS resolve4 failed for ${host}: ${dnsError.message}. Using original hostname.`)
    }

    return nodemailer.createTransport({
        host: resolvedHost,
        port,
        secure,
        auth: { user, pass },
        tls: {
            rejectUnauthorized: false,
            minVersion: 'TLSv1.2',
            servername: host  // Use original hostname for SNI (not the resolved IP)
        },
        connectionTimeout: 30000,
        greetingTimeout: 30000,
        socketTimeout: 60000,
        family: 4,
        lookup: (hostname: string, options: any, callback: any) => {
            dns.lookup(hostname, { family: 4 }, callback)
        },
        debug: process.env.NODE_ENV !== 'production',
        logger: process.env.NODE_ENV !== 'production',
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
    const transport = await getTransport()

    const from = process.env.SMTP_FROM || `IMobile Service & Repair Center <no-reply@imobileservicecenter.lk>`
    console.log(`[Email] Sending to: ${to} | Subject: ${subject} | From: ${from}`)

    // Verify SMTP connection before sending - catches auth/connection errors early
    try {
        await transport.verify()
        console.log('[Email] ✅ SMTP connection verified successfully')
    } catch (verifyError: any) {
        console.error('[Email] ❌ SMTP connection FAILED during verify:', verifyError.message)
        console.error('[Email] Check: 1) SMTP_PASS is correct/not expired, 2) SMTP_HOST and SMTP_PORT are right, 3) Sender is verified in Brevo')
        throw new Error(`SMTP connection failed: ${verifyError.message}`)
    }

    const info = await transport.sendMail({
        from,
        to,
        subject,
        text,
        html,
        attachments,
    })

    console.log(`[Email] ✅ Message sent! ID: ${info.messageId} | Response: ${info.response}`)
    return info
}

