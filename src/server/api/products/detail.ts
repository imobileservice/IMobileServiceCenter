import { Request, Response } from 'express'
import { createServerClient } from '@supabase/ssr'

/**
 * GET /api/products/:id
 * Updated to load images from product_images table
 */
export async function detailHandler(req: Request, res: Response) {
  try {
    const { id } = req.params

    if (!id) {
      return res.status(400).json({
        error: 'Product ID is required',
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

    // Combine product data with images
    const productWithImages = {
      ...product,
      image: primaryImage || product.image, // Fallback to old field if exists
      images: images.length > 0 ? images : (product.images || [product.image].filter(Boolean)), // Fallback to old field
      category: product.categories?.slug || product.category, // Use category slug from join or fallback
    }

    return res.json({ data: productWithImages })
  } catch (e: any) {
    return res.status(500).json({
      error: e?.message || 'Unexpected error fetching product',
    })
  }
}
