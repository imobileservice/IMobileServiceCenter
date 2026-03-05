import { Request, Response } from 'express'
import { createServerClient } from '@supabase/ssr'
import { asyncHandler } from '../utils/async-handler'

export const featuredHandler = asyncHandler(async (req: Request, res: Response) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return res.status(503).json({ error: 'Supabase not configured' })
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      get(name: string) {
        return req.cookies?.[name]
      },
      set() {},
      remove() {},
    },
  })

  const limit = parseInt(req.query.limit as string) || 8

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_featured', true)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    return res.status(500).json({ error: error.message })
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
        image: primaryImage || null, // Primary image or first image
        images: images.length > 0 ? images : [], // All images array
      }
    })

    return res.json({ data: productsWithImages })
  }

  return res.json({ data: data || [] })
})

