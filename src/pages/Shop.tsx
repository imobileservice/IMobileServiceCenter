"use client"

import { useState, useMemo, useCallback, memo, useEffect, useRef } from "react"
import { useSearchParams } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Filter, ArrowUpDown, X, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { lazy, Suspense } from "react"
import { productsService } from "@/lib/supabase/services/products"
import { useRealtimeUpdates } from "@/hooks/use-realtime-updates"
import type { Database } from "@/lib/supabase/types"

type Product = Database["public"]["Tables"]["products"]["Row"]

// Lazy load heavy components
const ProductCard = lazy(() => import("@/components/product-card"))
const ProductQuickView = lazy(() => import("@/components/product-quick-view"))
const FilterSidebar = lazy(() => import("@/components/filter-sidebar"))
const MobileShopHeader = lazy(() => import("@/components/mobile-shop-header"))

const LoadingPlaceholder = () => <div className="h-80 bg-muted animate-pulse rounded-lg" />

// Memoized product card component
const MemoizedProductCard = memo(ProductCard)

export default function ShopPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "")
  const [selectedCategory, setSelectedCategory] = useState<string | null>(searchParams.get("category"))
  const [selectedBrand, setSelectedBrand] = useState<string | null>(searchParams.get("brand"))
  const [priceRange, setPriceRange] = useState([0, 1399990])
  const [dynamicFilters, setDynamicFilters] = useState<Record<string, any>>({})
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const productsPerPage = 16

  // Ref to store current filters for real-time updates
  const filtersRef = useRef({
    selectedCategory,
    selectedBrand,
    priceRange,
    searchQuery,
    dynamicFilters,
  })

  // Ref for products container to scroll to top on pagination
  const productsContainerRef = useRef<HTMLDivElement>(null)

  // Update filters ref when they change
  useEffect(() => {
    filtersRef.current = {
      selectedCategory,
      selectedBrand,
      priceRange,
      searchQuery,
      dynamicFilters,
    }
  }, [selectedCategory, selectedBrand, priceRange, searchQuery, dynamicFilters])

  const handleDynamicFilterChange = useCallback((key: string, value: any) => {
    setDynamicFilters(prev => {
      // If value is null, remove the key
      if (value === null) {
        const next = { ...prev }
        delete next[key]
        return next
      }
      return { ...prev, [key]: value }
    })
  }, [])

  // Load products function
  const loadProducts = useCallback(async (silent: boolean = false) => {
    try {
      // Only show loading state if not silent update
      if (!silent) {
        setLoading(true)
      }

      const filters: {
        category?: string
        brand?: string
        minPrice?: number
        maxPrice?: number
        search?: string
        dynamicFilters?: Record<string, any>
      } = {}

      const currentFilters = filtersRef.current

      // Apply category filter
      // Pass the category slug directly - it can be a parent category (e.g., "mobile-phones")
      // or a subcategory (e.g., "mobile-phones-iphone")
      // The API will look up the category_id from the slug
      if (currentFilters.selectedCategory) {
        filters.category = currentFilters.selectedCategory
      }

      // Apply brand filter (if not already set by combined format above)
      if (currentFilters.selectedBrand && !filters.brand) {
        // Use the brand as-is (FilterSidebar formats it correctly)
        filters.brand = currentFilters.selectedBrand
      }

      // Debug logging to help diagnose filter issues
      if (filters.brand || filters.category) {
        console.log('[Shop] Applied filters:', {
          category: filters.category,
          brand: filters.brand,
          selectedCategory: currentFilters.selectedCategory,
          selectedBrand: currentFilters.selectedBrand,
          minPrice: filters.minPrice,
          maxPrice: filters.maxPrice,
          search: filters.search
        })
      }

      // Always apply price range filter (ensures all products respect price filter)
      filters.minPrice = currentFilters.priceRange[0]
      filters.maxPrice = currentFilters.priceRange[1]

      // Apply search filter (if provided)
      if (currentFilters.searchQuery && currentFilters.searchQuery.trim()) {
        filters.search = currentFilters.searchQuery.trim()
      }

      if (currentFilters.dynamicFilters && Object.keys(currentFilters.dynamicFilters).length > 0) {
        filters.dynamicFilters = currentFilters.dynamicFilters
      }

      // Add a timeout so we don't hang forever if Supabase is unreachable
      const timeoutMs = 20000
      const data = await Promise.race([
        productsService.getAll(filters),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  `Products request timed out after ${timeoutMs / 1000}s. This usually means Supabase URL/key are incorrect, the project is paused, or there are network issues.`
                )
              ),
            timeoutMs
          )
        ),
      ])
      setProducts(data || [])
    } catch (error) {
      console.error("Error loading products:", error)
      // Only update to empty array if not silent (to avoid clearing on background errors)
      if (!silent) {
        setProducts([])
      }
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [])

  // Load products from database
  useEffect(() => {
    loadProducts()
    // Reset to page 1 when filters change
    setCurrentPage(1)
  }, [selectedCategory, selectedBrand, priceRange, searchQuery, dynamicFilters, loadProducts])

  // Sync state with URL parameters when they change (e.g. navigation)
  useEffect(() => {
    const categoryParam = searchParams.get("category")
    const brandParam = searchParams.get("brand")
    const searchParam = searchParams.get("search")

    // Only update if value changed to avoid infinite loops
    if (categoryParam !== selectedCategory) {
      setSelectedCategory(categoryParam)
      // Optional: Clear dynamic filters when category changes?
      // setDynamicFilters({}) 
      // User might want to keep them if applicable, but usually category change implies different filters.
      // Let's clear them to be safe as different categories have different filters.
      setDynamicFilters({})
    }
    if (brandParam !== selectedBrand) {
      setSelectedBrand(brandParam)
    }
    if (searchParam && searchParam !== searchQuery) {
      setSearchQuery(searchParam)
    }
  }, [searchParams])

  // Listen for real-time updates from admin panel
  useRealtimeUpdates(() => {
    // Silently refresh products when admin makes changes (no loading state)
    console.log('🔄 Shop page: Received update event, silently refreshing products...')
    // Use a small delay to ensure the database has been updated
    setTimeout(() => {
      loadProducts(true) // Pass true for silent update
    }, 200)
  }, [loadProducts])

  // All filtering is done server-side via loadProducts
  // This just ensures we have the latest filtered products
  const filteredProducts = useMemo(() => {
    if (loading) return []

    // Products are already filtered by loadProducts() based on all filters
    // Just return them as-is since server-side filtering is more efficient
    return products
  }, [products, loading])

  // Pagination calculations
  const totalPages = Math.ceil(filteredProducts.length / productsPerPage)
  const startIndex = (currentPage - 1) * productsPerPage
  const endIndex = startIndex + productsPerPage
  const paginatedProducts = filteredProducts.slice(startIndex, endIndex)

  // Reset to page 1 if current page is out of bounds
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1)
    }
  }, [currentPage, totalPages])

  // Scroll to top when page changes
  useEffect(() => {
    // Scroll to top smoothly when pagination changes
    if (productsContainerRef.current) {
      productsContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      // Fallback to window scroll if ref is not available
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [currentPage])

  // Memoized callbacks to prevent unnecessary re-renders
  const handleProductClick = useCallback((product: Product) => {
    setSelectedProduct(product)
  }, [])

  const handleCloseQuickView = useCallback(() => {
    setSelectedProduct(null)
  }, [])

  // Simplified animation variants for better performance
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.02, // Reduced stagger for faster rendering
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 10 }, // Reduced movement
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.2 }, // Faster animation
    },
  }

  return (
    <div className="min-h-screen bg-white dark:bg-background">
      {/* Mobile Header - Fixed */}
      <div className="lg:hidden">
        <Suspense fallback={null}>
          <MobileShopHeader
            onMenuClick={() => setShowSidebar(true)}
            onSearch={setSearchQuery}
            searchQuery={searchQuery}
          />
        </Suspense>
      </div>

      {/* Desktop Header */}
      <div className="hidden lg:block bg-muted border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-4xl font-bold mb-2">Shop Smartphones</h1>
          <p className="text-muted-foreground">Browse our collection of new and used phones</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="pt-20 lg:pt-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar - Desktop */}
          <div className="hidden lg:block">
            <Suspense fallback={<LoadingPlaceholder />}>
              <FilterSidebar
                selectedCategory={selectedCategory}
                selectedBrand={selectedBrand}
                priceRange={priceRange as [number, number]}
                dynamicFilters={dynamicFilters}
                onCategoryChange={setSelectedCategory}
                onBrandChange={setSelectedBrand}
                onPriceChange={setPriceRange}
                onDynamicFilterChange={handleDynamicFilterChange}
              />
            </Suspense>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3" ref={productsContainerRef}>
            {/* Mobile Controls */}
            <div className="lg:hidden flex items-center justify-between mb-4">
              <button
                onClick={() => setShowSidebar(true)}
                className="flex items-center gap-2 text-gray-700 dark:text-gray-300"
              >
                <Filter className="w-5 h-5" />
                <span className="text-sm font-medium">Show sidebar</span>
              </button>
              <button className="text-gray-700 dark:text-gray-300" aria-label="Sort products">
                <ArrowUpDown className="w-5 h-5" />
              </button>
            </div>

            {/* Results Count */}
            <div className="mb-4 text-sm text-gray-600 dark:text-muted-foreground">
              {loading ? (
                "Loading..."
              ) : (
                <>
                  Showing {startIndex + 1}-{Math.min(endIndex, filteredProducts.length)} of {filteredProducts.length} products
                  {totalPages > 1 && ` (Page ${currentPage} of ${totalPages})`}
                </>
              )}
            </div>

            {/* Products Grid - Mobile First: 2 columns */}
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-80 bg-muted animate-pulse rounded-lg" />
                ))}
              </div>
            ) : paginatedProducts.length > 0 ? (
              <>
                <motion.div
                  className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6"
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                >
                  {paginatedProducts.map((product) => {
                    // Calculate discount if original_price exists
                    let discount: number | undefined = undefined
                    if (product.original_price && product.price) {
                      const originalPrice = Number(product.original_price)
                      const currentPrice = Number(product.price)
                      if (originalPrice > currentPrice) {
                        discount = Math.round(((originalPrice - currentPrice) / originalPrice) * 100)
                      }
                    }

                    // Convert database product to ProductCard format
                    const productCardProps = {
                      id: product.id,
                      name: product.name,
                      price: Number(product.price),
                      image: product.image || product.images?.[0] || "/placeholder.svg",
                      condition: product.condition,
                      category: product.category,
                      brand: product.brand || undefined,
                      specs: product.specs ? JSON.stringify(product.specs) : undefined,
                      discount: discount,
                    }
                    return (
                      <motion.div key={product.id} variants={itemVariants}>
                        <Suspense fallback={<LoadingPlaceholder />}>
                          <MemoizedProductCard {...productCardProps} onQuickView={() => handleProductClick(product)} />
                        </Suspense>
                      </motion.div>
                    )
                  })}
                </motion.div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex flex-wrap items-center justify-center gap-2 mt-8">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="gap-2"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </Button>

                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum: number
                        if (totalPages <= 5) {
                          pageNum = i + 1
                        } else if (currentPage <= 3) {
                          pageNum = i + 1
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i
                        } else {
                          pageNum = currentPage - 2 + i
                        }

                        return (
                          <Button
                            key={pageNum}
                            variant={currentPage === pageNum ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCurrentPage(pageNum)}
                            className="min-w-[40px]"
                          >
                            {pageNum}
                          </Button>
                        )
                      })}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="gap-2"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">No products found matching your criteria</p>
                <Button
                  onClick={() => {
                    setSearchQuery("")
                    setSelectedCategory(null)
                    setSelectedBrand(null)
                    setPriceRange([0, 1399990])
                    setDynamicFilters({})
                  }}
                  variant="outline"
                >
                  Clear Filters
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Sidebar Drawer */}
      <AnimatePresence>
        {showSidebar && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSidebar(false)}
              className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            />
            {/* Sidebar */}
            <motion.div
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 bottom-0 w-80 bg-white dark:bg-card z-50 shadow-xl overflow-y-auto lg:hidden"
            >
              <div className="p-4">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold">Filters</h2>
                  <button
                    onClick={() => setShowSidebar(false)}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                    aria-label="Close sidebar"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <Suspense fallback={<LoadingPlaceholder />}>
                  <FilterSidebar
                    selectedCategory={selectedCategory}
                    selectedBrand={selectedBrand}
                    priceRange={priceRange as [number, number]}
                    dynamicFilters={dynamicFilters}
                    onCategoryChange={setSelectedCategory}
                    onBrandChange={setSelectedBrand}
                    onPriceChange={setPriceRange}
                    onDynamicFilterChange={handleDynamicFilterChange}
                  />
                </Suspense>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Quick View Modal */}
      {selectedProduct && <ProductQuickView product={selectedProduct} onClose={() => setSelectedProduct(null)} />}
    </div>
  )
}
