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
}

export const useCashierStore = create<CashierState>()(
  persist(
    (set) => ({
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
    }),
    {
      name: "cashier-storage",
    }
  )
)
