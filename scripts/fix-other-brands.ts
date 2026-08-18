/**
 * Repairs products saved under the placeholder brand "Other".
 *
 * The admin panel used to offer "Other" in the Brand dropdown, so admins picked
 * it and typed the real manufacturer into the custom model field. The generated
 * name then came out as "Other MOTO G30 Display" and the storefront filtered
 * those products into an "Other" bucket instead of Motorola.
 *
 * This script recovers the manufacturer from the model text and rewrites:
 *   brand       "Other"                -> "Motorola"
 *   specs.model "MOTO G30"             -> "G30"
 *   name        "Other MOTO G30 Display" -> "Motorola G30 Display"
 *
 * Usage:
 *   npx tsx scripts/fix-other-brands.ts                    # dry run (default)
 *   npx tsx scripts/fix-other-brands.ts --apply            # write changes
 *   npx tsx scripts/fix-other-brands.ts --apply --fix-duplicates
 *
 * --fix-duplicates additionally trims names where the brand is repeated inside
 * the model ("Redmi Redmi 10 Display" -> "Redmi 10 Display").
 *
 * A JSON backup of every affected row is written to scripts/backups/ before any
 * write, so a bad run can be reverted.
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { extractBrandFromText, isPlaceholderBrand } from '../src/constants/models'

dotenv.config({ quiet: true })

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
const FIX_DUPLICATES = process.argv.includes('--fix-duplicates')

interface ProductRow {
  id: string
  name: string | null
  brand: string | null
  category_id: string | null
  specs: Record<string, string> | string | null
}

interface Change {
  id: string
  oldBrand: string
  newBrand: string
  oldModel: string
  newModel: string
  oldName: string
  newName: string
  reason: string
}

const parseSpecs = (specs: ProductRow['specs']): Record<string, string> => {
  if (!specs) return {}
  if (typeof specs === 'string') {
    try {
      return JSON.parse(specs)
    } catch {
      return {}
    }
  }
  return specs
}

const tidy = (value: string) => value.trim().replace(/\s+/g, ' ')

async function main() {
  console.log(APPLY ? '=== APPLY MODE - changes will be written ===' : '=== DRY RUN - no changes written ===')
  console.log('')

  const { data: categories, error: catError } = await supabase
    .from('categories')
    .select('id,name,slug')

  if (catError) {
    console.error('Failed to load categories:', catError.message)
    process.exit(1)
  }

  // The modal drops a trailing "(main)" when it builds a name; match that here
  // so regenerated names are identical to newly created ones.
  const categoryNameById = new Map<string, string>()
  for (const category of categories || []) {
    categoryNameById.set(category.id, tidy(String(category.name).replace(/\(main\)/i, '')))
  }

  const { data: products, error } = await supabase
    .from('products')
    .select('id,name,brand,category_id,specs')

  if (error) {
    console.error('Failed to load products:', error.message)
    process.exit(1)
  }

  const rows = (products || []) as ProductRow[]
  const changes: Change[] = []
  const unresolved: ProductRow[] = []

  for (const product of rows) {
    const specs = parseSpecs(product.specs)
    const currentModel = tidy(specs.model || '')
    const currentName = tidy(product.name || '')
    const currentBrand = (product.brand || '').trim()
    const categoryName = product.category_id ? categoryNameById.get(product.category_id) || '' : ''

    const hasPlaceholderBrand = isPlaceholderBrand(currentBrand)
    const hasOtherPrefix = /^other\b/i.test(currentName)

    if (hasPlaceholderBrand || hasOtherPrefix) {
      // The manufacturer normally sits at the front of the model text; fall
      // back to the product name with the "Other " prefix stripped.
      const extracted =
        extractBrandFromText(currentModel) ||
        extractBrandFromText(tidy(currentName.replace(/^other\s+/i, '')))

      if (!extracted) {
        unresolved.push(product)
        continue
      }

      const newModel = extracted.model || currentModel
      const newName = tidy(`${extracted.brand} ${newModel} ${categoryName}`)

      if (extracted.brand !== currentBrand || newModel !== currentModel || newName !== currentName) {
        changes.push({
          id: product.id,
          oldBrand: currentBrand,
          newBrand: extracted.brand,
          oldModel: currentModel,
          newModel,
          oldName: currentName,
          newName,
          reason: 'placeholder-brand',
        })
      }
      continue
    }

    // Optional pass: brand repeated inside the model ("Redmi" + "Redmi 10")
    if (FIX_DUPLICATES && currentBrand && currentModel) {
      const lowerBrand = currentBrand.toLowerCase()
      if (currentModel.toLowerCase().startsWith(lowerBrand)) {
        const trimmedModel = tidy(currentModel.slice(currentBrand.length).replace(/^[-/,]+/, ''))
        if (trimmedModel) {
          const newName = tidy(`${currentBrand} ${trimmedModel} ${categoryName}`)
          if (newName !== currentName || trimmedModel !== currentModel) {
            changes.push({
              id: product.id,
              oldBrand: currentBrand,
              newBrand: currentBrand,
              oldModel: currentModel,
              newModel: trimmedModel,
              oldName: currentName,
              newName,
              reason: 'duplicate-brand-in-model',
            })
          }
        }
      }
    }
  }

  console.log(`Scanned ${rows.length} products`)
  console.log(`Products to fix: ${changes.length}`)
  console.log(`Could not resolve a brand: ${unresolved.length}`)
  console.log('')

  const byBrand = new Map<string, number>()
  for (const change of changes) byBrand.set(change.newBrand, (byBrand.get(change.newBrand) || 0) + 1)

  console.log('--- Brands recovered ---')
  for (const [brand, count] of [...byBrand.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${brand.padEnd(12)} ${count}`)
  }
  console.log('')

  console.log('--- Name changes ---')
  for (const change of changes) {
    console.log(`  "${change.oldName}"`)
    console.log(`   -> "${change.newName}"   [brand: ${change.oldBrand || '(empty)'} -> ${change.newBrand}, model: "${change.oldModel}" -> "${change.newModel}"]`)
  }
  console.log('')

  if (unresolved.length > 0) {
    console.log('--- Left untouched (no recognisable brand) ---')
    for (const product of unresolved) {
      console.log(`  ${product.id}  "${product.name}"  model="${parseSpecs(product.specs).model || ''}"`)
    }
    console.log('')
  }

  if (!APPLY) {
    console.log('Dry run complete. Re-run with --apply to write these changes.')
    return
  }

  if (changes.length === 0) {
    console.log('Nothing to apply.')
    return
  }

  // Back up the current state of every row we are about to touch
  const backupDir = path.join(process.cwd(), 'scripts', 'backups')
  fs.mkdirSync(backupDir, { recursive: true })
  const backupFile = path.join(backupDir, `products-before-brand-fix-${Date.now()}.json`)
  const changedIds = new Set(changes.map((c) => c.id))
  fs.writeFileSync(
    backupFile,
    JSON.stringify(rows.filter((row) => changedIds.has(row.id)), null, 2)
  )
  console.log(`Backup written: ${backupFile}`)
  console.log('')

  let updated = 0
  let failed = 0

  for (const change of changes) {
    const original = rows.find((row) => row.id === change.id)!
    const specs = parseSpecs(original.specs)
    specs.model = change.newModel

    const { error: updateError } = await supabase
      .from('products')
      .update({
        brand: change.newBrand,
        name: change.newName,
        specs,
        updated_at: new Date().toISOString(),
      })
      .eq('id', change.id)

    if (updateError) {
      failed++
      console.error(`  FAILED ${change.id} (${change.oldName}): ${updateError.message}`)
    } else {
      updated++
    }
  }

  console.log('')
  console.log(`Updated ${updated} products, ${failed} failures.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
