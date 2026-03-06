import { create } from "zustand"
import { getApiUrl } from './utils/api'

export interface CartItem {
  id: string
  name: string
  price: number
  image: string
  quantity: number
  condition: "new" | "used"
}

export interface User {
  id: string
  name: string
  email: string
  whatsapp: string
}

interface CartStore {
  items: CartItem[]
  addToCart: (item: CartItem) => void
  removeFromCart: (id: string) => void
  updateQuantity: (id: string, quantity: number) => void
  clearCart: () => void
  getTotalPrice: () => number
}

interface AuthStore {
  user: User | null
  isAuthenticated: boolean
  setUser: (user: User | null) => void
  logout: () => Promise<void>
  initialize: () => Promise<void>
}

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  addToCart: (item) =>
    set((state) => {
      const existing = state.items.find((i) => i.id === item.id)
      if (existing) {
        return {
          items: state.items.map((i) => (i.id === item.id ? { ...i, quantity: i.quantity + item.quantity } : i)),
        }
      }
      return { items: [...state.items, item] }
    }),
  removeFromCart: (id) =>
    set((state) => ({
      items: state.items.filter((i) => i.id !== id),
    })),
  updateQuantity: (id, quantity) =>
    set((state) => ({
      items: state.items
        .map((i) => (i.id === id ? { ...i, quantity: Math.max(0, quantity) } : i))
        .filter((i) => i.quantity > 0),
    })),
  clearCart: () => set({ items: [] }),
  getTotalPrice: () => {
    return get().items.reduce((total, item) => total + item.price * item.quantity, 0)
  },
}))

let isInitializing = false

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  isAuthenticated: false,
  setUser: (user) => {
    const newState = { user, isAuthenticated: !!user }
    set(newState)
    console.log('[AuthStore] setUser called:', newState)

    // Expose to window for debugging
    if (typeof window !== 'undefined') {
      (window as any).__AUTH_STORE_DEBUG__ = {
        user: newState.user,
        isAuthenticated: newState.isAuthenticated,
        timestamp: new Date().toISOString()
      }
    }
  },
  logout: async () => {
    try {
      const { authService } = await import('./supabase/services/auth')
      await authService.signOut()
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      set({ user: null, isAuthenticated: false })
    }
  },
  initialize: async () => {
    // Prevent concurrent initialization (React.StrictMode double mount)
    if (isInitializing) {
      console.log('[AuthStore] ⏭️ Initialization already in progress, skipping...')
      return
    }

    // Prevent re-initialization if user is already set
    const currentState = get()
    if (currentState.user && currentState.isAuthenticated) {
      console.log('[AuthStore] ⏭️ Skipping initialization - user already authenticated:', currentState.user.id)
      return
    }

    isInitializing = true
    try {
      console.log('[AuthStore] Initializing auth state...')
      const { createClient } = await import('./supabase/client')
      const { authService } = await import('./supabase/services/auth')
      const supabase = createClient()

      // Strategy: Check backend database first using stored token, then fallback to localStorage
      // This avoids hanging on getSession() which might timeout

      console.log('[AuthStore] Checking backend database for session...')
      try {
        // Get stored session token from localStorage
        const storedToken = typeof window !== 'undefined'
          ? localStorage.getItem('supabase_session_token')
          : null

        const headers: HeadersInit = {
          'Content-Type': 'application/json',
        }

        // Add token to header if available
        if (storedToken) {
          headers['x-session-token'] = storedToken
        }

        const apiUrl = getApiUrl('/api/auth/session' + (storedToken ? `?token=${encodeURIComponent(storedToken)}` : ''))
        console.log('[AuthStore] 🌐 Fetching session from:', apiUrl)

        const response = await fetch(apiUrl, {
          method: 'GET',
          headers,
          credentials: 'include',
          cache: 'no-store',
        })

        if (response.ok) {
          const sessionData = await response.json()
          if (sessionData?.user && sessionData?.session) {
            console.log('[AuthStore] ✅ Session found in backend!')

            // Update stored token in localStorage
            if (sessionData.session.access_token) {
              try {
                if (typeof window !== 'undefined') {
                  localStorage.setItem('supabase_session_token', sessionData.session.access_token)
                }
              } catch (e) {
                // Ignore localStorage errors
              }
            }

            // Set user state IMMEDIATELY (don't wait for setSession)
            // This ensures the user is logged in even if setSession fails
            let userState = {
              id: sessionData.user.id,
              name: sessionData.user.email?.split('@')[0] || 'User',
              email: sessionData.user.email || '',
              whatsapp: '',
            }

            // Try to fetch profile (with timeout to prevent hanging)
            try {
              const profilePromise = authService.getProfile(sessionData.user.id)
              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Profile fetch timeout')), 5000)
              )

              const profile = await Promise.race([profilePromise, timeoutPromise]) as any
              if (profile) {
                userState = {
                  id: sessionData.user.id,
                  name: profile?.name || sessionData.user.email?.split('@')[0] || 'User',
                  email: sessionData.user.email || '',
                  whatsapp: profile?.whatsapp || '',
                }
              }
            } catch (profileError: any) {
              // Profile fetch failed or timed out - use basic user info
              console.warn('[AuthStore] Profile fetch failed, using basic user info:', profileError.message)
            }

            // Set user state - this is the critical part
            const newState = {
              user: userState,
              isAuthenticated: true,
            }

            console.log('[AuthStore] 🔄 Setting user state:', newState)
            set(newState)

            // Verify state was set
            const verifyState = useAuthStore.getState()
            console.log('[AuthStore] ✅ User state set! Verification:', {
              user: verifyState.user,
              isAuthenticated: verifyState.isAuthenticated,
              userId: verifyState.user?.id
            })

            // Expose to window for debugging
            if (typeof window !== 'undefined') {
              (window as any).__AUTH_STORE_DEBUG__ = {
                user: newState.user,
                isAuthenticated: newState.isAuthenticated,
                timestamp: new Date().toISOString()
              }
              console.log('[AuthStore] 💡 Debug: Check window.__AUTH_STORE_DEBUG__ in console')
            }

            // Try to set session in Supabase client (non-blocking, fire and forget)
            if (sessionData.session.access_token && sessionData.session.refresh_token) {
              // Fire and forget - don't wait for this
              ; (async () => {
                try {
                  const setSessionPromise = supabase.auth.setSession({
                    access_token: sessionData.session.access_token,
                    refresh_token: sessionData.session.refresh_token,
                  })

                  const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Timeout')), 1000)
                  )

                  await Promise.race([setSessionPromise, timeoutPromise])
                  console.log('[AuthStore] ✅ Session also set in Supabase client')
                } catch (setError: any) {
                  // Silently ignore - user state is already set, this is just for Supabase client
                  if (setError.message !== 'Timeout') {
                    console.log('[AuthStore] Session not set in Supabase client (non-fatal):', setError.message)
                  }
                }
              })()
            }

            return // Exit early - user is authenticated
          }
        } else if (response.status === 401) {
          console.log('[AuthStore] ⚠️ No session in backend, checking localStorage...')
        } else {
          console.warn('[AuthStore] ⚠️ Backend session check failed:', response.status, '- checking localStorage...')
        }
      } catch (fetchError: any) {
        console.warn('[AuthStore] ⚠️ Backend check failed (non-fatal):', fetchError.message, '- checking localStorage...')
      }

      // Fallback: Check localStorage (with timeout)
      console.log('[AuthStore] Checking localStorage for session...')
      try {
        const getSessionPromise = supabase.auth.getSession()
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 5000)
        )

        const { data: { session }, error: sessionError } = await Promise.race([
          getSessionPromise,
          timeoutPromise
        ]) as any

        if (sessionError) {
          console.error('[AuthStore] Error getting session:', sessionError)
        }

        if (session?.user) {
          console.log('[AuthStore] ✅ Session found in localStorage!')
          try {
            const profile = await authService.getProfile(session.user.id)
            set({
              user: {
                id: session.user.id,
                name: profile?.name || session.user.email?.split('@')[0] || 'User',
                email: session.user.email || '',
                whatsapp: profile?.whatsapp || '',
              },
              isAuthenticated: true,
            })
            console.log('[AuthStore] ✅ User state set from localStorage session')
            return
          } catch (profileError) {
            set({
              user: {
                id: session.user.id,
                name: session.user.email?.split('@')[0] || 'User',
                email: session.user.email || '',
                whatsapp: '',
              },
              isAuthenticated: true,
            })
            console.log('[AuthStore] ✅ User state set from localStorage session (no profile)')
            return
          }
        }
      } catch (err: any) {
        if (err.message === 'Timeout') {
          console.warn('[AuthStore] ⚠️ getSession() timed out')
        } else {
          console.warn('[AuthStore] ⚠️ getSession() failed:', err.message)
        }
      }

      // No session found anywhere - only reset if we don't already have a user
      const finalState = get()
      if (!finalState.user) {
        console.log('[AuthStore] ❌ No session found - user not authenticated')
        set({ user: null, isAuthenticated: false })
      } else {
        console.log('[AuthStore] ✅ User already set, not resetting state')
      }
    } catch (error: any) {
      console.error('[AuthStore] ❌ Auth initialization error:', error)
      // Only reset if we don't already have a user
      const finalState = get()
      if (!finalState.user) {
        set({ user: null, isAuthenticated: false })
      }
    } finally {
      isInitializing = false
    }
  },
}))

// Expose AuthStore to window for debugging in browser console
if (typeof window !== 'undefined') {
  (window as any).AuthStore = {
    getState: () => useAuthStore.getState(),
    getUser: () => useAuthStore.getState().user,
    isAuthenticated: () => useAuthStore.getState().isAuthenticated,
    subscribe: (callback: (state: AuthStore) => void) => useAuthStore.subscribe(callback),
  }
  console.log('💡 Debug: AuthStore exposed to window. Try: AuthStore.getState() or AuthStore.getUser()')
}
