/**
 * Read-only: what state did the phone model catalogue actually end up in?
 *
 *   npx tsx scripts/inspect-model-dupes.ts
 *
 * Lists models whose name still carries a display grade, whether a clean twin
 * exists, and how many products are linked to each - so a half-finished merge
 * is obvious. Writes nothing.
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { normalizeModelName, stripBrandPrefix } from '../src/server/api/utils/compatibility'

dotenv.config()

const supabase = createClient(
  (process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

async function main() {
  const { data: models, error } = await supabase
    .from('phone_models')
    .select('id, brand_id, name, created_at, brands:brand_id (name)')
    .limit(5000)

  if (error) {
    console.error('read failed:', error.message)
    process.exit(1)
  }

  const { data: links } = await supabase.from('product_compatibility').select('phone_model_id')
  const linkCount = new Map<string, number>()
  for (const l of links || []) {
    const id = (l as any).phone_model_id
    linkCount.set(id, (linkCount.get(id) || 0) + 1)
  }

  const rows = (models || []) as any[]
  const brandOf = (r: any) => {
    const b = Array.isArray(r.brands) ? r.brands[0] : r.brands
    return b?.name || '?'
  }

  console.log('phone_models now:', rows.length)
  console.log('link rows now   :', links?.length)

  const byKey = new Map<string, any[]>()
  for (const r of rows) {
    const cleaned = normalizeModelName(stripBrandPrefix(r.name, brandOf(r)))
    const key = `${r.brand_id}::${cleaned.toLowerCase()}`
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key)!.push({ ...r, cleaned })
  }

  console.log('\n=== groups that still hold more than one row (the duplicates) ===')
  let dupeGroups = 0
  for (const group of byKey.values()) {
    if (group.length < 2) continue
    dupeGroups++
    console.log(`\n  phone: ${brandOf(group[0])} ${group[0].cleaned}`)
    for (const r of group) {
      console.log(
        `    - "${r.name}"  links=${linkCount.get(r.id) || 0}  id=${r.id.slice(0, 8)}  created=${String(r.created_at).slice(0, 19)}`
      )
    }
  }
  console.log(`\n  duplicate groups: ${dupeGroups}`)

  const stillDirty = rows.filter(
    (r) => normalizeModelName(stripBrandPrefix(r.name, brandOf(r))) !== r.name
  )
  console.log(`\n=== names still carrying a grade / brand repeat: ${stillDirty.length} ===`)
  for (const r of stillDirty.slice(0, 40)) {
    console.log(`  ${brandOf(r)} "${r.name}"  links=${linkCount.get(r.id) || 0}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
