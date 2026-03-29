import { createClient } from '../client'
import { withRetry, handleSupabaseError } from '../utils/error-handler'
import type { Database } from '../types'
import { getAuthTokenFast } from '../utils/auth-helpers'

type CartItem = Database['public']['Tables']['cart_items']['Row']
type CartItemInsert = Database['public']['Tables']['cart_items']['Insert']
type CartItemUpdate = Database['public']['Tables']['cart_items']['Update']

export const cartService = {
  // Get user's cart items with product details
  async getCartItems(userId: string) {
    return withRetry(async () => {
      // Try backend API first (faster and more reliable)
      if (typeof window !== 'undefined') {
        const fetchWithAuth = async (isRetry = false): Promise<any> => {
          try {
            const { getApiUrl } = await import('../../utils/api')
            const storedToken = await getAuthTokenFast(true)
            if (!storedToken) return []

            const headers: HeadersInit = {}
            headers['x-session-token'] = storedToken

            const response = await fetch(getApiUrl('/api/cart'), {
              headers,
              cache: 'no-store',
              credentials: 'include',
              signal: AbortSignal.timeout(5000),
            })

            if (response.ok) {
              const payload = await response.json()
              return payload.data || []
            }

            // If 401 and not already retried, try refreshing and retrying once
            if (response.status === 401 && !isRetry) {
              console.warn('[cartService] 401 during getCartItems, attempting retry...')
              // Force a refresh check in useAuthStore if possible
              try {
                const { useAuthStore } = await import('../../store')
                await useAuthStore.getState().initialize()
              } catch (e) {
                // Ignore initialization errors
              }
              return fetchWithAuth(true) // Retry once
            }

            throw new Error(`API returned ${response.status}`)
          } catch (e: any) {
            if (isRetry) throw e // If retry fails, throw move to fallback
            throw e
          }
        }

        try {
          return await fetchWithAuth()
        } catch (e: any) {
          // If API fails, fall through to direct Supabase call
          console.warn('[cartService] API call failed, using direct Supabase connection:', e.message)
        }
      }

      // Direct Supabase call (fallback)
      const supabase = createClient()
      // ... (rest of the direct Supabase call logic)

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
        const fetchWithAuth = async (isRetry = false): Promise<any> => {
          try {
            const { getApiUrl } = await import('../../utils/api')
            const apiUrl = getApiUrl('/api/cart')
            
            const storedToken = await getAuthTokenFast(false)
            const headers: HeadersInit = { 'Content-Type': 'application/json' }
            if (storedToken) headers['x-session-token'] = storedToken

            const response = await fetch(apiUrl, {
              method: 'POST',
              headers,
              credentials: 'include',
              body: JSON.stringify({ productId, quantity, variantSelected }),
              signal: AbortSignal.timeout(15000),
            })

            console.log('[cartService] Backend API response:', { status: response.status, ok: response.ok })

            if (response.ok) {
              const payload = await response.json()
              return payload.data
            }

            // If 401 Unauthorized and not already retried
            if (response.status === 401) {
              if (!isRetry) {
                console.warn('[cartService] 401 during addItem, attempting session refresh and retry...')
                try {
                  const { useAuthStore } = await import('../../store')
                  await useAuthStore.getState().initialize()
                } catch (e) {
                  // Ignore initialization errors
                }
                return fetchWithAuth(true) // Retry once
              }
              throw new Error('Unauthorized: Please sign in to add items to cart')
            }

            const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}: Failed to add to cart` }))
            throw new Error(errorData.error || `Failed to add to cart (${response.status})`)
          } catch (e: any) {
            if (e.message?.includes('Unauthorized')) throw e
            if (isRetry) throw e
            throw e
          }
        }

        try {
          return await fetchWithAuth()
        } catch (e: any) {
          // If it's a timeout or abortion, throw immediately
          if (e.message?.includes('timeout') || e.message?.includes('aborted') || e.name === 'AbortError') {
            throw e
          }
          // If it's an auth error, throw immediately
          if (e.message?.includes('Unauthorized')) {
            throw e
          }
          console.warn('[cartService] Backend API call failed, trying direct Supabase:', e.message)
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
    }, 2, 1000, 20000) // Increased retries delay and timeout
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
          const apiUrl = getApiUrl('/api/cart')

          const storedToken = await getAuthTokenFast(false)
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
          const apiUrl = getApiUrl(`/api/cart/${itemId}`)

          const storedToken = await getAuthTokenFast(false)
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
          const apiUrl = getApiUrl('/api/cart')

          const storedToken = await getAuthTokenFast(false)
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
