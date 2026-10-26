import { useCallback, useEffect, useState } from 'react'
import { getApiUrl } from '@/lib/utils/api'
import { parseDeliveryFee } from '@/lib/utils/order-totals'

export function useDeliveryFee() {
  const [fee, setFee] = useState<number | null>(null)
  const [error, setError] = useState(false)
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(getApiUrl('/api/orders/delivery-fee'), { cache: 'no-store' })
      if (!response.ok) throw new Error('Unable to load delivery fee')
      const data = await response.json()
      const value = parseDeliveryFee(data.delivery_fee)
      setFee(value)
      setError(false)
      return value
    } catch {
      setError(true)
      return null
    }
  }, [])
  useEffect(() => {
    void refresh()
    const reload = () => { void refresh() }
    window.addEventListener('focus', reload)
    const interval = window.setInterval(reload, 30000)
    return () => {
      window.removeEventListener('focus', reload)
      window.clearInterval(interval)
    }
  }, [refresh])
  return { fee, error, refresh }
}
