import { create } from "zustand"
import { persist } from "zustand/middleware"

interface SupplierUser {
  id: string
  name: string
  email: string
}

interface SupplierState {
  supplier: SupplierUser | null
  token: string | null
  expiresAt: string | null
  isAuthenticated: boolean
  login: (supplier: SupplierUser, token: string, expiresAt: string) => void
  logout: () => void
  isSessionExpired: () => boolean
}

/**
 * Session for the supplier portal, persisted so a refresh does not sign them
 * out. Mirrors how the POS keeps its till session.
 *
 * The token here is only half the story - it is worthless without the matching
 * row in supplier_sessions, and the server re-checks on every request that the
 * account is still enabled. Clearing this store is therefore a local logout;
 * the real revocation is server side.
 */
export const useSupplierStore = create<SupplierState>()(
  persist(
    (set, get) => ({
      supplier: null,
      token: null,
      expiresAt: null,
      isAuthenticated: false,

      login: (supplier, token, expiresAt) =>
        set({ supplier, token, expiresAt, isAuthenticated: true }),

      logout: () =>
        set({ supplier: null, token: null, expiresAt: null, isAuthenticated: false }),

      isSessionExpired: () => {
        const { expiresAt } = get()
        if (!expiresAt) return true
        return new Date(expiresAt).getTime() <= Date.now()
      },
    }),
    { name: "imobile-supplier-session" }
  )
)
