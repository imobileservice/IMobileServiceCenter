import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { useAdminUnlock } from "./admin-unlock"
import { adminSessionToken } from "./session-fetch"
import { getApiUrl } from "./utils/api"

interface AdminUser {
  id: string
  email: string
  name: string
  role: string
}

interface AdminState {
  user: AdminUser | null
  isAuthenticated: boolean
  login: (email: string, otp: string, userData?: any, token?: string) => Promise<void>
  logout: () => void
}

/**
 * Who is signed in to the admin panel.
 *
 * The real gate is the server, and as of the assistant-admin work that is now
 * true in both directions: /api/admin/login only issues a code to an account
 * with role='admin', and every /api/admin route past the login is checked
 * against a server-side session (see server/api/utils/panel-auth.ts). The token
 * for that session is held in sessionStorage by session-fetch.ts, which
 * attaches it to every API call this app makes.
 *
 * This store is still just the UI's copy of who that is. It persists so a page
 * refresh does not bounce the administrator back to the login screen - but it
 * is persisted to sessionStorage alongside the token, so the two cannot fall
 * out of step: a tab that has the user has the token, and a tab that has
 * neither shows the login form.
 */
export const useAdminStore = create<AdminState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      login: async (email: string, otp: string, userData?: any, token?: string) => {
        if (token) adminSessionToken.set(token)

        set({
          user: {
            id: userData?.id || "1",
            email,
            name: userData?.name || "Admin",
            role: String(userData?.role || "admin").toLowerCase(),
          },
          isAuthenticated: true,
        })
      },
      logout: () => {
        // Tell the server first, so the session is revoked rather than left to
        // age out; the local clear happens either way.
        try {
          void fetch(getApiUrl("/api/admin/logout"), { method: "POST" }).catch(() => {})
        } catch {
          /* offline - the token is dropped locally regardless */
        }

        adminSessionToken.set(null)

        // Signing out has to drop the confirmed password too, or the next person at
        // this machine inherits the ability to read shop credentials back.
        useAdminUnlock.getState().clear()
        set({
          user: null,
          isAuthenticated: false,
        })
      },
    }),
    {
      name: "imsc.panel.admin.user",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
)
