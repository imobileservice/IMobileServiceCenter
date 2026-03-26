"use client"

import { useState, useEffect, useCallback } from 'react'
import { productsServiceEnhanced } from '@/lib/supabase/services/products-enhanced'
import type { Database } from '@/lib/supabase/types'

type Product = Database['public']['Tables']['products']['Row']

interface UsePaginatedProductsOptions {
  filters?: {
    category?: string
    brand?: string
    condition?: 'new' | 'used'
    search?: string
    minPrice?: number
    maxPrice?: number
  }
  pageSize?: number
  enabled?: boolean
}

export function usePaginatedProducts(options: UsePaginatedProductsOptions = {}) {
  const { filters, pageSize = 20, enabled = true } = options
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [total, setTotal] = useState(0)

  const fetchPage = useCallback(async (pageNum: number, append = false) => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await productsServiceEnhanced.getAllPaginated({
        page: pageNum,
        pageSize,
        filters,
      })

      if (append) {
        setProducts(prev => [...prev, ...response.data])
      } else {
        setProducts(response.data)
      }

      setHasMore(response.hasMore)
      setTotal(response.total)
      setPage(pageNum)
    } catch (err) {
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [filters, pageSize])

  useEffect(() => {
    if (enabled) {
      fetchPage(1, false)
    }
  }, [enabled, fetchPage])

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      fetchPage(page + 1, true)
    }
  }, [loading, hasMore, page, fetchPage])

  const refetch = useCallback(() => {
    fetchPage(1, false)
  }, [fetchPage])

  const goToPage = useCallback((pageNum: number) => {
    fetchPage(pageNum, false)
  }, [fetchPage])

  return {
    products,
    loading,
    error,
    page,
    hasMore,
    total,
    totalPages: Math.ceil(total / pageSize),
    loadMore,
    refetch,
    goToPage,
  }
}
