import { Request, Response } from 'express'
import { createServerClient } from '@supabase/ssr'
import {
  findCompatibleProductIds,
  findMatchingModelIds,
  isMissingRelation,
  loadCompatibilityMap,
  pickCustomerModel,
} from '../utils/compatibility'
import { encodeListing } from '../utils/listing-token'

/**
 * Does products.sku exist yet? Probed once per process so the search clause can
 * include SKU only when add_phone_model_compatibility.sql has been applied -
 * searching a missing column would break the whole product list.
 */
let skuColumnAvailable: boolean | null = null

async function hasSkuColumn(supabase: any): Promise<boolean> {
  if (skuColumnAvailable !== null) return skuColumnAvailable

  const { error } = await supabase.from('products').select('sku').limit(1)
  skuColumnAvailable = !(error && isMissingRelation(error))
  return skuColumnAvailable
}

/**
 * GET /api/products/list
 * Updated to use category_id and load images from product_images table
 */
export async function listHandler(req: Request, res: Response) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      return res.status(503).json({
        error: 'Supabase not configured',
        message: 'Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file',
        data: [] // Return empty array so UI doesn't break
      })
    }

    const supabase = createServerClient(
      supabaseUrl,
      supabaseKey,
      {
        cookies: {
          get(name: string) {
            return req.cookies?.[name]
          },
          set(name: string, value: string, options: any) {
            // No-op for read-only operations
          },
          remove(name: string, options: any) {
            // No-op for read-only operations
          },
        },
      }
    )

    const {
      category,
      brand,
      condition,
      search,
      minPrice,
      maxPrice,
      phone_model,
      phone_model_name,
      expand_models,
    } = req.query

    /**
     * List one entry per PHONE this part fits, instead of one per product.
     *
     * A manufacturer builds one panel that goes into several phones, so one
     * box on the shelf is genuinely "the display for" each of them. Listing it
     * once, under one model name, makes the shop look like it stocks a handful
     * of parts. Listing it under every phone it fits shows the real coverage -
     * and whichever entry the customer buys, he gets a part that fits his
     * phone, from the same single stock pool.
     *
     * Opt-in, because the admin product list uses this endpoint too and must
     * keep seeing exactly one row per product.
     */
    const expandModels = expand_models === '1' || expand_models === 'true'

    // "Find Parts For Your Phone": narrow to the products linked to one phone
    // model. An unknown/unlinked model returns no products rather than the
    // whole catalogue.
    let compatibleOnlyIds: string[] | null = null

    // Which phone the shopper is shopping for. Collected from an explicit
    // pick, from a "what phone do you have" name, or from the search box - a
    // customer typing "A02" IS telling us his phone.
    const shopperModelIds = new Set<string>()

    if (phone_model || phone_model_name) {
      const modelIds = phone_model
        ? [String(phone_model)]
        : await findMatchingModelIds(supabase as any, String(phone_model_name))

      for (const id of modelIds) shopperModelIds.add(id)
      compatibleOnlyIds = await findCompatibleProductIds(supabase as any, modelIds)

      if (compatibleOnlyIds.length === 0) {
        return res.json({ data: [] })
      }
    }

    // Build query - join with categories and inventory stock
    let query = supabase
      .from('products')
      .select(`
        *,
        categories:category_id (
          id,
          name,
          slug
        ),
        inv_stock (
          quantity
        )
      `)

    // Filter by category slug (using category_id join)
    if (category) {
      // First, get category_id from slug
      const { data: categoryData, error: categoryError } = await supabase
        .from('categories')
        .select('id')
        .eq('slug', category as string)
        .maybeSingle()

      if (categoryError || !categoryData?.id) {
        // If category not found, return empty results
        console.warn(`[Products API] Category not found: ${category}`)
        return res.json({ data: [] })
      }

      query = query.eq('category_id', categoryData.id)
    }

    if (brand) {
      query = query.ilike('brand', brand as string)
    }

    if (condition) {
      query = query.eq('condition', condition as string)
    }

    if (compatibleOnlyIds) {
      query = query.in('id', compatibleOnlyIds)
    }

    if (search) {
      // Existing behaviour (name / description / specs.model) is kept exactly
      // as-is; SKU and phone-model matches are added on top so a search for
      // "Redmi Note 8 display" also finds a display merely *compatible* with it.
      const clauses = [
        `name.ilike.%${search}%`,
        `description.ilike.%${search}%`,
        `specs->>model.ilike.%${search}%`,
      ]

      if (await hasSkuColumn(supabase)) {
        clauses.push(`sku.ilike.%${search}%`)
      }

      const matchedModelIds = await findMatchingModelIds(supabase as any, String(search))
      if (matchedModelIds.length > 0) {
        for (const id of matchedModelIds) shopperModelIds.add(id)
        const compatibleIds = await findCompatibleProductIds(supabase as any, matchedModelIds)
        if (compatibleIds.length > 0) {
          clauses.push(`id.in.(${compatibleIds.join(',')})`)
        }
      }

      query = query.or(clauses.join(','))
    }

    if (minPrice) {
      query = query.gte('price', Number(minPrice))
    }

    if (maxPrice) {
      query = query.lte('price', Number(maxPrice))
    }

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) {
      return res.status(500).json({
        error: error.message,
        details: error.details,
        code: error.code,
      })
    }

    // Load images from product_images table for each product
    if (data && data.length > 0) {
      const productIds = data.map((p: any) => p.id)

      const { data: imagesData } = await supabase
        .from('product_images')
        .select('product_id, url, display_order, is_primary')
        .in('product_id', productIds)
        .order('display_order', { ascending: true })

      // Compatible phone models per product (empty map when not migrated yet)
      const compatibilityMap = await loadCompatibilityMap(supabase as any, productIds)

      // Group images by product_id
      const imagesMap = new Map<string, any[]>()
      imagesData?.forEach((img: any) => {
        if (!imagesMap.has(img.product_id)) {
          imagesMap.set(img.product_id, [])
        }
        imagesMap.get(img.product_id)?.push(img.url)
      })

      // Attach images to products
      const productsWithImages: any[] = data.map((product: any) => {
        const images = imagesMap.get(product.id) || [];
        const primaryImage = imagesData?.find((img: any) => img.product_id === product.id && img.is_primary)?.url || images[0];

        // Resolve stock from join
        const stockRec = Array.isArray(product.inv_stock) ? product.inv_stock[0] : product.inv_stock;

        return {
          ...product,
          image: primaryImage || product.image, // Fallback to old field if exists
          images: images.length > 0 ? images : (product.images || [product.image].filter(Boolean)), // Fallback to old field
          category: product.categories?.slug || product.category, // Use category slug from join or fallback
          stock: stockRec ? (stockRec.quantity ?? 0) : (product.stock ?? 0),
          // ONLY the shopper's own phone, never the full fit list. This payload
          // reaches the customer's browser, so anything in it is public.
          customer_model: pickCustomerModel(compatibilityMap.get(product.id) || [], shopperModelIds),
        };
      });

      if (!expandModels) {
        return res.json({ data: productsWithImages })
      }

      // One listing per phone. Same product id, same price, same single stock
      // value on every one of them - only the phone it is listed under differs.
      const listings: any[] = []
      for (const product of productsWithImages) {
        const all = compatibilityMap.get(product.id) || []

        // When the shopper named a phone - by searching "A02" or picking it -
        // he gets the entry for HIS phone and not the ones for the other
        // phones the same part happens to fit.
        const models =
          shopperModelIds.size > 0
            ? all.filter((m) => shopperModelIds.has(m.id))
            : all

        // Nothing linked yet: the product keeps its own single listing, so a
        // part that has never been given a phone list is still on sale.
        if (models.length === 0) {
          listings.push({ ...product, listing_id: encodeListing(product.id, null), customer_model: null })
          continue
        }

        for (const model of models) {
          listings.push({
            ...product,
            // The card needs its own React key and its own link; the product
            // id is untouched so the cart still points at the real box.
            // Opaque on purpose: two listings of one product must not share a
            // visible id in the address bar.
            listing_id: encodeListing(product.id, model.id),
            customer_model: {
              id: model.id,
              name: model.name,
              label: model.label,
              brand_name: model.brand_name,
            },
          })
        }
      }

      // Alphabetical by the name the customer actually reads, otherwise the
      // entries for one product sit in a clump and look like duplicates.
      listings.sort((a, b) =>
        String(a.customer_model?.label || a.name).localeCompare(
          String(b.customer_model?.label || b.name)
        )
      )

      return res.json({ data: listings })
    }

    return res.json({ data: data || [] })
  } catch (e: any) {
    return res.status(500).json({
      error: e?.message || 'Unexpected error fetching products',
    })
  }
}
