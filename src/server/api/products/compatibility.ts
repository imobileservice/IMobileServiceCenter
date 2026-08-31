import { Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { MODEL_SELECT, isMissingRelation, shapeModel } from '../utils/compatibility'

/**
 * Storefront read-only endpoints powering "Find Parts For Your Phone".
 *
 * Both handlers return an empty list rather than an error when the
 * compatibility migration has not been applied yet, so the widget simply does
 * not render instead of breaking the page.
 */

const getSupabase = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) return null

  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * GET /api/products/compatibility/brands
 * Brands that actually have at least one phone model, so the finder never
 * offers a brand with an empty model dropdown.
 */
export async function compatibilityBrandsHandler(_req: Request, res: Response) {
  const supabase = getSupabase()
  if (!supabase) return res.json({ brands: [] })

  const { data, error } = await supabase
    .from('phone_models')
    .select('brand_id, is_active, brands:brand_id (id, name, slug)')
    .eq('is_active', true)
    .limit(5000)

  if (error) {
    if (!isMissingRelation(error)) {
      console.warn('[Compatibility] Brand list failed:', error.message)
    }
    return res.json({ brands: [] })
  }

  const byId = new Map<string, { id: string; name: string; slug: string; model_count: number }>()
  for (const row of data || []) {
    const brand = Array.isArray((row as any).brands) ? (row as any).brands[0] : (row as any).brands
    if (!brand?.id) continue

    const existing = byId.get(brand.id)
    if (existing) {
      existing.model_count += 1
    } else {
      byId.set(brand.id, { id: brand.id, name: brand.name, slug: brand.slug, model_count: 1 })
    }
  }

  const brands = Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name))
  return res.json({ brands })
}

/**
 * GET /api/products/compatibility/models?brand_id=&brand=&search=
 * Phone models for the finder's second dropdown.
 */
export async function compatibilityModelsHandler(req: Request, res: Response) {
  const supabase = getSupabase()
  if (!supabase) return res.json({ models: [] })

  const brandId = String(req.query.brand_id || '').trim()
  const brandName = String(req.query.brand || '').trim()
  const search = String(req.query.search || '').trim()

  let query = supabase.from('phone_models').select(MODEL_SELECT).eq('is_active', true).limit(1000)

  if (brandId) {
    query = query.eq('brand_id', brandId)
  } else if (brandName) {
    const { data: brand } = await supabase
      .from('brands')
      .select('id')
      .ilike('name', brandName)
      .maybeSingle()

    if (!brand) return res.json({ models: [] })
    query = query.eq('brand_id', brand.id)
  }

  if (search) {
    const escaped = search.replace(/[%,()]/g, ' ').trim()
    if (escaped) {
      query = query.or(`name.ilike.%${escaped}%,model_code.ilike.%${escaped}%`)
    }
  }

  const { data, error } = await query.order('name', { ascending: true })

  if (error) {
    if (!isMissingRelation(error)) {
      console.warn('[Compatibility] Model list failed:', error.message)
    }
    return res.json({ models: [] })
  }

  return res.json({ models: (data || []).map(shapeModel) })
}
