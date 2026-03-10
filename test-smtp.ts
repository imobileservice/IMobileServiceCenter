import nodemailer from 'nodemailer';
import dns from 'dns';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

async function testSMTP() {
    console.log('--- SMTP Diagnostic Tool ---');

    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = Number(process.env.SMTP_PORT) || 587;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM;

    console.log('Config:', {
        host,
        port,
        user: user ? '***' : 'NOT SET',
        pass: pass ? '***' : 'NOT SET',
        from: from || 'NOT SET'
    });

    if (!user || !pass) {
        console.error('ERROR: Missing credentials');
        return;
    }

    const transport = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        tls: {
            rejectUnauthorized: false,
            minVersion: 'TLSv1.2'
        },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 30000,
        family: 4
    } as any);

    try {
        console.log('Verifying connection...');
        await transport.verify();
        console.log('SUCCESS: Connection verified');

        console.log('Sending test email to the user...');
        const result = await transport.sendMail({
            from: from || user,
            to: user, // Send to self for test
            subject: 'SMTP Diagnostic Test - IMobile',
            text: 'This is a diagnostic test to verify SMTP connectivity and configuration.',
            html: '<b>Diagnostic test successful!</b>'
        });
        console.log('SUCCESS: Test email sent');
        console.log('Message ID:', result.messageId);
        console.log('Response:', result.response);
    } catch (err: any) {
        console.error('FAILED:', err.message);
        if (err.code) console.error('Code:', err.code);
        if (err.command) console.error('Command:', err.command);
        if (err.response) console.error('Response:', err.response);
        if (err.stack) console.error('Stack:', err.stack);
    }
}

testSMTP();
