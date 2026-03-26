import { createClient } from '../client'
import { paginateQuery, type PaginationOptions, type PaginatedResponse } from '../utils/pagination'
import { withRetry, handleSupabaseError } from '../utils/error-handler'
import type { Database } from '../types'

type Product = Database['public']['Tables']['products']['Row']
type ProductInsert = Database['public']['Tables']['products']['Insert']
type ProductUpdate = Database['public']['Tables']['products']['Update']

export const productsServiceEnhanced = {
  // Get all products with pagination
  async getAllPaginated(
    options: PaginationOptions & {
      filters?: {
        category?: string
        brand?: string
        condition?: 'new' | 'used'
        search?: string
        minPrice?: number
        maxPrice?: number
      }
    } = {}
  ): Promise<PaginatedResponse<Product>> {
    return withRetry(async () => {
      const { filters, ...paginationOptions } = options
      const supabase = createClient()
      let query = supabase.from('products').select('*', { count: 'exact' })

      if (filters) {
        if (filters.category) {
          query = query.eq('category', filters.category)
        }
        if (filters.brand) {
          query = query.eq('brand', filters.brand)
        }
        if (filters.condition) {
          query = query.eq('condition', filters.condition)
        }
        if (filters.search) {
          query = query.or(`name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`)
        }
        if (filters.minPrice !== undefined) {
          query = query.gte('price', filters.minPrice)
        }
        if (filters.maxPrice !== undefined) {
          query = query.lte('price', filters.maxPrice)
        }
      }

      try {
        return await paginateQuery<Product>(query, paginationOptions)
      } catch (error) {
        throw handleSupabaseError(error)
      }
    })
  },

  // Get all products (non-paginated, for backwards compatibility)
  async getAll(filters?: {
    category?: string
    brand?: string
    condition?: 'new' | 'used'
    search?: string
    minPrice?: number
    maxPrice?: number
  }) {
    return withRetry(async () => {
      const supabase = createClient()
      let query = supabase.from('products').select('*')

      if (filters) {
        if (filters.category) {
          query = query.eq('category', filters.category)
        }
        if (filters.brand) {
          query = query.eq('brand', filters.brand)
        }
        if (filters.condition) {
          query = query.eq('condition', filters.condition)
        }
        if (filters.search) {
          query = query.or(`name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`)
        }
        if (filters.minPrice !== undefined) {
          query = query.gte('price', filters.minPrice)
        }
        if (filters.maxPrice !== undefined) {
          query = query.lte('price', filters.maxPrice)
        }
      }

      const { data, error } = await query.order('created_at', { ascending: false })

      if (error) throw handleSupabaseError(error)
      return data as Product[]
    })
  },

  // Get featured products
  async getFeatured(limit = 6) {
    return withRetry(async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('rating', { ascending: false })
        .order('reviews_count', { ascending: false })
        .limit(limit)

      if (error) throw handleSupabaseError(error)
      return data as Product[]
    })
  },

  // Get related products
  async getRelated(productId: string, category: string, limit = 4) {
    return withRetry(async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('category', category)
        .neq('id', productId)
        .limit(limit)

      if (error) throw handleSupabaseError(error)
      return data as Product[]
    })
  },

  // Get single product with full details
  async getById(id: string) {
    return withRetry(async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw handleSupabaseError(error)
      return data as Product
    })
  },

  // Batch operations
  async createBatch(products: ProductInsert[]) {
    return withRetry(async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('products')
        .insert(products)
        .select()

      if (error) throw handleSupabaseError(error)
      return data as Product[]
    })
  },

  async updateBatch(updates: Array<{ id: string; updates: ProductUpdate }>) {
    return withRetry(async () => {
      const supabase = createClient()
      const results = await Promise.all(
        updates.map(({ id, updates: productUpdates }) =>
          supabase
            .from('products')
            .update(productUpdates)
            .eq('id', id)
            .select()
            .single()
        )
      )

      const errors = results.filter(r => r.error)
      if (errors.length > 0) {
        throw handleSupabaseError(errors[0].error)
      }

      return results.map(r => r.data as Product)
    })
  },

  // Update stock (atomic operation)
  async updateStock(productId: string, quantity: number) {
    return withRetry(async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .rpc('update_product_stock', {
          p_product_id: productId,
          p_quantity: quantity,
        })

      if (error) throw handleSupabaseError(error)
      return data
    })
  },

  // Search with full-text search
  async search(query: string, limit = 20) {
    return withRetry(async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .or(`name.ilike.%${query}%,description.ilike.%${query}%,brand.ilike.%${query}%`)
        .limit(limit)

      if (error) throw handleSupabaseError(error)
      return data as Product[]
    })
  },

  // Get statistics
  async getStats() {
    return withRetry(async () => {
      const supabase = createClient()
      
      const [total, inStock, outOfStock, categories, brands] = await Promise.all([
        supabase.from('products').select('id', { count: 'exact', head: true }),
        supabase.from('products').select('id', { count: 'exact', head: true }).gt('stock', 0),
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('stock', 0),
        supabase.from('products').select('category_id'),
        supabase.from('products').select('brand'),
      ])

      // Count unique category_ids (excluding nulls)
      const uniqueCategories = new Set(
        categories.data?.map(p => p.category_id).filter(Boolean) || []
      )

      return {
        total: total.count || 0,
        inStock: inStock.count || 0,
        outOfStock: outOfStock.count || 0,
        categories: uniqueCategories.size,
        brands: new Set(brands.data?.map(p => p.brand).filter(Boolean) || []).size,
      }
    })
  },
}
