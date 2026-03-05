"use client"

import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Plus, Minus, Star } from "lucide-react"
import { useCartStore, type CartItem } from "@/lib/store"
import { getApiUrl } from "@/lib/utils/api"
import { formatCurrency } from "@/lib/utils/currency"

interface Product {
  id: string
  name: string
  price: number
  image: string
  rating?: number
  reviews?: number
  condition: "new" | "used"
  discount?: number
}

interface SimilarProductsProps {
  products?: Product[] // Optional - for backward compatibility
  currentProductId?: string // New: fetch similar products by product ID
  brand?: string // New: filter by brand
}

function SimilarProductCard({ product, index }: { product: Product; index: number }) {
  const cartItems = useCartStore((state) => state.items)
  const addToCart = useCartStore((state) => state.addToCart)
  const updateQuantity = useCartStore((state) => state.updateQuantity)
  const removeFromCart = useCartStore((state) => state.removeFromCart)

  const cartItem = cartItems.find((item) => item.id === product.id)
  const quantity = cartItem?.quantity || 0
  const isInCart = quantity > 0

  const originalPrice = product.discount ? Math.round(product.price / (1 - product.discount / 100)) : null

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const item: CartItem = {
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      quantity: 1,
      condition: product.condition,
    }
    addToCart(item)
  }

  const handleIncrement = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (cartItem) {
      updateQuantity(product.id, quantity + 1)
    } else {
      handleAddToCart(e)
    }
  }

  const handleDecrement = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (quantity > 1) {
      updateQuantity(product.id, quantity - 1)
    } else {
      removeFromCart(product.id)
    }
  }

  return (
    <motion.div
      key={product.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      whileHover={{ y: -4, transition: { duration: 0.3 } }}
      className="bg-white dark:bg-card rounded-lg overflow-hidden border border-gray-200 dark:border-border hover:shadow-lg transition-all duration-300 cursor-pointer shadow-sm"
    >
      {/* Clickable Link Wrapper */}
      <Link to={`/product/${product.id}`} className="block">
        {/* Image Container - Full Image View */}
        <div className="relative h-48 sm:h-56 md:h-64 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-muted dark:to-muted/50 overflow-hidden flex items-center justify-center p-3 sm:p-4">
          <motion.div
            whileHover={{ scale: 1.1 }}
            transition={{ duration: 0.4 }}
            className="relative w-full h-full"
          >
            <img
              src={product.image || "/placeholder.svg"}
              alt={product.name}
              className="object-contain w-full h-full"
            />
          </motion.div>

          {/* Condition Badge */}
          <motion.div
            className="absolute top-3 right-3"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold shadow-md ${
                product.condition === "new" ? "bg-green-500 text-white" : "bg-amber-500 text-white"
              }`}
            >
              {product.condition === "new" ? "NEW" : "Used"}
            </span>
          </motion.div>

          {/* Discount Badge */}
          {product.discount && (
            <motion.div
              className="absolute top-3 left-3"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-500 text-white shadow-md">
                -{product.discount}%
              </span>
            </motion.div>
          )}
        </div>

        {/* Content */}
        <div className="p-3 sm:p-4">
          <motion.h3
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="font-semibold text-sm sm:text-base line-clamp-2 mb-2 text-gray-900 dark:text-white"
          >
            {product.name}
          </motion.h3>

          {/* Rating */}
          <div className="flex items-center gap-1 mb-2">
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                className={`w-3.5 h-3.5 ${
                  i < Math.floor(product.rating) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                }`}
              />
            ))}
            <span className="text-xs text-muted-foreground ml-1">({product.reviews})</span>
          </div>

          {/* Price */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="flex flex-col gap-1"
          >
            {originalPrice && (
              <span className="text-xs sm:text-sm text-gray-400 line-through">
                {formatCurrency(originalPrice)}
              </span>
            )}
            <span className="text-base sm:text-lg font-bold text-blue-600 dark:text-primary">
              {formatCurrency(product.price)}
            </span>
          </motion.div>
        </div>
      </Link>

      {/* Add to Cart / Quantity Selector - Hidden on mobile, shown on hover for desktop */}
      <div className="px-3 sm:px-4 pb-3 sm:pb-4 hidden sm:block">
        <AnimatePresence mode="wait" initial={false}>
          {!isInCart ? (
            <motion.button
              key="add-button"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3 }}
              onClick={handleAddToCart}
              className="w-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full px-4 py-2.5 flex items-center justify-between transition-colors duration-200 group"
            >
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Add</span>
              <div className="w-7 h-7 rounded-full bg-white dark:bg-gray-900 flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
                <Plus className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" strokeWidth={2.5} />
              </div>
            </motion.button>
          ) : (
            <motion.div
              key="quantity-selector"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3 }}
              className="flex items-center justify-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-full px-2 py-1.5"
            >
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={handleDecrement}
                className="w-8 h-8 rounded-full bg-white dark:bg-gray-900 flex items-center justify-center shadow-sm hover:shadow-md transition-shadow"
              >
                <Minus className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" strokeWidth={2.5} />
              </motion.button>

              <motion.span
                key={quantity}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="text-sm font-semibold text-gray-900 dark:text-white min-w-[1.5rem] text-center"
              >
                {quantity}
              </motion.span>

              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={handleIncrement}
                className="w-8 h-8 rounded-full bg-white dark:bg-gray-900 flex items-center justify-center shadow-sm hover:shadow-md transition-shadow"
              >
                <Plus className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" strokeWidth={2.5} />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

export default function SimilarProducts({ products, currentProductId, brand }: SimilarProductsProps) {
  const [similarProducts, setSimilarProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)

  // Fetch similar products from backend if currentProductId and brand are provided
  useEffect(() => {
    const fetchSimilarProducts = async () => {
      if (products) {
        // If products are provided directly, use them
        setSimilarProducts(products)
        return
      }

      if (!currentProductId || !brand) {
        setSimilarProducts([])
        return
      }

      try {
        setLoading(true)
        // Fetch products with same brand, excluding current product
        const params = new URLSearchParams({
          brand: brand,
        })
        const response = await fetch(getApiUrl(`/api/products/list?${params.toString()}`))
        
        if (response.ok) {
          const result = await response.json()
          // Filter out current product and limit to 4
          const filtered = (result.data || [])
            .filter((p: any) => p.id !== currentProductId)
            .slice(0, 4)
            .map((p: any) => ({
              id: p.id,
              name: p.name,
              price: Number(p.price),
              image: p.image || p.images?.[0] || "/placeholder.svg",
              rating: p.rating || 4.5,
              reviews: p.reviews || 0,
              condition: p.condition,
              discount: p.original_price && p.price 
                ? Math.round(((Number(p.original_price) - Number(p.price)) / Number(p.original_price)) * 100)
                : undefined,
            }))
          setSimilarProducts(filtered)
        }
      } catch (err) {
        console.error("Error fetching similar products:", err)
        setSimilarProducts([])
      } finally {
        setLoading(false)
      }
    }

    fetchSimilarProducts()
  }, [products, currentProductId, brand])

  if (loading) {
    return (
      <div className="border-t border-border pt-12">
        <h2 className="text-2xl font-bold mb-8">Similar Products</h2>
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-80 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (!similarProducts || similarProducts.length === 0) {
    return null // Don't show section if no similar products
  }

  return (
    <div className="border-t border-border pt-12">
      <h2 className="text-2xl font-bold mb-8">Similar Products</h2>
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
        {similarProducts.map((product, index) => (
          <SimilarProductCard key={product.id} product={product} index={index} />
        ))}
      </div>
    </div>
  )
}
