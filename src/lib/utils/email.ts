import { getApiUrl } from './api'
import { toast } from 'sonner'

export async function sendInvoiceToEmail(orderId: string, email?: string) {
    try {
        const response = await fetch(getApiUrl(`/api/orders/${orderId}/send-invoice`), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email }),
        })

        if (!response.ok) {
            const error = await response.json()
            throw new Error(error.error || error.message || 'Failed to send email')
        }

        const data = await response.json()
        toast.success(data.message || 'Invoice sent to email!')
        return true
    } catch (error: any) {
        console.error('Failed to send invoice email:', error)
        toast.error(error.message || 'Failed to send invoice email')
        return false
    }
}
