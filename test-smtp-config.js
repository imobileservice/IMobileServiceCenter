/**
 * Test SMTP Configuration
 * This script tests if your Gmail SMTP settings are working correctly
 */

const nodemailer = require('nodemailer');

// Test with port 587 (STARTTLS)
async function testPort587() {
    console.log('\n🔍 Testing Gmail SMTP with Port 587 (STARTTLS)...\n');

    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
            user: 'dexlanka@gmail.com',
            pass: 'egny tnsm wwdr zeek',
        },
    });

    try {
        // Verify connection
        await transporter.verify();
        console.log('✅ Port 587 - Connection verified successfully!');

        // Send test email
        const info = await transporter.sendMail({
            from: '"IMobile Service Center" <dexlanka@gmail.com>',
            to: 'dexlanka@gmail.com', // Send to yourself for testing
            subject: 'Test Email - Port 587',
            text: 'This is a test email using port 587 with STARTTLS',
            html: '<b>This is a test email using port 587 with STARTTLS</b>',
        });

        console.log('✅ Port 587 - Email sent successfully!');
        console.log('   Message ID:', info.messageId);
        return true;
    } catch (error) {
        console.log('❌ Port 587 - Failed:', error.message);
        return false;
    }
}

// Test with port 465 (SSL)
async function testPort465() {
    console.log('\n🔍 Testing Gmail SMTP with Port 465 (SSL)...\n');

    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true, // true for 465, false for other ports
        auth: {
            user: 'dexlanka@gmail.com',
            pass: 'egny tnsm wwdr zeek',
        },
    });

    try {
        // Verify connection
        await transporter.verify();
        console.log('✅ Port 465 - Connection verified successfully!');

        // Send test email
        const info = await transporter.sendMail({
            from: '"IMobile Service Center" <dexlanka@gmail.com>',
            to: 'dexlanka@gmail.com', // Send to yourself for testing
            subject: 'Test Email - Port 465',
            text: 'This is a test email using port 465 with SSL',
            html: '<b>This is a test email using port 465 with SSL</b>',
        });

        console.log('✅ Port 465 - Email sent successfully!');
        console.log('   Message ID:', info.messageId);
        return true;
    } catch (error) {
        console.log('❌ Port 465 - Failed:', error.message);
        return false;
    }
}

// Run tests
async function runTests() {
    console.log('═══════════════════════════════════════════════');
    console.log('   SMTP Configuration Test');
    console.log('═══════════════════════════════════════════════');

    const port587Works = await testPort587();
    const port465Works = await testPort465();

    console.log('\n═══════════════════════════════════════════════');
    console.log('   Test Results Summary');
    console.log('═══════════════════════════════════════════════');
    console.log(`Port 587 (STARTTLS): ${port587Works ? '✅ WORKING' : '❌ FAILED'}`);
    console.log(`Port 465 (SSL):      ${port465Works ? '✅ WORKING' : '❌ FAILED'}`);

    console.log('\n📋 Recommended Supabase SMTP Settings:');
    if (port587Works) {
        console.log('\n✅ Use these settings in Supabase Dashboard:');
        console.log('   Host: smtp.gmail.com');
        console.log('   Port: 587');
        console.log('   Username: dexlanka@gmail.com');
        console.log('   Password: egny tnsm wwdr zeek');
        console.log('   Sender email: dexlanka@gmail.com');
        console.log('   Sender name: IMobile');
    } else if (port465Works) {
        console.log('\n✅ Use these settings in Supabase Dashboard:');
        console.log('   Host: smtp.gmail.com');
        console.log('   Port: 465');
        console.log('   Username: dexlanka@gmail.com');
        console.log('   Password: egny tnsm wwdr zeek');
        console.log('   Sender email: dexlanka@gmail.com');
        console.log('   Sender name: IMobile');
    } else {
        console.log('\n❌ Both ports failed. Please check:');
        console.log('   1. Gmail app password is correct');
        console.log('   2. 2-Step Verification is enabled in Gmail');
        console.log('   3. Internet connection is working');
    }

    console.log('\n═══════════════════════════════════════════════\n');
}

runTests().catch(console.error);
