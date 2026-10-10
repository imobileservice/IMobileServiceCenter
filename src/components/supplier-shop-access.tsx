import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { isSupplierShopOwner } from '@/config/features'
import { useAdminStore } from '@/lib/admin-store'
import { adminSessionToken, PANEL_SESSION_HEADER } from '@/lib/session-fetch'
import { getApiUrl } from '@/lib/utils/api'

const SupplierShopAccess = createContext({ allowed: false, checking: false })

export const useSupplierShopAccess = () => useContext(SupplierShopAccess)

export function SupplierShopAccessProvider({ children }: { children: ReactNode }) {
  const user = useAdminStore((state) => state.user)
  const authenticated = useAdminStore((state) => state.isAuthenticated)
  const token = adminSessionToken.get()
  const candidate = authenticated && isSupplierShopOwner(user) && Boolean(token)
  const [verified, setVerified] = useState<{ token: string | null; allowed: boolean }>({ token: null, allowed: false })

  useEffect(() => {
    if (!candidate || !token) {
      setVerified({ token: null, allowed: false })
      return
    }

    let active = true
    let requestId = 0
    const check = async () => {
      const current = ++requestId
      let allowed = false
      try {
        const response = await fetch(getApiUrl('/api/admin/supplier-shop-access'), {
          headers: { [PANEL_SESSION_HEADER]: token },
          cache: 'no-store',
        })
        allowed = response.ok && (await response.json()).allowed === true
      } catch {
        // An unavailable server cannot confirm permission.
      }
      if (active && current === requestId) setVerified({ token, allowed })
    }

    void check()
    const refresh = () => {
      if (document.visibilityState === 'visible') void check()
    }
    const interval = window.setInterval(refresh, 30_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      active = false
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [candidate, token])

  return (
    <SupplierShopAccess.Provider value={{
      allowed: candidate && verified.token === token && verified.allowed,
      checking: candidate && verified.token !== token,
    }}>
      {children}
    </SupplierShopAccess.Provider>
  )
}
