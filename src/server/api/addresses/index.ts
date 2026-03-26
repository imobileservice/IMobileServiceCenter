import { Router } from 'express'
import { Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { asyncHandler } from '../utils/async-handler'

const router = Router()

// Helper to get Supabase client
const getSupabase = (req: Request) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase not configured')
  }

  const sessionToken = req.headers['x-session-token'] as string || req.headers['authorization']?.replace('Bearer ', '')

  return createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  })
}

// GET /api/addresses - Get user's addresses
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const supabase = getSupabase(req)

  const sessionToken = req.headers['x-session-token'] as string || req.headers['authorization']?.replace('Bearer ', '')
  const { data: { user }, error: userError } = sessionToken
    ? await supabase.auth.getUser(sessionToken)
    : await supabase.auth.getUser()
  if (userError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { data, error } = await supabase
    .from('addresses')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.json({ data: data || [] })
}))

// POST /api/addresses - Create or update address
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const supabase = getSupabase(req)
  const address = req.body

  const sessionToken = req.headers['x-session-token'] as string || req.headers['authorization']?.replace('Bearer ', '')
  const { data: { user }, error: userError } = sessionToken
    ? await supabase.auth.getUser(sessionToken)
    : await supabase.auth.getUser()
  if (userError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const payload = {
    ...address,
    user_id: user.id,
    type: (address.type || 'billing').toLowerCase(),
  }

  console.log('[Addresses API] Upserting address:', { addressId: address.id, type: payload.type, userId: user.id })

  // If setting as default, unset other defaults of the same type (non-blocking)
  if (address.is_default) {
    void (async () => {
      try {
        await supabase
          .from('addresses')
          .update({ is_default: false })
          .eq('user_id', user.id)
          .eq('type', payload.type)
          .neq('id', address.id || '00000000-0000-0000-0000-000000000000')
        console.log('[Addresses API] Unset other defaults')
      } catch (err: any) {
        console.warn('[Addresses API] Failed to unset defaults (non-critical):', err.message)
      }
    })()
  }

  let data = null
  let error = null as any

  if (address.id) {
    // Update existing address
    const { data: updateData, error: updateError } = await supabase
      .from('addresses')
      .update(payload)
      .eq('id', address.id)
      .eq('user_id', user.id)
      .select()
      .single()

    data = updateData
    error = updateError
  } else {
    // Insert new address
    const { data: insertData, error: insertError } = await supabase
      .from('addresses')
      .insert(payload)
      .select()
      .single()

    data = insertData
    error = insertError
  }

  if (error) {
    console.error('[Addresses API] Address operation error:', error)
    return res.status(500).json({ error: error.message })
  }

  console.log('[Addresses API] Address saved successfully:', data?.id)
  return res.json({ data })
}))

// DELETE /api/addresses/:id - Delete address
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const supabase = getSupabase(req)
  const { id } = req.params

  const sessionToken = req.headers['x-session-token'] as string || req.headers['authorization']?.replace('Bearer ', '')
  const { data: { user }, error: userError } = sessionToken
    ? await supabase.auth.getUser(sessionToken)
    : await supabase.auth.getUser()
  if (userError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { error } = await supabase
    .from('addresses')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.status(204).send()
}))

export default router

