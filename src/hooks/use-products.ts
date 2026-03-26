"use client"

import { useEffect, useState } from 'react'
import { productsService } from '@/lib/supabase/services/products'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'

type Product = Database['public']['Tables']['products']['Row']

interface UseProductsOptions {
  filters?: {
    category?: string
    brand?: string
    condition?: 'new' | 'used'
    search?: string
    minPrice?: number
    maxPrice?: number
  }
  enabled?: boolean
  realtime?: boolean
}

export function useProducts(options: UseProductsOptions = {}) {
  const { filters, enabled = true, realtime = false } = options
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!enabled) return

    let mounted = true

    const fetchProducts = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await productsService.getAll(filters)
        if (mounted) {
          setProducts(data)
        }
      } catch (err) {
        if (mounted) {
          setError(err as Error)
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    fetchProducts()

    // Real-time subscription
    if (realtime) {
      const supabase = createClient()
      const channel = supabase
        .channel('products-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'products',
          },
          () => {
            // Refetch on any change
            fetchProducts()
          }
        )
        .subscribe()

      return () => {
        mounted = false
        supabase.removeChannel(channel)
      }
    }

    return () => {
      mounted = false
    }
  }, [enabled, realtime, JSON.stringify(filters)])

  const refetch = async () => {
    setLoading(true)
    try {
      const data = await productsService.getAll(filters)
      setProducts(data)
    } catch (err) {
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }

  return { products, loading, error, refetch }
}
