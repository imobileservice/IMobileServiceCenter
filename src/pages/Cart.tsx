"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Link, useNavigate } from "react-router-dom"
import { Trash2, Plus, Minus, ShoppingBag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/lib/store"
import { cartService } from "@/lib/supabase/services/cart"
import { toast } from "sonner"
import { formatCurrency } from "@/lib/utils/currency"
import type { Database } from "@/lib/supabase/types"

type CartItem = Database['public']['Tables']['cart_items']['Row'] & {
  products: {
    id: string
    name: string
    price: number
    image: string | null
    condition: 'new' | 'used'
    stock: number
  }
  variant_selected?: any
}

export default function CartPage() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const [items, setItems] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(true)

  // Redirect if not logged in
  useEffect(() => {
    if (!user) {
      navigate("/signin")
      return
    }
  }, [user, navigate])

  // Load cart items from database
  useEffect(() => {
    if (!user) return

    const loadCart = async () => {
      try {
        setLoading(true)

        // Use a timeout for cart loading
        const cartItemsPromise = cartService.getCartItems(user.id)
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Cart loading timeout')), 20000)
        )

        const cartItems = await Promise.race([cartItemsPromise, timeoutPromise])
        setItems((cartItems || []) as CartItem[])
      } catch (error: any) {
        console.error("Failed to load cart:", error)
        const errorMessage = error.message || "Failed to load cart items"
        if (!errorMessage.includes('timeout')) {
          toast.error("Failed to load cart items. Please refresh the page.")
        } else {
          toast.error("Cart loading timed out. Please check your connection.")
        }
        setItems([]) // Show empty cart on error
      } finally {
        setLoading(false)
      }
    }

    loadCart()

    // Listen for cart updates
    const handleCartUpdate = () => {
      loadCart()
    }
    window.addEventListener('cartUpdated', handleCartUpdate)

    return () => {
      window.removeEventListener('cartUpdated', handleCartUpdate)
    }
  }, [user])

  const removeFromCart = async (itemId: string) => {
    if (!user) return

    try {
      await cartService.removeItem(user.id, itemId)
      setItems(items.filter(item => item.id !== itemId))
      toast.success("Item removed from cart")
    } catch (error: any) {
      console.error("Failed to remove item:", error)
      toast.error("Failed to remove item")
    }
  }

  const updateQuantity = async (itemId: string, quantity: number) => {
    if (!user) return

    try {
      if (quantity <= 0) {
        await removeFromCart(itemId)
        return
      }

      await cartService.updateQuantity(user.id, itemId, quantity)
      setItems(items.map(item =>
        item.id === itemId ? { ...item, quantity } : item
      ))
    } catch (error: any) {
      console.error("Failed to update quantity:", error)
      toast.error("Failed to update quantity")
    }
  }

  const getPrice = (item: CartItem) => {
    // Check if variant_selected is an object and has a price property
    if (item.variant_selected && typeof item.variant_selected === 'object' && 'price' in item.variant_selected) {
      return Number((item.variant_selected as any).price) || Number(item.products.price)
    }
    return Number(item.products.price)
  }

  const getTotalPrice = () => {
    return items.reduce((total, item) => {
      return total + (getPrice(item) * item.quantity)
    }, 0)
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: {
      opacity: 1,
      x: 0,
      transition: { duration: 0.3 },
    },
    exit: {
      opacity: 0,
      x: 20,
      transition: { duration: 0.2 },
    },
  }

  if (!user) {
    return null // Will redirect
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center">
            <p className="text-muted-foreground">Loading cart...</p>
          </div>
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center">
            <ShoppingBag className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h1 className="text-3xl font-bold mb-2">Your cart is empty</h1>
            <p className="text-muted-foreground mb-8">Add some amazing phones to get started!</p>
            <Link to="/shop">
              <Button size="lg">Continue Shopping</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-4xl font-bold mb-8">Shopping Cart</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Cart Items */}
          <div className="lg:col-span-2">
            <motion.div className="space-y-4" variants={containerVariants} initial="hidden" animate="visible">
              {items.map((item) => (
                <motion.div
                  key={item.id}
                  variants={itemVariants}
                  className="bg-card border border-border rounded-lg p-4 flex flex-col sm:flex-row gap-4"
                >
                  <div className="flex gap-4 flex-1">
                    {/* Image */}
                    <div className="relative w-24 h-24 bg-muted rounded-lg overflow-hidden flex-shrink-0">
                      <img src={item.products.image || "/placeholder.svg"} alt={item.products.name} className="object-cover w-full h-full" />
                    </div>

                    {/* Details */}
                    <div className="flex-1">
                      <h3 className="font-semibold mb-1">{item.products.name}</h3>
                      <div className="text-sm text-muted-foreground mb-2 space-y-1">
                        <p>Condition: {item.products.condition === "new" ? "New" : "Used"}</p>
                        {/* Show variant details if available */}
                        {item.variant_selected && typeof item.variant_selected === 'object' && (
                          <>
                            {(item.variant_selected as any).storage && <p>Storage: {(item.variant_selected as any).storage}</p>}
                            {(item.variant_selected as any).ram && <p>RAM: {(item.variant_selected as any).ram}</p>}
                            {(item.variant_selected as any).color && <p>Color: {(item.variant_selected as any).color}</p>}
                          </>
                        )}
                      </div>
                      <p className="font-bold text-primary">{formatCurrency(getPrice(item))}</p>
                    </div>
                  </div>

                  {/* Quantity Controls */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between mt-2 sm:mt-0 border-t sm:border-t-0 pt-4 sm:pt-0 border-border">
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="p-2 hover:bg-muted rounded-lg transition-colors text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <div className="flex items-center gap-2 bg-muted rounded-lg p-1">
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className="p-1 hover:bg-background rounded transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-8 text-center font-semibold">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        className="p-1 hover:bg-background rounded transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    <p className="font-bold">{formatCurrency(getPrice(item) * item.quantity)}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            <Link to="/shop" className="inline-block mt-8">
              <Button variant="outline">Continue Shopping</Button>
            </Link>
          </div>

          {/* Order Summary */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-muted border border-border rounded-lg p-6 h-fit sticky top-20"
          >
            <h2 className="text-xl font-bold mb-6">Order Summary</h2>

            <div className="space-y-4 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(getTotalPrice())}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Shipping</span>
                <span>{getTotalPrice() > 15000 ? "Free" : formatCurrency(500)}</span>
              </div>
              {/* Tax removed as requested */}

              <div className="border-t border-border pt-4 flex justify-between font-bold text-lg">
                <span>Total</span>
                <span className="text-primary">
                  {formatCurrency(getTotalPrice() + (getTotalPrice() > 15000 ? 0 : 500))}
                </span>
              </div>
            </div>

            <Link to="/checkout" className="w-full">
              <Button className="w-full" size="lg">
                Proceed to Checkout
              </Button>
            </Link>

            <p className="text-xs text-muted-foreground text-center mt-4">Free shipping on orders over Rs. 15,000</p>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
