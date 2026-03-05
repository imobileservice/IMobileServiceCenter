import { useEffect, useRef } from 'react'

/**
 * Hook to listen for real-time updates from admin actions
 * This allows user-facing pages to automatically refresh when admin makes changes
 */
export function useRealtimeUpdates(
  onUpdate: () => void,
  dependencies: any[] = []
) {
  // Use ref to store the latest callback
  const onUpdateRef = useRef(onUpdate)
  const lastUpdateTimeRef = useRef<number>(0)
  
  // Update ref when callback changes
  useEffect(() => {
    onUpdateRef.current = onUpdate
  }, [onUpdate])

  useEffect(() => {
    // Listen for product updates
    const handleProductUpdate = (e?: Event | CustomEvent) => {
      const timestamp = (e as CustomEvent)?.detail?.timestamp || Date.now()
      // Prevent duplicate updates within 1 second
      if (timestamp - lastUpdateTimeRef.current < 1000) {
        console.log('⏭️ Skipping duplicate update')
        return
      }
      lastUpdateTimeRef.current = timestamp
      console.log('🔄 Product update detected, refreshing...', { timestamp })
      onUpdateRef.current()
    }

    // Listen for order updates
    const handleOrderUpdate = (e?: Event | CustomEvent) => {
      const timestamp = (e as CustomEvent)?.detail?.timestamp || Date.now()
      if (timestamp - lastUpdateTimeRef.current < 1000) return
      lastUpdateTimeRef.current = timestamp
      console.log('🔄 Order update detected, refreshing...')
      onUpdateRef.current()
    }

    // Listen for customer updates
    const handleCustomerUpdate = (e?: Event | CustomEvent) => {
      const timestamp = (e as CustomEvent)?.detail?.timestamp || Date.now()
      if (timestamp - lastUpdateTimeRef.current < 1000) return
      lastUpdateTimeRef.current = timestamp
      console.log('🔄 Customer update detected, refreshing...')
      onUpdateRef.current()
    }

    // Listen for message updates
    const handleMessageUpdate = (e?: Event | CustomEvent) => {
      const timestamp = (e as CustomEvent)?.detail?.timestamp || Date.now()
      if (timestamp - lastUpdateTimeRef.current < 1000) return
      lastUpdateTimeRef.current = timestamp
      console.log('🔄 Message update detected, refreshing...')
      onUpdateRef.current()
    }

    // Listen for category updates
    const handleCategoryUpdate = (e?: Event | CustomEvent) => {
      const timestamp = (e as CustomEvent)?.detail?.timestamp || Date.now()
      if (timestamp - lastUpdateTimeRef.current < 1000) return
      lastUpdateTimeRef.current = timestamp
      console.log('🔄 Category update detected, refreshing...')
      onUpdateRef.current()
    }

    // Listen for general admin updates
    const handleAdminUpdate = (e?: Event | CustomEvent) => {
      const timestamp = (e as CustomEvent)?.detail?.timestamp || Date.now()
      if (timestamp - lastUpdateTimeRef.current < 1000) return
      lastUpdateTimeRef.current = timestamp
      console.log('🔄 Admin update detected, refreshing...')
      onUpdateRef.current()
    }

    // Register event listeners with capture phase to ensure they fire
    window.addEventListener('productUpdated', handleProductUpdate as EventListener, true)
    window.addEventListener('categoryUpdated', handleCategoryUpdate as EventListener, true)
    window.addEventListener('orderUpdated', handleOrderUpdate as EventListener, true)
    window.addEventListener('customerUpdated', handleCustomerUpdate as EventListener, true)
    window.addEventListener('messageUpdated', handleMessageUpdate as EventListener, true)
    window.addEventListener('adminUpdated', handleAdminUpdate as EventListener, true)

    // Also listen to localStorage changes for cross-tab communication
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'productUpdated' || e.key === 'categoryUpdated' || e.key === 'orderUpdated' || 
          e.key === 'customerUpdated' || e.key === 'messageUpdated' || 
          e.key === 'adminUpdated') {
        const timestamp = e.newValue ? parseInt(e.newValue) : Date.now()
        if (timestamp - lastUpdateTimeRef.current < 1000) return
        lastUpdateTimeRef.current = timestamp
        console.log(`🔄 Cross-tab update detected (${e.key}), refreshing...`)
        onUpdateRef.current()
      }
    }
    
    window.addEventListener('storage', handleStorageChange)

    // Cleanup
    return () => {
      window.removeEventListener('productUpdated', handleProductUpdate as EventListener, true)
      window.removeEventListener('categoryUpdated', handleCategoryUpdate as EventListener, true)
      window.removeEventListener('orderUpdated', handleOrderUpdate as EventListener, true)
      window.removeEventListener('customerUpdated', handleCustomerUpdate as EventListener, true)
      window.removeEventListener('messageUpdated', handleMessageUpdate as EventListener, true)
      window.removeEventListener('adminUpdated', handleAdminUpdate as EventListener, true)
      window.removeEventListener('storage', handleStorageChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies]) // Only depend on the dependencies array, not onUpdate
}

/**
 * Utility function to dispatch update events
 * This is called by admin actions to notify all pages
 */
export function notifyUpdate(type: 'product' | 'category' | 'order' | 'customer' | 'message' | 'admin' = 'admin') {
  const eventName = `${type}Updated` as 
    | 'productUpdated'
    | 'categoryUpdated'
    | 'orderUpdated' 
    | 'customerUpdated' 
    | 'messageUpdated' 
    | 'adminUpdated'
  
  console.log(`📢 Dispatching ${eventName} event`)
  
  // Dispatch custom event with detail for better compatibility
  const event = new CustomEvent(eventName, { 
    detail: { timestamp: Date.now(), type },
    bubbles: true,
    cancelable: true
  })
  window.dispatchEvent(event)
  
  // Also dispatch a general admin update
  if (type !== 'admin') {
    const adminEvent = new CustomEvent('adminUpdated', {
      detail: { timestamp: Date.now(), type },
      bubbles: true,
      cancelable: true
    })
    window.dispatchEvent(adminEvent)
  }
  
  // Use localStorage for cross-tab communication
  try {
    localStorage.setItem(eventName, String(Date.now()))
    // Remove it immediately to trigger storage event
    setTimeout(() => {
      localStorage.removeItem(eventName)
    }, 100)
  } catch (e) {
    // localStorage might be disabled, that's okay
    console.warn('localStorage not available for cross-tab updates:', e)
  }
}

