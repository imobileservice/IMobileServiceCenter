import { createClient } from '../client'
import { withRetry, handleSupabaseError } from '../utils/error-handler'
import type { Database } from '../types'

type CartItem = Database['public']['Tables']['cart_items']['Row']
type CartItemInsert = Database['public']['Tables']['cart_items']['Insert']
type CartItemUpdate = Database['public']['Tables']['cart_items']['Update']

export const cartService = {
  // Get user's cart items with product details
  async getCartItems(userId: string) {
    return withRetry(async () => {
      // Try backend API first (faster and more reliable)
      if (typeof window !== 'undefined') {
        try {
          const { getApiUrl } = await import('../../utils/api')
          const supabase = createClient()
          const { data: { session } } = await supabase.auth.getSession()
          const storedToken = session?.access_token
          const headers: HeadersInit = {}
          if (storedToken) headers['x-session-token'] = storedToken

          const response = await fetch(getApiUrl('/api/cart'), {
            headers,
            cache: 'no-store',
            credentials: 'include',
            signal: AbortSignal.timeout(5000), // 8 second timeout
          })

          if (response.ok) {
            const payload = await response.json()
            return payload.data || []
          }

          // If API fails, fall through to direct Supabase call
          if (response.status !== 503) {
            console.warn('[cartService] API call failed, using direct Supabase connection')
          }
        } catch (e: any) {
          // Network error or timeout - fall through to direct Supabase call
          if (!e.message?.includes('timeout') && !e.message?.includes('aborted')) {
            console.warn('[cartService] API unavailable, using direct Supabase connection')
          }
        }
      }

      // Direct Supabase call (fallback)
      const supabase = createClient()

      // Try with variant_selected first, fallback if column doesn't exist
      let data, error
      try {
        const result = await supabase
          .from('cart_items')
          .select(`
            id,
            user_id,
            product_id,
            quantity,
            variant_selected,
            created_at,
            updated_at,
            products (
              id,
              name,
              price,
              condition,
              stock
            )
          `)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })

        data = result.data
        error = result.error
      } catch (e: any) {
        // If variant_selected column doesn't exist, try without it
        if (e.message?.includes('variant_selected') || e.message?.includes('schema cache')) {
          console.warn('[cartService] variant_selected column not found, using fallback query')
          const result = await supabase
            .from('cart_items')
            .select(`
              id,
              user_id,
              product_id,
              quantity,
              created_at,
              updated_at,
              products (
                id,
                name,
                price,
                condition,
                stock
              )
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })

          data = result.data
          error = result.error
        } else {
          throw e
        }
      }

      if (error) {
        // Provide helpful error message if variant_selected column is missing
        if (error.message?.includes('variant_selected') || error.message?.includes('schema cache')) {
          throw new Error('Database schema error: variant_selected column missing. Please run the migration: supabase/migrations/ensure_variant_selected_columns.sql in your Supabase SQL Editor.')
        }
        throw handleSupabaseError(error)
      }

      // Skip redundant image loading if API was successful
      if (data && Array.isArray(data) && data.length > 0) {
        // Only attach if backend haven't already done it (API usually does)
        const firstItem = data[0]
        const hasImages = firstItem.products?.image || (firstItem.products?.images && firstItem.products.images.length > 0)

        if (!hasImages) {
          const productIds = [...new Set(data.map((item: any) => item.product_id).filter(Boolean))]
          if (productIds.length > 0) {
            const { data: imagesData } = await supabase
              .from('product_images')
              .select('product_id, url, is_primary')
              .in('product_id', productIds)
              .order('is_primary', { ascending: false })
              .order('display_order', { ascending: true })

            const imageMap = new Map<string, string>()
            imagesData?.forEach((img: any) => {
              if (!imageMap.has(img.product_id) || img.is_primary) {
                imageMap.set(img.product_id, img.url)
              }
            })

            data = data.map((item: any) => {
              if (item.products) {
                item.products.image = imageMap.get(item.product_id) || null
              }
              return item
            })
          }
        }
      }

      return data
    }, 2, 500, 5000) // Reduced timeout for faster failover
  },

  // Add item to cart
  async addItem(userId: string, productId: string, quantity: number = 1, variantSelected?: any) {
    console.log('[cartService] addItem called', { userId, productId, quantity, variantSelected })

    return withRetry(async () => {
      // Try backend API first
      if (typeof window !== 'undefined') {
        try {
          const { getApiUrl } = await import('../../utils/api')
          const apiUrl = getApiUrl('/api/cart')
          console.log('[cartService] Attempting backend API:', apiUrl)

          const supabase = createClient()
          const { data: { session } } = await supabase.auth.getSession()
          const storedToken = session?.access_token
          const headers: HeadersInit = { 'Content-Type': 'application/json' }
          if (storedToken) headers['x-session-token'] = storedToken

          const response = await fetch(apiUrl, {
            method: 'POST',
            headers,
            credentials: 'include',
            body: JSON.stringify({ productId, quantity, variantSelected }),
            signal: AbortSignal.timeout(10000), // 10 second timeout
          })

          console.log('[cartService] Backend API response:', { status: response.status, ok: response.ok })

          if (response.ok) {
            const payload = await response.json()
            console.log('[cartService] Backend API success:', payload)
            return payload.data
          }

          // Handle error response
          const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}: Failed to add to cart` }))
          console.error('[cartService] Backend API error:', errorData)

          // If unauthorized, throw immediately (don't retry)
          if (response.status === 401) {
            throw new Error('Unauthorized: Please sign in to add items to cart')
          }

          throw new Error(errorData.error || `Failed to add to cart (${response.status})`)
        } catch (e: any) {
          // If it's a network error or timeout, try direct Supabase
          if (e.message?.includes('timeout') || e.message?.includes('aborted') || e.name === 'AbortError') {
            console.warn('[cartService] Backend API timeout/aborted, trying direct Supabase')
            throw e // Re-throw timeout errors immediately
          }

          // If it's an auth error, don't retry
          if (e.message?.includes('Unauthorized')) {
            throw e
          }

          // For other errors, fall through to direct Supabase call
          console.warn('[cartService] Backend API call failed, using direct Supabase connection:', e.message)
        }
      }

      // Direct Supabase call (fallback)
      console.log('[cartService] Using direct Supabase connection')
      const supabase = createClient()


      // Check if item exists with same variant (for variant matching)
      // Get all items for this product and match variants in memory (JSONB comparison is complex)
      const { data: allProductItems, error: checkError } = await supabase
        .from('cart_items')
        .select('*')
        .eq('user_id', userId)
        .eq('product_id', productId)

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('[cartService] Supabase check error:', checkError)
        throw handleSupabaseError(checkError)
      }

      // Find item with matching variant
      let existingWithVariant = null
      if (variantSelected && allProductItems) {
        const variantStr = JSON.stringify(variantSelected)
        existingWithVariant = allProductItems.find((item: any) => {
          if (!item.variant_selected) return false
          const itemVariant = typeof item.variant_selected === 'string'
            ? item.variant_selected
            : JSON.stringify(item.variant_selected)
          return itemVariant === variantStr
        }) || null
      }

      // Also check for existing item without variant (for backward compatibility)
      const existing = allProductItems?.find((item: any) => !item.variant_selected) || null

      if (existingWithVariant) {
        console.log('[cartService] Item with same variant exists, updating quantity:', existingWithVariant)
        // Update quantity for same variant
        const { data, error } = await supabase
          .from('cart_items')
          .update({ quantity: existingWithVariant.quantity + quantity })
          .eq('id', existingWithVariant.id)
          .select()
          .single()

        if (error) {
          console.error('[cartService] Supabase update error:', error)
          throw handleSupabaseError(error)
        }
        console.log('[cartService] Supabase update success:', data)
        return data
      } else if (existing && !variantSelected) {
        // If no variant and item exists, update quantity
        console.log('[cartService] Item exists (no variant), updating quantity:', existing)
        const { data, error } = await supabase
          .from('cart_items')
          .update({ quantity: existing.quantity + quantity })
          .eq('id', existing.id)
          .select()
          .single()

        if (error) {
          console.error('[cartService] Supabase update error:', error)
          throw handleSupabaseError(error)
        }
        console.log('[cartService] Supabase update success:', data)
        return data
      } else {
        console.log('[cartService] Item does not exist, inserting new item with variant')
        // Insert new item with variant
        const { data, error } = await supabase
          .from('cart_items')
          .insert({
            user_id: userId,
            product_id: productId,
            quantity,
            variant_selected: variantSelected || null,
          })
          .select()
          .single()

        if (error) {
          console.error('[cartService] Supabase insert error:', error)
          throw handleSupabaseError(error)
        }
        console.log('[cartService] Supabase insert success:', data)
        return data
      }
    }, 2, 500, 10000) // Reduced retries, shorter timeout
  },

  // Update cart item quantity
  async updateQuantity(userId: string, itemId: string, quantity: number) {
    return withRetry(async () => {
      if (quantity <= 0) {
        // Remove item if quantity is 0 or less
        return this.removeItem(userId, itemId)
      }

      // Try backend API first
      if (typeof window !== 'undefined') {
        try {
          const { getApiUrl } = await import('../../utils/api')
          const supabase = createClient()
          const { data: { session } } = await supabase.auth.getSession()
          const storedToken = session?.access_token
          const headers: HeadersInit = { 'Content-Type': 'application/json' }
          if (storedToken) headers['x-session-token'] = storedToken

          const response = await fetch(getApiUrl(`/api/cart/${itemId}`), {
            method: 'PUT',
            headers,
            credentials: 'include',
            body: JSON.stringify({ quantity }),
            signal: AbortSignal.timeout(10000),
          })

          if (response.ok) {
            if (response.status === 204) return null // Item was removed
            const payload = await response.json()
            return payload.data
          }

          const error = await response.json().catch(() => ({ error: 'Failed to update cart' }))
          throw new Error(error.error || 'Failed to update cart')
        } catch (e: any) {
          if (e.message?.includes('timeout') || e.message?.includes('aborted')) {
            throw e
          }
          console.warn('[cartService] API call failed, using direct Supabase connection')
        }
      }

      // Direct Supabase call (fallback)
      const supabase = createClient()
      const { data, error } = await supabase
        .from('cart_items')
        .update({ quantity })
        .eq('id', itemId)
        .eq('user_id', userId)
        .select()
        .single()

      if (error) throw handleSupabaseError(error)
      return data
    }, 2, 500, 10000)
  },

  // Remove item from cart
  async removeItem(userId: string, itemId: string) {
    return withRetry(async () => {
      // Try backend API first
      if (typeof window !== 'undefined') {
        try {
          const { getApiUrl } = await import('../../utils/api')
          const supabase = createClient()
          const { data: { session } } = await supabase.auth.getSession()
          const storedToken = session?.access_token
          const headers: HeadersInit = {}
          if (storedToken) headers['x-session-token'] = storedToken

          const response = await fetch(getApiUrl(`/api/cart/${itemId}`), {
            method: 'DELETE',
            headers,
            credentials: 'include',
            signal: AbortSignal.timeout(10000),
          })

          if (response.ok) {
            return
          }

          const error = await response.json().catch(() => ({ error: 'Failed to remove item' }))
          throw new Error(error.error || 'Failed to remove item')
        } catch (e: any) {
          if (e.message?.includes('timeout') || e.message?.includes('aborted')) {
            throw e
          }
          console.warn('[cartService] API call failed, using direct Supabase connection')
        }
      }

      // Direct Supabase call (fallback)
      const supabase = createClient()
      const { error } = await supabase
        .from('cart_items')
        .delete()
        .eq('id', itemId)
        .eq('user_id', userId)

      if (error) throw handleSupabaseError(error)
    }, 2, 500, 10000)
  },

  // Clear cart
  async clearCart(userId: string) {
    return withRetry(async () => {
      // Try backend API first
      if (typeof window !== 'undefined') {
        try {
          const { getApiUrl } = await import('../../utils/api')
          const supabase = createClient()
          const { data: { session } } = await supabase.auth.getSession()
          const storedToken = session?.access_token
          const headers: HeadersInit = {}
          if (storedToken) headers['x-session-token'] = storedToken

          const response = await fetch(getApiUrl('/api/cart'), {
            method: 'DELETE',
            headers,
            credentials: 'include',
            signal: AbortSignal.timeout(10000),
          })

          if (response.ok) {
            return
          }

          const error = await response.json().catch(() => ({ error: 'Failed to clear cart' }))
          throw new Error(error.error || 'Failed to clear cart')
        } catch (e: any) {
          if (e.message?.includes('timeout') || e.message?.includes('aborted')) {
            throw e
          }
          console.warn('[cartService] API call failed, using direct Supabase connection')
        }
      }

      // Direct Supabase call (fallback)
      const supabase = createClient()
      const { error } = await supabase
        .from('cart_items')
        .delete()
        .eq('user_id', userId)

      if (error) throw handleSupabaseError(error)
    }, 2, 500, 10000)
  },
}
