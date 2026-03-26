import { Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { asyncHandler } from '../utils/async-handler'
import { generateInvoicePDF } from '../utils/invoice-generator'
import { sendEmail } from '../utils/email'
import { invoiceService } from '../services/invoice-service'

/**
 * POST /api/orders
 * Create a new order
 */
export const createOrderHandler = asyncHandler(async (req: Request, res: Response) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return res.status(503).json({
      error: 'Supabase not configured',
      message: 'Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file'
    })
  }

  // Get user from session
  const sessionToken = req.headers['x-session-token'] as string || req.headers['authorization']?.replace('Bearer ', '')

  // We need to use createClient with authorization headers to verify the user
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
  const { data: { user }, error: userError } = sessionToken
    ? await supabase.auth.getUser(sessionToken)
    : await supabase.auth.getUser()
  if (userError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { order, items } = req.body

  if (!order || !items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'Order and items are required' })
  }

  console.log('[Orders API] Creating order:', { orderNumber: order.order_number, userId: user.id, itemCount: items.length })

  // Use admin client for DB operations to bypass RLS policies
  const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secretKey) {
    return res.status(500).json({ error: 'Server configuration error: Missing service key' })
  }

  // Use admin client for DB operations to bypass RLS policies
  const adminClient = createClient(supabaseUrl, secretKey)

  // Create order
  const { data: orderData, error: orderError } = await adminClient
    .from('orders')
    .insert({
      ...order,
      user_id: user.id,
    })
    .select()
    .single()

  if (orderError) {
    console.error('[Orders API] Order creation error:', orderError)
    return res.status(500).json({ error: orderError.message })
  }

  console.log('[Orders API] Order created:', orderData.id)

  // Create order items
  if (items.length > 0) {
    const orderItems = items.map((item: any) => ({
      order_id: orderData.id,
      ...item,
    }))

    const { error: itemsError } = await adminClient
      .from('order_items')
      .insert(orderItems)

    if (itemsError) {
      console.error('[Orders API] Order items creation error:', itemsError)
      // Cleanup empty order
      await adminClient.from('orders').delete().eq('id', orderData.id)
      return res.status(500).json({ error: `Failed to create order items: ${itemsError.message}` })
    } else {
      console.log('[Orders API] Order items created successfully')
      
      // Reduce stock for each item
      console.log('[Orders API] Reducing stock for items...')
      for (const item of items) {
        if (item.product_id) {
          // Get current stock first to decrement safely
          const { data: product, error: fetchError } = await adminClient
            .from('products')
            .select('name, stock')
            .eq('id', item.product_id)
            .single()
            
          if (!fetchError && product) {
            const newStock = Math.max(0, (product.stock || 0) - (item.quantity || 1))
            const { error: updateError } = await adminClient
              .from('products')
              .update({ stock: newStock })
              .eq('id', item.product_id)
              
            if (updateError) {
              console.error(`[Orders API] Failed to update stock for ${product.name}:`, updateError)
            } else {
              console.log(`[Orders API] Stock updated for ${product.name}: ${product.stock} -> ${newStock}`)
            }
          }
        }
      }
    }
  }

  // Send Invoice Email in background (non-blocking - don't hold up the response)
  setImmediate(async () => {
    try {
      console.log('[Orders API] Starting background invoice email for order:', orderData.order_number)
      await invoiceService.sendInvoice(orderData, items)
      console.log('[Orders API] Background invoice email sent successfully for order:', orderData.order_number)
    } catch (emailError: any) {
      console.error('[Orders API] Background invoice email FAILED for order:', orderData.order_number, '| Error:', emailError.message, '| Stack:', emailError.stack)
    }
  })

  return res.status(201).json({ data: orderData })



  // Helper for currency formatting in email
  function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
    }).format(amount)
  }

  return res.status(201).json({ data: orderData })
})
