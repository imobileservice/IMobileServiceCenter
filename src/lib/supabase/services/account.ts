import { createClient } from '../client'
import { withRetry } from '../utils/error-handler'
import { getAuthTokenFast } from '../utils/auth-helpers'

export const accountService = {
  // Addresses
  async listAddresses() {
    const supabase = createClient()
    const { data, error } = await supabase.from('addresses').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return data
  },
  async upsertAddress(address: {
    id?: string
    type: 'billing' | 'shipping'
    full_name: string
    phone?: string
    address_line1: string
    address_line2?: string
    city: string
    state?: string
    postal_code?: string
    country: string
    is_default?: boolean
  }) {
    console.log('[accountService] upsertAddress called', { addressId: address.id, type: address.type })

    // Try backend API first (more reliable)
    if (typeof window !== 'undefined') {
      try {
        const { getApiUrl } = await import('../../utils/api')
        const storedToken = await getAuthTokenFast(false)
        const headers: HeadersInit = { 'Content-Type': 'application/json' }
        if (storedToken) headers['x-session-token'] = storedToken

        const response = await fetch(getApiUrl('/api/addresses'), {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify(address),
          signal: AbortSignal.timeout(25000), // 25 second timeout
        })

        if (response.ok) {
          const payload = await response.json()
          console.log('[accountService] Address saved via API:', payload.data?.id)
          return payload.data
        }

        const error = await response.json().catch(() => ({ error: 'Failed to save address' }))
        throw new Error(error.error || 'Failed to save address')
      } catch (e: any) {
        if (e.message?.includes('timeout') || e.name === 'AbortError') {
          throw new Error('Address save timed out. Please check your connection and try again.')
        }
        if (e.message?.includes('Unauthorized')) {
          throw new Error('Not authenticated. Please sign in again.')
        }
        console.warn('[accountService] API call failed, using direct Supabase connection:', e.message)
      }
    }

    // Fallback to direct Supabase call
    const supabase = createClient()

    // Try to get user from auth store first (faster, no network call)
    let user: any = null
    try {
      const { useAuthStore } = await import('../../store')
      user = useAuthStore.getState().user
      console.log('[accountService] Got user from auth store:', user?.id)
    } catch (storeError) {
      console.warn('[accountService] Could not get user from store, trying Supabase:', storeError)
    }

    // If not in store, try Supabase (with strict timeout)
    if (!user) {
      try {
        const getUserPromise = supabase.auth.getUser()
        const getUserTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 100)
        )

        const result = await Promise.race([getUserPromise, getUserTimeout]) as any
        user = result?.data?.user
      } catch (getUserError: any) {
        // Silently fail here, we check for !user below
      }
    }

    if (!user) {
      console.error('[accountService] No user found')
      throw new Error('Not authenticated. Please sign in again.')
    }

    const payload = {
      ...address,
      user_id: user.id,
      type: (address.type || 'billing').toLowerCase() as 'billing' | 'shipping'
    }

    console.log('[accountService] Address payload prepared:', { ...payload, user_id: user.id })

    // If setting as default, unset other defaults of the same type (non-blocking)
    if (address.is_default) {
      supabase
        .from('addresses')
        .update({ is_default: false })
        .eq('user_id', user.id)
        .eq('type', payload.type)
        .neq('id', address.id || '00000000-0000-0000-0000-000000000000')
        .then(() => console.log('[accountService] Unset other defaults'))
        .catch((err: any) => console.warn('[accountService] Failed to unset defaults (non-critical):', err.message))
    }

    let data = null
    let error = null as any

    try {
      if (address.id) {
        console.log('[accountService] Updating existing address:', address.id)
        const updatePromise = supabase
          .from('addresses')
          .update(payload)
          .eq('id', address.id)
          .eq('user_id', user.id)
          .select()
          .single()

        const updateTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Update address timeout')), 20000)
        )

        const res = await Promise.race([updatePromise, updateTimeout])
        data = res.data
        error = res.error
      } else {
        console.log('[accountService] Inserting new address')
        const insertPromise = supabase
          .from('addresses')
          .insert(payload)
          .select()
          .single()

        const insertTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Insert address timeout')), 20000)
        )

        const res = await Promise.race([insertPromise, insertTimeout])
        data = res.data
        error = res.error
      }

      if (error) {
        console.error('[accountService] Address operation error:', error)
        throw error
      }

      console.log('[accountService] Address saved successfully:', data?.id)
      return data
    } catch (operationError: any) {
      console.error('[accountService] Address operation failed:', operationError)
      if (operationError.message?.includes('timeout')) {
        throw new Error('Address save timed out. Please check your connection and try again.')
      }
      throw operationError
    }
  },
  async deleteAddress(id: string) {
    // Try backend API first
    if (typeof window !== 'undefined') {
      try {
        const { getApiUrl } = await import('../../utils/api')
        const storedToken = await getAuthTokenFast(false)
        const headers: HeadersInit = {}
        if (storedToken) headers['x-session-token'] = storedToken

        const response = await fetch(getApiUrl(`/api/addresses/${id}`), {
          method: 'DELETE',
          headers,
          credentials: 'include',
          signal: AbortSignal.timeout(10000),
        })

        if (response.ok) {
          return
        }

        const error = await response.json().catch(() => ({ error: 'Failed to delete address' }))
        throw new Error(error.error || 'Failed to delete address')
      } catch (e: any) {
        if (e.message?.includes('timeout') || e.name === 'AbortError') {
          throw e
        }
        console.warn('[accountService] Delete address API failed, using direct Supabase:', e.message)
      }
    }

    // Fallback to direct Supabase
    const supabase = createClient()
    const { error } = await supabase
      .from('addresses')
      .delete()
      .eq('id', id)
    if (error) throw error
  },

  // Wishlist
  async getWishlist() {
    // Try backend API first
    if (typeof window !== 'undefined') {
      try {
        const { getApiUrl } = await import('../../utils/api')
        const storedToken = await getAuthTokenFast(false);
        const headers: HeadersInit = {}
        if (storedToken) headers['x-session-token'] = storedToken

        const response = await fetch(getApiUrl('/api/profile/wishlist'), {
          headers,
          credentials: 'include',
          signal: AbortSignal.timeout(10000),
        })

        if (response.ok) {
          const payload = await response.json()
          return payload.data || []
        }
      } catch (e: any) {
        if (!e.message?.includes('timeout') && e.name !== 'AbortError') {
          console.warn('[accountService] Wishlist API failed, using direct Supabase:', e.message)
        }
      }
    }

    // Fallback to direct Supabase
    const supabase = createClient()
    const { data, error } = await supabase
      .from('wishlists')
      .select('id, product_id, created_at, products (*)')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },
  async addToWishlist(productId: string) {
    // Try backend API first
    if (typeof window !== 'undefined') {
      try {
        const { getApiUrl } = await import('../../utils/api')
        const storedToken = await getAuthTokenFast(false);
        const headers: HeadersInit = { 'Content-Type': 'application/json' }
        if (storedToken) headers['x-session-token'] = storedToken

        const response = await fetch(getApiUrl('/api/profile/wishlist'), {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({ productId }),
          signal: AbortSignal.timeout(10000),
        })

        if (response.ok) {
          const payload = await response.json()
          return payload.data
        }

        const error = await response.json().catch(() => ({ error: 'Failed to add to wishlist' }))
        throw new Error(error.error || 'Failed to add to wishlist')
      } catch (e: any) {
        if (e.message?.includes('timeout') || e.name === 'AbortError') {
          throw e
        }
        console.warn('[accountService] Wishlist API failed, using direct Supabase:', e.message)
      }
    }

    // Fallback to direct Supabase
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')
    const { data, error } = await supabase
      .from('wishlists')
      .insert({ user_id: user.id, product_id: productId })
      .select()
      .single()
    if (error && error.code !== '23505') throw error // ignore unique violation
    return data
  },
  async removeFromWishlist(productId: string) {
    // Try backend API first
    if (typeof window !== 'undefined') {
      try {
        const { getApiUrl } = await import('../../utils/api')
        const storedToken = await getAuthTokenFast(false);
        const headers: HeadersInit = {}
        if (storedToken) headers['x-session-token'] = storedToken

        const response = await fetch(getApiUrl(`/api/profile/wishlist/${productId}`), {
          method: 'DELETE',
          headers,
          credentials: 'include',
          signal: AbortSignal.timeout(10000),
        })

        if (response.ok) {
          return
        }

        const error = await response.json().catch(() => ({ error: 'Failed to remove from wishlist' }))
        throw new Error(error.error || 'Failed to remove from wishlist')
      } catch (e: any) {
        if (e.message?.includes('timeout') || e.name === 'AbortError') {
          throw e
        }
        console.warn('[accountService] Wishlist API failed, using direct Supabase:', e.message)
      }
    }

    // Fallback to direct Supabase
    const supabase = createClient()
    const { error } = await supabase
      .from('wishlists')
      .delete()
      .eq('product_id', productId)
    if (error) throw error
  },

  // Credits and Downloads
  async getCredits() {
    // Try backend API first
    if (typeof window !== 'undefined') {
      try {
        const { getApiUrl } = await import('../../utils/api')
        const storedToken = await getAuthTokenFast(false);
        const headers: HeadersInit = {}
        if (storedToken) headers['x-session-token'] = storedToken

        const response = await fetch(getApiUrl('/api/profile/credits'), {
          headers,
          credentials: 'include',
          signal: AbortSignal.timeout(10000),
        })

        if (response.ok) {
          const payload = await response.json()
          return payload.data?.credits || 0
        }
      } catch (e: any) {
        if (!e.message?.includes('timeout') && e.name !== 'AbortError') {
          console.warn('[accountService] Credits API failed, using direct Supabase:', e.message)
        }
      }
    }

    // Fallback to direct Supabase
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')
    const { data, error } = await supabase
      .from('profiles')
      .select('store_credits')
      .eq('id', user.id)
      .single()
    if (error) throw error
    return data.store_credits as number
  },
  async getDownloads() {
    // Try backend API first
    if (typeof window !== 'undefined') {
      try {
        const { getApiUrl } = await import('../../utils/api')
        const storedToken = await getAuthTokenFast(false);
        const headers: HeadersInit = {}
        if (storedToken) headers['x-session-token'] = storedToken

        const response = await fetch(getApiUrl('/api/profile/downloads'), {
          headers,
          credentials: 'include',
          signal: AbortSignal.timeout(10000),
        })

        if (response.ok) {
          const payload = await response.json()
          return payload.data || []
        }
      } catch (e: any) {
        if (!e.message?.includes('timeout') && e.name !== 'AbortError') {
          console.warn('[accountService] Downloads API failed, using direct Supabase:', e.message)
        }
      }
    }

    // Fallback to direct Supabase
    const supabase = createClient()
    const { data, error } = await supabase
      .from('downloads')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  }
}


