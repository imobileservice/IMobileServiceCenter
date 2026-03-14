"use client"

import { useEffect } from "react"
import { useAuthStore } from "@/lib/store"
import { createClient } from "@/lib/supabase/client"
import { authService } from "@/lib/supabase/services/auth"

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore((state) => state.initialize)
  const setUser = useAuthStore((state) => state.setUser)

  useEffect(() => {
    // Initialize auth state on mount
    initialize()

    // Set up auth state change listener
    const supabase = createClient()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: any, session: any) => {
      if (event === "SIGNED_IN" && session?.user) {
        try {
          const profile = await authService.getProfile(session.user.id)
          setUser({
            id: session.user.id,
            name: profile?.name || session.user.email?.split("@")[0] || "User",
            email: session.user.email || "",
            whatsapp: profile?.whatsapp || "",
          })
        } catch (error) {
          // Silently handle profile fetch errors - user can still use the app
          // Only log in development to reduce console noise
          // MIGRATION: Vite uses import.meta.env.DEV or import.meta.env.MODE
          if (import.meta.env.DEV || import.meta.env.MODE === 'development') {
            console.error("Failed to fetch profile:", error)
          }
          setUser({
            id: session.user.id,
            name: session.user.email?.split("@")[0] || "User",
            email: session.user.email || "",
            whatsapp: "",
          })
        }
      } else if (event === "SIGNED_OUT") {
        // Prevent wiping a valid backend-verified session if Supabase client fails to load (e.g. adblocker)
        const { isAuthenticated, user } = useAuthStore.getState()
        if (isAuthenticated && user) {
          console.log('[AuthProvider] 🛡️ Supabase reported SIGNED_OUT but we have a valid backend session. Ignoring.')
        } else {
          setUser(null)
        }
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [initialize, setUser])

  return <>{children}</>
}

