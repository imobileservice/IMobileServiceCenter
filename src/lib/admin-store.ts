import { create } from "zustand"

interface AdminUser {
  id: string
  email: string
  name: string
}

interface AdminState {
  user: AdminUser | null
  isAuthenticated: boolean
  login: (email: string, otp: string, userData?: any) => Promise<void>
  logout: () => void
}

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
