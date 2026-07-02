import { create } from "zustand"
import { persist } from "zustand/middleware"

interface CashierUser {
  id: string
  email: string
  name: string
  role: string
  shop: string
}

interface TillSession {
  id: string
  token: string
  status: string
  opened_at: string
  expires_at: string
  opening_float: number
  till: {
    id: string
    code: string
    label: string
    shop: string
  }
}

interface CashierState {
  cashier: CashierUser | null
  tillSession: TillSession | null
  isAuthenticated: boolean
  login: (userData: CashierUser, tillSession: TillSession) => void
  logout: () => void
  isTillSessionExpired: () => boolean
}

export const useCashierStore = create<CashierState>()(
  persist(
    (set, get) => ({
      cashier: null,
      tillSession: null,
      isAuthenticated: false,
      login: (userData: CashierUser, tillSession: TillSession) => {
        set({
          cashier: {
            id: userData.id,
            email: userData.email,
            name: userData.name || "Cashier",
            role: userData.role || "cashier",
            shop: userData.shop || tillSession?.till?.shop || "Meegoda",
          },
          tillSession,
          isAuthenticated: true,
        })
      },
      logout: () => {
        set({
          cashier: null,
          tillSession: null,
          isAuthenticated: false,
        })
      },
      isTillSessionExpired: () => {
        const { isAuthenticated, tillSession } = get()
        if (!isAuthenticated || !tillSession?.expires_at) return true

        const expiresAt = new Date(tillSession.expires_at).getTime()
        return Number.isNaN(expiresAt) || Date.now() >= expiresAt
      },
    }),
    {
      name: "cashier-storage",
    }
  )
)
