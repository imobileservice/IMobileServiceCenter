import { createClient } from '../client'
import { getApiUrl } from '../../utils/api'
import { withRetry, handleSupabaseError } from '../utils/error-handler'

export interface HeroSlide {
  id: string
  product_id: string | null
  brand: string
  title: string
  subtitle: string | null
  image: string
  image2: string | null
  display_order: number
  is_active: boolean
  created_at: string
  updated_at: string
  products?: {
    id: string
    name: string
    image: string
  }
}

export const heroSlidesService = {
  // Get all active hero slides
  async getAll() {
    return withRetry(async () => {
      // Try backend API first
      if (typeof window !== 'undefined') {
        try {
          const response = await fetch(getApiUrl('/api/hero-slides'), {
            credentials: 'include',
            signal: AbortSignal.timeout(10000),
          })
          
          if (response.ok) {
            const payload = await response.json()
            return payload.data || []
          }
        } catch (e: any) {
          if (!e.message?.includes('timeout') && e.name !== 'AbortError') {
            console.warn('[heroSlidesService] API failed, using direct Supabase:', e.message)
          }
        }
      }

      // Fallback to direct Supabase
      const supabase = createClient()
      const { data, error } = await supabase
        .from('hero_slides')
        .select(`
          *,
          products (
            id,
            name
          )
        `)
        .eq('is_active', true)
        .order('display_order', { ascending: true })

      if (error) throw error
      
      // Load product images separately since image column doesn't exist
      if (data && data.length > 0) {
        const productIds = data
          .map(slide => slide.product_id || slide.products?.id)
          .filter(Boolean) as string[]
        
        if (productIds.length > 0) {
          const { data: imagesData } = await supabase
            .from('product_images')
            .select('product_id, url, is_primary')
            .in('product_id', productIds)
            .eq('is_primary', true)
          
          // Attach primary images to products
          const imagesMap = new Map<string, string>()
          imagesData?.forEach((img: any) => {
            imagesMap.set(img.product_id, img.url)
          })
          
          // Add image to products in slides
          data.forEach((slide: any) => {
            const productId = slide.product_id || slide.products?.id
            if (productId && slide.products) {
              slide.products.image = imagesMap.get(productId) || null
            }
          })
        }
      }
      
      return data as HeroSlide[]
    })
  },

  // Get all slides (admin)
  async getAllForAdmin() {
    return withRetry(async () => {
      // Try backend API first
      if (typeof window !== 'undefined') {
        try {
          const response = await fetch(getApiUrl('/api/admin/hero-slides'), {
            credentials: 'include',
            signal: AbortSignal.timeout(10000),
          })
          
          if (response.ok) {
            const payload = await response.json()
            return payload.data || []
          }
        } catch (e: any) {
          if (!e.message?.includes('timeout') && e.name !== 'AbortError') {
            console.warn('[heroSlidesService] Admin API failed, using direct Supabase:', e.message)
          }
        }
      }

      // Fallback to direct Supabase
      const supabase = createClient()
      const { data, error } = await supabase
        .from('hero_slides')
        .select(`
          *,
          products (
            id,
            name,
            image
          )
        `)
        .order('display_order', { ascending: true })

      if (error) throw error
      return data as HeroSlide[]
    })
  },

  // Create slide
  async create(slide: Omit<HeroSlide, 'id' | 'created_at' | 'updated_at'>) {
    if (typeof window !== 'undefined') {
      try {
        const response = await fetch(getApiUrl('/api/admin/hero-slides'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(slide),
          signal: AbortSignal.timeout(15000),
        })
        
        if (response.ok) {
          const payload = await response.json()
          return payload.data
        }
        
        const error = await response.json().catch(() => ({ error: 'Failed to create slide' }))
        throw new Error(error.error || 'Failed to create slide')
      } catch (e: any) {
        if (e.message?.includes('timeout') || e.name === 'AbortError') {
          throw e
        }
        console.warn('[heroSlidesService] API create failed, falling back to Supabase client:', e.message)
      }
    }

    // Fallback to direct Supabase call (requires user session)
    return withRetry(async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('hero_slides')
        .insert({
          product_id: slide.product_id || null,
          brand: slide.brand,
          title: slide.title,
          subtitle: slide.subtitle || null,
          image: slide.image,
          image2: slide.image2 || null,
          display_order: slide.display_order || 0,
          is_active: slide.is_active ?? true,
        })
        .select(`
          *,
          products (
            id,
            name,
            image
          )
        `)
        .single()

      if (error) throw handleSupabaseError(error)
      return data as HeroSlide
    })
  },

  // Update slide
  async update(id: string, updates: Partial<HeroSlide>) {
    if (typeof window !== 'undefined') {
      try {
        const response = await fetch(getApiUrl(`/api/admin/hero-slides/${id}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(updates),
          signal: AbortSignal.timeout(15000),
        })
        
        if (response.ok) {
          const payload = await response.json()
          return payload.data
        }
        
        const error = await response.json().catch(() => ({ error: 'Failed to update slide' }))
        throw new Error(error.error || 'Failed to update slide')
      } catch (e: any) {
        if (e.message?.includes('timeout') || e.name === 'AbortError') {
          throw e
        }
        console.warn('[heroSlidesService] API update failed, falling back to Supabase client:', e.message)
      }
    }

    return withRetry(async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('hero_slides')
        .update({
          ...(updates.product_id !== undefined && { product_id: updates.product_id }),
          ...(updates.brand !== undefined && { brand: updates.brand }),
          ...(updates.title !== undefined && { title: updates.title }),
          ...(updates.subtitle !== undefined && { subtitle: updates.subtitle }),
          ...(updates.image !== undefined && { image: updates.image }),
          ...(updates.image2 !== undefined && { image2: updates.image2 }),
          ...(updates.display_order !== undefined && { display_order: updates.display_order }),
          ...(updates.is_active !== undefined && { is_active: updates.is_active }),
        })
        .eq('id', id)
        .select(`
          *,
          products (
            id,
            name,
            image
          )
        `)
        .single()

      if (error) throw handleSupabaseError(error)
      return data as HeroSlide
    })
  },

  // Delete slide
  async delete(id: string) {
    if (typeof window !== 'undefined') {
      try {
        const response = await fetch(getApiUrl(`/api/admin/hero-slides/${id}`), {
          method: 'DELETE',
          credentials: 'include',
          signal: AbortSignal.timeout(10000),
        })
        
        if (response.ok) {
          return true
        }
        
        const error = await response.json().catch(() => ({ error: 'Failed to delete slide' }))
        throw new Error(error.error || 'Failed to delete slide')
      } catch (e: any) {
        if (e.message?.includes('timeout') || e.name === 'AbortError') {
          throw e
        }
        console.warn('[heroSlidesService] API delete failed, falling back to Supabase client:', e.message)
      }
    }

    return withRetry(async () => {
      const supabase = createClient()
      const { error } = await supabase
        .from('hero_slides')
        .delete()
        .eq('id', id)

      if (error) throw handleSupabaseError(error)
      return true
    })
  },
}

