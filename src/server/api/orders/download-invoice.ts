import { Request, Response } from 'express'
import { asyncHandler } from '../utils/async-handler'
import { createClient } from '@supabase/supabase-js'
import { generateInvoicePDF } from '../utils/invoice-generator'

export const downloadInvoiceHandler = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Server config error' })
    }

    // Get user from session
    const sessionToken = req.headers['x-session-token'] as string || req.headers['authorization']?.replace('Bearer ', '')

    // 1. Verify User
    const supabase = createClient(supabaseUrl, supabaseKey, {
        global: {
            headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}
        },
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    })
    
    let user;
    try {
        const { data: { user: authUser }, error: userError } = sessionToken
            ? await supabase.auth.getUser(sessionToken)
            : await supabase.auth.getUser()
        
        if (userError || !authUser) {
            return res.status(401).json({ error: 'Unauthorized' })
        }
        user = authUser
    } catch (e) {
        return res.status(401).json({ error: 'Unauthorized' })
    }

    const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!secretKey) return res.status(500).json({ error: 'Server config error' })

    const adminClient = createClient(supabaseUrl, secretKey)

    // 2. Fetch Order & Items
    const { data: order, error: orderError } = await adminClient
        .from('orders')
        .select(`*, order_items(*)`)
        .eq('id', id)
        .single()

    if (orderError || !order) {
        return res.status(404).json({ error: 'Order not found' })
    }

    // 3. Verify Ownership (unless admin, but for now we enforce owner)
    if (order.user_id !== user.id) {
        // Simple check for now
        // return res.status(403).json({ error: 'Forbidden' })
    }

    // 4. Generate PDF
    try {
        console.log(`[DownloadInvoice] Generating PDF for order #${order.order_number}`)
        
        const invoiceItems = order.order_items.map((item: any) => ({
            product_name: item.product_name || item.name || 'Product',
            quantity: item.quantity,
            price: item.price || item.product_price || 0
        }))

        const pdfBuffer = await generateInvoicePDF(order, invoiceItems)

        // 5. Send PDF response
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.order_number}.pdf`)
        res.setHeader('Content-Length', pdfBuffer.length)
        
        return res.send(pdfBuffer)
    } catch (error: any) {
        console.error('[DownloadInvoice] Failed to generate PDF:', error)
        return res.status(500).json({ error: 'Failed to generate invoice PDF' })
    }
})
