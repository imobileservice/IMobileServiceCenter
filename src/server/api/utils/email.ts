import nodemailer from 'nodemailer'
import dns from 'dns'

const getTransport = async () => {
    // Port 587 with STARTTLS (secure: false) is the industry standard for cloud environments
    const port = Number(process.env.SMTP_PORT) || 587
    const secure = port === 465
    const host = process.env.SMTP_HOST || 'smtp.gmail.com'

    console.log('[Email] Configuring transport for host:', host)

    // FORCE IPv4: Manually resolve hostname to an IPv4 address
    // This is the "Nuclear Option" to fix Railway's IPv6 ENETUNREACH error
    let resolvedHost = host
    try {
        const addresses = await new Promise<string[]>((resolve, reject) => {
            dns.resolve4(host, (err, addresses) => {
                if (err || !addresses.length) reject(err || new Error('No IPv4 addresses found'))
                else resolve(addresses)
            })
        })
        resolvedHost = addresses[0]
        console.log(`[Email] Host ${host} resolved to IPv4: ${resolvedHost}`)
    } catch (dnsError: any) {
        console.warn(`[Email] DNS Resolve failed for ${host}: ${dnsError.message}. Falling back to hostname.`)
    }

    return nodemailer.createTransport({
        host: resolvedHost,
        port,
        secure,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
        tls: {
            rejectUnauthorized: false,
            minVersion: 'TLSv1.2',
            servername: host // Essential when connecting via IP address
        },
        connectionTimeout: 30000,
        greetingTimeout: 30000,
        socketTimeout: 60000,
        family: 4,
        // Override lookup again just to be safe
        lookup: (hostname: string, options: any, callback: any) => {
            dns.lookup(hostname, { family: 4 }, callback);
        },
        debug: true,
        logger: true
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

    const transport = await getTransport()
    const from = process.env.SMTP_FROM || `"IMobile Service Center" <${process.env.SMTP_USER}>`
    console.log('[Email] Using From Address:', from)
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

