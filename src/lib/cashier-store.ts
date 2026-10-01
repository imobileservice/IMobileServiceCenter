import { create } from "zustand"
import { persist } from "zustand/middleware"
import { tillSessionToken } from "./session-fetch"

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
        // Mirrored into sessionStorage so session-fetch.ts can put it on every
        // /api/inventory call. That is what lets INVENTORY_API_STRICT be turned
        // on without the POS losing access - see utils/inventory-guard.ts.
        tillSessionToken.set(tillSession?.token || null)

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
        tillSessionToken.set(null)
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
      // The store itself is persisted to localStorage, but the till token is
      // mirrored into sessionStorage, which a reload clears. Put it back as the
      // store rehydrates, or the first request after a refresh would go out
      // without it.
      onRehydrateStorage: () => (state) => {
        tillSessionToken.set(state?.tillSession?.token || null)
      },
    }
  )
)

// A login or logout in another tab replaces or closes this till's session on
// the server. Pick the change up here too, or this tab keeps selling on a
// session the server has already closed and every sale is refused.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === useCashierStore.persist.getOptions().name) {
      void useCashierStore.persist.rehydrate()
    }
  })
}
