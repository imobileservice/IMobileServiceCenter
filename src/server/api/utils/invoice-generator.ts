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
        const itemX = 50
        const qtyX = 300
        const priceX = 380
        const totalX = 480
        
        doc
            .font('Helvetica-Bold')
            .fontSize(10)
            .text('Item', itemX, tableTop)
            .text('Qty', qtyX, tableTop, { width: 40, align: 'center' })
            .text('Price', priceX, tableTop, { width: 90, align: 'right' })
            .text('Total', totalX, tableTop, { width: 70, align: 'right' })
            .moveDown()
            .font('Helvetica')

        // Table Items
        let y = tableTop + 25
        items.forEach((item) => {
            const itemTotal = Number(item.price) * item.quantity
            
            // Calculate how many lines the product name will take to adjust Y for the next item
            const nameWidth = qtyX - itemX - 10
            const nameHeight = doc.heightOfString(item.product_name, { width: nameWidth })
            
            doc
                .fontSize(9)
                .text(item.product_name, itemX, y, { width: nameWidth })
                .text(item.quantity.toString(), qtyX, y, { width: 40, align: 'center' })
                .text(formatCurrency(Number(item.price)), priceX, y, { width: 90, align: 'right' })
                .text(formatCurrency(itemTotal), totalX, y, { width: 70, align: 'right' })

            y += Math.max(nameHeight + 10, 25)
            
            // Add a very subtle line between items if there's enough space
            if (y < 650) {
                doc
                    .moveTo(50, y - 5)
                    .lineTo(550, y - 5)
                    .strokeColor('#eeeeee')
                    .lineWidth(0.5)
                    .stroke()
            }
        })

        // Summary
        y += 20
        const summaryWidth = 150
        const labelX = 350
        const valueX = 450
        const valueWidth = 100

        doc
            .fontSize(10)
            .font('Helvetica')
            .text('Subtotal:', labelX, y)
            .text(formatCurrency(Number(order.subtotal)), valueX, y, { width: valueWidth, align: 'right' })

        y += 20
        doc
            .text('Shipping:', labelX, y)
            .text(formatCurrency(Number(order.shipping)), valueX, y, { width: valueWidth, align: 'right' })

        y += 25
        doc
            .font('Helvetica-Bold')
            .fontSize(12)
            .text('Total:', labelX, y)
            .fillColor('#000000')
            .text(formatCurrency(Number(order.total)), valueX, y, { width: valueWidth, align: 'right' })

        // Footer
        doc
            .fillColor('#444444')
            .fontSize(10)
            .font('Helvetica')
            .text('Thank you for your business!', 50, 700, { align: 'center', width: 500 })
            .fontSize(8)
            .text('IMobile Service Center - Your trusted partner for mobile services', 50, 715, { align: 'center', width: 500 })
            .text('If you have any questions about this invoice, please contact us.', 50, 728, { align: 'center', width: 500 })

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
