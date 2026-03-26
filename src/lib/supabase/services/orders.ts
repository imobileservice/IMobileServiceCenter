import { createClient } from '../client'
import { withRetry, handleSupabaseError } from '../utils/error-handler'
import { getAuthTokenFast } from '../utils/auth-helpers'
import type { Database } from '../types'

type Order = Database['public']['Tables']['orders']['Row']
type OrderInsert = Database['public']['Tables']['orders']['Insert']
type OrderUpdate = Database['public']['Tables']['orders']['Update']

export const ordersService = {
  // Get all orders (admin) - uses backend API with service role
  async getAll() {
    try {
      const { getApiUrl } = await import('@/lib/utils/api')
      const response = await fetch(getApiUrl('/api/admin/data/orders'))

      if (!response.ok) {
        throw new Error(`Failed to fetch orders: ${response.statusText}`)
      }

      const result = await response.json()
      return result.data || []
    } catch (error) {
      console.error('Error fetching orders from API:', error)
      // Fallback to direct Supabase call
      return withRetry(async () => {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('orders')
          .select(`
            *,
            order_items (*)
          `)
          .order('created_at', { ascending: false })

        if (error) throw handleSupabaseError(error)
        return data || []
      })
    }
  },

  // Get user's orders
  async getByUserId(userId: string) {
    // Try backend API first (bypasses RLS)
    if (typeof window !== 'undefined') {
      try {
        const { getApiUrl } = await import('@/lib/utils/api')
        const apiUrl = getApiUrl('/api/orders')

        const storedToken = await getAuthTokenFast(false)

        const headers: HeadersInit = {
          'Content-Type': 'application/json',
        }
        if (storedToken) headers['x-session-token'] = storedToken

        const response = await fetch(getApiUrl('/api/orders'), {
          headers
        })

        if (response.ok) {
          const result = await response.json()
          return result.data || []
        }
      } catch (e) {
        console.warn('API fetch for user orders failed, falling back to Supabase:', e)
      }
    }

    const supabase = createClient()
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (*)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data
  },

  // Get single order - uses backend API with service role
  async getById(id: string) {
    try {
      const { getApiUrl } = await import('@/lib/utils/api')
      const response = await fetch(getApiUrl(`/api/admin/data/orders/${id}`))

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Order not found')
        }
        throw new Error(`Failed to fetch order: ${response.statusText}`)
      }

      const result = await response.json()
      return result.data
    } catch (error) {
      console.error('Error fetching order from API:', error)
      // Fallback to direct Supabase call
      const supabase = createClient()
      const { data, error: supabaseError } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (*)
        `)
        .eq('id', id)
        .single()

      if (supabaseError) throw supabaseError
      return data
    }
  },

  // Create order
  async create(order: OrderInsert, items: Array<{
    product_id: string | null
    product_name: string
    product_image: string | null
    quantity: number
    price: number
  }>, attempt: number = 1) {
    if (attempt > 3) throw new Error('Failed to create order after 3 attempts')

    console.log(`[ordersService] Creating order (attempt ${attempt})...`, { orderNumber: order.order_number, itemCount: items.length })

    // Helper: Generate new number and retry
    const retryWithNewNumber = async (): Promise<any> => {
      console.log(`[ordersService] Retrying with new order number (next attempt: ${attempt + 1})...`)
      const newOrderNumber = await this.generateOrderNumber()
      const newOrder = { ...order, order_number: newOrderNumber }

      return this.create(newOrder, items, attempt + 1)
    }

    // Try backend API first (more reliable)
    if (typeof window !== 'undefined') {
      try {
        const { getApiUrl } = await import('../../utils/api')
        const storedToken = await getAuthTokenFast(false)
        const headers: HeadersInit = { 'Content-Type': 'application/json' }
        if (storedToken) headers['x-session-token'] = storedToken

        const response = await fetch(getApiUrl('/api/orders'), {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({ order, items }),
          signal: AbortSignal.timeout(30000), // 30 second timeout
        })

        if (response.ok) {
          const payload = await response.json()
          console.log('[ordersService] Order created via API:', payload.data?.id)
          return payload.data
        }

        const errorData = await response.json().catch(() => ({ error: 'Failed to create order' }))

        // Check for duplicate key error (Postgres 23505) or custom message
        if (errorData.code === '23505' || (errorData.message && errorData.message.includes('unique constraint'))) {
          console.warn('[ordersService] Duplicate order number detected from API, retrying...')
          return retryWithNewNumber()
        }

        throw new Error(errorData.error || errorData.message || 'Failed to create order')
      } catch (e: any) {
        if (e.message?.includes('After 3 attempts') || e.message?.includes('Failed to create order after')) throw e

        // If it's a duplicate key error from the initial API call
        if (e.message?.includes('unique constraint') || e.code === '23505') {
          return retryWithNewNumber()
        }

        if (e.message?.includes('timeout') || e.name === 'AbortError') {
          throw new Error('Order creation timeout. Please try again.')
        }

        // Re-throw all other errors - don't silently fall through to broken Supabase direct call
        throw new Error(e.message || 'Failed to create order. Please try again.')
      }
    }

  },

  // Update order status - uses backend API with service role
  async updateStatus(id: string, status: Order['status']) {
    try {
      const { getApiUrl } = await import('@/lib/utils/api')
      const response = await fetch(getApiUrl(`/api/admin/orders/${id}/status`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update order status')
      }

      const result = await response.json()
      return result.data
    } catch (error) {
      console.error('Error updating order status via API:', error)
      // Fallback to direct Supabase call
      const supabase = createClient()
      const { data, error: supabaseError } = await supabase
        .from('orders')
        .update({ status })
        .eq('id', id)
        .select()
        .single()

      if (supabaseError) throw supabaseError
      return data
    }
  },

  // Update order
  async update(id: string, updates: OrderUpdate) {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Generate unique order number
  async generateOrderNumber(maxAttempts: number = 5): Promise<string> {
    const supabase = createClient()

    // Generate order number with very high uniqueness
    const generateUniqueNumber = () => {
      const timestamp = Date.now()
      const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0')
      // Add more randomness to prevent collisions
      const extraRandom = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
      return `ORD${timestamp}${random}${extraRandom}`
    }

    // First attempt - generate and use immediately (very low collision probability)
    const orderNumber = generateUniqueNumber()
    console.log('[ordersService] Generated order number:', orderNumber)

    console.log('[ordersService] Generated order number:', orderNumber)

    // Check if exists using API (to bypass RLS)
    if (typeof window !== 'undefined') {
      try {
        const { getApiUrl } = await import('@/lib/utils/api')
        const response = await fetch(getApiUrl(`/api/orders/check-number/${orderNumber}`))
        if (response.ok) {
          const result = await response.json()
          if (result.exists) {
            console.warn(`[ordersService] Order number ${orderNumber} exists (API check), retrying...`)
            // Recursive retry (up to limit)
            if (maxAttempts > 0) return this.generateOrderNumber(maxAttempts - 1)
          } else {
            console.log('[ordersService] Order number is unique (API check)')
            return orderNumber
          }
        }
      } catch (e) {
        console.warn('[ordersService] API check failed, falling back to local check', e)
      }
    }

    // Fallback local check (might fail due to RLS but better than nothing)
    try {
      const checkPromise = supabase
        .from('orders')
        .select('id')
        .eq('order_number', orderNumber)
        .maybeSingle()

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Order number check timeout')), 2000) // Reduced to 2 seconds
      )

      const { data, error } = await Promise.race([checkPromise, timeoutPromise])

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found (expected)
        console.warn('[ordersService] Order number check error (non-critical):', error.message)
        // Return anyway - collision is extremely unlikely
        return orderNumber
      }

      if (!data) {
        // Order number is unique
        console.log('[ordersService] Order number is unique:', orderNumber)
        return orderNumber
      }

      // If exists (very rare), generate new one
      console.warn(`[ordersService] Order number ${orderNumber} exists, generating new one...`)
    } catch (error: any) {
      // If check times out or fails, return the generated number anyway
      // Collision probability is extremely low with timestamp + random + microsecond
      console.warn('[ordersService] Order number check failed (non-critical):', error.message)
      console.log('[ordersService] Using generated order number without verification:', orderNumber)
      return orderNumber
    }

    // Fallback: if somehow we got here, try a few more times
    for (let attempt = 1; attempt < maxAttempts; attempt++) {
      const newOrderNumber = generateUniqueNumber()
      console.log(`[ordersService] Retry attempt ${attempt + 1}: ${newOrderNumber}`)

      try {
        const checkPromise = supabase
          .from('orders')
          .select('id')
          .eq('order_number', newOrderNumber)
          .maybeSingle()

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 2000)
        )

        const { data } = await Promise.race([checkPromise, timeoutPromise])

        if (!data) {
          return newOrderNumber
        }
      } catch (error: any) {
        // If check fails, use the number anyway
        return newOrderNumber
      }
    }

    // Last resort: return a number (collision is extremely unlikely)
    return generateUniqueNumber()
  },
}
