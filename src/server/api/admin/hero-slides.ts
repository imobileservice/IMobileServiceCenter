import { Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { asyncHandler } from '../utils/async-handler'

const getSupabaseAdmin = () => {
  // Read environment variables inside the function to avoid import hoisting issues
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    throw new Error('Supabase URL not configured')
  }

  const key = supabaseServiceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

  if (!key) {
    throw new Error('Supabase key not configured')
  }

  return createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
}

// GET /api/admin/hero-slides - Get all slides (admin)
export const getAllSlidesHandler = asyncHandler(async (req: Request, res: Response) => {
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('hero_slides')
    .select(`
      *,
      products (
        id,
        name
      )
    `)
    .order('display_order', { ascending: true })

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.json({ data: data || [] })
})

// POST /api/admin/hero-slides - Create slide
export const createSlideHandler = asyncHandler(async (req: Request, res: Response) => {
  const supabase = getSupabaseAdmin()
  const { product_id, brand, title, subtitle, image, image2, display_order, is_active } = req.body

  if (!brand || !title || !image) {
    return res.status(400).json({ error: 'Missing required fields: brand, title, image' })
  }

  const { data, error } = await supabase
    .from('hero_slides')
    .insert({
      product_id: product_id || null,
      brand,
      title,
      subtitle: subtitle || null,
      image,
      image2: image2 || null,
      display_order: display_order || 0,
      is_active: is_active !== undefined ? is_active : true,
    })
    .select(`
      *,
      products (
        id,
        name
      )
    `)
    .single()

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  // Notify clients of update
  res.locals.notifyUpdate = { type: 'heroSlidesUpdated', timestamp: Date.now() }

  return res.status(201).json({ data })
})

// PUT /api/admin/hero-slides/:id - Update slide
export const updateSlideHandler = asyncHandler(async (req: Request, res: Response) => {
  const supabase = getSupabaseAdmin()
  const { id } = req.params
  const { product_id, brand, title, subtitle, image, image2, display_order, is_active } = req.body

  const updates: any = {}
  if (product_id !== undefined) updates.product_id = product_id
  if (brand !== undefined) updates.brand = brand
  if (title !== undefined) updates.title = title
  if (subtitle !== undefined) updates.subtitle = subtitle
  if (image !== undefined) updates.image = image
  if (image2 !== undefined) updates.image2 = image2
  if (display_order !== undefined) updates.display_order = display_order
  if (is_active !== undefined) updates.is_active = is_active

  const { data, error } = await supabase
    .from('hero_slides')
    .update(updates)
    .eq('id', id)
    .select(`
      *,
      products (
        id,
        name
      )
    `)
    .single()

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  // Notify clients of update
  res.locals.notifyUpdate = { type: 'heroSlidesUpdated', timestamp: Date.now() }

  return res.json({ data })
})

// DELETE /api/admin/hero-slides/:id - Delete slide
export const deleteSlideHandler = asyncHandler(async (req: Request, res: Response) => {
  const supabase = getSupabaseAdmin()
  const { id } = req.params

  const { error } = await supabase
    .from('hero_slides')
    .delete()
    .eq('id', id)

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  // Notify clients of update
  res.locals.notifyUpdate = { type: 'heroSlidesUpdated', timestamp: Date.now() }

  return res.status(204).send()
})

