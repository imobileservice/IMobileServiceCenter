"use client"

import { useState, memo, useEffect } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Plus, Minus } from "lucide-react"
import { useAuthStore } from "@/lib/store"
import { cartService } from "@/lib/supabase/services/cart"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"
import { formatCurrency } from "@/lib/utils/currency"

interface ProductCardProps {
  id: string
  name: string
  price: number
  image: string
  condition: "new" | "used"
  discount?: number
  specs?: string
  onQuickView?: () => void
}

function ProductCard({ id, name, price, image, condition, discount, specs, onQuickView }: ProductCardProps) {
  const navigate = useNavigate()
  const [isHovered, setIsHovered] = useState(false)
  const [quantity, setQuantity] = useState(0)
  const [loading, setLoading] = useState(false)
  const user = useAuthStore((state) => state.user)

  // Load cart quantity for this product (non-blocking)
  useEffect(() => {
    if (!user) {
      setQuantity(0)
      return
    }

    const loadCartQuantity = async () => {
      try {
        // Use a shorter timeout for quantity check (non-critical)
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Quantity check timeout')), 5000)
        )
        
        const itemsPromise = cartService.getCartItems(user.id)
        const items = await Promise.race([itemsPromise, timeoutPromise])
        const item = items?.find((item: any) => item.product_id === id)
        setQuantity(item?.quantity || 0)
      } catch (error) {
        // Silently fail - quantity check is non-critical
        // User can still add to cart even if quantity check fails
        setQuantity(0)
      }
    }

    loadCartQuantity()
  }, [user, id])

  const isInCart = quantity > 0

  const originalPrice = discount ? Math.round(price / (1 - discount / 100)) : null

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    console.log('[ProductCard] Add to cart clicked', { userId: user?.id, productId: id, loading })

    if (!user) {
      console.warn('[ProductCard] No user found, redirecting to signin')
      toast.error("Please sign in to add items to cart")
      navigate("/signin")
      return
    }

    if (loading) {
      console.log('[ProductCard] Already loading, ignoring click')
      return
    }

    try {
      setLoading(true)
      console.log('[ProductCard] Starting add to cart...', { userId: user.id, productId: id })
      
      // Use a timeout for add to cart operation
      const addItemPromise = cartService.addItem(user.id, id, 1)
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Add to cart timeout - please try again')), 10000)
      )
      
      const result = await Promise.race([addItemPromise, timeoutPromise])
      console.log('[ProductCard] Add to cart successful:', result)
      
      setQuantity(prev => {
        const newQuantity = prev + 1
        console.log('[ProductCard] Updated quantity:', { prev, newQuantity })
        return newQuantity
      })
      
      toast.success("Added to cart")
      
      // Trigger cart count update
      window.dispatchEvent(new CustomEvent('cartUpdated', { detail: { timestamp: Date.now() } }))
      console.log('[ProductCard] Cart update event dispatched')
    } catch (error: any) {
      console.error("[ProductCard] Failed to add to cart:", error)
      console.error("[ProductCard] Error details:", {
        message: error.message,
        stack: error.stack,
        name: error.name
      })
      
      const errorMessage = error.message || "Failed to add to cart"
      const displayMessage = errorMessage.includes('timeout') 
        ? "Request timed out. Please check your connection and try again." 
        : errorMessage.includes('Unauthorized')
        ? "Please sign in to add items to cart"
        : errorMessage
        
      toast.error(displayMessage)
    } finally {
      setLoading(false)
      console.log('[ProductCard] Add to cart finished, loading set to false')
    }
  }

  const handleIncrement = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!user) {
      toast.error("Please sign in to update cart")
      navigate("/signin")
      return
    }

    if (loading) return

    try {
      setLoading(true)
      
      // Find the cart item ID with timeout
      const getItemsPromise = cartService.getCartItems(user.id)
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Get cart timeout')), 8000)
      )
      
      const items = await Promise.race([getItemsPromise, timeoutPromise])
      const item = items?.find((item: any) => item.product_id === id)
      
      if (item) {
        const updatePromise = cartService.updateQuantity(user.id, item.id, quantity + 1)
        const updateTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Update cart timeout')), 8000)
        )
        
        await Promise.race([updatePromise, updateTimeout])
        setQuantity(prev => prev + 1)
        
        // Trigger cart count update
        window.dispatchEvent(new CustomEvent('cartUpdated', { detail: { timestamp: Date.now() } }))
      } else {
        await handleAddToCart(e)
      }
    } catch (error: any) {
      console.error("Failed to update cart:", error)
      const errorMessage = error.message || "Failed to update cart"
      toast.error(errorMessage.includes('timeout') ? "Request timed out. Please try again." : errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleDecrement = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!user) {
      toast.error("Please sign in to update cart")
      navigate("/signin")
      return
    }

    if (loading) return

    try {
      setLoading(true)
      
      // Find the cart item ID with timeout
      const getItemsPromise = cartService.getCartItems(user.id)
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Get cart timeout')), 8000)
      )
      
      const items = await Promise.race([getItemsPromise, timeoutPromise])
      const item = items?.find((item: any) => item.product_id === id)
      
      if (item) {
        if (quantity > 1) {
          const updatePromise = cartService.updateQuantity(user.id, item.id, quantity - 1)
          const updateTimeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Update cart timeout')), 8000)
          )
          
          await Promise.race([updatePromise, updateTimeout])
          setQuantity(prev => prev - 1)
        } else {
          const removePromise = cartService.removeItem(user.id, item.id)
          const removeTimeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Remove cart timeout')), 8000)
          )
          
          await Promise.race([removePromise, removeTimeout])
          setQuantity(0)
        }
        
        // Trigger cart count update
        window.dispatchEvent(new CustomEvent('cartUpdated', { detail: { timestamp: Date.now() } }))
      }
    } catch (error: any) {
      console.error("Failed to update cart:", error)
      const errorMessage = error.message || "Failed to update cart"
      toast.error(errorMessage.includes('timeout') ? "Request timed out. Please try again." : errorMessage)
    } finally {
      setLoading(false)
    }
  }

  // Parse specs if it's a JSON string
  let parsedSpecs: any = null
  if (specs) {
    try {
      parsedSpecs = typeof specs === 'string' ? JSON.parse(specs) : specs
    } catch {
      // If parsing fails, treat as string
    }
  }

  // Extract storage, RAM, warranty from specs
  const storage = parsedSpecs?.storage || parsedSpecs?.Storage || ''
  const ram = parsedSpecs?.ram || parsedSpecs?.RAM || ''
  const warranty = parsedSpecs?.Warranty || parsedSpecs?.warranty || 'Company Warranty'
  const specsText = [storage, ram, warranty].filter(Boolean).join(' • ')

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      whileHover={{ y: -4, transition: { duration: 0.3 } }}
      className="bg-white dark:bg-card rounded-lg overflow-hidden border border-gray-200 dark:border-border hover:shadow-lg transition-all duration-300 cursor-pointer shadow-sm"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Clickable Link Wrapper */}
      <Link to={`/product/${id}`} className="block">
        {/* Image Container - Full Image View */}
        <div className="relative h-48 sm:h-56 md:h-64 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-muted dark:to-muted/50 overflow-hidden flex items-center justify-center p-3 sm:p-4">
          <motion.div
            whileHover={{ scale: 1.1 }}
            transition={{ duration: 0.4 }}
            className="relative w-full h-full"
          >
            <img
              src={image || "/placeholder.svg"}
              alt={name}
              className="object-contain w-full h-full"
            />
          </motion.div>

          {/* Discount Badge - Top Left */}
          {discount && (
            <motion.div
              className="absolute top-3 left-3 z-10"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              <span className="px-2.5 py-1 rounded text-xs font-bold bg-blue-500 text-white shadow-md">
                -{discount}%
              </span>
            </motion.div>
          )}

          {/* Condition Badge - Top Right */}
          <motion.div
            className="absolute top-3 right-3 z-10"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            <span
              className={`px-2.5 py-1 rounded text-xs font-semibold shadow-md ${
                condition === "new" ? "bg-green-500 text-white" : "bg-amber-500 text-white"
              }`}
            >
              {condition === "new" ? "NEW" : "Used"}
            </span>
          </motion.div>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Product Name */}
          <motion.h3
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="font-bold text-base mb-2 text-gray-900 dark:text-white line-clamp-2"
          >
            {name}
          </motion.h3>

          {/* Specs - Clean Format */}
          {specsText && (
            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.15 }}
              className="text-xs text-gray-600 dark:text-gray-400 mb-3"
            >
              {specsText}
            </motion.p>
          )}

          {/* Price */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="flex flex-col gap-1"
          >
            {originalPrice && (
              <span className="text-xs text-gray-400 dark:text-gray-500 line-through">
                {formatCurrency(originalPrice)}
              </span>
            )}
            <span className="text-lg font-bold text-gray-900 dark:text-white">
              {formatCurrency(price)}
            </span>
          </motion.div>
        </div>
      </Link>

      {/* Add to Cart / Quantity Selector - Always visible */}
      <div className="px-3 sm:px-4 pb-3 sm:pb-4 relative z-20" onClick={(e) => e.stopPropagation()}>
        <AnimatePresence mode="wait" initial={false}>
          {!isInCart ? (
            <motion.button
              key="add-button"
              initial={{ opacity: 1, scale: 1 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => {
                console.log('[ProductCard] Button clicked directly', { productId: id, userId: user?.id, loading })
                e.preventDefault()
                e.stopPropagation()
                if (!loading) {
                  handleAddToCart(e)
                }
              }}
              disabled={loading}
              type="button"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-4 py-2.5 flex items-center justify-center gap-2 transition-colors duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed relative z-30 shadow-sm hover:shadow-md"
            >
              {loading ? (
                <>
                  <span className="text-sm">Adding...</span>
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" strokeWidth={2.5} />
                  <span className="text-sm">Add to Cart</span>
                </>
              )}
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
                disabled={loading}
                className="w-8 h-8 rounded-full bg-white dark:bg-gray-900 flex items-center justify-center shadow-sm hover:shadow-md transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
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
                disabled={loading}
                className="w-8 h-8 rounded-full bg-white dark:bg-gray-900 flex items-center justify-center shadow-sm hover:shadow-md transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
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

// Export memoized component for better performance
export default memo(ProductCard)
