import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Helpers shared by the admin and storefront compatibility endpoints.
 *
 * Everything here is written so the app keeps working when
 * supabase/migrations/add_phone_model_compatibility.sql has not been run yet:
 * a missing table degrades to "no compatibility data", never to an error page.
 */

export const COMPAT_TABLE_MISSING =
  'Phone model tables not found. Run supabase/migrations/add_phone_model_compatibility.sql'

/**
 * Is this error "that table/column has not been migrated yet"?
 *
 * Postgres reports 42P01 (missing table) / 42703 (missing column); PostgREST
 * reports PGRST205 for a table missing from its schema cache and PGRST204 for a
 * column missing on a write ("Could not find the 'sku' column"). All four mean
 * the same thing to us: degrade gracefully instead of failing the request.
 */
export function isMissingRelation(error: any): boolean {
  if (!error) return false
  return (
    error.code === '42P01' ||
    error.code === '42703' ||
    error.code === 'PGRST205' ||
    error.code === 'PGRST204' ||
    /does not exist/i.test(error.message || '') ||
    /could not find the .+ column/i.test(error.message || '')
  )
}

/**
 * Quality grades the shop writes into a DISPLAY's name - they say what the
 * part is made of, not which phone it fits.
 *
 *   "Samsung M02 W/F Display"   W/F = With Frame, a display grade
 *   "Samsung A32 4G Incell"     Incell = a panel type
 *
 * The phone is "Samsung M02" either way. The grade already lives on the
 * product as specs.quality, so stripping it from the MODEL name loses nothing
 * and stops one phone splitting into "M02", "M02 W/F" and "M02 Incell".
 */
const QUALITY_TOKENS = [
  'with frame',
  'w/frame',
  'w/f',
  'wf',
  'without frame',
  'no frame',
  'incell',
  'in-cell',
  'in cell',
  'amoled',
  'soft oled',
  'hard oled',
  'oled',
  'tft',
  'ips',
  'lcd',
  'service pack',
  'original',
  'oem',
  'combo',
  'folder',
  'display',
  'screen',
]

/**
 * Strip display quality grades from a phone model name.
 *
 *   "M02 W/F"      -> "M02"
 *   "10 4G W/F"    -> "10 4G"
 *   "A32 4G Incell"-> "A32 4G"
 *   "Redmi Note 8" -> "Redmi Note 8"   (unchanged)
 *
 * Returns the original text when stripping would leave nothing, so a model
 * genuinely called "Display" is never erased.
 */
export function normalizeModelName(raw: string): string {
  const original = String(raw || '').trim()
  if (!original) return ''

  let out = original
  for (const token of QUALITY_TOKENS) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Whole token only: bounded by start/end, whitespace, slash, dash or bracket.
    // "W/F" must go; the "4G" in "10 4G" and the "F" in "F62" must stay.
    out = out.replace(new RegExp(`(^|[\\s(\\[/-])${escaped}($|[\\s)\\]/-])`, 'gi'), '$1 $2')
  }

  out = out
    .replace(/\s*[/-]\s*$/g, '')
    .replace(/^\s*[/-]\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return out || original
}

/**
 * Drop a brand name the model repeats.
 *
 * The label is composed as "<brand> <model>", so a model stored as
 * "samsung A32" under Samsung prints "Samsung samsung A32" - on the picker,
 * and on a customer's bill. Only a leading whole-word repeat is removed, and
 * never when it would empty the name (a brand whose model IS the brand name).
 */
export function stripBrandPrefix(name: string, brandName?: string | null): string {
  const model = String(name || '').trim()
  const brand = String(brandName || '').trim()
  if (!model || !brand) return model

  const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const stripped = model.replace(new RegExp(`^${escaped}\\b[\\s-]*`, 'i'), '').trim()

  return stripped || model
}

export interface PhoneModelRow {
  id: string
  brand_id: string
  name: string
  model_code: string | null
  aliases: string[]
  is_active: boolean
  brands?: { id: string; name: string; slug: string } | null
}

/** Shape a phone_models row (with its brand join) for the client. */
export function shapeModel(row: any) {
  const brand = Array.isArray(row.brands) ? row.brands[0] : row.brands
  return {
    id: row.id,
    brand_id: row.brand_id,
    brand_name: brand?.name || '',
    brand_slug: brand?.slug || '',
    name: row.name,
    model_code: row.model_code || '',
    aliases: Array.isArray(row.aliases) ? row.aliases : [],
    is_active: row.is_active !== false,
    /** "Xiaomi Redmi Note 8" - what the pickers display. */
    label: [brand?.name, row.name].filter(Boolean).join(' '),
  }
}

const MODEL_SELECT = 'id, brand_id, name, model_code, aliases, is_active, brands:brand_id (id, name, slug)'

export { MODEL_SELECT }

interface SearchableModel {
  id: string
  /** Lower-cased haystack: "redmi 10 4g", the bare name, the code, the aliases. */
  haystacks: string[]
}

/**
 * The whole model list, briefly cached.
 *
 * The catalogue is a few hundred rows and POS search fires on every keystroke,
 * so it is read once and reused for a few seconds. A model added in the admin
 * shows up on the next refill.
 */
let modelCache: { at: number; models: SearchableModel[] } | null = null
const MODEL_CACHE_MS = 30_000

async function loadSearchableModels(supabase: SupabaseClient): Promise<SearchableModel[]> {
  if (modelCache && Date.now() - modelCache.at < MODEL_CACHE_MS) return modelCache.models

  const { data, error } = await supabase
    .from('phone_models')
    .select('id, name, model_code, aliases, brands:brand_id (name)')
    .limit(5000)

  if (error) {
    if (!isMissingRelation(error)) {
      console.warn('[Compatibility] Model load failed:', error.message)
    }
    return []
  }

  const models: SearchableModel[] = (data || []).map((row: any) => {
    const brand = Array.isArray(row.brands) ? row.brands[0] : row.brands
    const brandName = brand?.name || ''
    const aliases: string[] = Array.isArray(row.aliases) ? row.aliases : []

    return {
      id: row.id,
      haystacks: [
        // The brand lives in its own column, so a cashier typing the natural
        // "Redmi 10 4G" would never match the stored name "10 4G" on its own.
        [brandName, row.name].filter(Boolean).join(' '),
        row.name || '',
        row.model_code || '',
        ...aliases.map((a) => String(a)),
      ]
        .filter(Boolean)
        .map((s) => s.toLowerCase()),
    }
  })

  modelCache = { at: Date.now(), models }
  return models
}

/**
 * Phone model ids whose brand+name / name / code / alias matches the search
 * text. Returns [] (never throws) when the tables are missing.
 *
 * Matching is done here rather than in SQL because the useful haystack spans
 * two tables (brand name + model name) and a text[] of aliases, neither of
 * which PostgREST can ILIKE across in one query.
 */
export async function findMatchingModelIds(
  supabase: SupabaseClient,
  search: string,
  limit = 200
): Promise<string[]> {
  const term = search.trim().toLowerCase()
  if (!term) return []

  try {
    const models = await loadSearchableModels(supabase)
    const ids: string[] = []

    for (const model of models) {
      if (model.haystacks.some((h) => h.includes(term))) {
        ids.push(model.id)
        if (ids.length >= limit) break
      }
    }

    return ids
  } catch (e: any) {
    console.warn('[Compatibility] Model search threw:', e?.message)
    return []
  }
}

/**
 * Product ids compatible with any of the given phone model ids.
 * Returns [] (never throws) when the tables are missing.
 */
export async function findCompatibleProductIds(
  supabase: SupabaseClient,
  phoneModelIds: string[]
): Promise<string[]> {
  if (!phoneModelIds.length) return []

  try {
    const { data, error } = await supabase
      .from('product_compatibility')
      .select('product_id')
      .in('phone_model_id', phoneModelIds)

    if (error) {
      if (!isMissingRelation(error)) {
        console.warn('[Compatibility] Product lookup failed:', error.message)
      }
      return []
    }

    return Array.from(new Set((data || []).map((r: any) => r.product_id)))
  } catch (e: any) {
    console.warn('[Compatibility] Product lookup threw:', e?.message)
    return []
  }
}

/**
 * Compatible models for a set of products, keyed by product id.
 * Returns an empty map (never throws) when the tables are missing.
 */
export async function loadCompatibilityMap(
  supabase: SupabaseClient,
  productIds: string[]
): Promise<Map<string, ReturnType<typeof shapeModel>[]>> {
  const map = new Map<string, ReturnType<typeof shapeModel>[]>()
  if (!productIds.length) return map

  try {
    const { data, error } = await supabase
      .from('product_compatibility')
      .select(`product_id, phone_models:phone_model_id (${MODEL_SELECT})`)
      .in('product_id', productIds)

    if (error) {
      if (!isMissingRelation(error)) {
        console.warn('[Compatibility] Map load failed:', error.message)
      }
      return map
    }

    for (const row of data || []) {
      const raw = Array.isArray((row as any).phone_models)
        ? (row as any).phone_models[0]
        : (row as any).phone_models
      if (!raw) continue

      const list = map.get((row as any).product_id) || []
      list.push(shapeModel(raw))
      map.set((row as any).product_id, list)
    }

    // Stable, readable order: brand then model name
    for (const list of map.values()) {
      list.sort((a, b) => a.label.localeCompare(b.label))
    }

    return map
  } catch (e: any) {
    console.warn('[Compatibility] Map load threw:', e?.message)
    return map
  }
}

/**
 * Replace a product's compatible model set with exactly `phoneModelIds`.
 *
 * Never touches products or inv_stock - only join rows. Removing a model
 * removes a relationship, it does not remove stock.
 */
export async function setProductCompatibility(
  supabase: SupabaseClient,
  productId: string,
  phoneModelIds: string[]
): Promise<{ ok: boolean; error?: string; added: number; removed: number }> {
  const wanted = Array.from(new Set(phoneModelIds.filter(Boolean)))

  const { data: existingRows, error: readError } = await supabase
    .from('product_compatibility')
    .select('phone_model_id')
    .eq('product_id', productId)

  if (readError) {
    if (isMissingRelation(readError)) {
      return { ok: false, error: COMPAT_TABLE_MISSING, added: 0, removed: 0 }
    }
    return { ok: false, error: readError.message, added: 0, removed: 0 }
  }

  const existing = new Set((existingRows || []).map((r: any) => r.phone_model_id))
  const toAdd = wanted.filter((id) => !existing.has(id))
  const toRemove = Array.from(existing).filter((id) => !wanted.includes(id as string)) as string[]

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('product_compatibility')
      .delete()
      .eq('product_id', productId)
      .in('phone_model_id', toRemove)

    if (error) return { ok: false, error: error.message, added: 0, removed: 0 }
  }

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from('product_compatibility')
      .upsert(
        toAdd.map((phone_model_id) => ({ product_id: productId, phone_model_id })),
        { onConflict: 'product_id,phone_model_id', ignoreDuplicates: true }
      )

    if (error) return { ok: false, error: error.message, added: 0, removed: toRemove.length }
  }

  return { ok: true, added: toAdd.length, removed: toRemove.length }
}
