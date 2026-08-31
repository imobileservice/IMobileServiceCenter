import { Request, Response } from 'express'
import { createServerClient } from '@supabase/ssr'
import { loadCompatibilityMap, pickCustomerModel } from '../utils/compatibility'
import { decodeListing } from '../utils/listing-token'

/**
 * GET /api/products/:id
 * Updated to load images from product_images table
 */
export async function detailHandler(req: Request, res: Response) {
  try {
    // A shop link carries an opaque listing token that hides which product it
    // points at and which phone it was listed under. A plain product id still
    // works, so bookmarked links and the admin keep functioning.
    const { productId: id, phoneModelId: listingModelId } = decodeListing(req.params.id)

    if (!id) {
      return res.status(404).json({
        error: 'Product not found',
      })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      return res.status(503).json({
        error: 'Supabase not configured',
        message: 'Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file',
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

    // Get product with category info
    const { data: product, error } = await supabase
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
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Product not found',
        })
      }
      return res.status(500).json({
        error: error.message,
        details: error.details,
        code: error.code,
      })
    }

    // Load images from product_images table
    const { data: imagesData } = await supabase
      .from('product_images')
      .select('url, display_order, is_primary, alt_text')
      .eq('product_id', id)
      .order('display_order', { ascending: true })

    // Build images array
    const images = imagesData?.map((img: any) => img.url) || []
    const primaryImage = imagesData?.find((img: any) => img.is_primary)?.url || images[0]

    // Resolve stock from join
    const stockRec = Array.isArray(product.inv_stock) ? product.inv_stock[0] : product.inv_stock;

    // Compatible phone models. Purely a relationship list - it never affects
    // the stock resolved above, which stays the one inv_stock row.
    const compatibilityMap = await loadCompatibilityMap(supabase as any, [id])

    // The shopper tells us his phone with ?phone_model=<id>. He is shown that
    // one name and nothing else - the other phones this part fits are the
    // shop's business, and this response goes straight to his browser.
    const wanted = new Set<string>()
    if (listingModelId) wanted.add(listingModelId)
    if (req.query.phone_model) wanted.add(String(req.query.phone_model))

    // Combine product data with images
    const productWithImages = {
      ...product,
      image: primaryImage || product.image, // Fallback to old field if exists
      images: images.length > 0 ? images : (product.images || [product.image].filter(Boolean)), // Fallback to old field
      category: product.categories?.slug || product.category, // Use category slug from join or fallback
      stock: stockRec ? (stockRec.quantity ?? 0) : (product.stock ?? 0),
      customer_model: pickCustomerModel(compatibilityMap.get(id) || [], wanted),
    };

    return res.json({ data: productWithImages })
  } catch (e: any) {
    return res.status(500).json({
      error: e?.message || 'Unexpected error fetching product',
    })
  }
}
