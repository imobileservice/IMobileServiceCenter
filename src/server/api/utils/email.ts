import nodemailer from 'nodemailer'
import dns from 'dns'

const getTransport = async () => {
    // Read SMTP Settings from envor fallback
    const host = process.env.SMTP_HOST || 'smtp.resend.com'
    const port = parseInt(process.env.SMTP_PORT || '465') // Use 465 for SSL/TLS, 587 for STARTTLS
    const secure = port === 465 // true for 465, false for other ports
    const user = process.env.SMTP_USER || 'resend' 
    const pass = process.env.SMTP_PASS || 're_3xuwxa4h_NfsCkF8p26UdRvigiMk2eW4Y'

    console.log(`[Email] Configuring SMTP Transport for ${host}:${port}`)

    // FORCE IPv4: Manually resolve hostname to an IPv4 address (especially needed for Resend, optional for Gmail)
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
        console.warn(`[Email] DNS Resolve failed for ${host}: ${dnsError.message}.`)
    }

    return nodemailer.createTransport({
        host: resolvedHost,
        port,
        secure,
        auth: {
            user,
            pass,
        },
        tls: {
            rejectUnauthorized: false,
            minVersion: 'TLSv1.2',
            servername: host
        },
        connectionTimeout: 20000,
        greetingTimeout: 20000,
        socketTimeout: 45000,
        family: 4,
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
    const transport = await getTransport()
    
    // Domain is now verified on Resend!
    const from = process.env.SMTP_FROM || 'IMobile Service Center <info@imobileservicecenter.lk>'
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

