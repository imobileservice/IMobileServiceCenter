import PDFDocument from 'pdfkit'

interface OrderItem {
    product_name: string
    quantity: number
    price: number
}

interface Order {
    id: string
    order_number: string
    created_at: string
    customer_name: string
    customer_email: string
    customer_phone?: string
    shipping_address: string
    payment_method: string
    status: string
    subtotal: number
    shipping: number
    tax: number
    total: number
}

export const generateInvoicePDF = (order: Order, items: OrderItem[]): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50, size: 'A4' })
        const buffers: Buffer[] = []

        doc.on('data', buffers.push.bind(buffers))
        doc.on('end', () => {
            const pdfData = Buffer.concat(buffers)
            resolve(pdfData)
        })
        doc.on('error', (err) => {
            reject(err)
        })

        // Header
        doc
            .fontSize(20)
            .text('IMobile Service Center', 50, 50)
            .fontSize(10)
            .text('Your trusted partner for mobile services', 50, 75)
            .moveDown()

        // Invoice Title
        doc
            .fontSize(25)
            .text('INVOICE', 50, 120, { align: 'right' })
            .fontSize(10)
            .text(`Order #${order.order_number}`, 50, 150, { align: 'right' })
            .text(`Date: ${new Date(order.created_at).toLocaleDateString()}`, 50, 165, { align: 'right' })

        // Customer Details
        doc
            .fontSize(12)
            .text('Bill To:', 50, 160)
            .fontSize(10)
            .text(order.customer_name, 50, 180)
            .text(order.customer_email, 50, 195)
            .text(order.customer_phone || '', 50, 210)
            .text(order.shipping_address, 50, 225, { width: 250 })

        // Order Details
        doc
            .fontSize(12)
            .text('Order Information:', 350, 160)
            .fontSize(10)
            .text(`Payment Method: ${order.payment_method === 'cash_on_delivery' ? 'Cash on Delivery' : order.payment_method}`, 350, 180)
            .text(`Status: ${order.status?.toUpperCase() || 'PENDING'}`, 350, 195)

        // Divider
        doc
            .moveDown(4)
            .moveTo(50, 280)
            .lineTo(550, 280)
            .strokeColor('#aaaaaa')
            .stroke()

        // Table Header
        const tableTop = 300
        doc
            .font('Helvetica-Bold')
            .fontSize(10)
            .text('Item', 50, tableTop)
            .text('Quantity', 300, tableTop, { width: 90, align: 'right' })
            .text('Price', 400, tableTop, { width: 90, align: 'right' })
            .text('Total', 500, tableTop, { width: 50, align: 'right' })
            .moveDown()
            .font('Helvetica')

        // Table Items
        let y = tableTop + 25
        items.forEach((item) => {
            const itemTotal = Number(item.price) * item.quantity

            doc
                .text(item.product_name, 50, y, { width: 250 })
                .text(item.quantity.toString(), 300, y, { width: 90, align: 'right' })
                .text(formatCurrency(Number(item.price)), 400, y, { width: 90, align: 'right' })
                .text(formatCurrency(itemTotal), 500, y, { width: 50, align: 'right' })

            y += 20
        })

        // Divider
        doc
            .moveDown()
            .moveTo(50, y + 10)
            .lineTo(550, y + 10)
            .strokeColor('#aaaaaa')
            .stroke()

        // Summary
        y += 30
        const summaryX = 400

        doc
            .text('Subtotal:', summaryX, y)
            .text(formatCurrency(Number(order.subtotal)), 500, y, { width: 50, align: 'right' })

        y += 15
        doc
            .text('Shipping:', summaryX, y)
            .text(formatCurrency(Number(order.shipping)), 500, y, { width: 50, align: 'right' })

        y += 15
        doc
            .font('Helvetica-Bold')
            .fontSize(12)
            .text('Total:', summaryX, y)
            .text(formatCurrency(Number(order.total)), 500, y, { width: 50, align: 'right' })

        // Footer
        doc
            .fontSize(10)
            .font('Helvetica')
            .text('Thank you for your order!', 50, 700, { align: 'center', width: 500 })
            .text('If you have any questions, please contact us at support@imobile.com', 50, 715, { align: 'center', width: 500 })

        doc.end()
    })
}

// Helper for currency formatting
const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-LK', {
        style: 'currency',
        currency: 'LKR',
    }).format(amount)
}
