import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { assistantSessionToken } from "./session-fetch"
import { getApiUrl } from "./utils/api"

export interface AssistantUser {
  id: string
  email: string
  name: string
  role: "assistant_admin"
  permissions: Record<string, boolean>
  mustChangePassword: boolean
}

interface AssistantState {
  user: AssistantUser | null
  isAuthenticated: boolean
  /** False until the first /session check has answered. */
  ready: boolean
  login: (user: AssistantUser, token: string) => void
  logout: () => void
  /** Re-read the account from the server; returns false if the session is gone. */
  refresh: () => Promise<boolean>
  can: (permission: string) => boolean
}

/**
 * The assistant admin's session, as the UI sees it.
 *
 * Nothing here is a security boundary. `can()` decides which links to draw and
 * which buttons to enable; the server decides what actually happens, and every
 * assistant route names the permission it requires (see server/api/assistant).
 * If the two ever disagree, the server wins and the UI shows the refusal.
 *
 * refresh() is what keeps them from disagreeing for long: every assistant page
 * calls it on mount, so a permission an administrator switched off, or an
 * account they suspended, takes effect on the next page view rather than at
 * token expiry.
 */
export const useAssistantStore = create<AssistantState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      ready: false,

      login: (user: AssistantUser, token: string) => {
        assistantSessionToken.set(token)
        set({ user, isAuthenticated: true, ready: true })
      },

      logout: () => {
        try {
          void fetch(getApiUrl("/api/assistant/logout"), { method: "POST" }).catch(() => {})
        } catch {
          /* offline - the token is dropped locally regardless */
        }
        assistantSessionToken.set(null)
        set({ user: null, isAuthenticated: false, ready: true })
      },

      refresh: async () => {
        try {
          const response = await fetch(getApiUrl("/api/assistant/session"))
          if (!response.ok) {
            assistantSessionToken.set(null)
            set({ user: null, isAuthenticated: false, ready: true })
            return false
          }

          const { data } = await response.json()

          // An administrator opening an assistant screen is answered by the same
          // endpoint. They are not an assistant session, so they are not signed
          // in to this panel - the guard sends them back to their own.
          if (data?.type !== "assistant") {
            set({ user: null, isAuthenticated: false, ready: true })
            return false
          }

          set({
            user: {
              id: data.id,
              email: data.email,
              name: data.name || data.email,
              role: "assistant_admin",
              permissions: data.permissions || {},
              mustChangePassword: Boolean(data.mustChangePassword),
            },
            isAuthenticated: true,
            ready: true,
          })
          return true
        } catch {
          // A network blip must not sign anyone out; the guard keeps showing
          // what it has and the next refresh settles it.
          set({ ready: true })
          return get().isAuthenticated
        }
      },

      can: (permission: string) => get().user?.permissions?.[permission] === true,
    }),
    {
      name: "imsc.panel.assistant.user",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
)
