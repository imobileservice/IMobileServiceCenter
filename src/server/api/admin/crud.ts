import { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'
import { generateDeliveryBillPDF } from '../utils/invoice-generator'
import {
  createProductRecord,
  updateProductRecord,
  deleteProductRecord,
} from '../utils/product-write'

// Async error wrapper
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      console.error('[Admin CRUD API] Unhandled async error:', error)
      if (!res.headersSent) {
        res.status(error.status || 500).json({
          error: error.message || 'Internal Server Error',
          ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
        })
      }
    })
  }
}

/**
 * A service-role client, or a 503 already sent to the caller.
 *
 * Returns null after answering the request, so call sites read as
 * `const supabase = getServiceClient(res); if (!supabase) return`.
 */
function getServiceClient(res: Response) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    res.status(503).json({ error: 'Supabase not configured' })
    return null
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
}

/**
 * POST /api/admin/products
 * Create a new product (administrator only).
 *
 * The work itself lives in utils/product-write, so that an assistant admin
 * creating a product, and the approval step that applies an assistant's edit,
 * travel exactly the same code path as this one - barcode generation, category
 * slug resolution, inv_stock initialisation and all.
 */
export const createProductHandler = asyncHandler(async (req: Request, res: Response) => {
  const supabase = getServiceClient(res)
  if (!supabase) return

  const result = await createProductRecord(supabase, req.body || {})
  if (!result.ok) return res.status(result.status || 500).json({ error: result.error })

  return res.json({ data: result.data })
})

/**
 * PUT /api/admin/products/:id
 * Update a product (administrator only).
 */
export const updateProductHandler = asyncHandler(async (req: Request, res: Response) => {
  const supabase = getServiceClient(res)
  if (!supabase) return

  const result = await updateProductRecord(supabase, req.params.id, req.body || {})
  if (!result.ok) return res.status(result.status || 500).json({ error: result.error })

  return res.json({ data: result.data })
})

/**
 * DELETE /api/admin/products/:id
 * Delete a product (administrator only).
 */
export const deleteProductHandler = asyncHandler(async (req: Request, res: Response) => {
  const supabase = getServiceClient(res)
  if (!supabase) return

  const result = await deleteProductRecord(supabase, req.params.id)
  if (!result.ok) return res.status(result.status || 500).json({ error: result.error })

  return res.json({ success: true })
})

/**
 * PUT /api/admin/orders/:id/status
 * Update order status (admin only)
 */
export const updateOrderStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(503).json({ error: 'Supabase not configured' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })

  const { id } = req.params
  const { status } = req.body

  if (!status) {
    return res.status(400).json({ error: 'Status is required' })
  }

  const allowedStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled']
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid order status' })
  }

  console.log(`[Admin] Updating order status: ${id} -> ${status}`)

  const { data: existingOrder, error: existingError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .single()

  if (existingError || !existingOrder) {
    console.error('Error fetching existing order:', existingError)
    return res.status(404).json({ error: 'Order not found' })
  }

  const { data, error } = await supabase
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating order status:', error)
    return res.status(500).json({ error: error.message })
  }

  if (!data) {
    console.error(`[Admin] Order not found for update: ${id}`)
    return res.status(404).json({ error: 'Order not found' })
  }

  // Handle stock reduction for Cash on Delivery orders only on the first transition to shipped.
  if (status === 'shipped' && existingOrder.status !== 'shipped' && data.payment_method === 'cash_on_delivery') {
    console.log(`[Admin] COD order ${id} marked as Shipped. Reducing stock...`)
    
    // Fetch items for this order
    const { data: items, error: itemsError } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', id)
      
    if (!itemsError && items) {
      for (const item of items) {
        if (item.product_id) {
          try {
            // Get current Meegoda stock
            const { data: invStock } = await supabase
              .from('inv_stock')
              .select('qty_meegoda')
              .eq('product_id', item.product_id)
              .single()
            
            if (invStock) {
              const currentQty = invStock.qty_meegoda || 0
              const newQty = Math.max(0, currentQty - (item.quantity || 1))
              
              // 1. Update Meegoda stock
              await supabase
                .from('inv_stock')
                .update({ 
                  qty_meegoda: newQty,
                  updated_at: new Date().toISOString()
                })
                .eq('product_id', item.product_id)
              
              // 2. Log movement
              await supabase
                .from('inv_stock_movements')
                .insert({
                  product_id: item.product_id,
                  type: 'sale',
                  quantity: -(item.quantity || 1),
                  reference_id: id,
                  notes: `Website COD Order Shipped: ${data.order_number}`,
                  created_by: 'admin'
                })
                
              console.log(`[Admin] Stock reduced for item ${item.product_id} in COD order ${data.order_number}`)
            }
          } catch (err) {
            console.error(`[Admin] Error reducing stock for COD item:`, err)
          }
        }
      }
    }
  }

  return res.json({ data })
})

/**
 * GET /api/admin/orders/:id/delivery-bill
 * Generate a delivery bill PDF for website packers/cashiers.
 */
export const downloadDeliveryBillHandler = asyncHandler(async (req: Request, res: Response) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(503).json({ error: 'Supabase not configured' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })

  const { id } = req.params
  const { data: order, error } = await supabase
    .from('orders')
    .select(`*, order_items (*)`)
    .eq('id', id)
    .single()

  if (error || !order) {
    console.error('Error fetching delivery bill order:', error)
    return res.status(404).json({ error: 'Order not found' })
  }

  const items = ((order as any).order_items || []).map((item: any) => ({
    product_name: item.product_name || 'Product',
    quantity: Number(item.quantity || 0),
    price: Number(item.price || 0),
  }))

  const pdfBuffer = await generateDeliveryBillPDF(order as any, items)

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename=delivery-bill-${order.order_number || id}.pdf`)
  res.setHeader('Content-Length', pdfBuffer.length)
  return res.send(pdfBuffer)
})

/**
 * PUT /api/admin/messages/:id/status
 * Update message status (admin only)
 */
export const updateMessageStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(503).json({ error: 'Supabase not configured' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })

  const { id } = req.params
  const { status } = req.body

  if (!status) {
    return res.status(400).json({ error: 'Status is required' })
  }

  const { data, error } = await supabase
    .from('messages')
    .update({ status })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating message status:', error)
    return res.status(500).json({ error: error.message })
  }

  return res.json({ data })
})

/**
 * PUT /api/admin/customers/:id
 * Update customer (admin only)
 */
export const updateCustomerHandler = asyncHandler(async (req: Request, res: Response) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(503).json({ error: 'Supabase not configured' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })

  const { id } = req.params

  const { data, error } = await supabase
    .from('profiles')
    .update(req.body)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating customer:', error)
    return res.status(500).json({ error: error.message })
  }

  return res.json({ data })
})

/**
 * DELETE /api/admin/customers/:id
 * Delete customer (admin only)
 */
export const deleteCustomerHandler = asyncHandler(async (req: Request, res: Response) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(503).json({ error: 'Supabase not configured' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })

  const { id } = req.params

  // Delete user from auth (this will cascade to profiles)
  const { error: authError } = await supabase.auth.admin.deleteUser(id)

  if (authError) {
    console.error('Error deleting customer:', authError)
    return res.status(500).json({ error: authError.message })
  }

  return res.json({ success: true })
})

/**
 * DELETE /api/admin/messages/:id
 * Delete message (admin only)
 */
export const deleteMessageHandler = asyncHandler(async (req: Request, res: Response) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(503).json({ error: 'Supabase not configured' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })

  const { id } = req.params

  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting message:', error)
    return res.status(500).json({ error: error.message })
  }

  return res.json({ success: true })
})
