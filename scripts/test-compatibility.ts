/**
 * Phone Model Compatibility - end-to-end verification.
 *
 * Run AFTER pasting supabase/migrations/add_phone_model_compatibility.sql into
 * the Supabase SQL editor:
 *
 *   npx tsx scripts/test-compatibility.ts
 *
 * Creates one throwaway product (SKU DSP-TEST-001), runs the ten required
 * checks against the real database, then deletes everything it created.
 * It never touches products, stock, sales or customers it did not create.
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

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

const TEST_SKU = 'DSP-TEST-001'
const TEST_NAME = 'Display A (compatibility test)'
const TEST_BRAND = 'Xiaomi'
const TEST_MODELS = ['Redmi Note 8', 'Redmi Note 8T', 'Redmi Note 9', 'Redmi Note 9S']
const EXTRA_MODEL = 'Redmi Note 10'

let passed = 0
let failed = 0

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    passed++
    console.log(`  PASS  ${name}${detail ? ` - ${detail}` : ''}`)
  } else {
    failed++
    console.error(`  FAIL  ${name}${detail ? ` - ${detail}` : ''}`)
  }
}

async function main() {
  console.log('\nPhone Model Compatibility - verification\n')

  // --- Preconditions --------------------------------------------------------
  const { error: tableError } = await supabase.from('phone_models').select('id').limit(1)
  if (tableError) {
    console.error(
      'phone_models is missing. Paste supabase/migrations/add_phone_model_compatibility.sql\n' +
      'into the Supabase SQL editor first.\n\n' + tableError.message
    )
    process.exit(1)
  }

  // --- Fixtures -------------------------------------------------------------
  // Brand: reuse the existing row, never create a second "Xiaomi".
  let { data: brand } = await supabase
    .from('brands')
    .select('id, name')
    .ilike('name', TEST_BRAND)
    .maybeSingle()

  if (!brand) {
    const created = await supabase
      .from('brands')
      .insert({ name: TEST_BRAND, slug: TEST_BRAND.toLowerCase() })
      .select('id, name')
      .single()
    brand = created.data
  }
  if (!brand) throw new Error('Could not resolve the test brand')

  // Phone models: reuse existing rows, create only what is missing.
  const modelIds: Record<string, string> = {}
  const createdModelIds: string[] = []

  for (const name of [...TEST_MODELS, EXTRA_MODEL]) {
    const { data: existing } = await supabase
      .from('phone_models')
      .select('id')
      .eq('brand_id', brand.id)
      .ilike('name', name)
      .maybeSingle()

    if (existing) {
      modelIds[name] = existing.id
    } else {
      const { data, error } = await supabase
        .from('phone_models')
        .insert({ brand_id: brand.id, name })
        .select('id')
        .single()
      if (error) throw error
      modelIds[name] = data.id
      createdModelIds.push(data.id)
    }
  }

  // Category: whatever the catalogue already uses.
  const { data: category } = await supabase.from('categories').select('id').limit(1).single()
  if (!category) throw new Error('No categories found - cannot create a test product')

  // Learn the products shape (older DBs still carry a `category` text column).
  const { data: sampleProduct } = await supabase.from('products').select('*').limit(1).maybeSingle()
  const hasLegacyCategory = !!sampleProduct && 'category' in sampleProduct

  const productPayload: Record<string, any> = {
    name: TEST_NAME,
    sku: TEST_SKU,
    price: 8500,
    brand: TEST_BRAND,
    condition: 'new',
    category_id: category.id,
    stock: 5,
  }
  if (hasLegacyCategory) productPayload.category = 'display'

  // Clean any leftover from an interrupted previous run
  await supabase.from('products').delete().eq('sku', TEST_SKU)

  const { data: product, error: productError } = await supabase
    .from('products')
    .insert(productPayload)
    .select('id, sku, name')
    .single()

  if (productError) throw productError
  const productId = product.id

  await supabase
    .from('inv_stock')
    .upsert(
      { product_id: productId, quantity: 5, qty_meegoda: 5, qty_padukka: 0, qty_padukka_new: 0, low_stock_threshold: 5 },
      { onConflict: 'product_id' }
    )

  // Attach the four compatible models
  await supabase.from('product_compatibility').insert(
    TEST_MODELS.map((name) => ({ product_id: productId, phone_model_id: modelIds[name] }))
  )

  console.log(`Fixture: ${TEST_NAME} (${TEST_SKU}) with ${TEST_MODELS.length} compatible models\n`)

  try {
    // --- Test 1: only ONE product exists -----------------------------------
    const { data: skuMatches } = await supabase.from('products').select('id').eq('sku', TEST_SKU)
    check('1. Only one product row exists', (skuMatches?.length || 0) === 1, `${skuMatches?.length} row(s)`)

    // --- Test 2: all four models resolve to the same product ---------------
    const missedModels: string[] = []
    for (const name of TEST_MODELS) {
      const { data: links } = await supabase
        .from('product_compatibility')
        .select('product_id')
        .eq('phone_model_id', modelIds[name])

      if (!(links || []).some((l: any) => l.product_id === productId)) {
        missedModels.push(name)
      }
    }
    check(
      '2. All four phone models return the same Display A',
      missedModels.length === 0,
      missedModels.length ? `missing for ${missedModels.join(', ')}` : 'one product id for all 4'
    )

    // --- Test 3: stock is still 5 ------------------------------------------
    const { data: stockAfterLinking } = await supabase
      .from('inv_stock')
      .select('quantity')
      .eq('product_id', productId)
      .single()
    check(
      '3. Stock is still 5 after linking 4 models',
      stockAfterLinking?.quantity === 5,
      `quantity=${stockAfterLinking?.quantity}`
    )

    // --- Test 4: selling one takes 5 -> 4 ----------------------------------
    let saleId: string | null = null
    const { data: saleResult, error: saleError } = await supabase.rpc('process_sale', {
      p_customer_name: 'Compatibility Test',
      p_payment_method: 'cash',
      p_source: 'pos',
      p_created_by: 'compatibility-test',
      p_items: [{ product_id: productId, quantity: 1, price: 8500 }],
      p_shop: 'Meegoda',
    })

    if (saleError) {
      check('4. Selling one Display A takes stock 5 -> 4', false, saleError.message)
    } else {
      saleId = (saleResult as any)?.sale_id || (saleResult as any)?.id || null
      const { data: stockAfterSale } = await supabase
        .from('inv_stock')
        .select('quantity')
        .eq('product_id', productId)
        .single()
      check(
        '4. Selling one Display A takes stock 5 -> 4',
        stockAfterSale?.quantity === 4,
        `quantity=${stockAfterSale?.quantity}`
      )
    }

    // --- Test 5: no duplicate products -------------------------------------
    const { data: nameMatches } = await supabase.from('products').select('id').eq('name', TEST_NAME)
    const { data: allLinks } = await supabase
      .from('product_compatibility')
      .select('phone_model_id')
      .eq('product_id', productId)
    check(
      '5. No duplicate products created by compatibility',
      (nameMatches?.length || 0) === 1 && (allLinks?.length || 0) === TEST_MODELS.length,
      `${nameMatches?.length} product(s), ${allLinks?.length} compatibility row(s)`
    )

    // --- Test 6: admin can add another model -------------------------------
    await supabase
      .from('product_compatibility')
      .insert({ product_id: productId, phone_model_id: modelIds[EXTRA_MODEL] })

    const { data: afterAdd } = await supabase
      .from('product_compatibility')
      .select('phone_model_id')
      .eq('product_id', productId)
    const { data: stockAfterAdd } = await supabase
      .from('inv_stock')
      .select('quantity')
      .eq('product_id', productId)
      .single()
    check(
      '6. Admin can add another compatible model (stock unchanged)',
      (afterAdd?.length || 0) === 5 && stockAfterAdd?.quantity === 4,
      `${afterAdd?.length} models, quantity=${stockAfterAdd?.quantity}`
    )

    // --- Test 7: admin can remove a model ----------------------------------
    await supabase
      .from('product_compatibility')
      .delete()
      .eq('product_id', productId)
      .eq('phone_model_id', modelIds[EXTRA_MODEL])

    const { data: afterRemove } = await supabase
      .from('product_compatibility')
      .select('phone_model_id')
      .eq('product_id', productId)
    const { data: stockAfterRemove } = await supabase
      .from('inv_stock')
      .select('quantity')
      .eq('product_id', productId)
      .single()
    const { data: productStillThere } = await supabase
      .from('products')
      .select('id')
      .eq('id', productId)
      .maybeSingle()
    check(
      '7. Admin can remove a compatible model (product and stock intact)',
      (afterRemove?.length || 0) === 4 && stockAfterRemove?.quantity === 4 && !!productStillThere,
      `${afterRemove?.length} models, quantity=${stockAfterRemove?.quantity}`
    )

    // --- Test 8 / 9: searching a model finds Display A ---------------------
    for (const [testNumber, modelName] of [['8', 'Redmi Note 8'], ['9', 'Redmi Note 9S']] as const) {
      const { data: matches } = await supabase
        .from('phone_models')
        .select('id')
        .eq('brand_id', brand.id)
        .ilike('name', modelName)

      const ids = (matches || []).map((m: any) => m.id)
      const { data: links } = await supabase
        .from('product_compatibility')
        .select('product_id')
        .in('phone_model_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])

      const found = (links || []).some((l: any) => l.product_id === productId)
      check(`${testNumber}. Searching "${modelName}" finds Display A`, found)
    }

    // --- Test 10: products without compatibility still work ----------------
    const { data: others } = await supabase
      .from('products')
      .select('id, name')
      .neq('id', productId)
      .limit(50)

    const otherIds = (others || []).map((p: any) => p.id)
    const { data: otherLinks } = await supabase
      .from('product_compatibility')
      .select('product_id')
      .in('product_id', otherIds.length ? otherIds : ['00000000-0000-0000-0000-000000000000'])

    const linked = new Set((otherLinks || []).map((l: any) => l.product_id))
    const withoutCompat = otherIds.filter((id: string) => !linked.has(id))

    let untouchedOk = true
    if (withoutCompat.length > 0) {
      const { data: sample, error: sampleError } = await supabase
        .from('products')
        .select('id, name, price')
        .eq('id', withoutCompat[0])
        .single()
      untouchedOk = !sampleError && !!sample?.id
    }
    check(
      '10. Existing products with no compatibility still load normally',
      untouchedOk,
      `${withoutCompat.length} of ${otherIds.length} sampled products have no compatibility rows`
    )

    // --- Cleanup ------------------------------------------------------------
    if (saleId) {
      await supabase.from('inv_sale_items').delete().eq('sale_id', saleId)
      await supabase.from('inv_sales').delete().eq('id', saleId)
    }
    await supabase.from('inv_stock_movements').delete().eq('product_id', productId)
    await supabase.from('product_compatibility').delete().eq('product_id', productId)
    await supabase.from('inv_stock').delete().eq('product_id', productId)
    await supabase.from('products').delete().eq('id', productId)

    // Only remove phone models this run created - never ones the shop uses.
    if (createdModelIds.length > 0) {
      await supabase.from('phone_models').delete().in('id', createdModelIds)
    }

    const { data: leftovers } = await supabase.from('products').select('id').eq('sku', TEST_SKU)
    check('Cleanup: test product removed', (leftovers?.length || 0) === 0)
  } catch (error: any) {
    console.error('\nTest run aborted:', error.message)
    // Best-effort cleanup so a failure does not leave a test product behind
    await supabase.from('product_compatibility').delete().eq('product_id', productId)
    await supabase.from('inv_stock').delete().eq('product_id', productId)
    await supabase.from('products').delete().eq('id', productId)
    failed++
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
