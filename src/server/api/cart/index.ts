import { Router } from 'express'
import { Request, Response } from 'express'
import { createServerClient } from '@supabase/ssr'
import { asyncHandler } from '../utils/async-handler'

const router = Router()

// Helper to get Supabase client
const getSupabase = (req: Request) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase not configured')
  }

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      get(name: string) {
        return req.cookies?.[name]
      },
      set(name: string, value: string, options: any) {
        // No-op for read-only operations
      },
      remove(name: string, options: any) {
        // No-op for read-only operations
      },
    },
  })
}

// GET /api/cart - Get user's cart items
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const supabase = getSupabase(req)

  // Get user from session
  const sessionToken = req.headers['x-session-token'] as string || req.headers['authorization']?.replace('Bearer ', '')
  const { data: { user }, error: userError } = sessionToken
    ? await supabase.auth.getUser(sessionToken)
    : await supabase.auth.getUser()
  if (userError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Try to select with variant_selected first, fallback if column doesn't exist
  let data, error
  try {
    const result = await supabase
      .from('cart_items')
      .select(`
        id,
        user_id,
        product_id,
        quantity,
        variant_selected,
        created_at,
        updated_at,
        products (
          id,
          name,
          price,
          condition,
          stock
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    data = result.data
    error = result.error
  } catch (e: any) {
    // If variant_selected column doesn't exist, try without it
    if (e.message?.includes('variant_selected') || e.message?.includes('schema cache')) {
      console.warn('[Cart API] variant_selected column not found, using fallback query')
      const result = await supabase
        .from('cart_items')
        .select(`
          id,
          user_id,
          product_id,
          quantity,
          created_at,
          updated_at,
          products (
            id,
            name,
            price,
            condition,
            stock
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      data = result.data
      error = result.error
    } else {
      throw e
    }
  }

  if (error) {
    console.error('[Cart API] Error fetching cart items:', error)
    // Provide helpful error message if variant_selected column is missing
    if (error.message?.includes('variant_selected') || error.message?.includes('schema cache')) {
      return res.status(500).json({
        error: 'Database schema error: variant_selected column missing. Please run the migration: supabase/migrations/ensure_variant_selected_columns.sql'
      })
    }
    return res.status(500).json({ error: error.message })
  }

  // Load images from product_images table for each product
  if (data && Array.isArray(data)) {
    const productIds = [...new Set(data.map((item: any) => item.product_id).filter(Boolean))]

    if (productIds.length > 0) {
      const { data: imagesData } = await supabase
        .from('product_images')
        .select('product_id, url, is_primary')
        .in('product_id', productIds)
        .order('is_primary', { ascending: false })
        .order('display_order', { ascending: true })

      // Create a map of product_id -> primary image URL
      const imageMap = new Map<string, string>()
      imagesData?.forEach((img: any) => {
        if (!imageMap.has(img.product_id) || img.is_primary) {
          imageMap.set(img.product_id, img.url)
        }
      })

      // Attach images to products
      data = data.map((item: any) => {
        if (item.products) {
          item.products.image = imageMap.get(item.product_id) || null
        }
        return item
      })
    }
  }

  return res.json({ data: data || [] })
}))

// POST /api/cart - Add item to cart
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  console.log('[Cart API] POST /api/cart - Request received', { body: req.body, cookies: Object.keys(req.cookies || {}) })

  const supabase = getSupabase(req)
  const { productId, quantity = 1, variantSelected } = req.body

  if (!productId) {
    console.error('[Cart API] Missing productId')
    return res.status(400).json({ error: 'Product ID is required' })
  }

  // Get user from session
  const sessionToken = req.headers['x-session-token'] as string || req.headers['authorization']?.replace('Bearer ', '')
  const { data: { user }, error: userError } = sessionToken
    ? await supabase.auth.getUser(sessionToken)
    : await supabase.auth.getUser()
  console.log('[Cart API] User check:', { user: user?.id, error: userError?.message })

  if (userError || !user) {
    console.error('[Cart API] Unauthorized:', userError?.message)
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Check if item already exists with same variant
  // Note: We can't use .eq() on JSONB columns with stringified JSON in Supabase/PostgreSQL
  // Instead, fetch all items for this product and compare variants in memory
  console.log('[Cart API] Checking for existing cart item', { userId: user.id, productId, variantSelected })

  const { data: allProductItems, error: checkError } = await supabase
    .from('cart_items')
    .select('*')
    .eq('user_id', user.id)
    .eq('product_id', productId)

  if (checkError && checkError.code !== 'PGRST116') {
    console.error('[Cart API] Check error:', checkError)
    return res.status(500).json({ error: checkError.message })
  }

  // Find item with matching variant (compare in JavaScript, not SQL)
  let existingWithVariant = null
  if (variantSelected && allProductItems) {
    const variantStr = JSON.stringify(variantSelected)
    existingWithVariant = allProductItems.find((item: any) => {
      if (!item.variant_selected) return false
      // Handle both string and object formats
      const itemVariant = typeof item.variant_selected === 'string'
        ? item.variant_selected
        : JSON.stringify(item.variant_selected)
      return itemVariant === variantStr
    }) || null
  }

  // Also check for existing item without variant (for backward compatibility)
  const existing = allProductItems?.find((item: any) => !item.variant_selected) || null

  if (existingWithVariant) {
    console.log('[Cart API] Item with same variant exists, updating quantity', { existingId: existingWithVariant.id, currentQuantity: existingWithVariant.quantity, newQuantity: existingWithVariant.quantity + quantity })
    // Update quantity for same variant
    const { data, error } = await supabase
      .from('cart_items')
      .update({ quantity: existingWithVariant.quantity + quantity })
      .eq('id', existingWithVariant.id)
      .select()
      .single()

    if (error) {
      console.error('[Cart API] Update error:', error)
      return res.status(500).json({ error: error.message })
    }

    console.log('[Cart API] Update success:', data)
    return res.json({ data })
  } else if (existing && !variantSelected) {
    // If no variant and item exists, update quantity
    console.log('[Cart API] Item exists (no variant), updating quantity', { existingId: existing.id, currentQuantity: existing.quantity, newQuantity: existing.quantity + quantity })
    const { data, error } = await supabase
      .from('cart_items')
      .update({ quantity: existing.quantity + quantity })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) {
      console.error('[Cart API] Update error:', error)
      return res.status(500).json({ error: error.message })
    }

    console.log('[Cart API] Update success:', data)
    return res.json({ data })
  } else {
    console.log('[Cart API] Item does not exist, inserting new item', { userId: user.id, productId, quantity, variantSelected })
    // Insert new item with variant
    const { data, error } = await supabase
      .from('cart_items')
      .insert({
        user_id: user.id,
        product_id: productId,
        quantity,
        variant_selected: variantSelected || null,
      })
      .select()
      .single()

    if (error) {
      console.error('[Cart API] Insert error:', error)
      return res.status(500).json({ error: error.message })
    }

    console.log('[Cart API] Insert success:', data)
    return res.status(201).json({ data })
  }
}))

// PUT /api/cart/:id - Update cart item quantity
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const supabase = getSupabase(req)
  const { id } = req.params
  const { quantity } = req.body

  if (quantity === undefined) {
    return res.status(400).json({ error: 'Quantity is required' })
  }

  // Get user from session
  const sessionToken = req.headers['x-session-token'] as string || req.headers['authorization']?.replace('Bearer ', '')
  const { data: { user }, error: userError } = sessionToken
    ? await supabase.auth.getUser(sessionToken)
    : await supabase.auth.getUser()
  if (userError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (quantity <= 0) {
    // Remove item
    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    return res.status(204).send()
  }

  // Update quantity
  const { data, error } = await supabase
    .from('cart_items')
    .update({ quantity })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.json({ data })
}))

// DELETE /api/cart/:id - Remove item from cart
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const supabase = getSupabase(req)
  const { id } = req.params

  // Get user from session
  const sessionToken = req.headers['x-session-token'] as string || req.headers['authorization']?.replace('Bearer ', '')
  const { data: { user }, error: userError } = sessionToken
    ? await supabase.auth.getUser(sessionToken)
    : await supabase.auth.getUser()
  if (userError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { error } = await supabase
    .from('cart_items')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.status(204).send()
}))

// DELETE /api/cart - Clear cart
router.delete('/', asyncHandler(async (req: Request, res: Response) => {
  const supabase = getSupabase(req)

  // Get user from session
  const sessionToken = req.headers['x-session-token'] as string || req.headers['authorization']?.replace('Bearer ', '')
  const { data: { user }, error: userError } = sessionToken
    ? await supabase.auth.getUser(sessionToken)
    : await supabase.auth.getUser()
  if (userError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { error } = await supabase
    .from('cart_items')
    .delete()
    .eq('user_id', user.id)

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.status(204).send()
}))

export default router

