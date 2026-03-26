import { generateInvoicePDF } from '../utils/invoice-generator'
import { sendEmail } from '../utils/email'

export const invoiceService = {
    /**
     * Generates a PDF invoice and emails it to the customer.
     * @param order The order object (must contain customer_email, order_number, etc.)
     * @param items The array of order items
     * @param recipientEmail Optional recipient email address (falls back to order.customer_email)
     */
    async sendInvoice(order: any, items: any[], recipientEmail?: string) {
        console.log(`[InvoiceService] Processing invoice for order #${order.order_number}`)

        const toEmail = recipientEmail || order.customer_email;

        // Map items for generator if needed, or use as is if they match the interface
        // The generator expects: { product_name, quantity, price }
        const invoiceItems = items.map((item: any) => ({
            product_name: item.product_name || item.name || 'Product',
            quantity: item.quantity,
            price: item.price || item.product_price || 0
        }))

        try {
            console.log('[InvoiceService] Generating PDF...')
            const pdfBuffer = await generateInvoicePDF(order, invoiceItems)
            console.log('[InvoiceService] PDF generated.')

            console.log(`[InvoiceService] Sending email to ${toEmail}...`)
            const info = await sendEmail({
                to: toEmail,
                subject: `Your Invoice for Order #${order.order_number}`,
                html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #333;">Thank you for your order!</h2>
          <p>Hi <strong>${order.customer_name}</strong>,</p>
          <p>We've received your order <strong>#${order.order_number}</strong> placed on ${new Date(order.created_at).toLocaleDateString()}.</p>
          <p>Your official invoice is attached to this email as a PDF.</p>
          <div style="background-color: #f9f9f9; padding: 15px; margin: 20px 0; border-radius: 5px;">
            <p style="margin: 0;"><strong>Total Amount:</strong> ${formatCurrency(Number(order.total))}</p>
            <p style="margin: 5px 0 0;"><strong>Status:</strong> ${order.status?.toUpperCase() || 'PENDING'}</p>
          </div>
          <p>If you have any questions, please contact us.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">IMobile Service Center</p>
        </div>
      `,
                attachments: [
                    {
                        filename: `invoice-${order.order_number}.pdf`,
                        content: pdfBuffer,
                        contentType: 'application/pdf'
                    }
                ]
            })
            console.log('[InvoiceService] Email sent successfully.')
            return { success: true }
        } catch (error: any) {
            console.error('[InvoiceService] Failed to send invoice:', error)
            throw error
        }
    }
}

// Helper for currency formatting in email
function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-LK', {
        style: 'currency',
        currency: 'LKR',
    }).format(amount)
}
