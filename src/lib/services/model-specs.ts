/**
 * Model Specifications Service
 * Fetches device specifications (RAM, Storage, Colors) from external APIs or provides defaults
 */

interface ModelSpecs {
  storage: string[]
  ram?: string[]
  colors: Array<{ name: string; hex?: string }>
}

// Common device specifications database
const DEVICE_SPECS: Record<string, ModelSpecs> = {
  // iPhone models
  'iphone 15 pro max': {
    storage: ['256GB', '512GB', '1TB'],
    colors: [
      { name: 'Natural Titanium', hex: '#8E8E93' },
      { name: 'Blue Titanium', hex: '#007AFF' },
      { name: 'White Titanium', hex: '#FFFFFF' },
      { name: 'Black Titanium', hex: '#000000' },
    ],
  },
  'iphone 15 pro': {
    storage: ['128GB', '256GB', '512GB', '1TB'],
    colors: [
      { name: 'Natural Titanium', hex: '#8E8E93' },
      { name: 'Blue Titanium', hex: '#007AFF' },
      { name: 'White Titanium', hex: '#FFFFFF' },
      { name: 'Black Titanium', hex: '#000000' },
    ],
  },
  'iphone 15': {
    storage: ['128GB', '256GB', '512GB'],
    colors: [
      { name: 'Black', hex: '#000000' },
      { name: 'Blue', hex: '#007AFF' },
      { name: 'Green', hex: '#34C759' },
      { name: 'Yellow', hex: '#FFCC00' },
      { name: 'Pink', hex: '#FF2D55' },
    ],
  },
  'iphone 14 pro max': {
    storage: ['128GB', '256GB', '512GB', '1TB'],
    colors: [
      { name: 'Deep Purple', hex: '#AF52DE' },
      { name: 'Gold', hex: '#FFD700' },
      { name: 'Silver', hex: '#C0C0C0' },
      { name: 'Space Black', hex: '#000000' },
    ],
  },
  // Samsung models
  'samsung galaxy s24 ultra': {
    storage: ['256GB', '512GB', '1TB'],
    ram: ['12GB'],
    colors: [
      { name: 'Titanium Black', hex: '#000000' },
      { name: 'Titanium Gray', hex: '#8E8E93' },
      { name: 'Titanium Violet', hex: '#AF52DE' },
      { name: 'Titanium Yellow', hex: '#FFCC00' },
    ],
  },
  'samsung galaxy s24': {
    storage: ['128GB', '256GB', '512GB'],
    ram: ['8GB'],
    colors: [
      { name: 'Onyx Black', hex: '#000000' },
      { name: 'Marble Gray', hex: '#8E8E93' },
      { name: 'Cobalt Violet', hex: '#AF52DE' },
      { name: 'Amber Yellow', hex: '#FFCC00' },
    ],
  },
  // OnePlus models
  'oneplus 12': {
    storage: ['256GB', '512GB'],
    ram: ['12GB', '16GB'],
    colors: [
      { name: 'Silky Black', hex: '#000000' },
      { name: 'Flowy Emerald', hex: '#34C759' },
    ],
  },
  'oneplus 11': {
    storage: ['128GB', '256GB'],
    ram: ['8GB', '16GB'],
    colors: [
      { name: 'Titan Black', hex: '#000000' },
      { name: 'Eternal Green', hex: '#34C759' },
    ],
  },
}

export const modelSpecsService = {
  /**
   * Get specifications for a device model
   * @param modelName - Device model name (e.g., "iPhone 15 Pro Max")
   * @param brand - Device brand (e.g., "Apple")
   */
  async getSpecs(modelName: string, brand?: string): Promise<ModelSpecs | null> {
    // Normalize model name
    const normalized = modelName.toLowerCase().trim()
    
    // Try exact match first
    if (DEVICE_SPECS[normalized]) {
      return DEVICE_SPECS[normalized]
    }
    
    // Try partial match
    for (const [key, specs] of Object.entries(DEVICE_SPECS)) {
      if (normalized.includes(key) || key.includes(normalized)) {
        return specs
      }
    }
    
    // Try with brand prefix
    if (brand) {
      const brandModel = `${brand.toLowerCase()} ${normalized}`.trim()
      if (DEVICE_SPECS[brandModel]) {
        return DEVICE_SPECS[brandModel]
      }
    }
    
    // Return default specs if not found
    return {
      storage: ['128GB', '256GB', '512GB'],
      ram: ['8GB', '12GB'],
      colors: [
        { name: 'Black', hex: '#000000' },
        { name: 'White', hex: '#FFFFFF' },
        { name: 'Blue', hex: '#007AFF' },
      ],
    }
  },

  /**
   * Search for model specifications (can be extended to use external API)
   */
  async searchModel(modelName: string, brand?: string): Promise<ModelSpecs | null> {
    // For now, use local database
    // In the future, this can call external APIs like:
    // - GSMArena API
    // - DeviceSpecs API
    // - Custom scraping service
    
    return this.getSpecs(modelName, brand)
  },
}

