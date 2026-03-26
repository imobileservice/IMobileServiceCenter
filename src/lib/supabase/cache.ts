/**
 * Simple cache implementation for Supabase queries
 * For production, consider using React Query or SWR
 */

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
}

class SupabaseCache {
  private cache = new Map<string, CacheEntry<any>>()
  private defaultTTL = 5 * 60 * 1000 // 5 minutes

  set<T>(key: string, data: T, ttl = this.defaultTTL) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    })
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    const isExpired = Date.now() - entry.timestamp > entry.ttl
    if (isExpired) {
      this.cache.delete(key)
      return null
    }

    return entry.data as T
  }

  invalidate(pattern?: string) {
    if (!pattern) {
      this.cache.clear()
      return
    }

    // Invalidate keys matching pattern
    const keysToDelete: string[] = []
    this.cache.forEach((_, key) => {
      if (key.includes(pattern)) {
        keysToDelete.push(key)
      }
    })

    keysToDelete.forEach(key => this.cache.delete(key))
  }

  clear() {
    this.cache.clear()
  }
}

export const supabaseCache = new SupabaseCache()

/**
 * Cache wrapper for async functions
 */
export async function withCache<T>(
  key: string,
  fn: () => Promise<T>,
  ttl?: number
): Promise<T> {
  // Check cache first
  const cached = supabaseCache.get<T>(key)
  if (cached !== null) {
    return cached
  }

  // Fetch and cache
  const data = await fn()
  supabaseCache.set(key, data, ttl)
  return data
}

/**
 * Cache keys helper
 */
export const cacheKeys = {
  products: (filters?: any) => `products:${JSON.stringify(filters || {})}`,
  product: (id: string) => `product:${id}`,
  cart: (userId: string) => `cart:${userId}`,
  orders: (userId?: string) => userId ? `orders:${userId}` : 'orders:all',
  order: (id: string) => `order:${id}`,
  categories: () => 'categories',
  brands: () => 'brands',
}
