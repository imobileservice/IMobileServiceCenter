import { useState, useEffect } from 'react'
import { useAuthStore } from '@/lib/store'
import { cartService } from '@/lib/supabase/services/cart'

/**
 * Hook to get the current cart item count for the logged-in user
 * Only works when user is authenticated
 */
export function useCartCount() {
  const user = useAuthStore((state) => state.user)
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setCount(0)
      setLoading(false)
      return
    }

    const loadCartCount = async () => {
      try {
        // Use a shorter timeout for cart count (non-critical)
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Cart count timeout')), 5000)
        )
        
        const itemsPromise = cartService.getCartItems(user.id)
        const items = await Promise.race([itemsPromise, timeoutPromise])
        const totalCount = items?.reduce((sum: number, item: any) => sum + item.quantity, 0) || 0
        setCount(totalCount)
      } catch (error) {
        // Silently fail - don't spam console for non-critical cart count
        if (error instanceof Error && !error.message.includes('timeout')) {
          console.error('Failed to load cart count:', error)
        }
        // Keep previous count on error (don't reset to 0)
      } finally {
        setLoading(false)
      }
    }

    loadCartCount()

    // Listen for cart updates from other components
    const handleCartUpdate = () => {
      loadCartCount()
    }
    window.addEventListener('cartUpdated', handleCartUpdate)

    // Refresh cart count every 15 seconds (reduced frequency to avoid timeouts)
    const interval = setInterval(loadCartCount, 15000)

    return () => {
      clearInterval(interval)
      window.removeEventListener('cartUpdated', handleCartUpdate)
    }
  }, [user])

  return { count, loading }
}

