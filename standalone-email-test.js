const nodemailer = require('nodemailer');
require('dotenv').config();

async function testEmail() {
    console.log('--- Email Connection Test ---');
    console.log('Host:', process.env.SMTP_HOST);
    console.log('Port:', process.env.SMTP_PORT);
    console.log('User:', process.env.SMTP_USER);
    console.log('From:', process.env.SMTP_FROM);

    const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT),
        secure: process.env.SMTP_PORT === '465',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
        tls: {
            rejectUnauthorized: false
        }
    });

    try {
        console.log('Verifying connection...');
        await transport.verify();
        console.log('Connection Verified!');

        console.log('Sending test mail...');
        const info = await transport.sendMail({
            from: process.env.SMTP_FROM || 'IMobile <onboarding@resend.dev>',
            to: 'kalhanadeshan@gmail.com', // Change to your email for test
            subject: 'SMTP Connection Test',
            text: 'If you receive this, SMTP is working correctly.'
        });
        console.log('Message sent! ID:', info.messageId);
        console.log('Response:', info.response);
    } catch (err) {
        console.error('SMTP Error:', err);
    }
}

testEmail();
