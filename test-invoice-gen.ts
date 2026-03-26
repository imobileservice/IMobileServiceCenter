
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { generateInvoicePDF } from './src/server/api/utils/invoice-generator'
import { sendEmail } from './src/server/api/utils/email'

// Load env vars
dotenv.config()

const testInvoice = async () => {
    console.log('Testing Invoice Generation...')

    const mockOrder = {
        id: 'test-order-id',
        order_number: 'ORD-TEST-12345',
        created_at: new Date().toISOString(),
        customer_name: 'Test Customer',
        customer_email: process.env.SMTP_USER || 'deerlanfashion@gmail.com', // Send to self
        customer_phone: '0771234567',
        shipping_address: '123 Test St, Colombo, Sri Lanka',
        payment_method: 'credit_card',
        status: 'completed',
        subtotal: 5000,
        shipping: 500,
        tax: 0,
        total: 5500
    }

    const mockItems = [
        {
            product_name: 'iPhone 15 Pro Case',
            quantity: 2,
            price: 1500
        },
        {
            product_name: 'Screen Protector',
            quantity: 1,
            price: 2000
        }
    ]

    try {
        // 1. Generate PDF
        console.log('Generating PDF...')
        const pdfBuffer = await generateInvoicePDF(mockOrder, mockItems)
        console.log('PDF generated, size:', pdfBuffer.length, 'bytes')

        // 2. Save locally for inspection (optional)
        fs.writeFileSync('test-invoice.pdf', pdfBuffer)
        console.log('Saved to test-invoice.pdf')

        // 3. Send Email
        console.log('Sending email to:', mockOrder.customer_email)
        await sendEmail({
            to: mockOrder.customer_email,
            subject: 'Test Invoice #' + mockOrder.order_number,
            html: '<p>This is a test invoice.</p>',
            attachments: [
                {
                    filename: `invoice-${mockOrder.order_number}.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf'
                }
            ]
        })
        console.log('Email sent successfully!')

    } catch (error) {
        console.error('Test failed:', error)
    }
}

testInvoice()
