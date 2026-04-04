/**
 * Brevo SMTP Diagnostic Test
 * Run: node test-brevo-smtp.js
 * 
 * This tests your Brevo SMTP credentials and sends a real test email.
 */

require('dotenv').config()
const nodemailer = require('nodemailer')
const dns = require('dns')

const SMTP_HOST = process.env.SMTP_HOST || 'smtp-relay.brevo.com'
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587')
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS
const SMTP_FROM = process.env.SMTP_FROM || 'IMobile Service & Repair Center <no-reply@imobileservicecenter.lk>'

// Send to this email for testing (change to your own email)
const TEST_RECIPIENT = process.argv[2] || SMTP_USER

async function runDiagnostics() {
    console.log('\n🔍 Brevo SMTP Diagnostics\n' + '='.repeat(50))

    // 1. Check env vars
    console.log('\n📋 Step 1: Checking Environment Variables')
    console.log(`  SMTP_HOST:  ${SMTP_HOST || '❌ MISSING'}`)
    console.log(`  SMTP_PORT:  ${SMTP_PORT}`)
    console.log(`  SMTP_USER:  ${SMTP_USER || '❌ MISSING'}`)
    console.log(`  SMTP_PASS:  ${SMTP_PASS ? `✅ Set (${SMTP_PASS.length} chars)` : '❌ MISSING'}`)
    console.log(`  SMTP_FROM:  ${SMTP_FROM}`)
    console.log(`  Test mail → ${TEST_RECIPIENT}`)

    if (!SMTP_USER || !SMTP_PASS) {
        console.error('\n❌ CRITICAL: SMTP_USER or SMTP_PASS is missing from .env file!')
        console.error('  Add to .env:')
        console.error('    SMTP_HOST=smtp-relay.brevo.com')
        console.error('    SMTP_PORT=587')
        console.error('    SMTP_USER=<your-brevo-login>@smtp-brevo.com')
        console.error('    SMTP_PASS=<your-brevo-smtp-key>')
        process.exit(1)
    }

    // 2. DNS Resolution
    console.log('\n📋 Step 2: DNS Resolution (IPv4)')
    try {
        const addresses = await new Promise((resolve, reject) => {
            dns.resolve4(SMTP_HOST, (err, addrs) => err ? reject(err) : resolve(addrs))
        })
        console.log(`  ✅ ${SMTP_HOST} → ${addresses.join(', ')}`)
    } catch (err) {
        console.error(`  ❌ DNS failed: ${err.message}`)
        console.error('  Check your internet connection or firewall.')
    }

    // 3. Create transport
    console.log('\n📋 Step 3: Creating SMTP Transport')
    const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
        tls: {
            rejectUnauthorized: false,
            minVersion: 'TLSv1.2',
            servername: SMTP_HOST,
        },
        connectionTimeout: 30000,
        greetingTimeout: 30000,
        family: 4,
    })
    console.log(`  Transport created: host=${SMTP_HOST}, port=${SMTP_PORT}, secure=${SMTP_PORT === 465}`)

    // 4. Verify connection
    console.log('\n📋 Step 4: Verifying SMTP Connection (will authenticate)')
    try {
        await transporter.verify()
        console.log('  ✅ SMTP connection verified! Authentication successful.')
    } catch (err) {
        console.error(`  ❌ SMTP verify FAILED: ${err.message}`)
        console.error('\n🔧 Possible fixes:')
        console.error('  1. SMTP key expired/revoked → Regenerate at brevo.com → SMTP & API')
        console.error('  2. Wrong SMTP_USER → Should end in @smtp-brevo.com')
        console.error('  3. Port 587 blocked → Try port 465 (change SMTP_PORT=465 in .env)')
        console.error('  4. Firewall blocking outbound port 587 → Contact your ISP/VPS provider')
        process.exit(1)
    }

    // 5. Send test email
    console.log(`\n📋 Step 5: Sending Test Email to ${TEST_RECIPIENT}`)
    try {
        const info = await transporter.sendMail({
            from: SMTP_FROM,
            to: TEST_RECIPIENT,
            subject: '✅ IMobile SMTP Test - Brevo Working!',
            text: `Brevo SMTP is working correctly!\n\nSent at: ${new Date().toISOString()}\nFrom: ${SMTP_FROM}`,
            html: `
                <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:30px;background:#f8fafc;border-radius:12px;">
                    <h2 style="color:#3b82f6;margin-top:0;">✅ IMobile SMTP Test</h2>
                    <p style="color:#374151;">Brevo SMTP is configured correctly and working!</p>
                    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:20px 0;">
                        <strong>Config details:</strong><br>
                        Host: ${SMTP_HOST}:${SMTP_PORT}<br>
                        User: ${SMTP_USER}<br>
                        From: ${SMTP_FROM}<br>
                        Sent: ${new Date().toISOString()}
                    </div>
                    <p style="color:#6b7280;font-size:12px;">If you received this email, OTP delivery is working correctly.</p>
                </div>
            `
        })
        console.log(`  ✅ Email sent! Message ID: ${info.messageId}`)
        console.log(`  Response: ${info.response}`)
        console.log(`\n🎉 SUCCESS! Brevo SMTP is working. Check ${TEST_RECIPIENT} for the test email.`)
    } catch (err) {
        console.error(`  ❌ Send FAILED: ${err.message}`)
        if (err.code === 'EENVELOPE') {
            console.error('\n  The FROM address is not verified in Brevo!')
            console.error('  Go to brevo.com → Senders, domains, IPs → verify your sender email')
        }
    }

    console.log('\n' + '='.repeat(50) + '\n')
}

runDiagnostics().catch(console.error)
