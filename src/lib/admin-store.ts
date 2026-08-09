import { create } from "zustand"

interface AdminUser {
  id: string
  email: string
  name: string
  role: string
}

interface AdminState {
  user: AdminUser | null
  isAuthenticated: boolean
  login: (email: string, otp: string, userData?: any) => Promise<void>
  logout: () => void
}

/**
 * Who is signed in to the admin panel.
 *
 * The real gate is the server: /api/admin/login only issues a code to, and only
 * verifies, an account with role='admin' (see authenticateAdmin), and the
 * `admins` table carries a CHECK that keeps anything else out. This store just
 * carries the result around the UI — it is not a security boundary, and nothing
 * here should be the only thing standing between a cashier and an admin screen.
 */
export const useAdminStore = create<AdminState>((set) => ({
  user: null,
  isAuthenticated: false,
  login: async (email: string, otp: string, userData?: any) => {
    // OTP-based authentication - userData comes from backend after OTP verification
    if (userData) {
      set({
        user: {
          id: userData.id || "1",
          email: email,
          name: userData.name || "Admin",
          role: String(userData.role || "admin").toLowerCase(),
        },
        isAuthenticated: true,
      })
    } else {
      // Fallback for development/testing
      set({
        user: {
          id: "1",
          email: email,
          name: "Admin",
          role: "admin",
        },
        isAuthenticated: true,
      })
    }
  },
  logout: () => {
    set({
      user: null,
      isAuthenticated: false,
    })
  },
}))
