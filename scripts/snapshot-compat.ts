/**
 * Before/after snapshot around scripts/clean-phone-models.ts.
 *
 * Prints the numbers that MUST NOT change (products, stock, sale items) and
 * the ones that are expected to (phone model count), plus the exact set of
 * product -> phone links so a merge can be proved lossless.
 *
 *   npx tsx scripts/snapshot-compat.ts before
 *   npx tsx scripts/snapshot-compat.ts after
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

dotenv.config()

const supabase = createClient(
  (process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

const label = process.argv[2] || 'snapshot'
const outFile = path.join('scripts', `.compat-${label}.json`)

async function main() {
  const { count: products } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })

  const { count: models } = await supabase
    .from('phone_models')
    .select('*', { count: 'exact', head: true })

  const { data: stock } = await supabase.from('inv_stock').select('product_id, quantity')
  const totalStock = (stock || []).reduce((sum, r: any) => sum + (r.quantity || 0), 0)

  const { count: saleItems } = await supabase
    .from('inv_sale_items')
    .select('*', { count: 'exact', head: true })

  // Every product -> phone pair, by NAME, so ids changing does not matter.
  const { data: links } = await supabase
    .from('product_compatibility')
    .select('product_id, phone_models:phone_model_id (name, brands:brand_id (name))')

  const pairs = new Set<string>()
  for (const row of links || []) {
    const pm: any = Array.isArray((row as any).phone_models)
      ? (row as any).phone_models[0]
      : (row as any).phone_models
    if (!pm) continue
    const brand = Array.isArray(pm.brands) ? pm.brands[0] : pm.brands
    pairs.add(`${(row as any).product_id}::${(brand?.name || '')} ${pm.name}`.toLowerCase())
  }

  const snap = {
    products,
    phone_models: models,
    stock_rows: stock?.length || 0,
    total_stock_units: totalStock,
    sale_items: saleItems,
    link_rows: links?.length || 0,
    distinct_pairs: pairs.size,
    pairs: [...pairs].sort(),
  }

  fs.writeFileSync(outFile, JSON.stringify(snap, null, 2))

  console.log(`--- ${label} ---`)
  console.log('  products          :', snap.products)
  console.log('  phone_models      :', snap.phone_models)
  console.log('  inv_stock rows    :', snap.stock_rows)
  console.log('  TOTAL STOCK UNITS :', snap.total_stock_units)
  console.log('  sale items        :', snap.sale_items)
  console.log('  link rows         :', snap.link_rows)
  console.log('  distinct pairs    :', snap.distinct_pairs)
  console.log('  written to', outFile)

  if (label === 'after' && fs.existsSync(path.join('scripts', '.compat-before.json'))) {
    const before = JSON.parse(fs.readFileSync(path.join('scripts', '.compat-before.json'), 'utf8'))
    const lost = before.pairs.filter((p: string) => !pairs.has(p))
    const gained = [...pairs].filter((p) => !before.pairs.includes(p))

    console.log('\n=== comparison ===')
    console.log('  products            :', before.products, '->', snap.products,
      before.products === snap.products ? 'UNCHANGED (correct)' : '!! CHANGED')
    console.log('  total stock units   :', before.total_stock_units, '->', snap.total_stock_units,
      before.total_stock_units === snap.total_stock_units ? 'UNCHANGED (correct)' : '!! CHANGED')
    console.log('  sale items          :', before.sale_items, '->', snap.sale_items,
      before.sale_items === snap.sale_items ? 'UNCHANGED (correct)' : '!! CHANGED')
    console.log('  phone models        :', before.phone_models, '->', snap.phone_models, '(expected to drop)')
    console.log('  product-phone pairs :', before.distinct_pairs, '->', snap.distinct_pairs)
    console.log('  pairs LOST          :', lost.length)
    if (lost.length) console.log('    ', lost.slice(0, 20).join('\n     '))
    console.log('  pairs GAINED        :', gained.length)
    if (gained.length) console.log('    ', gained.slice(0, 20).join('\n     '))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
