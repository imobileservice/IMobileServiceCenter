import { Request, Response } from 'express'
import { createServerClient } from '@supabase/ssr'

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

    const { category, brand, condition, search, minPrice, maxPrice } = req.query

    // Build query - join with categories for filtering
    let query = supabase
      .from('products')
      .select(`
        *,
        categories:category_id (
          id,
          name,
          slug
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

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`)
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

      // Group images by product_id
      const imagesMap = new Map<string, any[]>()
      imagesData?.forEach((img: any) => {
        if (!imagesMap.has(img.product_id)) {
          imagesMap.set(img.product_id, [])
        }
        imagesMap.get(img.product_id)?.push(img.url)
      })

      // Attach images to products
      const productsWithImages = data.map((product: any) => {
        const images = imagesMap.get(product.id) || []
        const primaryImage = imagesData?.find((img: any) => img.product_id === product.id && img.is_primary)?.url || images[0]
        
        return {
          ...product,
          image: primaryImage || product.image, // Fallback to old field if exists
          images: images.length > 0 ? images : (product.images || [product.image].filter(Boolean)), // Fallback to old field
          category: product.categories?.slug || product.category, // Use category slug from join or fallback
        }
      })

      return res.json({ data: productsWithImages })
    }

    return res.json({ data: data || [] })
  } catch (e: any) {
    return res.status(500).json({
      error: e?.message || 'Unexpected error fetching products',
    })
  }
}
