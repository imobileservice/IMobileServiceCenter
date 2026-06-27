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

export const generateDeliveryBillPDF = (order: Order, items: OrderItem[]): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 42, size: 'A4' })
        const buffers: Buffer[] = []

        doc.on('data', buffers.push.bind(buffers))
        doc.on('end', () => resolve(Buffer.concat(buffers)))
        doc.on('error', reject)

        const orderNumber = order.order_number || order.id
        const paymentMethod = order.payment_method === 'cash_on_delivery'
            ? 'Cash on Delivery'
            : (order.payment_method || 'N/A').replace(/_/g, ' ')

        doc
            .font('Helvetica-Bold')
            .fontSize(22)
            .text('IMobile Service Center', 42, 42)
            .fontSize(18)
            .text('DELIVERY BILL', 42, 42, { align: 'right' })

        doc
            .font('Helvetica')
            .fontSize(10)
            .text(`Order #${orderNumber}`, 42, 75, { align: 'right' })
            .text(`Date: ${new Date(order.created_at).toLocaleString()}`, 42, 90, { align: 'right' })
            .moveTo(42, 118)
            .lineTo(553, 118)
            .strokeColor('#cccccc')
            .stroke()

        doc
            .font('Helvetica-Bold')
            .fontSize(12)
            .fillColor('#000000')
            .text('Deliver To', 42, 140)
            .font('Helvetica')
            .fontSize(10)
            .text(order.customer_name || 'Website Customer', 42, 162)
            .text(order.customer_phone || '', 42, 178)
            .text(order.customer_email || '', 42, 194)
            .text(order.shipping_address || 'No shipping address', 42, 214, { width: 260 })

        doc
            .font('Helvetica-Bold')
            .fontSize(12)
            .text('Payment', 360, 140)
            .font('Helvetica')
            .fontSize(10)
            .text(paymentMethod, 360, 162)
            .text(`Status: ${(order.status || 'pending').toUpperCase()}`, 360, 178)
            .font('Helvetica-Bold')
            .fontSize(16)
            .text(`Collect: ${formatCurrency(Number(order.total || 0))}`, 360, 210)

        const tableTop = 285
        const itemX = 42
        const qtyX = 355
        const priceX = 425
        const totalX = 500

        doc
            .moveTo(42, tableTop - 15)
            .lineTo(553, tableTop - 15)
            .strokeColor('#cccccc')
            .stroke()
            .font('Helvetica-Bold')
            .fontSize(10)
            .text('Product', itemX, tableTop)
            .text('Qty', qtyX, tableTop, { width: 40, align: 'center' })
            .text('Price', priceX, tableTop, { width: 65, align: 'right' })
            .text('Total', totalX, tableTop, { width: 53, align: 'right' })

        let y = tableTop + 24
        doc.font('Helvetica').fontSize(9)
        items.forEach((item, index) => {
            const itemTotal = Number(item.price || 0) * Number(item.quantity || 0)
            const nameHeight = doc.heightOfString(item.product_name, { width: qtyX - itemX - 16 })

            doc
                .font('Helvetica')
                .text(`${index + 1}. ${item.product_name}`, itemX, y, { width: qtyX - itemX - 16 })
                .text(String(item.quantity), qtyX, y, { width: 40, align: 'center' })
                .text(formatCurrency(Number(item.price || 0)), priceX, y, { width: 65, align: 'right' })
                .text(formatCurrency(itemTotal), totalX, y, { width: 53, align: 'right' })

            y += Math.max(nameHeight + 12, 28)
            doc.moveTo(42, y - 6).lineTo(553, y - 6).strokeColor('#eeeeee').lineWidth(0.5).stroke()
        })

        y += 18
        doc
            .font('Helvetica')
            .fontSize(10)
            .text('Subtotal', 370, y)
            .text(formatCurrency(Number(order.subtotal || 0)), 455, y, { width: 98, align: 'right' })
            .text('Shipping', 370, y + 18)
            .text(formatCurrency(Number(order.shipping || 0)), 455, y + 18, { width: 98, align: 'right' })
            .font('Helvetica-Bold')
            .fontSize(13)
            .text('Total', 370, y + 42)
            .text(formatCurrency(Number(order.total || 0)), 455, y + 42, { width: 98, align: 'right' })

        doc
            .font('Helvetica')
            .fontSize(9)
            .fillColor('#444444')
            .text('Delivery confirmation', 42, 690)
            .moveTo(42, 730)
            .lineTo(250, 730)
            .strokeColor('#999999')
            .stroke()
            .text('Customer signature', 42, 738)
            .moveTo(340, 730)
            .lineTo(553, 730)
            .stroke()
            .text('Delivered by', 340, 738)

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
