import { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'

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
 * POST /api/admin/products
 * Create a new product (admin only)
 */
export const createProductHandler = asyncHandler(async (req: Request, res: Response) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(503).json({ error: 'Supabase not configured' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })

  // Convert category slug to category_id if category is provided
  let productData: any = { ...req.body }
  const imageUrls = productData.images || (productData.image ? [productData.image] : [])

  // Remove old image fields (they're stored in product_images table now)
  delete productData.image
  delete productData.images

  if (productData.category && !productData.category_id) {
    // Get category_id from slug
    const { data: categoryData, error: categoryError } = await supabase
      .from('categories')
      .select('id')
      .eq('slug', productData.category)
      .single()

    if (categoryError || !categoryData) {
      return res.status(400).json({
        error: `Category not found: ${productData.category}`
      })
    }

    productData.category_id = categoryData.id
    // Remove the category slug field as it's not a column in the products table
    delete productData.category
  }

  // Auto-generate a sequential 6-digit barcode (000001, 000002, ...)
  if (!productData.barcode) {
    // Find the highest existing numeric barcode and add 1
    const { data: barcodeRows } = await supabase
      .from('products')
      .select('barcode')
      .not('barcode', 'is', null)
      .order('barcode', { ascending: false })
      .limit(100)

    let nextNumber = 1
    if (barcodeRows && barcodeRows.length > 0) {
      // Filter only purely numeric barcodes and find the max
      const numericBarcodes = barcodeRows
        .map((r: any) => parseInt(r.barcode, 10))
        .filter((n: number) => !isNaN(n))
      if (numericBarcodes.length > 0) {
        nextNumber = Math.max(...numericBarcodes) + 1
      }
    }
    // Zero-pad to 6 digits: 000001, 000002 ... 999999
    productData.barcode = String(nextNumber).padStart(6, '0')
    console.log(`[Admin] Auto-generated barcode: ${productData.barcode}`)
  }

  // Insert product (without image fields)
  const { data, error } = await supabase
    .from('products')
    .insert(productData)
    .select()
    .single()

  if (error) {
    console.error('Error creating product:', error)
    return res.status(500).json({ error: error.message })
  }

  // Initialize stock in inv_stock so it appears in Inventory
  if (data?.id) {
    const { error: stockError } = await supabase
      .from('inv_stock')
      .insert({
        product_id: data.id,
        quantity: productData.stock || 0,
        low_stock_threshold: 5
      })

    if (stockError) {
      console.error('Error initializing inv_stock:', stockError)
      // Non-fatal, keep going
    }
  }

  // Insert images into product_images table
  if (imageUrls.length > 0 && data?.id) {
    const imageInserts = imageUrls.map((url: string, index: number) => ({
      product_id: data.id,
      url: url,
      display_order: index,
      is_primary: index === 0,
      alt_text: `${productData.name} image ${index + 1}`,
    }))

    const { error: imagesError } = await supabase
      .from('product_images')
      .insert(imageInserts)

    if (imagesError) {
      console.error('Error inserting product images:', imagesError)
      // Don't fail the request, just log the error
    }
  }

  return res.json({ data })
})

/**
 * PUT /api/admin/products/:id
 * Update a product (admin only)
 */
export const updateProductHandler = asyncHandler(async (req: Request, res: Response) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(503).json({ error: 'Supabase not configured' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })

  const { id } = req.params

  // Convert category slug to category_id if category is provided
  let updateData: any = { ...req.body }
  const imageUrls = updateData.images || (updateData.image ? [updateData.image] : undefined)

  // Remove old image fields (they're stored in product_images table now)
  delete updateData.image
  delete updateData.images

  if (updateData.category && !updateData.category_id) {
    // Get category_id from slug
    const { data: categoryData, error: categoryError } = await supabase
      .from('categories')
      .select('id')
      .eq('slug', updateData.category)
      .single()

    if (categoryError || !categoryData) {
      return res.status(400).json({
        error: `Category not found: ${updateData.category}`
      })
    }

    updateData.category_id = categoryData.id
    // Remove the category slug field as it's not a column in the products table
    delete updateData.category
  }

  // Update product (without image fields)
  const { data, error } = await supabase
    .from('products')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating product:', error)
    return res.status(500).json({ error: error.message })
  }

  // Sync inventory stock if stock was updated
  if (updateData.stock !== undefined && data?.id) {
    console.log(`[Admin CRUD] Syncing manual stock update for product ${id}: ${updateData.stock}`)
    const { error: invStockError } = await supabase
      .from('inv_stock')
      .update({ 
        quantity: updateData.stock,
        updated_at: new Date().toISOString()
      })
      .eq('product_id', data.id)

    if (invStockError) {
      console.error('[Admin CRUD] Error syncing inv_stock:', invStockError)
      // Fallback: Try to insert if it somehow doesn't exist
      await supabase
        .from('inv_stock')
        .upsert({
          product_id: data.id,
          quantity: updateData.stock,
          low_stock_threshold: 5
        })
    }
  }

  // Update images in product_images table if provided
  if (imageUrls !== undefined && data?.id) {
    // Delete existing images
    await supabase
      .from('product_images')
      .delete()
      .eq('product_id', id)

    // Insert new images
    if (imageUrls.length > 0) {
      const imageInserts = imageUrls.map((url: string, index: number) => ({
        product_id: id,
        url: url,
        display_order: index,
        is_primary: index === 0,
        alt_text: `${updateData.name || data.name} image ${index + 1}`,
      }))

      const { error: imagesError } = await supabase
        .from('product_images')
        .insert(imageInserts)

      if (imagesError) {
        console.error('Error updating product images:', imagesError)
        // Don't fail the request, just log the error
      }
    }
  }

  return res.json({ data })
})

/**
 * DELETE /api/admin/products/:id
 * Delete a product (admin only)
 */
export const deleteProductHandler = asyncHandler(async (req: Request, res: Response) => {
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
    .from('products')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting product:', error)
    if (error.code === '23503') {
      return res.status(409).json({ error: 'Cannot delete product because it exists in past sales/receipts. Please update its stock to 0 instead to discontinue it.' })
    }
    return res.status(500).json({ error: error.message })
  }

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

  console.log(`[Admin] Updating order status: ${id} -> ${status}`)

  const { data, error } = await supabase
    .from('orders')
    .update({ status })
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

  return res.json({ data })
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

