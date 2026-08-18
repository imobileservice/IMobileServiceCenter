import { Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { asyncHandler } from '../utils/async-handler'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Supabase configuration missing for admin brands API')
}

const getSupabaseAdmin = () => {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase not configured')
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
}

const TABLE_MISSING = 'Brands table not found. Run supabase/migrations/add_brands_table.sql'

const slugify = (name: string) =>
  name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/** Reject the placeholder that this whole feature exists to get rid of. */
const isPlaceholder = (name: string) => {
  const value = name.trim().toLowerCase()
  return value === 'other' || value === 'others' || value === 'n/a' || value === 'unknown'
}

// GET /api/admin/brands - list every brand, newest custom ones included
export const getBrandsHandler = asyncHandler(async (_req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('brands')
      .select('*')
      .order('name', { ascending: true })

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return res.status(404).json({ error: TABLE_MISSING, code: 'TABLE_NOT_FOUND' })
      }
      return res.status(500).json({ error: error.message, code: error.code })
    }

    return res.json({ brands: data || [] })
  } catch (error: any) {
    console.error('[Brands API] GET failed:', error.message)
    return res.status(500).json({ error: error.message })
  }
})

// POST /api/admin/brands - add a brand typed into the "Add New Brand" dialog
export const createBrandHandler = asyncHandler(async (req: Request, res: Response) => {
  try {
    const rawName = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
    const models = Array.isArray(req.body?.models) ? req.body.models : []

    if (rawName.length < 2) {
      return res.status(400).json({ error: 'Brand name is required (minimum 2 characters)' })
    }
    if (isPlaceholder(rawName)) {
      return res.status(400).json({
        error: 'Please enter the real manufacturer name instead of a placeholder like "Other".'
      })
    }

    const supabase = getSupabaseAdmin()

    // Case-insensitive match first, so "wiko" resolves to the existing "Wiko"
    const { data: existing } = await supabase
      .from('brands')
      .select('*')
      .ilike('name', rawName)
      .maybeSingle()

    if (existing) {
      return res.json({ brand: existing, created: false })
    }

    const { data, error } = await supabase
      .from('brands')
      .insert({ name: rawName, slug: slugify(rawName), models })
      .select()
      .single()

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return res.status(404).json({ error: TABLE_MISSING, code: 'TABLE_NOT_FOUND' })
      }
      return res.status(500).json({ error: error.message, code: error.code })
    }

    return res.status(201).json({ brand: data, created: true })
  } catch (error: any) {
    console.error('[Brands API] POST failed:', error.message)
    return res.status(500).json({ error: error.message })
  }
})

/**
 * Ask the AI which models this manufacturer sells. Returns [] rather than
 * throwing when the key is missing or the answer is unusable - the modal then
 * falls back to the "Other / Custom Model" free-text input.
 */
async function searchModelsWithAI(brandName: string): Promise<string[]> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim()
  if (!apiKey) {
    console.warn('[Brand Models] OPENROUTER_API_KEY missing, skipping AI lookup')
    return []
  }

  try {
    // Dynamic import to avoid ERR_REQUIRE_ESM in the CJS build
    const sdk = await (eval('import("@openrouter/sdk")') as Promise<any>)
    const OpenRouter = sdk.OpenRouter
    const openrouter = new OpenRouter({ apiKey })

    const prompt = `List the mobile phone models sold by the brand "${brandName}".
Return ONLY a JSON array of model name strings, no explanation and no markdown code block.
Rules:
1. Do NOT repeat the brand name inside each model (write "Hot 40" not "Infinix Hot 40").
2. Order newest first, and include popular budget models - this is for a phone repair parts shop.
3. Return between 10 and 40 models.
4. If "${brandName}" is not a phone manufacturer you know, return an empty array [].
Example output: ["Hot 40", "Note 30", "Smart 8"]`

    const response = await openrouter.chat.send({
      chatGenerationParams: {
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        messages: [{ role: 'user', content: prompt }],
      },
      httpReferer: 'http://localhost:3000',
      xTitle: 'IMobile Admin Panel'
    })

    const responseText = (response as any).choices?.[0]?.message?.content
    if (!responseText) return []

    const arrayMatch = responseText.match(/\[[\s\S]*\]/)
    if (!arrayMatch) return []

    const parsed = JSON.parse(arrayMatch[0])
    if (!Array.isArray(parsed)) return []

    const seen = new Set<string>()
    return parsed
      .filter((m: unknown): m is string => typeof m === 'string')
      .map((m) => m.trim())
      .filter((m) => {
        if (m.length < 1 || m.length > 60) return false
        const key = m.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, 60)
  } catch (error: any) {
    console.error('[Brand Models] AI lookup failed:', error.message)
    return []
  }
}

// GET /api/admin/brands/:name/models - cached models, or an AI lookup on a miss
export const getBrandModelsHandler = asyncHandler(async (req: Request, res: Response) => {
  const brandName = String(req.params.name || '').trim()

  if (brandName.length < 2) {
    return res.status(400).json({ error: 'Brand name is required' })
  }

  const refresh = req.query.refresh === 'true'
  let supabase: ReturnType<typeof getSupabaseAdmin> | null = null

  try {
    supabase = getSupabaseAdmin()
  } catch {
    // No DB access - still try the AI lookup so the dropdown gets something
  }

  if (supabase && !refresh) {
    const { data } = await supabase
      .from('brands')
      .select('models')
      .ilike('name', brandName)
      .maybeSingle()

    const cached = Array.isArray(data?.models) ? (data!.models as string[]) : []
    if (cached.length > 0) {
      return res.json({ models: cached, source: 'cache' })
    }
  }

  const models = await searchModelsWithAI(brandName)

  // Cache a successful lookup so the next admin does not wait on the AI again
  if (supabase && models.length > 0) {
    const { error } = await supabase
      .from('brands')
      .update({ models, updated_at: new Date().toISOString() })
      .ilike('name', brandName)
    if (error) console.warn('[Brand Models] Could not cache models:', error.message)
  }

  return res.json({ models, source: models.length > 0 ? 'ai' : 'none' })
})
