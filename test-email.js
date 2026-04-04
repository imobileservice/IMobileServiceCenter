require('dotenv').config();
const { sendEmail } = require('./src/server/api/utils/email');

async function test() {
    try {
        console.log('Testing email sending...');
        const res = await sendEmail({
            to: 'kalhanadeshan@gmail.com', // Using a test email
            subject: 'Test Email',
            text: 'This is a test'
        });
        console.log('Success:', res);
    } catch (err) {
        console.error('Failed to send email:', err);
    }
}

test();
