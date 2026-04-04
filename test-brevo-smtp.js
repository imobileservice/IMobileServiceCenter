const nodemailer = require('nodemailer');

const host = 'smtp-relay.brevo.com';
const port = 587;
const user = 'a717f1001@smtp-brevo.com';
const pass = 'xsmtpsib-3cbad6989da25b9eb6d4a986ed654c04edbe2493dfda4d83dc8867c35ef36c5c-PIlYPEauNrXA2hlk';

const transport = nodemailer.createTransport({
    host,
    port,
    secure: false, // true for 465, false for 587
    auth: { user, pass },
    tls: {
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2',
        servername: host
    },
    debug: true,
    logger: true
});

transport.verify()
    .then(() => console.log('✅ SMTP connection verified successfully'))
    .catch(err => console.error('❌ SMTP connection FAILED:', err.message));
