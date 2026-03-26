"use client"

import { useEffect, useState } from 'react'
import { cartService } from '@/lib/supabase/services/cart'
import { authService } from '@/lib/supabase/services/auth'
import { createClient } from '@/lib/supabase/client'

interface CartItem {
  id: string
  user_id: string
  product_id: string
  quantity: number
  products: {
    id: string
    name: string
    price: number
    image: string | null
    condition: 'new' | 'used'
    stock: number
  }
}

export function useCart(realtime = false) {
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    const initializeCart = async () => {
      try {
        const user = await authService.getCurrentUser()
        if (!user) {
          setCartItems([])
          setLoading(false)
          return
        }

        setUserId(user.id)
        const items = await cartService.getCartItems(user.id)
        if (mounted) {
          setCartItems(items as CartItem[])
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

    initializeCart()

    // Real-time subscription
    if (realtime && userId) {
      const supabase = createClient()
      const channel = supabase
        .channel('cart-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'cart_items',
            filter: `user_id=eq.${userId}`,
          },
          async () => {
            const items = await cartService.getCartItems(userId)
            if (mounted) {
              setCartItems(items as CartItem[])
            }
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
  }, [realtime, userId])

  const addItem = async (productId: string, quantity = 1) => {
    if (!userId) throw new Error('User must be logged in')
    
    try {
      setError(null)
      await cartService.addItem(userId, productId, quantity)
      const updated = await cartService.getCartItems(userId)
      setCartItems(updated as CartItem[])
    } catch (err) {
      setError(err as Error)
      throw err
    }
  }

  const updateQuantity = async (itemId: string, quantity: number) => {
    if (!userId) throw new Error('User must be logged in')
    
    try {
      setError(null)
      await cartService.updateQuantity(userId, itemId, quantity)
      const updated = await cartService.getCartItems(userId)
      setCartItems(updated as CartItem[])
    } catch (err) {
      setError(err as Error)
      throw err
    }
  }

  const removeItem = async (itemId: string) => {
    if (!userId) throw new Error('User must be logged in')
    
    try {
      setError(null)
      await cartService.removeItem(userId, itemId)
      const updated = await cartService.getCartItems(userId)
      setCartItems(updated as CartItem[])
    } catch (err) {
      setError(err as Error)
      throw err
    }
  }

  const clearCart = async () => {
    if (!userId) throw new Error('User must be logged in')
    
    try {
      setError(null)
      await cartService.clearCart(userId)
      setCartItems([])
    } catch (err) {
      setError(err as Error)
      throw err
    }
  }

  const totalPrice = cartItems.reduce((sum, item) => {
    return sum + (item.products.price * item.quantity)
  }, 0)

  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0)

  return {
    cartItems,
    loading,
    error,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    totalPrice,
    itemCount,
    refetch: async () => {
      if (userId) {
        const items = await cartService.getCartItems(userId)
        setCartItems(items as CartItem[])
      }
    },
  }
}
