import { createClient } from '../client'
import { withRetry, handleSupabaseError } from '../utils/error-handler'
import type { Database } from '../types'

type Message = Database['public']['Tables']['messages']['Row']
type MessageInsert = Database['public']['Tables']['messages']['Insert']
type MessageUpdate = Database['public']['Tables']['messages']['Update']

export const messagesService = {
  // Get all messages (admin only) - uses backend API with service role
  async getAll() {
    try {
      const { getApiUrl } = await import('@/lib/utils/api')
      const response = await fetch(getApiUrl('/api/admin/data/messages'))
      
      if (!response.ok) {
        throw new Error(`Failed to fetch messages: ${response.statusText}`)
      }
      
      const result = await response.json()
      return (result.data || []) as Message[]
    } catch (error) {
      console.error('Error fetching messages from API:', error)
      // Fallback to direct Supabase call
      return withRetry(async () => {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .order('created_at', { ascending: false })

        if (error) throw handleSupabaseError(error)
        return (data || []) as Message[]
      })
    }
  },

  // Get single message
  async getById(id: string) {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data as Message
  },

  // Create message (from contact form)
  async create(message: MessageInsert) {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('messages')
      .insert(message)
      .select()
      .single()

    if (error) throw error
    return data as Message
  },

  // Update message status - uses backend API with service role
  async updateStatus(id: string, status: Message['status']) {
    try {
      const { getApiUrl } = await import('@/lib/utils/api')
      const response = await fetch(getApiUrl(`/api/admin/messages/${id}/status`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update message status')
      }
      
      const result = await response.json()
      return result.data as Message
    } catch (error) {
      console.error('Error updating message status via API:', error)
      // Fallback to direct Supabase call
      const supabase = createClient()
      const { data, error: supabaseError } = await supabase
        .from('messages')
        .update({ status })
        .eq('id', id)
        .select()
        .single()

      if (supabaseError) throw supabaseError
      return data as Message
    }
  },

  // Update message
  async update(id: string, updates: MessageUpdate) {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('messages')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data as Message
  },

  // Delete message - uses backend API with service role
  async delete(id: string) {
    try {
      const { getApiUrl } = await import('@/lib/utils/api')
      const response = await fetch(getApiUrl(`/api/admin/messages/${id}`), {
        method: 'DELETE',
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete message')
      }
    } catch (error) {
      console.error('Error deleting message via API:', error)
      // Fallback to direct Supabase call
      const supabase = createClient()
      const { error: supabaseError } = await supabase
        .from('messages')
        .delete()
        .eq('id', id)

      if (supabaseError) throw supabaseError
    }
  },
}
