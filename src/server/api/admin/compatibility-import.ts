import { Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { asyncHandler } from '../utils/async-handler'
import {
  addModelsToBrandCatalogue,
  COMPAT_TABLE_MISSING,
  isMissingRelation,
  normalizeModelName,
  stripBrandPrefix,
} from '../utils/compatibility'

/**
 * Bulk compatibility import.
 *
 *   SKU     | Product   | Compatible Models
 *   DSP001  | Display A | Redmi Note 8, Redmi Note 8T, Redmi Note 9
 *
 * Matches an EXISTING product by SKU (or exact name) and attaches the listed
 * models to it. It deliberately cannot create products: a spreadsheet row that
 * matches nothing is reported as skipped, so an import can never turn one
 * display into five near-identical products. Phone models are reused
 * case-insensitively, so re-importing the same sheet adds nothing.
 *
 * Stock columns are ignored entirely - importing compatibility never changes a
 * stock value.
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

interface ImportRow {
  sku?: string
  product?: string
  brand?: string
  models?: string[]
}

interface RowResult {
  row: number
  sku: string
  product: string
  status: 'linked' | 'skipped'
  message: string
  linked: number
  created_models: number
}

/**
 * POST /api/admin/compatibility/import
 * Body: { rows: ImportRow[], mode?: 'merge' | 'replace', dryRun?: boolean }
 */
export const importCompatibilityHandler = asyncHandler(async (req: Request, res: Response) => {
  const supabase = getSupabaseAdmin()

  const rows: ImportRow[] = Array.isArray(req.body?.rows) ? req.body.rows : []
  const mode: 'merge' | 'replace' = req.body?.mode === 'replace' ? 'replace' : 'merge'
  const dryRun = Boolean(req.body?.dryRun)

  if (rows.length === 0) {
    return res.status(400).json({ error: 'No rows to import' })
  }
  if (rows.length > 1000) {
    return res.status(400).json({ error: 'Import is limited to 1000 rows at a time' })
  }

  // Fail fast with a clear message when the migration has not been applied.
  const { error: tableError } = await supabase.from('phone_models').select('id').limit(1)
  if (tableError && isMissingRelation(tableError)) {
    return res.status(404).json({ error: COMPAT_TABLE_MISSING, code: 'TABLE_NOT_FOUND' })
  }

  // --- Reference data, loaded once -----------------------------------------
  const { data: brandRows } = await supabase.from('brands').select('id, name')
  const brandsByLower = new Map<string, { id: string; name: string }>()
  for (const brand of brandRows || []) {
    brandsByLower.set(String(brand.name).toLowerCase(), { id: brand.id, name: brand.name })
  }

  const { data: modelRows } = await supabase.from('phone_models').select('id, brand_id, name')
  const modelKey = (brandId: string, name: string) => `${brandId}::${name.trim().toLowerCase()}`
  const modelsByKey = new Map<string, string>()
  for (const model of modelRows || []) {
    modelsByKey.set(modelKey(model.brand_id, model.name), model.id)
  }

  const ensureBrand = async (name: string): Promise<{ id: string; name: string } | null> => {
    const clean = name.trim()
    if (clean.length < 2) return null

    const cached = brandsByLower.get(clean.toLowerCase())
    if (cached) return cached

    if (dryRun) return { id: 'dry-run', name: clean }

    const { data, error } = await supabase
      .from('brands')
      .insert({ name: clean, slug: slugify(clean) })
      .select('id, name')
      .single()

    if (error || !data) return null

    const brand = { id: data.id, name: data.name }
    brandsByLower.set(clean.toLowerCase(), brand)
    return brand
  }

  /** Models this import brought into existence, per brand id. */
  const newModelsByBrand = new Map<string, string[]>()

  const ensureModel = async (
    brandId: string,
    name: string,
    brandName = ''
  ): Promise<{ id: string; created: boolean } | null> => {
    // A sheet often carries the display grade in the model cell
    // ("A05 W/F"). The phone is the A05 - the grade belongs to the product.
    const clean = normalizeModelName(stripBrandPrefix(name.trim(), brandName))
    if (!clean) return null

    const existing = modelsByKey.get(modelKey(brandId, clean))
    if (existing) return { id: existing, created: false }

    if (dryRun) return { id: 'dry-run', created: true }

    const { data, error } = await supabase
      .from('phone_models')
      .insert({ brand_id: brandId, name: clean })
      .select('id')
      .single()

    if (error || !data) {
      console.warn('[Compatibility Import] Could not create model:', name, error?.message)
      return null
    }

    modelsByKey.set(modelKey(brandId, clean), data.id)
    // Also offer it in the product form's Model dropdown - flushed per brand
    // once the whole sheet is processed.
    const created = newModelsByBrand.get(brandId) || []
    created.push(clean)
    newModelsByBrand.set(brandId, created)
    return { id: data.id, created: true }
  }

  /**
   * "Xiaomi Redmi Note 8" -> brand Xiaomi, model "Redmi Note 8".
   * Falls back to the row/product brand when the cell has no brand prefix.
   */
  const splitBrandFromModel = (value: string, fallbackBrand: string) => {
    const clean = value.trim()
    for (const [lower, brand] of brandsByLower) {
      if (clean.toLowerCase().startsWith(`${lower} `)) {
        return { brandName: brand.name, modelName: clean.slice(lower.length).trim() }
      }
    }
    return { brandName: fallbackBrand, modelName: clean }
  }

  const results: RowResult[] = []
  let totalLinked = 0
  let totalCreatedModels = 0
  let skipped = 0

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]
    const sku = String(row.sku || '').trim()
    const productName = String(row.product || '').trim()
    const models = (Array.isArray(row.models) ? row.models : [])
      .map((m) => String(m || '').trim())
      .filter(Boolean)

    const record: RowResult = {
      row: index + 1,
      sku,
      product: productName,
      status: 'skipped',
      message: '',
      linked: 0,
      created_models: 0,
    }

    if (models.length === 0) {
      record.message = 'No compatible models listed'
      skipped++
      results.push(record)
      continue
    }

    // --- Find the existing product. Never create one. ----------------------
    let product: { id: string; name: string; brand: string | null } | null = null

    if (sku) {
      const { data } = await supabase
        .from('products')
        .select('id, name, brand')
        .ilike('sku', sku)
        .maybeSingle()
      product = (data as any) || null
    }

    if (!product && productName) {
      const { data } = await supabase
        .from('products')
        .select('id, name, brand')
        .ilike('name', productName)
        .limit(2)

      if ((data?.length || 0) === 1) {
        product = data![0] as any
      } else if ((data?.length || 0) > 1) {
        record.message = `"${productName}" matches ${data!.length} products - add the SKU to disambiguate`
        skipped++
        results.push(record)
        continue
      }
    }

    if (!product) {
      record.message = sku
        ? `No product with SKU "${sku}" - create the product first`
        : `No product named "${productName}" - create the product first`
      skipped++
      results.push(record)
      continue
    }

    record.product = product.name

    // --- Resolve each model, creating only what is missing -----------------
    const fallbackBrand = String(row.brand || product.brand || '').trim()
    const modelIds: string[] = []

    for (const raw of models) {
      const { brandName, modelName } = splitBrandFromModel(raw, fallbackBrand)
      if (!brandName || !modelName) continue

      const brand = await ensureBrand(brandName)
      if (!brand) continue

      const model = await ensureModel(brand.id, modelName, brand.name)
      if (!model) continue

      if (model.created) record.created_models++
      if (model.id !== 'dry-run') modelIds.push(model.id)
    }

    if (dryRun) {
      record.status = 'linked'
      record.linked = models.length
      record.message = `Would attach ${models.length} model(s)`
      totalLinked += models.length
      totalCreatedModels += record.created_models
      results.push(record)
      continue
    }

    if (modelIds.length === 0) {
      record.message = 'Could not resolve any model in this row'
      skipped++
      results.push(record)
      continue
    }

    if (mode === 'replace') {
      await supabase.from('product_compatibility').delete().eq('product_id', product.id)
    }

    const { error: linkError } = await supabase
      .from('product_compatibility')
      .upsert(
        modelIds.map((phone_model_id) => ({ product_id: product!.id, phone_model_id })),
        { onConflict: 'product_id,phone_model_id', ignoreDuplicates: true }
      )

    if (linkError) {
      record.message = linkError.message
      skipped++
      results.push(record)
      continue
    }

    record.status = 'linked'
    record.linked = modelIds.length
    record.message = `${modelIds.length} model(s) attached`
    totalLinked += modelIds.length
    totalCreatedModels += record.created_models
    results.push(record)
  }

  // One product -> many phones, and every phone the sheet introduced becomes
  // selectable as a product's own model too.
  for (const [brandId, names] of newModelsByBrand) {
    await addModelsToBrandCatalogue(supabase, brandId, names)
  }

  return res.json({
    dryRun,
    mode,
    summary: {
      rows: rows.length,
      linked: results.filter((r) => r.status === 'linked').length,
      skipped,
      compatibility_rows: totalLinked,
      models_created: totalCreatedModels,
      products_created: 0, // by design - an import never creates a product
    },
    results,
  })
})
