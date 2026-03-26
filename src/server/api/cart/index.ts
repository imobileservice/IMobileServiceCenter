import { Router } from 'express'
import { Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { asyncHandler } from '../utils/async-handler'

const router = Router()

// Helper: verify the user from the request token, returns verified user or null
const verifyUser = async (req: Request) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase not configured')

  const sessionToken = req.headers['x-session-token'] as string || req.headers['authorization']?.replace('Bearer ', '')
  if (!sessionToken) return { user: null, token: null }

  // Use anon client just for verification (getUser validates the JWT with Supabase)
  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  })
  const { data: { user }, error } = await authClient.auth.getUser(sessionToken)
  return { user: error ? null : user, token: sessionToken }
}

// Helper: get an authenticated DB client - uses service role key so RLS is bypassed
// after we have already verified the user above. All queries are scoped to user.id manually.
const getDbClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl) throw new Error('Supabase not configured')

  // Use service role key if available (bypasses RLS, we scope queries by user.id)
  const key = serviceRoleKey || anonKey
  if (!key) throw new Error('Supabase key not configured')

  return createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  })
}

// GET /api/cart - Get user's cart items
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { user } = await verifyUser(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const supabase = getDbClient()

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

      const imageMap = new Map<string, string>()
      imagesData?.forEach((img: any) => {
        if (!imageMap.has(img.product_id) || img.is_primary) {
          imageMap.set(img.product_id, img.url)
        }
      })

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
  console.log('[Cart API] POST /api/cart - Request received', { body: req.body })

  const { productId, quantity = 1, variantSelected } = req.body
  if (!productId) {
    console.error('[Cart API] Missing productId')
    return res.status(400).json({ error: 'Product ID is required' })
  }

  const { user } = await verifyUser(req)
  console.log('[Cart API] User check:', { userId: user?.id })
  if (!user) {
    console.error('[Cart API] Unauthorized')
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabase = getDbClient()

  // Check if item already exists with same variant
  console.log('[Cart API] Checking for existing cart item', { userId: user.id, productId })
  const { data: allProductItems, error: checkError } = await supabase
    .from('cart_items')
    .select('*')
    .eq('user_id', user.id)
    .eq('product_id', productId)

  if (checkError && checkError.code !== 'PGRST116') {
    console.error('[Cart API] Check error:', checkError)
    return res.status(500).json({ error: checkError.message })
  }

  // Find item with matching variant
  let existingWithVariant = null
  if (variantSelected && allProductItems) {
    const variantStr = JSON.stringify(variantSelected)
    existingWithVariant = allProductItems.find((item: any) => {
      if (!item.variant_selected) return false
      const itemVariant = typeof item.variant_selected === 'string'
        ? item.variant_selected
        : JSON.stringify(item.variant_selected)
      return itemVariant === variantStr
    }) || null
  }

  const existing = allProductItems?.find((item: any) => !item.variant_selected) || null

  if (existingWithVariant) {
    const { data, error } = await supabase
      .from('cart_items')
      .update({ quantity: existingWithVariant.quantity + quantity })
      .eq('id', existingWithVariant.id)
      .select()
      .single()
    if (error) { console.error('[Cart API] Update error:', error); return res.status(500).json({ error: error.message }) }
    console.log('[Cart API] Update success:', data)
    return res.json({ data })
  } else if (existing && !variantSelected) {
    const { data, error } = await supabase
      .from('cart_items')
      .update({ quantity: existing.quantity + quantity })
      .eq('id', existing.id)
      .select()
      .single()
    if (error) { console.error('[Cart API] Update error:', error); return res.status(500).json({ error: error.message }) }
    console.log('[Cart API] Update success:', data)
    return res.json({ data })
  } else {
    console.log('[Cart API] Inserting new item', { userId: user.id, productId, quantity })
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
    if (error) { console.error('[Cart API] Insert error:', error); return res.status(500).json({ error: error.message }) }
    console.log('[Cart API] Insert success:', data)
    return res.status(201).json({ data })
  }
}))

// PUT /api/cart/:id - Update cart item quantity
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { user } = await verifyUser(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const supabase = getDbClient()
  const { id } = req.params
  const { quantity } = req.body

  if (quantity === undefined) return res.status(400).json({ error: 'Quantity is required' })

  if (quantity <= 0) {
    const { error } = await supabase.from('cart_items').delete().eq('id', id).eq('user_id', user.id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(204).send()
  }

  const { data, error } = await supabase
    .from('cart_items')
    .update({ quantity })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.json({ data })
}))

// DELETE /api/cart/:id - Remove item from cart
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { user } = await verifyUser(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const supabase = getDbClient()
  const { id } = req.params

  const { error } = await supabase.from('cart_items').delete().eq('id', id).eq('user_id', user.id)
  if (error) return res.status(500).json({ error: error.message })
  return res.status(204).send()
}))

// DELETE /api/cart - Clear cart
router.delete('/', asyncHandler(async (req: Request, res: Response) => {
  const { user } = await verifyUser(req)
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const supabase = getDbClient()
  const { error } = await supabase.from('cart_items').delete().eq('user_id', user.id)
  if (error) return res.status(500).json({ error: error.message })
  return res.status(204).send()
}))

export default router
