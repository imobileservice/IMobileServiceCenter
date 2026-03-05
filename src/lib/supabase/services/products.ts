import { createClient } from '../client'
import { getApiUrl } from '../../utils/api'
import { withRetry, handleSupabaseError } from '../utils/error-handler'
import type { Database } from '../types'

type Product = Database['public']['Tables']['products']['Row']
type ProductInsert = Database['public']['Tables']['products']['Insert']

export const productsService = {
  // Get featured products
  async getFeatured(limit: number = 8) {
    return withRetry(async () => {
      // Try backend API first
      if (typeof window !== 'undefined') {
        try {
          const response = await fetch(getApiUrl(`/api/products/featured?limit=${limit}`), {
            credentials: 'include',
            signal: AbortSignal.timeout(10000),
          })

          if (response.ok) {
            const payload = await response.json()
            return payload.data || []
          }
        } catch (e: any) {
          if (!e.message?.includes('timeout') && e.name !== 'AbortError') {
            console.warn('[productsService] Featured API failed, using direct Supabase:', e.message)
          }
        }
      }

      // Fallback to direct Supabase
      const supabase = createClient()
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_featured', true)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw handleSupabaseError(error)

      // Load images for featured products
      if (data && data.length > 0) {
        return await this.attachImagesToProducts(data)
      }

      return data as Product[]
    })
  },

  // Attach images to products from product_images table
  async attachImagesToProducts(products: any[]): Promise<Product[]> {
    const supabase = createClient()
    const productIds = products.map(p => p.id)

    try {
      const { data: imagesData } = await supabase
        .from('product_images')
        .select('product_id, url, display_order, is_primary')
        .in('product_id', productIds)
        .order('display_order', { ascending: true })

      // Group images by product_id
      const imagesMap = new Map<string, string[]>()
      imagesData?.forEach((img: any) => {
        if (!imagesMap.has(img.product_id)) {
          imagesMap.set(img.product_id, [])
        }
        imagesMap.get(img.product_id)?.push(img.url)
      })

      // Attach images to products
      return products.map((product: any) => {
        const images = imagesMap.get(product.id) || []
        const primaryImage = imagesData?.find((img: any) => img.product_id === product.id && img.is_primary)?.url || images[0]

        return {
          ...product,
          image: primaryImage || product.image,
          images: images.length > 0 ? images : (product.images || [product.image].filter(Boolean)),
        }
      })
    } catch (error) {
      console.warn('Error loading images from product_images table:', error)
      // Return products with existing image fields as fallback
      return products
    }
  },

  // Get all products
  async getAll(filters?: {
    category?: string
    brand?: string
    condition?: 'new' | 'used'
    search?: string
    minPrice?: number
    maxPrice?: number
    dynamicFilters?: Record<string, any>
  }) {
    return withRetry(async () => {
      // Check if we have Supabase credentials - if not, skip API and use direct calls
      const hasSupabaseConfig =
        import.meta.env.VITE_SUPABASE_URL ||
        import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
        (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SUPABASE_URL)

      let products: Product[] = []
      let apiSuccess = false

      // Try API first only if Supabase is configured (API might be faster)
      if (typeof window !== 'undefined' && hasSupabaseConfig) {
        try {
          const params = new URLSearchParams()
          if (filters?.category) params.set('category', filters.category)
          if (filters?.brand) params.set('brand', filters.brand)
          if (filters?.condition) params.set('condition', filters.condition)
          if (filters?.search) params.set('search', filters.search)
          if (filters?.minPrice !== undefined) params.set('minPrice', String(filters.minPrice))
          if (filters?.maxPrice !== undefined) params.set('maxPrice', String(filters.maxPrice))

          const queryString = params.toString()
          const cacheBuster = `_t=${Date.now()}`
          const endpoint = queryString
            ? `/api/products/list?${queryString}&${cacheBuster}`
            : `/api/products/list?${cacheBuster}`

          const response = await fetch(endpoint, {
            cache: 'no-store',
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0'
            },
            signal: AbortSignal.timeout(5000),
          })
          if (response.ok) {
            const payload = await response.json()
            products = payload.data as Product[]
            apiSuccess = true
          } else {
            console.warn('API call failed, will try direct Supabase connection')
          }
        } catch (e) {
          console.warn('API unavailable, will try direct Supabase connection')
        }
      }

      // Direct Supabase call (fallback if API failed or was skipped)
      if (!apiSuccess) {
        const supabase = createClient()

        if (!hasSupabaseConfig) {
          console.warn('Supabase not configured - returning empty product list')
          return [] as Product[]
        }

        // Check if category_id column exists
        let categoryFilter = null
        if (filters?.category) {
          // Get category_id from slug
          const { data: categoryData } = await supabase
            .from('categories')
            .select('id')
            .eq('slug', filters.category)
            .single()

          if (categoryData?.id) {
            categoryFilter = categoryData.id
          }
        }

        let query = supabase.from('products').select('*')

        // Filter by category_id if available, otherwise try category field (backward compatibility)
        if (categoryFilter) {
          query = query.eq('category_id', categoryFilter)
        } else if (filters?.category) {
          // Fallback: check if category field still exists
          try {
            query = query.eq('category', filters.category)
          } catch (e) {
            // Category field doesn't exist, skip filter
          }
        }

        if (filters?.brand) {
          query = query.ilike('brand', filters.brand)
        }
        if (filters?.condition) {
          query = query.eq('condition', filters.condition)
        }
        if (filters?.search) {
          query = query.or(`name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`)
        }
        if (filters?.minPrice !== undefined) {
          query = query.gte('price', filters.minPrice)
        }
        if (filters?.maxPrice !== undefined) {
          query = query.lte('price', filters.maxPrice)
        }

        const { data, error } = await query.order('created_at', { ascending: false })

        if (error) throw handleSupabaseError(error)
        products = data as Product[]
      }

      // Apply dynamic filters in-memory
      if (filters?.dynamicFilters && Object.keys(filters.dynamicFilters).length > 0) {
        products = products.filter(product => {
          const specs = product.specs as Record<string, any> || {}

          return Object.entries(filters.dynamicFilters || {}).every(([key, filterValue]) => {
            // Skip invalid filters
            if (filterValue === null || filterValue === undefined) return true
            if (Array.isArray(filterValue) && filterValue.length === 0) return true

            const productValue = specs[key]

            // Handle range filter (array of 2 numbers)
            if (Array.isArray(filterValue) && filterValue.length === 2 && typeof filterValue[0] === 'number' && typeof filterValue[1] === 'number') {
              // If product value is not present or not a number, exclude
              if (productValue === undefined || productValue === null) return false
              // Try to parse product value as number (it might be "128GB" or "6.1 inches")
              // For now, let's assume range filters are only applied to numeric values or we parse them
              // A better approach is to rely on exact match for string values unless we know it's a range
              // But the UI sends [min, max] only for range types.
              // We should parse the product value. E.g. "128" from "128GB".
              const numValue = parseFloat(String(productValue).replace(/[^0-9.]/g, ''))
              if (isNaN(numValue)) return false
              return numValue >= filterValue[0] && numValue <= filterValue[1]
            }

            // Handle multiselect (array of strings)
            if (Array.isArray(filterValue)) {
              if (productValue === undefined || productValue === null) return false
              // If product value is array, check intersection? Or just exact match?
              // Usually product spec is single value.
              return filterValue.includes(productValue)
            }

            // Handle single select (string/number)
            return productValue == filterValue
          })
        })
      }

      // Load images for products
      if (products && products.length > 0) {
        return await this.attachImagesToProducts(products)
      }

      return products
    })
  },

  // Get single product
  async getById(id: string) {
    return withRetry(async () => {
      // Try API first
      if (typeof window !== 'undefined') {
        try {
          const response = await fetch(getApiUrl(`/api/products/${id}`), {
            cache: 'no-store',
            signal: AbortSignal.timeout(10000),
          })
          if (response.ok) {
            const payload = await response.json()
            return payload.data as Product
          }
        } catch (e) {
          // Fall through to direct call
        }
      }

      // Direct Supabase call
      const supabase = createClient()
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw handleSupabaseError(error)

      // Load images for single product
      if (data) {
        const productsWithImages = await this.attachImagesToProducts([data])
        return productsWithImages[0]
      }

      return data as Product
    })
  },

  // Create product - uses backend API with service role
  async create(product: ProductInsert) {
    try {
      const { getApiUrl } = await import('@/lib/utils/api')
      const response = await fetch(getApiUrl('/api/admin/products'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(product),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create product')
      }

      const result = await response.json()
      return result.data as Product
    } catch (error) {
      console.error('Error creating product via API:', error)
      // Don't use fallback - the API should handle everything
      // The fallback would fail because it doesn't handle category_id conversion
      throw error
    }
  },

  // Update product
  async update(id: string, updates: Partial<ProductInsert>) {
    try {
      const { getApiUrl } = await import('@/lib/utils/api')
      const response = await fetch(getApiUrl(`/api/admin/products/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update product')
      }

      const result = await response.json()
      return result.data as Product
    } catch (error) {
      console.error('Error updating product via API:', error)
      throw error
    }
  },

  // Delete product
  async delete(id: string) {
    try {
      const { getApiUrl } = await import('@/lib/utils/api')
      const response = await fetch(getApiUrl(`/api/admin/products/${id}`), {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete product')
      }

      return true
    } catch (error) {
      console.error('Error deleting product via API:', error)
      throw error
    }
  },

  // Get unique categories (deprecated - use getCategoriesWithCounts instead)
  async getCategories() {
    return withRetry(async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('products')
        .select('category')
        .order('category')

      if (error) throw handleSupabaseError(error)

      const uniqueCategories = Array.from(new Set(data?.map((p: { category: any }) => p.category).filter(Boolean) as string[]))
      return uniqueCategories
    })
  },

  // Get categories with product counts (updated to use category_id)
  async getCategoriesWithCounts() {
    return withRetry(async () => {
      // Check if we have Supabase credentials
      const hasSupabaseConfig =
        import.meta.env.VITE_SUPABASE_URL ||
        import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
        (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SUPABASE_URL)

      // Try API first only if Supabase is configured
      if (typeof window !== 'undefined' && hasSupabaseConfig) {
        try {
          const response = await fetch(getApiUrl('/api/products/categories'), {
            cache: 'no-store',
            signal: AbortSignal.timeout(5000),
          })
          if (response.ok) {
            const payload = await response.json()
            return payload.data
          }
          console.warn('API call failed, using direct Supabase connection')
        } catch (e) {
          console.warn('API unavailable, using direct Supabase connection')
        }
      }

      // Direct Supabase call (fallback or when API not available)
      const supabase = createClient()

      if (!hasSupabaseConfig) {
        console.warn('Supabase not configured - returning empty categories')
        return []
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase configuration missing')
      }

      // Load from categories table (primary method)
      try {
        const categoriesResponse = await fetch(`${supabaseUrl}/rest/v1/categories?select=id,name,slug,sort_order&is_active=eq.true&order=sort_order.asc`, {
          headers: {
            'apikey': supabaseAnonKey,
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(8000)
        })

        if (categoriesResponse.ok) {
          const dbCategories: Array<{ id: string; name: string; slug: string; sort_order: number }> = await categoriesResponse.json()

          // Load products to count - use category_id
          const { data: products, error } = await supabase
            .from('products')
            .select('category_id')

          if (error) {
            console.warn('Error fetching products for category counts:', error)
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
          dbCategories.forEach((dbCat) => {
            const isSubcategory = dbCat.slug.includes('-') &&
              (dbCat.slug.startsWith('mobile-phones-') ||
                dbCat.slug.startsWith('accessories-') ||
                dbCat.slug.startsWith('used-items-'))

            if (!isSubcategory) {
              const count = categoryCounts.get(dbCat.id) || 0
              let name = dbCat.name
              if (dbCat.slug === 'mobile-phones') name = 'Mobile Phone'
              if (dbCat.slug === 'used-items') name = 'Used Phone'

              categoriesMap.set(dbCat.slug, {
                id: dbCat.slug,
                name: name,
                count,
              })
            }
          })

          // Second pass: add subcategories to their parents
          dbCategories.forEach((dbCat) => {
            if (dbCat.slug.startsWith('mobile-phones-') && dbCat.slug !== 'mobile-phones') {
              const parent = categoriesMap.get('mobile-phones')
              if (parent) {
                if (!parent.subcategories) {
                  parent.subcategories = []
                }
                const subSlug = dbCat.slug.replace('mobile-phones-', '')
                // Clean up name: remove "Used " prefix if present, generally use simple brand name
                // But for mobile phones subcategories are usually brands
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
                // Remove "Used " prefix for cleaner display
                const name = dbCat.name.replace(/^Used\s+/i, '')
                const count = categoryCounts.get(dbCat.id) || 0
                parent.subcategories.push({
                  id: subSlug,
                  name: name,
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

          return categories.sort((a, b) => {
            const aCat = dbCategories.find((c) => c.slug === a.id)
            const bCat = dbCategories.find((c) => c.slug === b.id)
            const aOrder = aCat?.sort_order ?? 999
            const bOrder = bCat?.sort_order ?? 999
            return aOrder - bOrder
          })
        }
      } catch (e) {
        console.warn('Categories table not available, using fallback method:', e)
      }

      // Fallback: Use old method (derive categories from products)
      const { data, error } = await supabase
        .from('products')
        .select('category_id, brand')

      if (error) {
        throw handleSupabaseError(error)
      }

      // Try to get categories from categories table for mapping
      try {
        const { data: categories } = await supabase
          .from('categories')
          .select('id, name, slug, sort_order')
          .eq('is_active', true)
          .order('sort_order', { ascending: true })

        if (categories && categories.length > 0) {
          // Count products per category_id
          const categoryCounts = new Map<string, number>()
          data?.forEach((product: any) => {
            const catId = product.category_id
            if (catId) {
              categoryCounts.set(catId, (categoryCounts.get(catId) || 0) + 1)
            }
          })

          const categoriesMap = new Map<string, {
            id: string
            name: string
            count: number
            subcategories?: Array<{ id: string; name: string; count: number }>
          }>()

          categories.forEach((cat: { slug: string | string[]; id: string; name: any }) => {
            const isSubcategory = cat.slug.includes('-') &&
              (cat.slug.startsWith('mobile-phones-') ||
                cat.slug.startsWith('accessories-') ||
                cat.slug.startsWith('used-items-'))

            if (!isSubcategory) {
              const count = categoryCounts.get(cat.id) || 0
              categoriesMap.set(cat.slug, {
                id: cat.slug,
                name: cat.name,
                count,
              })
            }
          })

          // Add subcategories
          categories.forEach((cat: { slug: string; name: any; id: string }) => {
            if (cat.slug.startsWith('mobile-phones-') && cat.slug !== 'mobile-phones') {
              const parent = categoriesMap.get('mobile-phones')
              if (parent) {
                if (!parent.subcategories) parent.subcategories = []
                const count = categoryCounts.get(cat.id) || 0
                parent.subcategories.push({
                  id: cat.slug.replace('mobile-phones-', ''),
                  name: cat.name,
                  count,
                })
              }
            } else if (cat.slug.startsWith('accessories-') && cat.slug !== 'accessories') {
              const parent = categoriesMap.get('accessories')
              if (parent) {
                if (!parent.subcategories) parent.subcategories = []
                const count = categoryCounts.get(cat.id) || 0
                parent.subcategories.push({
                  id: cat.slug.replace('accessories-', ''),
                  name: cat.name,
                  count,
                })
              }
            } else if (cat.slug.startsWith('used-items-') && cat.slug !== 'used-items') {
              const parent = categoriesMap.get('used-items')
              if (parent) {
                if (!parent.subcategories) parent.subcategories = []
                const count = categoryCounts.get(cat.id) || 0
                parent.subcategories.push({
                  id: cat.slug.replace('used-items-', ''),
                  name: cat.name,
                  count,
                })
              }
            }
          })

          const result = Array.from(categoriesMap.values())
          result.forEach(cat => {
            if (cat.subcategories) {
              cat.subcategories.sort((a, b) => a.name.localeCompare(b.name))
            }
          })

          return result.sort((a, b) => {
            const aCat = categories.find((c: { slug: string }) => c.slug === a.id)
            const bCat = categories.find((c: { slug: string }) => c.slug === b.id)
            return (aCat?.sort_order ?? 999) - (bCat?.sort_order ?? 999)
          })
        }
      } catch (e) {
        // Fall through to old method
      }

      // Last resort: return empty array if categories table doesn't work
      return []
    })
  },

  // Get brands
  async getBrands() {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('products')
      .select('brand')
      .order('brand')

    if (error) throw handleSupabaseError(error)

    const uniqueBrands = Array.from(new Set(data?.map((p: { brand: any }) => p.brand).filter(Boolean) as string[]))
    return uniqueBrands.sort()
  },
}
