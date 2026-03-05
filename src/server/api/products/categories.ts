import { Request, Response } from 'express'
import { createServerClient } from '@supabase/ssr'

/**
 * GET /api/products/categories
 * Loads categories from the categories table with product counts using category_id
 */
export async function categoriesHandler(req: Request, res: Response) {
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

    // Try to load from categories table first
    try {
      const { data: dbCategories, error: categoriesError } = await supabase
        .from('categories')
        .select('id, name, slug, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      if (!categoriesError && dbCategories && dbCategories.length > 0) {
        // Fetch products to count - use category_id
        const { data: products, error: productsError } = await supabase
          .from('products')
          .select('category_id')

        if (productsError) {
          console.warn('[Categories API] Error fetching products for counts:', productsError)
        }

        // Count products per category_id
        const categoryCounts = new Map<string, number>()
        products?.forEach((product: any) => {
          const catId = product.category_id
          if (catId) {
            categoryCounts.set(catId, (categoryCounts.get(catId) || 0) + 1)
          }
        })

        // Build category structure with subcategories
        const categoriesMap = new Map<string, {
          id: string
          name: string
          count: number
          subcategories?: Array<{ id: string; name: string; count: number }>
        }>()

        // First pass: create parent categories
        dbCategories.forEach((dbCat: { id: string; name: string; slug: string; sort_order: number }) => {
          const isSubcategory = dbCat.slug.includes('-') && 
            (dbCat.slug.startsWith('mobile-phones-') || 
             dbCat.slug.startsWith('accessories-') || 
             dbCat.slug.startsWith('used-items-'))

          if (!isSubcategory) {
            const count = categoryCounts.get(dbCat.id) || 0
            categoriesMap.set(dbCat.slug, {
              id: dbCat.slug,
              name: dbCat.name,
              count,
            })
          }
        })

        // Second pass: add subcategories to their parents
        dbCategories.forEach((dbCat: { id: string; name: string; slug: string; sort_order: number }) => {
          if (dbCat.slug.startsWith('mobile-phones-') && dbCat.slug !== 'mobile-phones') {
            const parent = categoriesMap.get('mobile-phones')
            if (parent) {
              if (!parent.subcategories) {
                parent.subcategories = []
              }
              const subSlug = dbCat.slug.replace('mobile-phones-', '')
              const count = categoryCounts.get(dbCat.id) || 0
              parent.subcategories.push({
                id: subSlug,
                name: dbCat.name,
                count,
              })
            }
          } else if (dbCat.slug.startsWith('accessories-') && dbCat.slug !== 'accessories') {
            const parent = categoriesMap.get('accessories')
            if (parent) {
              if (!parent.subcategories) {
                parent.subcategories = []
              }
              const subSlug = dbCat.slug.replace('accessories-', '')
              const count = categoryCounts.get(dbCat.id) || 0
              parent.subcategories.push({
                id: subSlug,
                name: dbCat.name,
                count,
              })
            }
          } else if (dbCat.slug.startsWith('used-items-') && dbCat.slug !== 'used-items') {
            const parent = categoriesMap.get('used-items')
            if (parent) {
              if (!parent.subcategories) {
                parent.subcategories = []
              }
              const subSlug = dbCat.slug.replace('used-items-', '')
              const count = categoryCounts.get(dbCat.id) || 0
              parent.subcategories.push({
                id: subSlug,
                name: dbCat.name,
                count,
              })
            }
          }
        })

        const categories = Array.from(categoriesMap.values())
        
        categories.forEach(cat => {
          if (cat.subcategories) {
            cat.subcategories.sort((a, b) => a.name.localeCompare(b.name))
          }
        })

        categories.sort((a, b) => {
          const aCat = dbCategories.find((c) => c.slug === a.id)
          const bCat = dbCategories.find((c) => c.slug === b.id)
          const aOrder = aCat?.sort_order ?? 999
          const bOrder = bCat?.sort_order ?? 999
          return aOrder - bOrder
        })

        return res.json({ data: categories })
      }
    } catch (e: any) {
      console.warn('[Categories API] Categories table not available, using fallback:', e.message)
    }

    // Fallback: Use old method (derive categories from products)
    // Try category_id first, fallback to category if it exists
    let query = supabase.from('products').select('category_id, brand')
    const { data, error } = await query

    if (error) {
      return res.status(500).json({
        error: error.message,
        details: error.details,
        code: error.code,
      })
    }

    const categoryCounts = new Map<string, number>()
    const categoryBrands = new Map<string, Set<string>>()

    // If we got category_id, we need to map them to category slugs
    // For now, just use a simple approach - count by category_id
    if (data && data.length > 0 && data[0].category_id) {
      // Products have category_id - we need to fetch category slugs
      const categoryIds = [...new Set(data.map((p: any) => p.category_id).filter(Boolean))]
      const { data: categoryData } = await supabase
        .from('categories')
        .select('id, slug')
        .in('id', categoryIds)

      const categoryIdToSlug = new Map(
        categoryData?.map((c: any) => [c.id, c.slug]) || []
      )

      data.forEach((product: any) => {
        const categoryId = product.category_id
        if (categoryId) {
          const categorySlug = categoryIdToSlug.get(categoryId) || categoryId
          categoryCounts.set(categorySlug, (categoryCounts.get(categorySlug) || 0) + 1)

          if (product.brand) {
            if (!categoryBrands.has(categorySlug)) {
              categoryBrands.set(categorySlug, new Set())
            }
            categoryBrands.get(categorySlug)?.add(product.brand)
          }
        }
      })
    } else {
      // Fallback: try category field (for backward compatibility)
      data?.forEach((product: any) => {
        const category = product.category
        if (category) {
          categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1)

          if (product.brand) {
            if (!categoryBrands.has(category)) {
              categoryBrands.set(category, new Set())
            }
            categoryBrands.get(category)?.add(product.brand)
          }
        }
      })
    }

    const categories: Array<{
      id: string
      name: string
      count: number
      subcategories?: Array<{ id: string; name: string; count: number }>
    }> = []

    categoryCounts.forEach((count, category) => {
      const categoryId = category.toLowerCase().replace(/\s+/g, '-')
      let categoryName = category
        .split('-')
        .map((word) => {
          if (word.toLowerCase() === 'ipads') return 'iPads'
          if (word.toLowerCase() === 'tablets') return 'Tablets'
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        })
        .join(' ')

      if (category === 'mobile-phones' && categoryBrands.has(category)) {
        const brands = Array.from(categoryBrands.get(category) || [])
        const subcategories = brands.map((brand) => {
          const brandCount = data?.filter(
            (p: any) => p.category === category && p.brand === brand
          ).length || 0
          return {
            id: brand.toLowerCase(),
            name: brand,
            count: brandCount,
          }
        })

        categories.push({
          id: categoryId,
          name: categoryName,
          count,
          subcategories: subcategories.sort((a, b) => a.name.localeCompare(b.name)),
        })
      } else {
        categories.push({
          id: categoryId,
          name: categoryName,
          count,
        })
      }
    })

    return res.json({
      data: categories.sort((a, b) => a.name.localeCompare(b.name)),
    })
  } catch (e: any) {
    return res.status(500).json({
      error: e?.message || 'Unexpected error fetching categories',
    })
  }
}
