import { createClient } from '../client'
import { getApiUrl } from '../../utils/api'

export interface Brand {
  id: string
  name: string
  slug: string
  models: string[]
  is_active: boolean
  created_at: string
  updated_at: string
}

/**
 * Brands the admin panel offers in the Product modal.
 *
 * Reads go through the admin API (service role) with a direct Supabase read as
 * a fallback, matching how categories are handled. Writes are API-only because
 * the browser client holds the anon key.
 */
export const brandsService = {
  async getAll(): Promise<Brand[]> {
    try {
      const response = await fetch(getApiUrl('/api/admin/brands'), {
        headers: { 'Content-Type': 'application/json' },
      })

      if (response.ok) {
        const data = await response.json()
        return Array.isArray(data.brands) ? data.brands : []
      }
    } catch (error) {
      console.warn('[brandsService] API unavailable, falling back to direct read:', error)
    }

    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('brands')
        .select('*')
        .order('name', { ascending: true })

      if (error) throw error
      return (data || []) as Brand[]
    } catch (error) {
      // The table may simply not be migrated yet - the modal still works off
      // the static brand list in that case.
      console.warn('[brandsService] Could not load brands:', error)
      return []
    }
  },

  async create(name: string, models: string[] = []): Promise<Brand> {
    const response = await fetch(getApiUrl('/api/admin/brands'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, models }),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(data.error || 'Failed to add brand')
    }

    return data.brand as Brand
  },

  /**
   * Model list for a brand: cached values if the brand already has them,
   * otherwise an AI lookup. Returns [] when nothing could be found, which is
   * the signal for the modal to fall back to the custom-model text input.
   */
  async getModels(brandName: string, refresh = false): Promise<string[]> {
    try {
      const url = getApiUrl(
        `/api/admin/brands/${encodeURIComponent(brandName)}/models${refresh ? '?refresh=true' : ''}`
      )
      const response = await fetch(url, { headers: { 'Content-Type': 'application/json' } })

      if (!response.ok) return []

      const data = await response.json()
      return Array.isArray(data.models) ? data.models : []
    } catch (error) {
      console.warn('[brandsService] Model lookup failed:', error)
      return []
    }
  },
}
