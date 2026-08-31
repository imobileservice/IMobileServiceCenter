/**
 * Strip display quality grades out of the PHONE MODEL catalogue.
 *
 *   Samsung "M02 W/F"    ->  Samsung "M02"       (W/F = With Frame)
 *   Redmi   "10 4G W/F"  ->  Redmi   "10 4G"
 *   Samsung "A32 4G Incell" -> Samsung "A32 4G"
 *
 * W/F, Incell, OLED and friends describe the PART, not the phone. They already
 * live on the product as specs.quality, so the model catalogue should not
 * carry them - otherwise one phone shows up as three different "models" and a
 * cashier searching the real phone name misses two of them.
 *
 *   npx tsx scripts/clean-phone-models.ts          # dry run, changes nothing
 *   npx tsx scripts/clean-phone-models.ts --apply  # write the changes
 *
 * What it touches: phone_models (rename / merge), product_compatibility and
 * inv_sale_items.phone_model_id (repointed to the surviving model).
 * What it NEVER touches: products, product names, inv_stock, sales totals,
 * orders, customers. No stock value changes, no product is created or deleted.
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { normalizeModelName, stripBrandPrefix } from '../src/server/api/utils/compatibility'

dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const APPLY = process.argv.includes('--apply')

interface ModelRow {
  id: string
  brand_id: string
  name: string
  brands?: { name: string } | { name: string }[] | null
}

const brandOf = (row: ModelRow): string => {
  const b = Array.isArray(row.brands) ? row.brands[0] : row.brands
  return b?.name || '?'
}

/** Move every link from `fromId` to `keepId`, then delete the spare model. */
async function mergeModel(fromId: string, keepId: string): Promise<number> {
  let moved = 0

  const { data: links } = await supabase
    .from('product_compatibility')
    .select('product_id')
    .eq('phone_model_id', fromId)

  for (const link of links || []) {
    // Upsert first: the product may already be linked to the surviving model,
    // in which case the pair simply collapses into one row.
    const { error } = await supabase
      .from('product_compatibility')
      .upsert(
        { product_id: (link as any).product_id, phone_model_id: keepId },
        { onConflict: 'product_id,phone_model_id', ignoreDuplicates: true }
      )
    if (error) throw new Error(`link move failed: ${error.message}`)
    moved++
  }

  // Past sales that recorded this model keep pointing at a real row.
  const { error: saleError } = await supabase
    .from('inv_sale_items')
    .update({ phone_model_id: keepId })
    .eq('phone_model_id', fromId)

  if (saleError && !/does not exist|could not find/i.test(saleError.message)) {
    throw new Error(`sale item repoint failed: ${saleError.message}`)
  }

  const { error: delError } = await supabase.from('phone_models').delete().eq('id', fromId)
  if (delError) throw new Error(`model delete failed: ${delError.message}`)

  return moved
}

async function main() {
  console.log(APPLY ? '=== APPLYING CHANGES ===' : '=== DRY RUN (nothing will be written) ===')

  const { data: models, error } = await supabase
    .from('phone_models')
    .select('id, brand_id, name, brands:brand_id (name)')
    .limit(5000)

  if (error) {
    console.error('Could not read phone_models:', error.message)
    process.exit(1)
  }

  const rows = (models || []) as ModelRow[]
  console.log(`phone_models in catalogue: ${rows.length}\n`)

  // Group by brand + cleaned name. Everything in a group is the same phone.
  const groups = new Map<string, { cleaned: string; rows: ModelRow[] }>()
  for (const row of rows) {
    const cleaned = normalizeModelName(stripBrandPrefix(row.name, brandOf(row)))
    const key = `${row.brand_id}::${cleaned.toLowerCase()}`
    if (!groups.has(key)) groups.set(key, { cleaned, rows: [] })
    groups.get(key)!.rows.push(row)
  }

  let renames = 0
  let merges = 0
  let linksMoved = 0
  let untouched = 0

  for (const { cleaned, rows: group } of groups.values()) {
    const dirty = group.filter((r) => r.name !== cleaned)
    if (dirty.length === 0 && group.length === 1) {
      untouched++
      continue
    }

    // Prefer a row that is already clean; otherwise rename one in place, which
    // keeps its id and so keeps every link it already has.
    const exact = group.find((r) => r.name === cleaned)
    const keep = exact || group[0]

    // Merge the spares BEFORE renaming the survivor. phone_models has a unique
    // index on (brand_id, LOWER(name)), so renaming "A05s W/F" to "A05s" while
    // a stray "A05S" still exists would collide - clearing the spares first
    // makes the name free.
    for (const spare of group) {
      if (spare.id === keep.id) continue
      console.log(`MERGE   ${brandOf(spare)} "${spare.name}"  ->  "${cleaned}"`)
      merges++
      if (APPLY) {
        try {
          linksMoved += await mergeModel(spare.id, keep.id)
        } catch (e: any) {
          console.error(`  ! ${e.message}`)
        }
      }
    }

    if (!exact) {
      console.log(`RENAME  ${brandOf(keep)} "${keep.name}"  ->  "${cleaned}"`)
      renames++
      if (APPLY) {
        const { error: renameError } = await supabase
          .from('phone_models')
          .update({ name: cleaned })
          .eq('id', keep.id)
        if (renameError) console.error(`  ! rename failed: ${renameError.message}`)
      }
    }
  }

  console.log('\n--- summary ---')
  console.log(`  renamed          : ${renames}`)
  console.log(`  merged away      : ${merges}`)
  console.log(`  already clean    : ${untouched}`)
  if (APPLY) console.log(`  links repointed  : ${linksMoved}`)
  console.log(`  models after     : ${rows.length - merges}`)

  if (!APPLY) {
    console.log('\nNothing was written. Re-run with --apply to make these changes.')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
