import { createClient } from '../client'
import { withRetry, handleSupabaseError } from '../utils/error-handler'
import type { Database } from '../types'
import { analyticsService } from './analytics'

type Profile = Database['public']['Tables']['profiles']['Row']
type ProfileUpdate = Database['public']['Tables']['profiles']['Update']

export interface Customer {
  id: string
  name: string
  email: string
  phone: string | null
  whatsapp: string | null
  joinDate: string
  totalOrders: number
  totalSpent: number
  status: 'Active' | 'Inactive'
}

export const customersService = {
  // Get all customers with order statistics - uses backend API with service role
  async getAll() {
    try {
      const { getApiUrl } = await import('@/lib/utils/api')
      const response = await fetch(getApiUrl('/api/admin/data/customers'))
      
      if (!response.ok) {
        throw new Error(`Failed to fetch customers: ${response.statusText}`)
      }
      
      const result = await response.json()
      return result.data || []
    } catch (error) {
      console.error('Error fetching customers from API:', error)
      // Fallback to direct Supabase call
      return withRetry(async () => {
      const supabase = createClient()
      
      // Get all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })

      if (profilesError) throw handleSupabaseError(profilesError)

      // Get orders for statistics
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('user_id, total, created_at')

      if (ordersError) throw handleSupabaseError(ordersError)

      // Calculate statistics for each customer
      const customers: Customer[] = await Promise.all(
        (profiles || []).map(async (profile) => {
          const userOrders = orders?.filter(o => o.user_id === profile.id) || []
          const totalOrders = userOrders.length
          const totalSpent = userOrders.reduce((sum, o) => sum + Number(o.total || 0), 0)
          const lastOrder = userOrders.length > 0 
            ? new Date(Math.max(...userOrders.map(o => new Date(o.created_at).getTime())))
            : null
          
          // Customer is active if:
          // 1. They have orders in last 90 days, OR
          // 2. They signed up recently (within last 30 days) - new customers are considered active
          const profileCreatedAt = new Date(profile.created_at)
          const daysSinceSignup = (Date.now() - profileCreatedAt.getTime()) / (1000 * 60 * 60 * 24)
          const isNewCustomer = daysSinceSignup < 30
          
          const hasRecentOrder = lastOrder 
            ? (Date.now() - lastOrder.getTime()) < 90 * 24 * 60 * 60 * 1000
            : false
          
          const isActive = hasRecentOrder || isNewCustomer

          // Get detailed stats if available (don't fail if this errors)
          let stats = null
          try {
            stats = await analyticsService.getCustomerStats(profile.id)
          } catch (err) {
            // Use calculated values if function fails
            console.warn('Failed to get customer stats for', profile.id, err)
          }

          return {
            id: profile.id,
            name: profile.name || profile.email || 'Unknown',
            email: profile.email || '',
            phone: null, // Can be added to profiles table
            whatsapp: profile.whatsapp || null,
            joinDate: profile.created_at.split('T')[0],
            totalOrders: stats?.total_orders || totalOrders,
            totalSpent: Number(stats?.total_spent || totalSpent.toFixed(2)),
            status: isActive ? 'Active' as const : 'Inactive' as const,
          }
        })
      )

      return customers || []
      })
    }
  },

  // Get single customer
  async getById(id: string) {
    return withRetry(async () => {
      const supabase = createClient()
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw handleSupabaseError(error)

      // Get customer stats
      const stats = await analyticsService.getCustomerStats(id)

      return {
        id: profile.id,
        name: profile.name || profile.email || 'Unknown',
        email: profile.email || '',
        phone: null,
        whatsapp: profile.whatsapp || null,
        joinDate: profile.created_at.split('T')[0],
        totalOrders: stats?.total_orders || 0,
        totalSpent: Number(stats?.total_spent || 0),
        status: 'Active' as const,
      } as Customer
    })
  },

  // Update customer profile - uses backend API with service role
  async update(id: string, updates: ProfileUpdate) {
    try {
      const { getApiUrl } = await import('@/lib/utils/api')
      const response = await fetch(getApiUrl(`/api/admin/customers/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update customer')
      }
      
      const result = await response.json()
      return result.data
    } catch (error) {
      console.error('Error updating customer via API:', error)
      // Fallback to direct Supabase call
      return withRetry(async () => {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('profiles')
          .update(updates)
          .eq('id', id)
          .select()
          .single()

        if (error) throw handleSupabaseError(error)
        return data
      })
    }
  },

  // Delete customer - uses backend API with service role
  async delete(id: string) {
    try {
      const { getApiUrl } = await import('@/lib/utils/api')
      const response = await fetch(getApiUrl(`/api/admin/customers/${id}`), {
        method: 'DELETE',
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete customer')
      }
    } catch (error) {
      console.error('Error deleting customer via API:', error)
      // Fallback to direct Supabase call (may fail without service role)
      return withRetry(async () => {
        const supabase = createClient()
        // Delete from auth.users will cascade to profiles
        // Note: This requires service role key or admin privileges
        const { error } = await supabase.auth.admin.deleteUser(id)
        
        if (error) throw handleSupabaseError(error)
      })
    }
  },
}
