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

/**
 * Phone model ids whose name / code / alias matches the search text.
 * Returns [] (never throws) when the tables are missing.
 */
export async function findMatchingModelIds(
  supabase: SupabaseClient,
  search: string,
  limit = 200
): Promise<string[]> {
  const term = search.trim()
  if (!term) return []

  try {
    const escaped = term.replace(/[%,()]/g, ' ').trim()
    if (!escaped) return []

    const { data, error } = await supabase
      .from('phone_models')
      .select('id, name, model_code, aliases')
      .or(`name.ilike.%${escaped}%,model_code.ilike.%${escaped}%`)
      .limit(limit)

    if (error) {
      if (!isMissingRelation(error)) {
        console.warn('[Compatibility] Model search failed:', error.message)
      }
      return []
    }

    const ids = new Set<string>((data || []).map((m: any) => m.id))

    // Aliases are a text[]; ILIKE cannot reach inside it from PostgREST, so the
    // alias pass is done here. The model table is small (hundreds of rows).
    const { data: aliasRows } = await supabase
      .from('phone_models')
      .select('id, aliases')
      .not('aliases', 'eq', '{}')
      .limit(2000)

    const lowered = escaped.toLowerCase()
    for (const row of aliasRows || []) {
      const aliases: string[] = Array.isArray(row.aliases) ? row.aliases : []
      if (aliases.some((a) => String(a).toLowerCase().includes(lowered))) {
        ids.add(row.id)
      }
    }

    return Array.from(ids)
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
