/**
 * Utility functions for WhatsApp integration (FREE method - no API needed)
 * Uses WhatsApp web links to send messages
 */

/**
 * Get the site URL for creating absolute links
 */
export function getSiteUrl(): string {
  // Try environment variables first
  const envUrl = import.meta.env.VITE_SITE_URL || import.meta.env.NEXT_PUBLIC_SITE_URL
  if (envUrl) {
    return envUrl.startsWith('http') ? envUrl : `https://${envUrl}`
  }

  // Fallback to current origin
  if (typeof window !== 'undefined') {
    return window.location.origin
  }

  return 'https://yourwebsite.com' // Fallback
}

/**
 * Format phone number for WhatsApp (removes spaces, dashes, etc.)
 * @param phone - Phone number (can include +, spaces, dashes)
 * @returns Formatted phone number
 */
export function formatPhoneForWhatsApp(phone: string): string {
  if (!phone) return ''
  
  // Remove all spaces, dashes, parentheses, and other non-digit characters except +
  let formatted = phone.replace(/[^\d+]/g, '')
  
  // If doesn't start with +, add country code (default to Sri Lanka +94)
  if (!formatted.startsWith('+')) {
    // Remove leading 0 if present (Sri Lankan format)
    if (formatted.startsWith('0')) {
      formatted = formatted.substring(1)
    }
    formatted = `+94${formatted}`
  }
  
  return formatted
}

/**
 * Send invoice via WhatsApp (FREE method)
 * Opens WhatsApp web/app with pre-filled message containing invoice link
 * 
 * @param orderId - Order ID (UUID)
 * @param customerPhone - Customer's phone number
 * @param orderNumber - Order number (for display)
 */
export function sendInvoiceToWhatsApp(orderId: string, customerPhone: string, orderNumber?: string): void {
  if (!orderId || !customerPhone) {
    console.error('Order ID and customer phone are required')
    return
  }

  const siteUrl = getSiteUrl()
  const invoiceUrl = `${siteUrl}/invoice/${orderId}`
  const formattedPhone = formatPhoneForWhatsApp(customerPhone)

  const message = `Thank you for your order!${orderNumber ? `\n\nOrder Number: ${orderNumber}` : ''}\n\nYour Invoice:\n${invoiceUrl}\n\nIf you have any questions, please contact us.`

  // Create WhatsApp URL
  const whatsappUrl = `https://wa.me/${formattedPhone.replace('+', '')}?text=${encodeURIComponent(message)}`
  
  // Open WhatsApp in new tab/window
  window.open(whatsappUrl, '_blank')
}

