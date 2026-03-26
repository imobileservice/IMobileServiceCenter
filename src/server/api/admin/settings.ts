import { Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { asyncHandler } from '../utils/async-handler'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Supabase configuration missing for admin settings API')
}

const getSupabaseAdmin = () => {
  if (!supabaseUrl) {
    throw new Error('Supabase URL not configured. Please set VITE_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL in your .env file.')
  }
  
  // Try service role key first, fallback to anon key if not available
  const key = supabaseServiceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  
  if (!key) {
    throw new Error('Supabase key not configured. Please set SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY in your .env file.')
  }
  
  return createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
}

// GET /api/admin/settings/:key - Get a setting value
export const getSettingHandler = asyncHandler(async (req: Request, res: Response) => {
  const { key } = req.params
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('admin_settings')
    .select('*')
    .eq('key', key)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return res.status(404).json({ error: 'Setting not found' })
    }
    return res.status(500).json({ error: error.message })
  }

  return res.json({ data })
})

// PUT /api/admin/settings/:key - Update a setting value
export const updateSettingHandler = asyncHandler(async (req: Request, res: Response) => {
  const { key } = req.params
  const { value, description } = req.body
  const supabase = getSupabaseAdmin()

  // Check if setting exists
  const { data: existing } = await supabase
    .from('admin_settings')
    .select('*')
    .eq('key', key)
    .single()

  if (existing) {
    // Update existing
    const { data, error } = await supabase
      .from('admin_settings')
      .update({
        value,
        description: description || existing.description,
        updated_at: new Date().toISOString(),
      })
      .eq('key', key)
      .select()
      .single()

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    return res.json({ data })
  } else {
    // Create new
    const { data, error } = await supabase
      .from('admin_settings')
      .insert({
        key,
        value,
        description: description || '',
      })
      .select()
      .single()

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    return res.status(201).json({ data })
  }
})

