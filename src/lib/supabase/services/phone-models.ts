import { getApiUrl } from '../../utils/api'

/**
 * Phone models and product compatibility.
 *
 * A phone model is shared reference data ("Redmi Note 8" exists once); a
 * product is linked to as many of them as it fits. Nothing in here creates
 * products or touches stock - Display A stays one product with one stock value
 * however many models it is compatible with.
 *
 * Every read returns [] on failure so a missing migration degrades to "no
 * compatibility data" rather than a broken page.
 */

export interface PhoneModel {
  id: string
  brand_id: string
  brand_name: string
  brand_slug: string
  name: string
  model_code: string
  aliases: string[]
  is_active: boolean
  /** "Xiaomi Redmi Note 8" - what the pickers display. */
  label: string
}

export interface CompatibilityBrand {
  id: string
  name: string
  slug: string
  model_count: number
}

async function getJson(path: string): Promise<any | null> {
  try {
    const response = await fetch(getApiUrl(path), {
      headers: { 'Content-Type': 'application/json' },
    })
    if (!response.ok) return null
    return await response.json()
  } catch (error) {
    console.warn('[phoneModelsService] Request failed:', path, error)
    return null
  }
}

export const phoneModelsService = {
  // --- Admin: phone model catalogue ----------------------------------------

  async getAll(options: { search?: string; brand?: string; brandId?: string; limit?: number } = {}): Promise<PhoneModel[]> {
    const params = new URLSearchParams()
    if (options.search) params.set('search', options.search)
    if (options.brandId) params.set('brand_id', options.brandId)
    else if (options.brand) params.set('brand', options.brand)
    if (options.limit) params.set('limit', String(options.limit))

    const query = params.toString()
    const data = await getJson(`/api/admin/phone-models${query ? `?${query}` : ''}`)
    return Array.isArray(data?.models) ? data.models : []
  },

  async create(input: {
    brand?: string
    brandId?: string
    name: string
    modelCode?: string
    aliases?: string[]
  }): Promise<PhoneModel> {
    const response = await fetch(getApiUrl('/api/admin/phone-models'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brand: input.brand,
        brand_id: input.brandId,
        name: input.name,
        model_code: input.modelCode,
        aliases: input.aliases,
      }),
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'Failed to add phone model')
    return data.model as PhoneModel
  },

  /**
   * Add a whole brand model list at once. Existing models are reused, so this
   * is safe to press repeatedly - it never duplicates a model.
   */
  async bulkCreate(input: { brand?: string; brandId?: string; names: string[] }): Promise<PhoneModel[]> {
    const response = await fetch(getApiUrl('/api/admin/phone-models/bulk'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brand: input.brand,
        brand_id: input.brandId,
        names: input.names,
      }),
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'Failed to import phone models')
    return Array.isArray(data.models) ? data.models : []
  },

  async update(id: string, updates: Partial<Pick<PhoneModel, 'name' | 'model_code' | 'aliases' | 'is_active'>>): Promise<PhoneModel> {
    const response = await fetch(getApiUrl(`/api/admin/phone-models/${id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'Failed to update phone model')
    return data.model as PhoneModel
  },

  async remove(id: string): Promise<void> {
    const response = await fetch(getApiUrl(`/api/admin/phone-models/${id}`), { method: 'DELETE' })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || 'Failed to delete phone model')
    }
  },

  // --- Admin: per-product compatibility ------------------------------------

  async getForProduct(productId: string): Promise<PhoneModel[]> {
    const data = await getJson(`/api/admin/products/${productId}/compatibility`)
    return Array.isArray(data?.models) ? data.models : []
  },

  /** Compatible models for many products at once, keyed by product id. */
  async getForProducts(productIds: string[]): Promise<Record<string, PhoneModel[]>> {
    if (productIds.length === 0) return {}

    try {
      const response = await fetch(getApiUrl('/api/admin/products/compatibility/bulk'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_ids: productIds }),
      })

      if (!response.ok) return {}

      const data = await response.json()
      return data?.compatibility && typeof data.compatibility === 'object' ? data.compatibility : {}
    } catch (error) {
      console.warn('[phoneModelsService] Bulk compatibility lookup failed:', error)
      return {}
    }
  },

  /** Replace a product compatible-model set. Stock is never affected. */
  async setForProduct(productId: string, phoneModelIds: string[]): Promise<PhoneModel[]> {
    const response = await fetch(getApiUrl(`/api/admin/products/${productId}/compatibility`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_model_ids: phoneModelIds }),
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'Failed to save compatible models')
    return Array.isArray(data.models) ? data.models : []
  },

  // --- Storefront: "Find Parts For Your Phone" -----------------------------

  async getFinderBrands(): Promise<CompatibilityBrand[]> {
    const data = await getJson('/api/products/compatibility/brands')
    return Array.isArray(data?.brands) ? data.brands : []
  },

  async getFinderModels(brandId: string): Promise<PhoneModel[]> {
    if (!brandId) return []
    const data = await getJson(`/api/products/compatibility/models?brand_id=${encodeURIComponent(brandId)}`)
    return Array.isArray(data?.models) ? data.models : []
  },
}
