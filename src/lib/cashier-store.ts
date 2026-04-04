import { create } from "zustand"
import { persist } from "zustand/middleware"

interface CashierUser {
  id: string
  email: string
  name: string
  role: string
}

interface CashierState {
  cashier: CashierUser | null
  isAuthenticated: boolean
  login: (email: string, otp: string, userData: any) => void
  logout: () => void
}

export const useCashierStore = create<CashierState>()(
  persist(
    (set) => ({
      cashier: null,
      isAuthenticated: false,
      login: (email: string, otp: string, userData: any) => {
        if (userData) {
          set({
            cashier: {
              id: userData.id,
              email: userData.email || email,
              name: userData.name || "Cashier",
              role: userData.role || "cashier",
            },
            isAuthenticated: true,
          })
        }
      },
      logout: () => {
        set({
          cashier: null,
          isAuthenticated: false,
        })
      },
    }),
    {
      name: "cashier-storage",
    }
  )
)
