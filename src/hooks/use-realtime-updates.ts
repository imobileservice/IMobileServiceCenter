import { useAutoRefresh } from './use-auto-refresh'

/**
 * Refreshes user-facing pages when products, categories or orders change,
 * whether the change came from this browser or from another device.
 */
export function useRealtimeUpdates(
  onUpdate: () => void,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _dependencies: any[] = []
) {
  useAutoRefresh(onUpdate, { intervalMs: 60000 })
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

