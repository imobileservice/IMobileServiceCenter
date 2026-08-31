import { Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { asyncHandler } from '../utils/async-handler'
import {
  COMPAT_TABLE_MISSING,
  MODEL_SELECT,
  isMissingRelation,
  loadCompatibilityMap,
  normalizeModelName,
  setProductCompatibility,
  shapeModel,
  stripBrandPrefix,
} from '../utils/compatibility'

/**
 * Admin CRUD for phone models plus the per-product compatibility set.
 *
 * Phone models are shared reference data: one "Redmi Note 8" row is reused by
 * every product that fits it. Nothing here creates or duplicates products, and
 * nothing here writes to inv_stock.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const getSupabaseAdmin = () => {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase not configured')
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const slugify = (name: string) =>
  name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

const cleanAliases = (input: unknown): string[] => {
  const raw = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(',')
      : []

  const seen = new Set<string>()
  const out: string[] = []
  for (const value of raw) {
    const alias = String(value || '').trim()
    if (!alias || alias.length > 80) continue
    const key = alias.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(alias)
  }
  return out.slice(0, 25)
}

/**
 * Resolve a brand name to a brands row, creating it when missing.
 * Reuses the existing brands table - the model list never invents a second
 * brand catalogue.
 */
async function resolveBrandId(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  brandName: string
): Promise<{ id: string; name: string } | null> {
  const name = brandName.trim()
  if (name.length < 2) return null

  const { data: existing } = await supabase
    .from('brands')
    .select('id, name')
    .ilike('name', name)
    .maybeSingle()

  if (existing) return existing as { id: string; name: string }

  const { data, error } = await supabase
    .from('brands')
    .insert({ name, slug: slugify(name) })
    .select('id, name')
    .single()

  if (error) {
    console.warn('[Phone Models] Could not create brand:', error.message)
    return null
  }
  return data as { id: string; name: string }
}

// GET /api/admin/phone-models?search=&brand_id=&brand=&limit=
export const getPhoneModelsHandler = asyncHandler(async (req: Request, res: Response) => {
  const supabase = getSupabaseAdmin()

  const search = String(req.query.search || '').trim()
  const brandId = String(req.query.brand_id || '').trim()
  const brandName = String(req.query.brand || '').trim()
  const limit = Math.min(Number(req.query.limit) || 500, 2000)

  let query = supabase.from('phone_models').select(MODEL_SELECT).limit(limit)

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
    if (isMissingRelation(error)) {
      return res.status(404).json({ error: COMPAT_TABLE_MISSING, code: 'TABLE_NOT_FOUND', models: [] })
    }
    return res.status(500).json({ error: error.message, models: [] })
  }

  return res.json({ models: (data || []).map(shapeModel) })
})

// POST /api/admin/phone-models  { brand | brand_id, name, model_code?, aliases? }
export const createPhoneModelHandler = asyncHandler(async (req: Request, res: Response) => {
  const supabase = getSupabaseAdmin()

  const rawName = String(req.body?.name || '').trim()
  const modelCode = String(req.body?.model_code || '').trim() || null
  const aliases = cleanAliases(req.body?.aliases)
  let brandId = String(req.body?.brand_id || '').trim()
  let brandName = String(req.body?.brand || '').trim()

  if (rawName.length < 1) {
    return res.status(400).json({ error: 'Model name is required' })
  }

  if (!brandId) {
    const brand = await resolveBrandId(supabase, brandName)
    if (!brand) {
      return res.status(400).json({ error: 'A brand is required to add a phone model' })
    }
    brandId = brand.id
    brandName = brand.name || brandName
  }

  // "M02 W/F" is a display grade on a phone called M02. Store the phone.
  const name = normalizeModelName(stripBrandPrefix(rawName, brandName))

  // Never create a duplicate model - reuse the existing row instead.
  const { data: existing } = await supabase
    .from('phone_models')
    .select(MODEL_SELECT)
    .eq('brand_id', brandId)
    .ilike('name', name)
    .maybeSingle()

  if (existing) {
    return res.json({ model: shapeModel(existing), created: false })
  }

  const { data, error } = await supabase
    .from('phone_models')
    .insert({ brand_id: brandId, name, model_code: modelCode, aliases })
    .select(MODEL_SELECT)
    .single()

  if (error) {
    if (isMissingRelation(error)) {
      return res.status(404).json({ error: COMPAT_TABLE_MISSING, code: 'TABLE_NOT_FOUND' })
    }
    return res.status(500).json({ error: error.message })
  }

  return res.status(201).json({ model: shapeModel(data), created: true })
})

/**
 * POST /api/admin/phone-models/bulk  { brand | brand_id, names: string[] }
 *
 * Bulk-adds a brand model list in one call (the "Import models from <brand>"
 * button in the product modal). Existing models are reused, never duplicated.
 */
export const bulkCreatePhoneModelsHandler = asyncHandler(async (req: Request, res: Response) => {
  const supabase = getSupabaseAdmin()

  const names: string[] = Array.isArray(req.body?.names) ? req.body.names : []
  let brandId = String(req.body?.brand_id || '').trim()
  let brandName = String(req.body?.brand || '').trim()

  if (!brandId) {
    const brand = await resolveBrandId(supabase, brandName)
    if (!brand) {
      return res.status(400).json({ error: 'A brand is required to add phone models' })
    }
    brandId = brand.id
    brandName = brand.name || brandName
  }

  const cleaned: string[] = []
  const seen = new Set<string>()
  for (const value of names) {
    // Drop display grades ("A05 W/F" -> "A05") and a repeated brand, so a
    // bulk import cannot split one phone across several model rows.
    const name = normalizeModelName(stripBrandPrefix(String(value || '').trim(), brandName))
    if (!name || name.toLowerCase() === 'custom') continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    cleaned.push(name)
  }

  if (cleaned.length === 0) {
    return res.json({ models: [] })
  }

  // Insert only the names that are not already stored for this brand, matched
  // case-insensitively so "redmi note 8" never lands beside "Redmi Note 8".
  const { data: existingRows, error: existingError } = await supabase
    .from('phone_models')
    .select('name')
    .eq('brand_id', brandId)

  if (existingError && isMissingRelation(existingError)) {
    return res.status(404).json({ error: COMPAT_TABLE_MISSING, code: 'TABLE_NOT_FOUND' })
  }

  const existingNames = new Set((existingRows || []).map((r: any) => String(r.name).toLowerCase()))
  const toInsert = cleaned.filter((name) => !existingNames.has(name.toLowerCase()))

  if (toInsert.length > 0) {
    const { error } = await supabase
      .from('phone_models')
      .insert(toInsert.map((name) => ({ brand_id: brandId, name })))

    // 23505 = another admin inserted the same model first; harmless.
    if (error && error.code !== '23505') {
      if (isMissingRelation(error)) {
        return res.status(404).json({ error: COMPAT_TABLE_MISSING, code: 'TABLE_NOT_FOUND' })
      }
      console.warn('[Phone Models] Bulk insert warning:', error.message)
    }
  }

  const { data } = await supabase
    .from('phone_models')
    .select(MODEL_SELECT)
    .eq('brand_id', brandId)
    .order('name', { ascending: true })

  return res.json({ models: (data || []).map(shapeModel), created: toInsert.length })
})

// PUT /api/admin/phone-models/:id
export const updatePhoneModelHandler = asyncHandler(async (req: Request, res: Response) => {
  const supabase = getSupabaseAdmin()
  const { id } = req.params

  const updates: Record<string, any> = {}
  if (req.body?.name !== undefined) updates.name = String(req.body.name).trim()
  if (req.body?.model_code !== undefined) updates.model_code = String(req.body.model_code).trim() || null
  if (req.body?.aliases !== undefined) updates.aliases = cleanAliases(req.body.aliases)
  if (req.body?.is_active !== undefined) updates.is_active = Boolean(req.body.is_active)
  if (req.body?.brand_id !== undefined) updates.brand_id = String(req.body.brand_id)

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Nothing to update' })
  }

  const { data, error } = await supabase
    .from('phone_models')
    .update(updates)
    .eq('id', id)
    .select(MODEL_SELECT)
    .single()

  if (error) {
    if (isMissingRelation(error)) {
      return res.status(404).json({ error: COMPAT_TABLE_MISSING, code: 'TABLE_NOT_FOUND' })
    }
    return res.status(500).json({ error: error.message })
  }

  return res.json({ model: shapeModel(data) })
})

/**
 * DELETE /api/admin/phone-models/:id
 * Removes the model and its compatibility rows (ON DELETE CASCADE).
 * Products and their stock are untouched.
 */
export const deletePhoneModelHandler = asyncHandler(async (req: Request, res: Response) => {
  const supabase = getSupabaseAdmin()
  const { id } = req.params

  const { error } = await supabase.from('phone_models').delete().eq('id', id)

  if (error) {
    if (isMissingRelation(error)) {
      return res.status(404).json({ error: COMPAT_TABLE_MISSING, code: 'TABLE_NOT_FOUND' })
    }
    return res.status(500).json({ error: error.message })
  }

  return res.json({ success: true })
})

/**
 * POST /api/admin/products/compatibility/bulk  { product_ids: string[] }
 *
 * Compatible models for many products in one round trip - the label modal needs
 * them for every product in the print queue.
 */
export const bulkProductCompatibilityHandler = asyncHandler(async (req: Request, res: Response) => {
  const supabase = getSupabaseAdmin()
  const ids: string[] = Array.isArray(req.body?.product_ids) ? req.body.product_ids : []

  if (ids.length === 0) return res.json({ compatibility: {} })
  if (ids.length > 500) {
    return res.status(400).json({ error: 'Too many products in one request' })
  }

  const map = await loadCompatibilityMap(supabase, ids)
  const compatibility: Record<string, any[]> = {}
  for (const id of ids) {
    compatibility[id] = map.get(id) || []
  }

  return res.json({ compatibility })
})

// GET /api/admin/products/:id/compatibility
export const getProductCompatibilityHandler = asyncHandler(async (req: Request, res: Response) => {
  const supabase = getSupabaseAdmin()
  const { id } = req.params

  const map = await loadCompatibilityMap(supabase, [id])
  return res.json({ models: map.get(id) || [] })
})

/**
 * PUT /api/admin/products/:id/compatibility  { phone_model_ids: string[] }
 *
 * Replaces the product compatible-model set. Stock is never read or written
 * here - Display A keeps its single inv_stock row no matter how many models it
 * is linked to.
 */
export const setProductCompatibilityHandler = asyncHandler(async (req: Request, res: Response) => {
  const supabase = getSupabaseAdmin()
  const { id } = req.params
  const ids: string[] = Array.isArray(req.body?.phone_model_ids) ? req.body.phone_model_ids : []

  const result = await setProductCompatibility(supabase, id, ids)

  if (!result.ok) {
    const status = result.error === COMPAT_TABLE_MISSING ? 404 : 500
    return res.status(status).json({ error: result.error })
  }

  const map = await loadCompatibilityMap(supabase, [id])
  return res.json({
    models: map.get(id) || [],
    added: result.added,
    removed: result.removed,
  })
})
