import { Response } from 'express'
import { getSupabaseAdmin } from '../inventory/supabase-admin'
import { SupplierRequest } from './auth'
import { fetchAllowedCategoryIds, PRODUCT_SELECT, toCatalogItem } from './shop.shared'

/**
 * GET /api/supplier/catalog?search=&category_id=&in_stock_only=true
 *
 * What this shop may buy: the products inside the categories the admin opened
 * to them, each marked in stock or out of stock and nothing more.
 *
 * The shop id comes from req.supplier (the session), never the query string -
 * see requireSupplier - and the category filter is intersected with the allowed
 * list rather than trusted, so asking for someone else's category returns
 * nothing instead of leaking it.
 */
export async function supplierCatalogHandler(req: SupplierRequest, res: Response) {
  try {
    const supplierId = req.supplier!.id
    const supabase = getSupabaseAdmin()

    const allowed = await fetchAllowedCategoryIds(supabase, supplierId)

    if (allowed === null) {
      return res.json({ data: [], categories: [], totals: emptyTotals(), migration_required: true })
    }

    if (allowed.length === 0) {
      return res.json({ data: [], categories: [], totals: emptyTotals(), migration_required: false })
    }

    const { search, category_id, in_stock_only } = req.query

    const requested = typeof category_id === 'string' ? category_id.trim() : ''
    const categoryIds = requested ? allowed.filter((id) => id === requested) : allowed

    if (categoryIds.length === 0) {
      return res.json({ data: [], categories: [], totals: emptyTotals(), migration_required: false })
    }

    let query = supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .in('category_id', categoryIds)
      .order('name', { ascending: true })
      .limit(500)

    if (typeof search === 'string' && search.trim()) {
      const term = search.trim()
      query = query.or(`name.ilike.%${term}%,barcode.ilike.%${term}%,brand.ilike.%${term}%,specs->>model.ilike.%${term}%`)
    }

    // The filter tabs always list every category the shop has, not just the
    // ones matching the current search - otherwise the tab you are standing on
    // can disappear as you type.
    const [{ data: products, error }, categoriesResult] = await Promise.all([
      query,
      supabase.from('categories').select('id, name, slug').in('id', allowed).order('name', { ascending: true }),
    ])

    if (error) throw error

    let items = (products || []).map(toCatalogItem)

    const totals = {
      products: items.length,
      in_stock: items.filter((item: any) => item.in_stock).length,
      out_of_stock: items.filter((item: any) => !item.in_stock).length,
    }

    if (in_stock_only === 'true') items = items.filter((item: any) => item.in_stock)

    // In stock first: a shop is here to order, and what we have is the part
    // they can act on.
    items.sort((a: any, b: any) => {
      if (a.in_stock !== b.in_stock) return a.in_stock ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    return res.json({
      data: items,
      categories: categoriesResult.data || [],
      totals,
      migration_required: false,
    })
  } catch (error: any) {
    console.error('[Supplier] catalog error:', error)
    return res.status(500).json({ error: error.message || 'Could not load the product list' })
  }
}

const emptyTotals = () => ({ products: 0, in_stock: 0, out_of_stock: 0 })
