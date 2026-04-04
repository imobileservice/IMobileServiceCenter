"use client"

import { useState, useEffect, useCallback } from "react"
import { useNavigate, useParams, Link } from "react-router-dom"
import { motion } from "framer-motion"
import { ShoppingCart, ArrowLeft, Star, Truck, Shield, RotateCcw, Heart, Loader2, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/lib/store"
import { cartService } from "@/lib/supabase/services/cart"
import { toast } from "sonner"
import { useRealtimeUpdates } from "@/hooks/use-realtime-updates"
import ProductImageGallery from "@/components/product-image-gallery"
import ProductReviews from "@/components/product-reviews"
import SimilarProducts from "@/components/similar-products"
import { getApiUrl } from "@/lib/utils/api"
import { formatCurrency } from "@/lib/utils/currency"

// Product type matching database schema
interface Product {
  id: string
  name: string
  price: number
  image?: string
  images?: string[]
  condition: "new" | "used"
  stock?: number
  category: string
  brand?: string
  description?: string
  specs?: any
  rating?: number
  reviews?: number
  reviewsData?: any[]
  variants?: Array<{
    storage?: string
    ram?: string
    color?: string
    price: number
  }>
}

export default function ProductDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [quantity, setQuantity] = useState(1)
  const [isFavorite, setIsFavorite] = useState(false)
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [addingToCart, setAddingToCart] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"description" | "additional" | "reviews" | "shipping">("description")
  const user = useAuthStore((state) => state.user)

  // Variant selection state
  const [selectedStorage, setSelectedStorage] = useState<string>("")
  const [selectedRAM, setSelectedRAM] = useState<string>("")
  const [selectedColor, setSelectedColor] = useState<string>("")
  const [currentPrice, setCurrentPrice] = useState<number>(0)
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0)

  // Variant structure type
  interface VariantConfig {
    base_price?: number
    storage?: Array<{ value: string; price_adjustment: number; stock?: number }>
    ram?: Array<{ value: string; price_adjustment: number; stock?: number }>
    color?: Array<{ value: string; hex?: string; image?: string; stock?: number }>
  }

  // Get variant configuration
  const variants = product?.variants as VariantConfig | undefined
  const hasNewVariants = variants && typeof variants === 'object' && !Array.isArray(variants)

  // Collect all unique images (general product images + color-specific images)
  const productImages = (() => {
    if (!product) return ["/placeholder.svg"]
    
    const baseImages = product.images && product.images.length > 0
      ? product.images
      : product.image
        ? [product.image]
        : ["/placeholder.svg"]
        
    const variantColorImages = (variants?.color || [])
      .map((c: { image?: string }) => c.image)
      .filter((img): img is string => !!img)
      
    // Combine and remove duplicates while preserving order
    return Array.from(new Set([...baseImages, ...variantColorImages]))
  })()

  // Fetch product function
  const fetchProduct = useCallback(async (silent: boolean = false) => {
    if (!id) {
      setError("Product ID is required")
      if (!silent) {
        setLoading(false)
      }
      return
    }

    try {
      // Only show loading state if not silent update
      if (!silent) {
        setLoading(true)
        setError(null)
      }

      const response = await fetch(getApiUrl(`/api/products/${id}`), {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        }
      })

      if (!response.ok) {
        if (response.status === 404) {
          // Only show error if not silent (product might have been deleted)
          if (!silent) {
            setError("Product not found")
            setLoading(false)
          } else {
            // If silent and 404, product was deleted - redirect to shop
            console.log('Product deleted, redirecting to shop...')
            setTimeout(() => {
              navigate('/shop')
            }, 1000)
          }
        } else {
          if (!silent) {
            setError("Failed to load product")
            setLoading(false)
          }
        }
        return
      }

      const result = await response.json()
      const productData = result.data
      setProduct(productData)

      // Debug: Log product data to help diagnose selector issues
      console.log('[ProductDetail] Product loaded:', {
        id: productData.id,
        name: productData.name,
        category: productData.category,
        categoryLower: (productData.category || '').toLowerCase(),
        brand: productData.brand,
        hasVariants: !!productData.variants,
        variantsType: typeof productData.variants,
        variants: productData.variants,
        specs: productData.specs,
      })

      // Initialize variant selections from product specs
      if (productData.specs) {
        if (productData.specs.storage || productData.specs.Storage) {
          setSelectedStorage(productData.specs.storage || productData.specs.Storage || "")
        }
        if (productData.specs.ram || productData.specs.RAM) {
          setSelectedRAM(productData.specs.ram || productData.specs.RAM || "")
        }
        if (productData.specs.color || productData.specs.Color) {
          const colorValue = productData.specs.color || productData.specs.Color || ""
          // If color is a comma-separated string, take the first one
          const firstColor = colorValue.split(',')[0].trim()
          setSelectedColor(firstColor)
        }
      }

      // Set initial price
      setCurrentPrice(productData.price || 0)
    } catch (err) {
      console.error("Error fetching product:", err)
      if (!silent) {
        setError("Failed to load product. Please try again.")
      }
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [id, navigate])

  // Fetch product from backend
  useEffect(() => {
    fetchProduct()
  }, [fetchProduct])

  // Listen for real-time updates from admin panel
  useRealtimeUpdates(() => {
    // Silently refresh product when admin makes changes (no loading state)
    console.log('🔄 ProductDetail page: Received update event, silently refreshing product...')
    if (id) {
      // Use a small delay to ensure the database has been updated
      setTimeout(() => {
        fetchProduct(true) // Pass true for silent update
      }, 200)
    }
  }, [id, fetchProduct])

  // Update price and active image index when variant changes
  useEffect(() => {
    if (!product) return

    // Check if product has new variant structure
    if (hasNewVariants) {
      // New structure with price adjustments
      const basePrice = variants?.base_price || product.price
      let totalPrice = basePrice

      // Add storage price adjustment
      if (selectedStorage && variants?.storage) {
        const storageOption = variants.storage.find(s => s.value === selectedStorage)
        if (storageOption) {
          totalPrice += storageOption.price_adjustment || 0
        }
      }

      // Add RAM price adjustment (only if not Apple)
      const isAppleProduct = (product.brand || '').toLowerCase() === 'apple'
      if (!isAppleProduct && selectedRAM && variants?.ram) {
        const ramOption = variants.ram.find(r => r.value === selectedRAM)
        if (ramOption) {
          totalPrice += ramOption.price_adjustment || 0
        }
      }

      setCurrentPrice(totalPrice)

      // Update active image index when color changes
      if (selectedColor && variants?.color) {
        const colorObj = variants.color.find((c: { value: string; image?: string }) => c.value === selectedColor)
        if (colorObj?.image) {
          const imageIndex = productImages.findIndex(img => img === colorObj.image)
          if (imageIndex !== -1) {
            setActiveImageIndex(imageIndex)
          }
        }
      }
    } else {
      // Fallback to base price
      setCurrentPrice(product.price)
    }
  }, [product, selectedStorage, selectedRAM, selectedColor, productImages, hasNewVariants, variants])

  // Initialize variant selections when product loads
  useEffect(() => {
    if (!product) return

    const variants = product.variants as VariantConfig | undefined

    if (variants && typeof variants === 'object' && !Array.isArray(variants)) {
      // Set default selections from variants
      if (!selectedStorage && variants.storage && variants.storage.length > 0) {
        setSelectedStorage(variants.storage[0].value)
      }
      if (!selectedRAM && variants.ram && variants.ram.length > 0) {
        const isApple = (product.brand || '').toLowerCase() === 'apple'
        if (!isApple) {
          setSelectedRAM(variants.ram[0].value)
        }
      }
      if (!selectedColor && variants.color && variants.color.length > 0) {
        setSelectedColor(variants.color[0].value)
      }
    }
  }, [product])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading product...</p>
        </div>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">{error || "Product not found"}</h1>
          <Button onClick={() => navigate("/shop")}>Back to Shop</Button>
        </div>
      </div>
    )
  }

  const handleAddToCart = async () => {
    if (!product) return

    if (!user) {
      toast.error("Please sign in to add items to cart")
      navigate("/signin")
      return
    }

    if (addingToCart) return

    try {
      setAddingToCart(true)

      // Prepare variant selection
      const variantSelected: any = {}
      if (selectedStorage) variantSelected.storage = selectedStorage
      if (selectedRAM) variantSelected.ram = selectedRAM
      if (selectedColor) variantSelected.color = selectedColor
      variantSelected.price = currentPrice

      console.log('[ProductDetail] Adding to cart:', {
        productId: product.id,
        quantity,
        userId: user.id,
        variant: variantSelected
      })

      // Use cartService to add item to database with variant
      await cartService.addItem(user.id, product.id, quantity, variantSelected)

      toast.success(`Added ${quantity} ${quantity > 1 ? 'items' : 'item'} to cart`)

      // Trigger cart count update
      window.dispatchEvent(new CustomEvent('cartUpdated', { detail: { timestamp: Date.now() } }))
    } catch (error: any) {
      console.error('[ProductDetail] Failed to add to cart:', error)
      const errorMessage = error.message || "Failed to add to cart"
      toast.error(errorMessage.includes('timeout')
        ? "Request timed out. Please try again."
        : errorMessage.includes('Unauthorized')
          ? "Please sign in to add items to cart"
          : errorMessage)
    } finally {
      setAddingToCart(false)
    }
  }

  // Default specs if not available
  const productSpecs = product.specs || {}

  // Check if product is mobile phone or tablet (needs variant selectors)
  // More flexible category check - handle both slug format and display format
  // Include all mobile phone subcategories (mobile-phones-iphone, mobile-phones-samsung, etc.)
  const categoryLower = (product.category || '').toLowerCase()
  const brandLower = (product.brand || '').toLowerCase()
  const nameLower = (product.name || '').toLowerCase()

  // Check category, brand, or product name for mobile/tablet indicators
  const isMobileOrTablet = categoryLower === 'mobile-phones' ||
    categoryLower === 'tablets' ||
    categoryLower.startsWith('mobile-phones-') || // All mobile phone subcategories
    categoryLower.includes('mobile') ||
    categoryLower.includes('phone') ||
    categoryLower.includes('tablet') ||
    // Fallback: check brand or name if category is unclear
    brandLower.includes('honor') ||
    brandLower.includes('samsung') ||
    brandLower.includes('apple') ||
    brandLower.includes('oneplus') ||
    brandLower.includes('xiaomi') ||
    brandLower.includes('oppo') ||
    brandLower.includes('vivo') ||
    nameLower.includes('phone') ||
    nameLower.includes('mobile') ||
    nameLower.includes('tablet') ||
    nameLower.includes('iphone') ||
    nameLower.includes('galaxy') ||
    nameLower.includes('pixel')
  const isApple = brandLower === 'apple' || nameLower.includes('iphone') || nameLower.includes('ipad')

  const hasNewVariants_redundant = variants && typeof variants === 'object' && !Array.isArray(variants)

  // Helper function to extract string value from specs
  const getStringValue = (value: any): string => {
    if (typeof value === 'string') return value
    if (typeof value === 'number') return String(value)
    if (value && typeof value === 'object' && 'value' in value) return String(value.value)
    return ''
  }

  // Helper to extract all possible values from specs (check multiple field name variations)
  const extractFromSpecs = (fieldNames: string[], specs: any): string[] => {
    for (const fieldName of fieldNames) {
      const value = specs[fieldName]
      if (value) {
        if (Array.isArray(value)) {
          return value.map(getStringValue).filter(Boolean)
        }
        const strValue = getStringValue(value)
        if (strValue) {
          // If it's a comma-separated string, split it
          if (strValue.includes(',')) {
            return strValue.split(',').map(v => v.trim()).filter(Boolean)
          }
          return [strValue]
        }
      }
    }
    return []
  }

  // Get available options from variants or fallback to specs
  // For variants structure: use variants array
  // For specs: try multiple field name variations and formats
  const storageOptions = hasNewVariants && variants?.storage
    ? variants.storage.map(s => s.value)
    : (() => {
      // Try storageOptions array first
      if (Array.isArray(productSpecs.storageOptions)) {
        return productSpecs.storageOptions.map(getStringValue).filter(Boolean)
      }
      // Try all possible field name variations
      const extracted = extractFromSpecs(['storage', 'Storage', 'storageSize', 'StorageSize', 'memory', 'Memory'], productSpecs)
      return extracted.length > 0 ? extracted : []
    })()

  const ramOptions = hasNewVariants && variants?.ram
    ? variants.ram.map(r => r.value)
    : (() => {
      // Try ramOptions array first
      if (Array.isArray(productSpecs.ramOptions)) {
        return productSpecs.ramOptions.map(getStringValue).filter(Boolean)
      }
      // Try all possible field name variations
      const extracted = extractFromSpecs(['ram', 'RAM', 'memoryRam', 'MemoryRAM'], productSpecs)
      return extracted.length > 0 ? extracted : []
    })()

  const colorOptions = hasNewVariants && variants?.color
    ? variants.color.map((c: any) => ({ value: c.value, hex: c.hex, image: c.image }))
    : (() => {
      // Try colorOptions array first
      if (Array.isArray(productSpecs.colorOptions)) {
        return productSpecs.colorOptions.map((c: any) => {
          if (typeof c === 'string') return { value: c }
          if (c && typeof c === 'object' && 'value' in c) return c
          return { value: String(c) }
        })
      }
      // Try all possible field name variations
      const colorValue = productSpecs.color || productSpecs.Color || productSpecs.colour || productSpecs.Colour
      if (colorValue) {
        if (typeof colorValue === 'string') {
          if (colorValue.includes(',')) {
            return colorValue.split(',').map((c: string) => ({ value: c.trim() }))
          }
          return [{ value: colorValue }]
        }
        if (colorValue && typeof colorValue === 'object' && 'value' in colorValue) {
          return [{ value: String(colorValue.value) }]
        }
        return [{ value: String(colorValue) }]
      }
      return []
    })()

  // Get current storage/RAM/color from selections or defaults
  const currentStorage = selectedStorage || (storageOptions.length > 0 ? storageOptions[0] : "")
  const currentRAM = selectedRAM || (ramOptions.length > 0 ? ramOptions[0] : "")
  const currentColorObj = colorOptions.find((c: any) => c.value === selectedColor) || colorOptions[0]
  const currentColor = currentColorObj?.value || ""

  // Remaining specs (excluding storage / ram / color to avoid duplication)
  const otherSpecsEntries = Object.entries(productSpecs).filter(
    ([key]) => !['storage', 'Storage', 'ram', 'RAM', 'color', 'Color', 'storageOptions', 'ramOptions', 'colorOptions', 'variants'].includes(key),
  )

  // Default rating and reviews
  const productRating = product.rating || 4.5
  const productReviews = product.reviews || 0
  const productReviewsData = product.reviewsData || []

  // Breadcrumbs
  const breadcrumbs = [
    { label: "Home", path: "/" },
    ...(product.brand ? [{ label: product.brand, path: `/shop?brand=${encodeURIComponent(product.brand)}` }] : []),
    { label: product.name, path: "" }
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Breadcrumbs */}
      <div className="border-b border-border bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {breadcrumbs.map((crumb, index) => (
              <div key={index} className="flex items-center gap-2">
                {index > 0 && <span>/</span>}
                {crumb.path ? (
                  <Link to={crumb.path} className="hover:text-primary transition-colors">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-foreground font-medium">{crumb.label}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Product Details */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 mb-12">
          {/* Product Images */}
          <ProductImageGallery 
            images={productImages} 
            productName={product.name} 
            condition={product.condition} 
            externalImageIndex={activeImageIndex}
          />

          {/* Product Information */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
            <div className="space-y-6">
              {/* Product Name */}
              <div>
                <h1 className="text-3xl sm:text-4xl font-bold mb-3">{product.name}</h1>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center gap-1">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`w-5 h-5 ${i < Math.floor(productRating)
                            ? "fill-yellow-400 text-yellow-400"
                            : i < productRating
                              ? "fill-yellow-400/50 text-yellow-400/50"
                              : "text-gray-300"
                          }`}
                      />
                    ))}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {productRating.toFixed(1)} ({productReviews} {productReviews === 1 ? 'review' : 'reviews'})
                  </span>
                </div>
              </div>

              {/* Price */}
              <div className="border-t border-b border-border py-4">
                {currentPrice > product.price && (
                  <p className="text-lg text-muted-foreground line-through mb-1">
                    {formatCurrency(product.price)}
                  </p>
                )}
                <p className="text-3xl font-bold text-primary mb-2">{formatCurrency(currentPrice)}</p>
                {hasNewVariants && (selectedStorage || selectedRAM) && (
                  <p className="text-sm text-muted-foreground">
                    Base: {formatCurrency(product.price)}
                    {selectedStorage && variants?.storage && variants.storage.find(s => s.value === selectedStorage)?.price_adjustment !== 0 && (
                      <span className="ml-2">
                        + Storage: {formatCurrency(variants.storage.find(s => s.value === selectedStorage)?.price_adjustment || 0)}
                      </span>
                    )}
                    {selectedRAM && variants?.ram && variants.ram.find(r => r.value === selectedRAM)?.price_adjustment !== 0 && (
                      <span className="ml-2">
                        + RAM: {formatCurrency(variants.ram.find(r => r.value === selectedRAM)?.price_adjustment || 0)}
                      </span>
                    )}
                  </p>
                )}
              </div>

              {/* Key Features/Description Preview */}
              {product.description && (
                <div className="text-muted-foreground w-full overflow-hidden">
                  <p className="leading-relaxed whitespace-pre-line break-words">{product.description}</p>
                </div>
              )}

              {/* Variant Selectors - Only for Mobile Phones and Tablets */}
              {(isMobileOrTablet || hasNewVariants) && (
                <div className="space-y-6 border-t border-b border-border py-6">

                  {/* Storage Selector - Button Style */}
                  {storageOptions.length > 0 && (
                    <div>
                      <label className="block text-sm font-semibold mb-3">Storage:</label>
                      <div className="flex flex-wrap gap-2">
                        {storageOptions.map((option: string) => {
                          const isSelected = selectedStorage === option || (!selectedStorage && option === storageOptions[0])
                          const storageVariant = hasNewVariants ? variants?.storage?.find(s => s.value === option) : null
                          const priceAdjustment = (storageVariant && typeof storageVariant === 'object') ? (storageVariant as any).price_adjustment : 0

                          return (
                            <button
                              key={option}
                              onClick={() => setSelectedStorage(option)}
                              className={`px-4 py-2 rounded-lg border-2 transition-all font-medium text-sm ${isSelected
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-background text-foreground border-border hover:border-primary/50"
                                }`}
                            >
                              {option}
                              {priceAdjustment !== 0 && (
                                <span className="ml-2 text-xs opacity-80">
                                  {priceAdjustment > 0 ? '+' : ''}{formatCurrency(priceAdjustment)}
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* RAM Selector - Hidden for Apple products, Button Style */}
                  {!isApple && ramOptions.length > 0 && (
                    <div>
                      <label className="block text-sm font-semibold mb-3">RAM:</label>
                      <div className="flex flex-wrap gap-2">
                        {ramOptions.map((option: string) => {
                          const isSelected = selectedRAM === option || (!selectedRAM && option === ramOptions[0])
                          const ramVariant = hasNewVariants ? variants?.ram?.find(r => r.value === option) : null
                          const priceAdjustment = (ramVariant && typeof ramVariant === 'object') ? (ramVariant as any).price_adjustment : 0

                          return (
                            <button
                              key={option}
                              onClick={() => setSelectedRAM(option)}
                              className={`px-4 py-2 rounded-lg border-2 transition-all font-medium text-sm ${isSelected
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-background text-foreground border-border hover:border-primary/50"
                                }`}
                            >
                              {option}
                              {priceAdjustment !== 0 && (
                                <span className="ml-2 text-xs opacity-80">
                                  {priceAdjustment > 0 ? '+' : ''}{formatCurrency(priceAdjustment)}
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Color Selector - Circular Swatches */}
                  {colorOptions.length > 0 && (
                    <div>
                      <label className="block text-sm font-semibold mb-3">Color:</label>
                      <div className="flex flex-wrap gap-3 items-center">
                        {colorOptions.map((colorObj: any) => {
                          const colorValue = typeof colorObj === 'string' ? colorObj : colorObj.value
                          const colorHex = colorObj.hex || (() => {
                            const colorMap: Record<string, string> = {
                              'black': '#000000', 'white': '#FFFFFF', 'blue': '#007AFF', 'red': '#FF3B30',
                              'green': '#34C759', 'yellow': '#FFCC00', 'purple': '#AF52DE', 'pink': '#FF2D55',
                              'titanium': '#8E8E93', 'silver': '#C0C0C0', 'gold': '#FFD700', 'gray': '#8E8E93',
                              'grey': '#8E8E93', 'natural titanium': '#8E8E93', 'blue titanium': '#007AFF',
                              'white titanium': '#FFFFFF', 'titanium black': '#000000'
                            }
                            return colorMap[colorValue.toLowerCase()] || '#8E8E93'
                          })()
                          const isSelected = selectedColor === colorValue || (!selectedColor && colorValue === colorOptions[0]?.value)

                          return (
                            <button
                              key={colorValue}
                              onClick={() => setSelectedColor(colorValue)}
                              className={`relative w-12 h-12 rounded-full border-2 transition-all ${isSelected
                                  ? "border-primary scale-110 shadow-lg"
                                  : "border-border hover:border-primary/50"
                                }`}
                              // eslint-disable-next-line react/forbid-dom-props
                              style={{ backgroundColor: colorHex }}
                              title={colorValue}
                              aria-label={`Select color ${colorValue}`}
                            >
                              {isSelected && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <div className="w-4 h-4 rounded-full bg-white border-2 border-primary shadow-sm" />
                                </div>
                              )}
                            </button>
                          )
                        })}
                        {/* Clear selection button */}
                        {selectedColor && (
                          <button
                            onClick={() => setSelectedColor("")}
                            className="px-3 py-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg"
                          >
                            X Clear
                          </button>
                        )}
                      </div>
                      {selectedColor && (
                        <p className="text-sm text-muted-foreground mt-2 capitalize">{selectedColor}</p>
                      )}
                    </div>
                  )}

                  {/* Show message if no selectors are available but product is mobile/tablet */}
                  {isMobileOrTablet && storageOptions.length === 0 && ramOptions.length === 0 && colorOptions.length === 0 && (
                    <div className="text-sm text-muted-foreground italic">
                      Variant options will be available once configured in the admin panel.
                    </div>
                  )}
                </div>
              )}

              {/* Specifications Grid */}
              {(currentStorage || currentRAM || otherSpecsEntries.length > 0) && (
                <div>
                  <h3 className="text-lg font-bold mb-4">Specifications</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {currentStorage && (
                      <div className="bg-muted p-3 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">Storage</p>
                        <p className="font-semibold text-sm">{currentStorage}</p>
                      </div>
                    )}
                    {!isApple && currentRAM && (
                      <div className="bg-muted p-3 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">RAM</p>
                        <p className="font-semibold text-sm">{currentRAM}</p>
                      </div>
                    )}
                    {otherSpecsEntries.map(([key, value]) => (
                      <div key={key} className="bg-muted p-3 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1 capitalize">{key.replace(/([A-Z])/g, " $1")}</p>
                        <p className="font-semibold text-sm">{String(value)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Service Guarantees */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex flex-col items-center text-center p-4 bg-muted rounded-lg">
                  <Truck className="w-6 h-6 text-primary mb-2" />
                  <p className="text-sm font-semibold">Free Shipping</p>
                </div>
                <div className="flex flex-col items-center text-center p-4 bg-muted rounded-lg">
                  <Shield className="w-6 h-6 text-primary mb-2" />
                  <p className="text-sm font-semibold">Warranty</p>
                </div>
                <div className="flex flex-col items-center text-center p-4 bg-muted rounded-lg">
                  <RotateCcw className="w-6 h-6 text-primary mb-2" />
                  <p className="text-sm font-semibold">Easy Returns</p>
                </div>
              </div>

              {/* Add to Cart Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <label className="text-sm font-medium">Quantity:</label>
                  <div className={`flex items-center border border-border rounded-lg ${product.stock !== undefined && product.stock <= 0 ? 'opacity-50 pointer-events-none' : ''}`}>
                    <button
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="px-4 py-2 hover:bg-muted transition-colors"
                      disabled={product.stock !== undefined && product.stock <= 0}
                    >
                      −
                    </button>
                    <span className="px-6 py-2 font-semibold min-w-[60px] text-center">{quantity}</span>
                    <button
                      onClick={() => setQuantity(quantity + 1)}
                      className="px-4 py-2 hover:bg-muted transition-colors"
                      disabled={product.stock !== undefined && product.stock <= 0 || (product.stock !== undefined && quantity >= product.stock)}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={handleAddToCart}
                    disabled={addingToCart || !product || (product.stock !== undefined && product.stock <= 0)}
                    className={`flex-1 gap-2 text-base py-6 ${product.stock !== undefined && product.stock <= 0 ? 'bg-red-500 hover:bg-red-600 text-white' : ''}`}
                  >
                    {product.stock !== undefined && product.stock <= 0 ? (
                      <span className="font-bold">Out of Stock</span>
                    ) : addingToCart ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <ShoppingCart className="w-5 h-5" />
                        ADD TO CART
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    className="px-6 py-6"
                    onClick={() => setIsFavorite(!isFavorite)}
                  >
                    <Heart className={`w-5 h-5 ${isFavorite ? "fill-red-500 text-red-500" : ""}`} />
                  </Button>
                </div>

                <div className="text-sm text-muted-foreground">
                  <button
                    onClick={() => setIsFavorite(!isFavorite)}
                    className="hover:text-primary transition-colors underline"
                  >
                    Add to wishlist
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Tabs Section */}
        <div className="border-t border-border pt-8">
          <div className="flex overflow-x-auto gap-1 border-b border-border mb-6 pb-2 scrollbar-hide">
            <button
              onClick={() => setActiveTab("description")}
              className={`whitespace-nowrap px-6 py-3 font-medium transition-colors ${activeTab === "description"
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
                }`}
            >
              DESCRIPTION
            </button>
            <button
              onClick={() => setActiveTab("additional")}
              className={`whitespace-nowrap px-6 py-3 font-medium transition-colors ${activeTab === "additional"
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
                }`}
            >
              ADDITIONAL INFORMATION
            </button>
            <button
              onClick={() => setActiveTab("reviews")}
              className={`whitespace-nowrap px-6 py-3 font-medium transition-colors ${activeTab === "reviews"
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
                }`}
            >
              REVIEWS ({productReviews})
            </button>
            <button
              onClick={() => setActiveTab("shipping")}
              className={`whitespace-nowrap px-6 py-3 font-medium transition-colors ${activeTab === "shipping"
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
                }`}
            >
              SHIPPING & DELIVERY
            </button>
          </div>

          {/* Tab Content */}
          <div className="min-h-[300px]">
            {activeTab === "description" && (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold">{product.name}</h2>
                {product.description && (
                  <div className="prose prose-invert max-w-none">
                    <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                      {product.description}
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeTab === "additional" && (
              <div className="space-y-4">
                <h3 className="text-xl font-bold mb-4">Product Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm text-muted-foreground">SKU:</span>
                    <span className="ml-2 font-medium">N/A</span>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Category:</span>
                    <span className="ml-2 font-medium capitalize">{product.category.replace('-', ' ')}</span>
                  </div>
                  {product.brand && (
                    <div>
                      <span className="text-sm text-muted-foreground">Brand:</span>
                      <span className="ml-2 font-medium">{product.brand}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-sm text-muted-foreground">Condition:</span>
                    <span className="ml-2 font-medium capitalize">{product.condition}</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "reviews" && (
              <ProductReviews
                productId={product.id}
                reviews={productReviewsData}
                rating={productRating}
                totalReviews={productReviews}
              />
            )}

            {activeTab === "shipping" && (
              <div className="space-y-4">
                <h3 className="text-xl font-bold mb-4">Shipping & Delivery</h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <Truck className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
                    <div>
                      <p className="font-semibold">Free Shipping</p>
                      <p className="text-sm text-muted-foreground">Free shipping on orders over Rs. 15,000</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
                    <div>
                      <p className="font-semibold">Warranty</p>
                      <p className="text-sm text-muted-foreground">All products come with warranty as specified</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <RotateCcw className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
                    <div>
                      <p className="font-semibold">Easy Returns</p>
                      <p className="text-sm text-muted-foreground">30-day return policy for unused items</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Related Products */}
        <div className="mt-16 border-t border-border pt-12">
          <h2 className="text-2xl font-bold mb-8">Related Products</h2>
          {product.brand ? (
            <SimilarProducts currentProductId={product.id} brand={product.brand} />
          ) : (
            <SimilarProducts currentProductId={product.id} />
          )}
        </div>
      </div>
    </div>
  )
}
