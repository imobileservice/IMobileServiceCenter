import { Router, Request, Response } from 'express'
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

// GET /api/hero-slides - Get all active hero slides
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const supabase = getSupabase(req)

  const { data, error } = await supabase
    .from('hero_slides')
    .select(`
      *,
      products (
        id,
        name,
        image
      )
    `)
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.json({ data: data || [] })
}))

export default router

