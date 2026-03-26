import { Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { asyncHandler } from '../utils/async-handler'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Supabase configuration missing for admin categories API')
}

const getSupabaseAdmin = () => {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase not configured')
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
}

// GET /api/admin/categories - Get all categories
export const getCategoriesHandler = asyncHandler(async (req: Request, res: Response) => {
  try {
    console.log('[Categories API] GET /api/admin/categories - Request received')
    const supabase = getSupabaseAdmin()
    
    console.log('[Categories API] Querying categories table...')
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true })
    
    console.log('[Categories API] Raw query result - data:', data?.length || 0, 'rows, error:', error?.message || 'none')
    
    if (error) {
      console.error('[Categories API] Supabase error:', error)
      console.error('[Categories API] Error code:', error.code)
      console.error('[Categories API] Error message:', error.message)
      
      // Check if table doesn't exist
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return res.status(404).json({ 
          error: 'Categories table not found',
          message: 'Please run the migration: supabase/migrations/add_categories_table.sql',
          code: 'TABLE_NOT_FOUND'
        })
      }
      
      return res.status(500).json({ error: error.message, code: error.code })
    }
    
    console.log('[Categories API] Successfully fetched', data?.length || 0, 'categories')
    return res.json({ data: data || [] })
  } catch (error: any) {
    console.error('[Categories API] Error:', error)
    if (error.message === 'Supabase not configured') {
      return res.status(503).json({ 
        error: 'Supabase not configured',
        message: 'SUPABASE_SERVICE_ROLE_KEY is missing. Please check your .env file.'
      })
    }
    throw error
  }
})

// GET /api/admin/categories/:id - Get single category
export const getCategoryHandler = asyncHandler(async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const supabase = getSupabaseAdmin()
    
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) {
      return res.status(404).json({ error: 'Category not found' })
    }
    
    return res.json({ data })
  } catch (error: any) {
    console.error('[Categories API] Error:', error)
    if (error.message === 'Supabase not configured') {
      return res.status(503).json({ 
        error: 'Supabase not configured',
        message: 'SUPABASE_SERVICE_ROLE_KEY is missing. Please check your .env file.'
      })
    }
    throw error
  }
})

// POST /api/admin/categories - Create category
export const createCategoryHandler = asyncHandler(async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { name, slug, description, icon, field_config, is_active, sort_order } = req.body
    
    // Validate required fields
    if (!name || !slug || !field_config) {
      return res.status(400).json({ error: 'Name, slug, and field_config are required' })
    }
    
    // Validate field_config structure
    if (!field_config.fields || !Array.isArray(field_config.fields)) {
      return res.status(400).json({ error: 'field_config must have a fields array' })
    }
    
    const { data, error } = await supabase
      .from('categories')
      .insert({
        name,
        slug,
        description: description || null,
        icon: icon || null,
        field_config,
        is_active: is_active !== undefined ? is_active : true,
        sort_order: sort_order || 0,
      })
      .select()
      .single()
    
    if (error) {
      console.error('[Categories API] Create error:', error)
      return res.status(500).json({ error: error.message })
    }
    
    return res.status(201).json({ data })
  } catch (error: any) {
    console.error('[Categories API] Error:', error)
    if (error.message === 'Supabase not configured') {
      return res.status(503).json({ 
        error: 'Supabase not configured',
        message: 'SUPABASE_SERVICE_ROLE_KEY is missing. Please check your .env file.'
      })
    }
    throw error
  }
})

// PUT /api/admin/categories/:id - Update category
export const updateCategoryHandler = asyncHandler(async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const supabase = getSupabaseAdmin()
    const { name, slug, description, icon, field_config, is_active, sort_order } = req.body
    
    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (slug !== undefined) updateData.slug = slug
    if (description !== undefined) updateData.description = description
    if (icon !== undefined) updateData.icon = icon
    if (field_config !== undefined) {
      if (!field_config.fields || !Array.isArray(field_config.fields)) {
        return res.status(400).json({ error: 'field_config must have a fields array' })
      }
      updateData.field_config = field_config
    }
    if (is_active !== undefined) updateData.is_active = is_active
    if (sort_order !== undefined) updateData.sort_order = sort_order
    updateData.updated_at = new Date().toISOString()
    
    const { data, error } = await supabase
      .from('categories')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()
    
    if (error) {
      console.error('[Categories API] Update error:', error)
      return res.status(500).json({ error: error.message })
    }
    
    if (!data) {
      return res.status(404).json({ error: 'Category not found' })
    }
    
    return res.json({ data })
  } catch (error: any) {
    console.error('[Categories API] Error:', error)
    if (error.message === 'Supabase not configured') {
      return res.status(503).json({ 
        error: 'Supabase not configured',
        message: 'SUPABASE_SERVICE_ROLE_KEY is missing. Please check your .env file.'
      })
    }
    throw error
  }
})

// DELETE /api/admin/categories/:id - Delete category
export const deleteCategoryHandler = asyncHandler(async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const supabase = getSupabaseAdmin()
    
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id)
    
    if (error) {
      console.error('[Categories API] Delete error:', error)
      return res.status(500).json({ error: error.message })
    }
    
    return res.json({ message: 'Category deleted successfully' })
  } catch (error: any) {
    console.error('[Categories API] Error:', error)
    if (error.message === 'Supabase not configured') {
      return res.status(503).json({ 
        error: 'Supabase not configured',
        message: 'SUPABASE_SERVICE_ROLE_KEY is missing. Please check your .env file.'
      })
    }
    throw error
  }
})

