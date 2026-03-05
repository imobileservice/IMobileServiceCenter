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

// GET /api/profile - Get user profile
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const supabase = getSupabase(req)
  
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      // Profile doesn't exist, return basic user info
      return res.json({
        data: {
          id: user.id,
          email: user.email,
          name: user.email?.split('@')[0] || 'User',
          whatsapp: '',
        }
      })
    }
    return res.status(500).json({ error: error.message })
  }

  return res.json({ data: data || null })
}))

// PUT /api/profile - Update user profile
router.put('/', asyncHandler(async (req: Request, res: Response) => {
  const supabase = getSupabase(req)
  const { name, whatsapp, avatar_url } = req.body

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const updates: any = {}
  if (name !== undefined) updates.name = name
  if (whatsapp !== undefined) updates.whatsapp = whatsapp
  if (avatar_url !== undefined) updates.avatar_url = avatar_url

  // Check if profile exists
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()

  let data
  let error

  if (existing) {
    // Update existing profile
    const result = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single()
    data = result.data
    error = result.error
  } else {
    // Create new profile
    const result = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        email: user.email || '',
        name: name || user.email?.split('@')[0] || 'User',
        whatsapp: whatsapp || '',
        ...updates,
      })
      .select()
      .single()
    data = result.data
    error = result.error
  }

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.json({ data })
}))

// GET /api/profile/wishlist - Get user wishlist
router.get('/wishlist', asyncHandler(async (req: Request, res: Response) => {
  const supabase = getSupabase(req)
  
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { data, error } = await supabase
    .from('wishlists')
    .select(`
      id,
      product_id,
      created_at,
      products (
        id,
        name,
        price,
        image,
        condition
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.json({ data: data || [] })
}))

// POST /api/profile/wishlist - Add to wishlist
router.post('/wishlist', asyncHandler(async (req: Request, res: Response) => {
  const supabase = getSupabase(req)
  const { productId } = req.body

  if (!productId) {
    return res.status(400).json({ error: 'Product ID is required' })
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { data, error } = await supabase
    .from('wishlists')
    .insert({ user_id: user.id, product_id: productId })
    .select()
    .single()

  if (error) {
    // Ignore unique violation (item already in wishlist)
    if (error.code === '23505') {
      return res.json({ data: { message: 'Item already in wishlist' } })
    }
    return res.status(500).json({ error: error.message })
  }

  return res.status(201).json({ data })
}))

// DELETE /api/profile/wishlist/:productId - Remove from wishlist
router.delete('/wishlist/:productId', asyncHandler(async (req: Request, res: Response) => {
  const supabase = getSupabase(req)
  const { productId } = req.params

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { error } = await supabase
    .from('wishlists')
    .delete()
    .eq('user_id', user.id)
    .eq('product_id', productId)

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.status(204).send()
}))

// GET /api/profile/credits - Get user store credits
router.get('/credits', asyncHandler(async (req: Request, res: Response) => {
  const supabase = getSupabase(req)
  
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('store_credits')
    .eq('id', user.id)
    .single()

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.json({ data: { credits: data?.store_credits || 0 } })
}))

// GET /api/profile/downloads - Get user downloads
router.get('/downloads', asyncHandler(async (req: Request, res: Response) => {
  const supabase = getSupabase(req)
  
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { data, error } = await supabase
    .from('downloads')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.json({ data: data || [] })
}))

export default router

