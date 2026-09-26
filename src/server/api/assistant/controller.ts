/**
 * Everything an assistant admin is allowed to do.
 *
 * The shape of the permission model, in one place:
 *
 *   CREATE  - products, categories, stock adjustments. Applied immediately.
 *   EDIT    - never applied directly. Recorded in assistant_admin_requests and
 *   DELETE    applied only when an administrator approves it.
 *   READ    - products, categories, stock. Nothing else exists here: there is
 *             no route in this file that can return an order, a customer, a
 *             sale, a supplier, a message or a revenue figure, so no amount of
 *             URL guessing reaches one.
 *
 * Payloads are filtered against explicit column allowlists rather than passed
 * through. Without that, `POST /products {"id": "<some other product>"}` or a
 * stray `created_at` reaches the table, and a "create only" account quietly
 * gains the ability to overwrite rows.
 */
import { Request, Response } from 'express'
import { SupabaseClient } from '@supabase/supabase-js'
import { getServiceClient } from '../utils/panel-session'
import { recordAudit, redact } from '../utils/assistant-audit'
import {
  createProductRecord,
  deleteProductRecord,
  updateProductRecord,
  deleteCategoryRecord,
  updateCategoryRecord,
} from '../utils/product-write'

/** Product columns an assistant may set, on create or in a change request. */
const PRODUCT_FIELDS = new Set([
  'name',
  'category',
  'category_id',
  'sku',
  'brand',
  'price',
  'cost_price',
  'buy_price',
  'sell_price',
  'discount_price',
  'stock',
  'qty_label',
  'qty_meegoda',
  'qty_padukka',
  'qty_padukka_new',
  'description',
  'condition',
  'specs',
  'is_featured',
  'image',
  'images',
  'variants',
  'compatible_model_ids',
])

/** Category columns an assistant may set. */
const CATEGORY_FIELDS = new Set([
  'name',
  'slug',
  'description',
  'icon',
  'field_config',
  'is_active',
  'sort_order',
])

function pick(payload: any, allowed: Set<string>) {
  const out: Record<string, any> = {}
  if (!payload || typeof payload !== 'object') return out
  for (const [key, value] of Object.entries(payload)) {
    if (allowed.has(key)) out[key] = value
  }
  return out
}

const num = (value: any) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** The signed-in assistant, or the response already sent. */
function actorOf(req: Request, res: Response) {
  const actor = req.actor
  if (!actor) {
    res.status(401).json({ error: 'Sign in to continue', code: 'NO_SESSION' })
    return null
  }
  return actor
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

/**
 * GET /api/assistant/overview
 *
 * Products, quantities, category sizes and a stock analysis - and deliberately
 * nothing else. Every figure here is computed from `products`, `categories` and
 * `inv_stock`; the orders, sales and customer tables are never queried, so
 * there is no revenue number to leak even by accident.
 */
export async function assistantOverviewHandler(req: Request, res: Response) {
  const actor = actorOf(req, res)
  if (!actor) return

  try {
    const supabase = getServiceClient()

    const [{ data: categories }, { data: products }, { data: stock }, { count: pendingCount }] =
      await Promise.all([
        supabase.from('categories').select('id, name, slug, is_active, sort_order').order('sort_order'),
        supabase.from('products').select('id, name, category_id, brand, price, cost_price, buy_price, created_at'),
        supabase
          .from('inv_stock')
          .select('product_id, quantity, qty_meegoda, qty_padukka, qty_padukka_new, low_stock_threshold, updated_at'),
        supabase
          .from('assistant_admin_requests')
          .select('id', { count: 'exact', head: true })
          .eq('assistant_id', actor.id)
          .eq('status', 'pending'),
      ])

    const productList = products || []
    const stockList = stock || []
    const categoryList = categories || []

    const stockByProduct = new Map(stockList.map((row: any) => [row.product_id, row]))

    let totalQuantity = 0
    let retailValue = 0
    let costValue = 0
    let lowStock = 0
    let outOfStock = 0
    const shopSplit = { meegoda: 0, padukka: 0, padukka_new: 0 }

    const lowStockItems: any[] = []

    for (const product of productList) {
      const row: any = stockByProduct.get(product.id)
      const quantity = Math.max(num(row?.quantity), 0)
      const threshold = num(row?.low_stock_threshold) || 5

      totalQuantity += quantity
      retailValue += quantity * num(product.price)
      // Cost falls back through the same chain the dashboard uses: an explicit
      // cost, then the purchase price, then the sell price when neither is set.
      costValue += quantity * (num(product.cost_price) || num(product.buy_price) || num(product.price))

      shopSplit.meegoda += Math.max(num(row?.qty_meegoda), 0)
      shopSplit.padukka += Math.max(num(row?.qty_padukka), 0)
      shopSplit.padukka_new += Math.max(num(row?.qty_padukka_new), 0)

      if (quantity === 0) {
        outOfStock += 1
      } else if (quantity <= threshold) {
        lowStock += 1
      }

      if (quantity <= threshold) {
        lowStockItems.push({
          id: product.id,
          name: product.name,
          brand: product.brand,
          quantity,
          threshold,
        })
      }
    }

    // Category size: how many products sit in each one, largest first.
    const countByCategory = new Map<string, number>()
    let uncategorised = 0
    for (const product of productList) {
      if (!product.category_id) {
        uncategorised += 1
        continue
      }
      countByCategory.set(product.category_id, (countByCategory.get(product.category_id) || 0) + 1)
    }

    const categoryBreakdown = categoryList
      .map((category: any) => {
        const productIds = productList.filter((p: any) => p.category_id === category.id)
        const quantity = productIds.reduce(
          (sum: number, p: any) => sum + Math.max(num(stockByProduct.get(p.id)?.quantity), 0),
          0
        )
        return {
          id: category.id,
          name: category.name,
          slug: category.slug,
          is_active: category.is_active !== false,
          product_count: countByCategory.get(category.id) || 0,
          quantity,
        }
      })
      .sort((a, b) => b.product_count - a.product_count)

    const missingStockRow = productList.filter((p: any) => !stockByProduct.has(p.id)).length

    const recentProducts = [...productList]
      .sort((a: any, b: any) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
      .slice(0, 8)
      .map((p: any) => ({
        id: p.id,
        name: p.name,
        brand: p.brand,
        created_at: p.created_at,
        quantity: Math.max(num(stockByProduct.get(p.id)?.quantity), 0),
      }))

    return res.json({
      data: {
        totals: {
          products: productList.length,
          categories: categoryList.length,
          activeCategories: categoryList.filter((c: any) => c.is_active !== false).length,
          quantity: totalQuantity,
          retailStockValue: retailValue,
          costStockValue: costValue,
          lowStock,
          outOfStock,
          healthy: Math.max(productList.length - lowStock - outOfStock, 0),
          uncategorised,
          missingStockRow,
          pendingRequests: pendingCount || 0,
        },
        shopSplit,
        categoryBreakdown,
        lowStockItems: lowStockItems.sort((a, b) => a.quantity - b.quantity).slice(0, 25),
        recentProducts,
      },
    })
  } catch (error: any) {
    console.error('[Assistant] Overview error:', error)
    return res.status(error?.status || 500).json({ error: error?.message || 'Could not load the dashboard' })
  }
}

/* ------------------------------------------------------------------ */
/* Products                                                            */
/* ------------------------------------------------------------------ */

const PRODUCT_SELECT =
  'id, name, sku, brand, category_id, price, cost_price, buy_price, sell_price, discount_price, stock, qty_label, description, condition, specs, is_featured, barcode, created_at, updated_at'

/** GET /api/assistant/products */
export async function assistantListProductsHandler(req: Request, res: Response) {
  if (!actorOf(req, res)) return

  try {
    const supabase = getServiceClient()
    const search = String(req.query.search || '').trim()
    const categoryId = String(req.query.category_id || '').trim()
    // The products screen loads the whole catalogue, the way the admin one does.
    // 1000 is PostgREST's own default row cap on Supabase.
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 1000)

    let query = supabase
      .from('products')
      .select(`${PRODUCT_SELECT}, product_images (url, is_primary, display_order)`)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (search) {
      // Escaped so a comma or parenthesis in the search box cannot be read as
      // extra PostgREST filter syntax.
      const safe = search.replace(/[%,()]/g, ' ')
      query = query.or(`name.ilike.%${safe}%,brand.ilike.%${safe}%,sku.ilike.%${safe}%,barcode.ilike.%${safe}%`)
    }
    if (categoryId) query = query.eq('category_id', categoryId)

    const { data, error } = await query
    if (error) throw error

    // In batches: every id is ~37 characters of query string, and a single
    // `in` over the whole catalogue outgrows the gateway's URL limit.
    const ids = (data || []).map((p: any) => p.id)
    const stock: any[] = []
    for (let start = 0; start < ids.length; start += 150) {
      const { data: batch } = await supabase
        .from('inv_stock')
        .select('product_id, quantity, qty_meegoda, qty_padukka, qty_padukka_new, low_stock_threshold')
        .in('product_id', ids.slice(start, start + 150))
      if (batch) stock.push(...batch)
    }

    const stockByProduct = new Map(stock.map((row: any) => [row.product_id, row]))

    return res.json({
      data: (data || []).map((product: any) => {
        const images = (product.product_images || []).sort(
          (a: any, b: any) => Number(b.is_primary) - Number(a.is_primary) || a.display_order - b.display_order
        )
        const { product_images, ...rest } = product
        return {
          ...rest,
          image: images[0]?.url || null,
          images: images.map((image: any) => image.url),
          stock_row: stockByProduct.get(product.id) || null,
        }
      }),
    })
  } catch (error: any) {
    console.error('[Assistant] List products error:', error)
    return res.status(error?.status || 500).json({ error: error?.message || 'Could not load products' })
  }
}

/** POST /api/assistant/products - applied straight away. */
export async function assistantCreateProductHandler(req: Request, res: Response) {
  const actor = actorOf(req, res)
  if (!actor) return

  try {
    const payload = pick(req.body, PRODUCT_FIELDS)

    if (!payload.name || !String(payload.name).trim()) {
      return res.status(400).json({ error: 'Product name is required' })
    }
    if (!payload.category && !payload.category_id) {
      return res.status(400).json({ error: 'Pick a category for this product' })
    }

    const supabase = getServiceClient()
    const result = await createProductRecord(supabase, payload)

    await recordAudit({
      assistantId: actor.type === 'assistant' ? actor.id : null,
      actorEmail: actor.email,
      action: 'product.create',
      resource: 'product',
      resourceId: result.data?.id,
      success: result.ok,
      detail: result.ok ? { name: payload.name } : { error: result.error, payload: redact(payload) },
      req,
    })

    if (!result.ok) return res.status(result.status || 500).json({ error: result.error })
    return res.json({ data: result.data })
  } catch (error: any) {
    console.error('[Assistant] Create product error:', error)
    return res.status(error?.status || 500).json({ error: error?.message || 'Could not create the product' })
  }
}

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

/** GET /api/assistant/categories */
export async function assistantListCategoriesHandler(req: Request, res: Response) {
  if (!actorOf(req, res)) return

  try {
    const supabase = getServiceClient()
    const [{ data: categories, error }, { data: products }] = await Promise.all([
      supabase.from('categories').select('*').order('sort_order', { ascending: true }),
      supabase.from('products').select('id, category_id'),
    ])
    if (error) throw error

    const counts = new Map<string, number>()
    for (const product of products || []) {
      if (!product.category_id) continue
      counts.set(product.category_id, (counts.get(product.category_id) || 0) + 1)
    }

    return res.json({
      data: (categories || []).map((category: any) => ({
        ...category,
        product_count: counts.get(category.id) || 0,
      })),
    })
  } catch (error: any) {
    console.error('[Assistant] List categories error:', error)
    return res.status(error?.status || 500).json({ error: error?.message || 'Could not load categories' })
  }
}

/** POST /api/assistant/categories - applied straight away. */
export async function assistantCreateCategoryHandler(req: Request, res: Response) {
  const actor = actorOf(req, res)
  if (!actor) return

  try {
    const payload = pick(req.body, CATEGORY_FIELDS)
    const name = String(payload.name || '').trim()
    if (!name) return res.status(400).json({ error: 'Category name is required' })

    const slug =
      String(payload.slug || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') ||
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')

    const supabase = getServiceClient()

    const { data: clash } = await supabase
      .from('categories')
      .select('id')
      .or(`slug.eq.${slug},name.ilike.${name}`)
      .maybeSingle()

    if (clash) {
      return res.status(409).json({ error: 'A category with this name already exists' })
    }

    const { data, error } = await supabase
      .from('categories')
      .insert({
        ...payload,
        name,
        slug,
        field_config: payload.field_config || { fields: [] },
        is_active: payload.is_active !== false,
        sort_order: Number(payload.sort_order) || 0,
      })
      .select()
      .single()

    await recordAudit({
      assistantId: actor.type === 'assistant' ? actor.id : null,
      actorEmail: actor.email,
      action: 'category.create',
      resource: 'category',
      resourceId: data?.id,
      success: !error,
      detail: error ? { error: error.message } : { name, slug },
      req,
    })

    if (error) return res.status(500).json({ error: error.message })
    return res.json({ data })
  } catch (error: any) {
    console.error('[Assistant] Create category error:', error)
    return res.status(error?.status || 500).json({ error: error?.message || 'Could not create the category' })
  }
}

/* ------------------------------------------------------------------ */
/* Inventory                                                           */
/* ------------------------------------------------------------------ */

/** GET /api/assistant/inventory/stock */
export async function assistantStockHandler(req: Request, res: Response) {
  if (!actorOf(req, res)) return

  try {
    const supabase = getServiceClient()
    const lowOnly = String(req.query.low_only || '') === 'true'

    const { data, error } = await supabase
      .from('inv_stock')
      .select(
        `product_id, quantity, qty_meegoda, qty_padukka, qty_padukka_new, low_stock_threshold, updated_at,
         products ( id, name, brand, sku, barcode, price, category_id )`
      )
      .order('updated_at', { ascending: false })

    if (error) throw error

    let rows = (data || []).map((row: any) => ({
      ...row,
      products: Array.isArray(row.products) ? row.products[0] : row.products,
      is_low_stock: num(row.quantity) <= (num(row.low_stock_threshold) || 5),
    }))

    if (lowOnly) rows = rows.filter((row: any) => row.is_low_stock)

    return res.json({ data: rows })
  } catch (error: any) {
    console.error('[Assistant] Stock error:', error)
    return res.status(error?.status || 500).json({ error: error?.message || 'Could not load stock' })
  }
}

/**
 * PUT /api/assistant/inventory/stock/:productId
 *
 * Stock adjustment is the one write that is not an approval request: keeping
 * quantities right is the job, and a wrong number is corrected by typing the
 * right one. Each change is written to inv_stock_movements with the assistant's
 * email attached, so the administrator can see who moved what.
 */
export async function assistantAdjustStockHandler(req: Request, res: Response) {
  const actor = actorOf(req, res)
  if (!actor) return

  try {
    const productId = String(req.params.productId || '')
    if (!productId) return res.status(400).json({ error: 'Product id is required' })

    const supabase = getServiceClient()

    const { data: product } = await supabase
      .from('products')
      .select('id, name')
      .eq('id', productId)
      .maybeSingle()

    if (!product) return res.status(404).json({ error: 'Product not found' })

    const { data: existing } = await supabase
      .from('inv_stock')
      .select('quantity, qty_meegoda, qty_padukka, qty_padukka_new, low_stock_threshold')
      .eq('product_id', productId)
      .maybeSingle()

    const body = req.body || {}
    const nextMeegoda = body.qty_meegoda === undefined ? num(existing?.qty_meegoda) : Math.max(num(body.qty_meegoda), 0)
    const nextPadukka = body.qty_padukka === undefined ? num(existing?.qty_padukka) : Math.max(num(body.qty_padukka), 0)
    const nextPadukkaNew =
      body.qty_padukka_new === undefined ? num(existing?.qty_padukka_new) : Math.max(num(body.qty_padukka_new), 0)
    const threshold =
      body.low_stock_threshold === undefined
        ? num(existing?.low_stock_threshold) || 5
        : Math.max(num(body.low_stock_threshold), 0)

    const total = nextMeegoda + nextPadukka + nextPadukkaNew
    const previousTotal = num(existing?.quantity)

    const { error } = await supabase.from('inv_stock').upsert(
      {
        product_id: productId,
        quantity: total,
        qty_meegoda: nextMeegoda,
        qty_padukka: nextPadukka,
        qty_padukka_new: nextPadukkaNew,
        low_stock_threshold: threshold,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'product_id' }
    )

    if (error) {
      await recordAudit({
        assistantId: actor.type === 'assistant' ? actor.id : null,
        actorEmail: actor.email,
        action: 'stock.adjust',
        resource: 'product',
        resourceId: productId,
        success: false,
        detail: { error: error.message },
        req,
      })
      return res.status(500).json({ error: error.message })
    }

    // products.stock is kept in step by trg_sync_product_stock, but that trigger
    // only fires on the quantity column; writing it here as well keeps the shop
    // page correct on a database where the trigger has not been installed.
    await supabase.from('products').update({ stock: total }).eq('id', productId)

    if (total !== previousTotal) {
      await supabase.from('inv_stock_movements').insert({
        product_id: productId,
        type: 'adjustment',
        quantity: total - previousTotal,
        notes: `Assistant adjustment by ${actor.email}${body.note ? `: ${String(body.note).slice(0, 300)}` : ''}`,
        created_by: actor.email,
      })
    }

    await recordAudit({
      assistantId: actor.type === 'assistant' ? actor.id : null,
      actorEmail: actor.email,
      action: 'stock.adjust',
      resource: 'product',
      resourceId: productId,
      detail: {
        product: product.name,
        from: previousTotal,
        to: total,
        qty_meegoda: nextMeegoda,
        qty_padukka: nextPadukka,
        qty_padukka_new: nextPadukkaNew,
        low_stock_threshold: threshold,
      },
      req,
    })

    return res.json({
      data: {
        product_id: productId,
        quantity: total,
        qty_meegoda: nextMeegoda,
        qty_padukka: nextPadukka,
        qty_padukka_new: nextPadukkaNew,
        low_stock_threshold: threshold,
      },
    })
  } catch (error: any) {
    console.error('[Assistant] Adjust stock error:', error)
    return res.status(error?.status || 500).json({ error: error?.message || 'Could not update stock' })
  }
}

/* ------------------------------------------------------------------ */
/* Change requests                                                     */
/* ------------------------------------------------------------------ */

async function snapshotProduct(supabase: SupabaseClient, id: string) {
  const { data } = await supabase.from('products').select(PRODUCT_SELECT).eq('id', id).maybeSingle()
  return data
}

async function snapshotCategory(supabase: SupabaseClient, id: string) {
  const { data } = await supabase.from('categories').select('*').eq('id', id).maybeSingle()
  return data
}

/**
 * Record an edit or a delete for approval.
 *
 * Nothing is written to the products or categories table here. The row only
 * changes if and when an administrator approves the request, and the approval
 * step re-reads the row at that moment - so an approval never blindly replays
 * stale values over something that has since been changed by someone else.
 */
async function createRequest(
  req: Request,
  res: Response,
  opts: {
    action: 'update' | 'delete'
    resource: 'product' | 'category'
    resourceId: string
    payload?: Record<string, any> | null
  }
) {
  const actor = actorOf(req, res)
  if (!actor) return

  if (actor.type !== 'assistant') {
    // An administrator has no reason to queue a request for themselves - they
    // can simply make the change - and letting them would put rows in the queue
    // that nobody is waiting on.
    return res.status(400).json({
      error: 'Administrators change records directly; there is nothing to approve.',
      code: 'ADMIN_NO_REQUEST',
    })
  }

  try {
    const supabase = getServiceClient()
    const before =
      opts.resource === 'product'
        ? await snapshotProduct(supabase, opts.resourceId)
        : await snapshotCategory(supabase, opts.resourceId)

    if (!before) {
      return res.status(404).json({ error: `That ${opts.resource} no longer exists` })
    }

    // One pending request per row, so an administrator is never asked to
    // approve two conflicting edits of the same product.
    const { data: existing } = await supabase
      .from('assistant_admin_requests')
      .select('id')
      .eq('resource', opts.resource)
      .eq('resource_id', opts.resourceId)
      .eq('status', 'pending')
      .maybeSingle()

    if (existing) {
      return res.status(409).json({
        error: `There is already a pending request for this ${opts.resource}. Wait for it to be reviewed.`,
        code: 'REQUEST_PENDING',
      })
    }

    const note = String(req.body?.note || '').trim().slice(0, 1000) || null

    const { data, error } = await supabase
      .from('assistant_admin_requests')
      .insert({
        assistant_id: actor.id,
        assistant_email: actor.email,
        action: opts.action,
        resource: opts.resource,
        resource_id: opts.resourceId,
        resource_label: (before as any).name || opts.resourceId,
        payload: opts.payload || null,
        before_snapshot: before,
        note,
      })
      .select()
      .single()

    await recordAudit({
      assistantId: actor.id,
      actorEmail: actor.email,
      action: `${opts.resource}.${opts.action}_requested`,
      resource: opts.resource,
      resourceId: opts.resourceId,
      success: !error,
      detail: { requestId: data?.id, payload: redact(opts.payload), note },
      req,
    })

    if (error) return res.status(500).json({ error: error.message })

    return res.json({
      data,
      message: 'Sent to the administrator for approval. Nothing has changed yet.',
    })
  } catch (error: any) {
    console.error('[Assistant] Create request error:', error)
    return res.status(error?.status || 500).json({ error: error?.message || 'Could not send the request' })
  }
}

/** POST /api/assistant/products/:id/edit-request */
export async function assistantRequestProductEditHandler(req: Request, res: Response) {
  const payload = pick(req.body?.payload ?? req.body, PRODUCT_FIELDS)
  if (Object.keys(payload).length === 0) {
    return res.status(400).json({ error: 'Change at least one field before sending the request' })
  }
  return createRequest(req, res, {
    action: 'update',
    resource: 'product',
    resourceId: String(req.params.id),
    payload,
  })
}

/** POST /api/assistant/products/:id/delete-request */
export async function assistantRequestProductDeleteHandler(req: Request, res: Response) {
  return createRequest(req, res, {
    action: 'delete',
    resource: 'product',
    resourceId: String(req.params.id),
  })
}

/** POST /api/assistant/categories/:id/edit-request */
export async function assistantRequestCategoryEditHandler(req: Request, res: Response) {
  const payload = pick(req.body?.payload ?? req.body, CATEGORY_FIELDS)
  if (Object.keys(payload).length === 0) {
    return res.status(400).json({ error: 'Change at least one field before sending the request' })
  }
  return createRequest(req, res, {
    action: 'update',
    resource: 'category',
    resourceId: String(req.params.id),
    payload,
  })
}

/** POST /api/assistant/categories/:id/delete-request */
export async function assistantRequestCategoryDeleteHandler(req: Request, res: Response) {
  return createRequest(req, res, {
    action: 'delete',
    resource: 'category',
    resourceId: String(req.params.id),
  })
}

/** GET /api/assistant/requests - the caller's own queue. */
export async function assistantListRequestsHandler(req: Request, res: Response) {
  const actor = actorOf(req, res)
  if (!actor) return

  try {
    const supabase = getServiceClient()
    let query = supabase
      .from('assistant_admin_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    // An assistant sees only their own; an administrator opening the same
    // screen sees everything.
    if (actor.type === 'assistant') query = query.eq('assistant_id', actor.id)

    const status = String(req.query.status || '').trim()
    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) throw error

    return res.json({ data: data || [] })
  } catch (error: any) {
    console.error('[Assistant] List requests error:', error)
    return res.status(error?.status || 500).json({ error: error?.message || 'Could not load requests' })
  }
}

/** POST /api/assistant/requests/:id/cancel - withdraw one's own pending request. */
export async function assistantCancelRequestHandler(req: Request, res: Response) {
  const actor = actorOf(req, res)
  if (!actor) return

  try {
    const supabase = getServiceClient()
    let query = supabase
      .from('assistant_admin_requests')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', String(req.params.id))
      .eq('status', 'pending')

    if (actor.type === 'assistant') query = query.eq('assistant_id', actor.id)

    const { data, error } = await query.select().maybeSingle()
    if (error) return res.status(500).json({ error: error.message })
    if (!data) return res.status(404).json({ error: 'That request is no longer pending' })

    await recordAudit({
      assistantId: actor.type === 'assistant' ? actor.id : null,
      actorEmail: actor.email,
      action: 'request.cancelled',
      resource: data.resource,
      resourceId: data.resource_id,
      detail: { requestId: data.id },
      req,
    })

    return res.json({ data })
  } catch (error: any) {
    console.error('[Assistant] Cancel request error:', error)
    return res.status(error?.status || 500).json({ error: error?.message || 'Could not cancel the request' })
  }
}

/* ------------------------------------------------------------------ */
/* Security events                                                     */
/* ------------------------------------------------------------------ */

const SECURITY_EVENTS = new Set([
  'screenshot.keypress',
  'screenshot.clipboard',
  'screenshot.print',
  'screenshot.capture_api',
  'screen.hidden',
  'devtools.suspected',
  'copy.blocked',
  'contextmenu.blocked',
])

/**
 * POST /api/assistant/security-event
 *
 * The assistant's screens report attempted screen captures here. What the
 * browser can actually block is limited (see components/assistant/capture-guard
 * for exactly how limited), so the durable half of the control is this log:
 * every attempt is attributed, timestamped, and visible to the administrator.
 */
export async function assistantSecurityEventHandler(req: Request, res: Response) {
  const actor = actorOf(req, res)
  if (!actor) return

  const event = String(req.body?.event || '')
  if (!SECURITY_EVENTS.has(event)) {
    return res.status(400).json({ error: 'Unknown event' })
  }

  await recordAudit({
    assistantId: actor.type === 'assistant' ? actor.id : null,
    actorEmail: actor.email,
    action: event,
    resource: 'screen',
    resourceId: String(req.body?.path || '').slice(0, 200) || null,
    success: false,
    detail: { path: req.body?.path, method: req.body?.method },
    req,
  })

  return res.json({ success: true })
}

/* Re-exported for the approval step, which applies what was queued here. */
export { createProductRecord, updateProductRecord, deleteProductRecord, updateCategoryRecord, deleteCategoryRecord }
