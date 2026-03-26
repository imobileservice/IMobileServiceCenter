import { createClient } from '../client'
import { getApiUrl } from '../../utils/api'
import { withRetry, handleSupabaseError } from '../utils/error-handler'

export interface CategoryField {
  key: string
  label: string
  type: 'text' | 'number' | 'select'
  options?: string[]
  placeholder?: string
  required?: boolean
}

export interface CategoryFieldConfig {
  fields: CategoryField[]
}

export interface Category {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  field_config: CategoryFieldConfig
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface CategoryInsert {
  name: string
  slug: string
  description?: string | null
  icon?: string | null
  field_config: CategoryFieldConfig
  is_active?: boolean
  sort_order?: number
}

export interface CategoryUpdate {
  name?: string
  slug?: string
  description?: string | null
  icon?: string | null
  field_config?: CategoryFieldConfig
  is_active?: boolean
  sort_order?: number
}

export const categoriesService = {
  // Get all categories - matches products service pattern exactly
  async getAll() {
    return withRetry(async () => {
      // Check if we have Supabase credentials - if not, skip API and use direct calls
      const hasSupabaseConfig = 
        import.meta.env.VITE_SUPABASE_URL || 
        import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
        (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SUPABASE_URL)

      // Try API first only if Supabase is configured (API might be faster)
      if (typeof window !== 'undefined' && hasSupabaseConfig) {
        try {
          const response = await fetch(getApiUrl('/api/admin/categories'), {
            cache: 'no-store',
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0'
            },
            signal: AbortSignal.timeout(5000), // 5 second timeout
          })
          if (response.ok) {
            const payload = await response.json()
            return payload.data as Category[]
          }
          // If API fails, fall through to direct Supabase call
          console.warn('[categoriesService] API call failed, using direct Supabase connection')
        } catch (e) {
          // Network error or timeout - fall through to direct Supabase call
          console.warn('[categoriesService] API unavailable, using direct Supabase connection')
        }
      }

      // Direct Supabase call (fallback or when API not available)
      // If Supabase not configured, return empty array
      if (!hasSupabaseConfig) {
        console.warn('[categoriesService] Supabase not configured - returning empty category list')
        return [] as Category[]
      }
      
      // Use direct REST API call (works reliably, Supabase JS client was hanging)
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase configuration missing')
      }
      
      // Direct REST API call - this works reliably unlike the JS client for this table
      const response = await fetch(`${supabaseUrl}/rest/v1/categories?select=*&order=sort_order.asc`, {
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        signal: AbortSignal.timeout(10000) // 10 second timeout
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to fetch categories: ${response.status} ${response.statusText} - ${errorText}`)
      }
      
      const data = await response.json()
      
      // Filter active categories in memory
      const activeCategories = (data || []).filter((cat: Category) => cat.is_active !== false)
      return activeCategories as Category[]
    })
  },

  // Get single category
  async getById(id: string) {
    try {
      const response = await fetch(getApiUrl(`/api/admin/categories/${id}`), {
        cache: 'no-store',
      })
      if (response.ok) {
        const payload = await response.json()
        return payload.data as Category
      }
      throw new Error('Failed to fetch category')
    } catch (error) {
      const supabase = createClient()
      const { data, error: supabaseError } = await supabase
        .from('categories')
        .select('*')
        .eq('id', id)
        .single()
      
      if (supabaseError) throw handleSupabaseError(supabaseError)
      return data as Category
    }
  },

  // Get category by slug
  async getBySlug(slug: string) {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .single()
    
    if (error) throw handleSupabaseError(error)
    return data as Category
  },

  // Create category
  async create(category: CategoryInsert) {
    try {
      const response = await fetch(getApiUrl('/api/admin/categories'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(category),
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create category')
      }
      
      const result = await response.json()
      return result.data as Category
    } catch (error) {
      console.error('Error creating category via API:', error)
      // Fallback to direct Supabase call (requires RLS policy to allow authenticated users)
      const supabase = createClient()
      const { data, error: supabaseError } = await supabase
        .from('categories')
        .insert({
          name: category.name,
          slug: category.slug,
          description: category.description || null,
          icon: category.icon || null,
          field_config: category.field_config,
          is_active: category.is_active ?? true,
          sort_order: category.sort_order ?? 0,
        })
        .select('*')
        .single()

      if (supabaseError) throw handleSupabaseError(supabaseError)
      return data as Category
    }
  },

  // Update category
  async update(id: string, updates: CategoryUpdate) {
    try {
      const response = await fetch(getApiUrl(`/api/admin/categories/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update category')
      }
      
      const result = await response.json()
      return result.data as Category
    } catch (error) {
      console.error('Error updating category via API:', error)
      const supabase = createClient()
      const { data, error: supabaseError } = await supabase
        .from('categories')
        .update({
          ...(updates.name !== undefined && { name: updates.name }),
          ...(updates.slug !== undefined && { slug: updates.slug }),
          ...(updates.description !== undefined && { description: updates.description }),
          ...(updates.icon !== undefined && { icon: updates.icon }),
          ...(updates.field_config !== undefined && { field_config: updates.field_config }),
          ...(updates.is_active !== undefined && { is_active: updates.is_active }),
          ...(updates.sort_order !== undefined && { sort_order: updates.sort_order }),
        })
        .eq('id', id)
        .select('*')
        .single()

      if (supabaseError) throw handleSupabaseError(supabaseError)
      return data as Category
    }
  },

  // Delete category
  async delete(id: string) {
    try {
      const response = await fetch(getApiUrl(`/api/admin/categories/${id}`), {
        method: 'DELETE',
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete category')
      }
    } catch (error) {
      console.error('Error deleting category via API:', error)
      const supabase = createClient()
      const { error: supabaseError } = await supabase
        .from('categories')
        .delete()
        .eq('id', id)

      if (supabaseError) throw handleSupabaseError(supabaseError)
    }
  },
}
