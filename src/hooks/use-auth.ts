"use client"

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { authService } from '@/lib/supabase/services/auth'
import type { User } from '@supabase/supabase-js'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)

  useEffect(() => {
    const supabase = createClient()

    // Get initial session
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
      
      if (session?.user) {
        try {
          const userProfile = await authService.getProfile(session.user.id)
          setProfile(userProfile)
        } catch (err) {
          console.error('Failed to fetch profile:', err)
        }
      }
      
      setLoading(false)
    }

    getSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null)
        
        if (session?.user) {
          try {
            const userProfile = await authService.getProfile(session.user.id)
            setProfile(userProfile)
          } catch (err) {
            console.error('Failed to fetch profile:', err)
          }
        } else {
          setProfile(null)
        }
        
        setLoading(false)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    const { user } = await authService.signIn(email, password)
    if (user) {
      const userProfile = await authService.getProfile(user.id)
      setProfile(userProfile)
    }
    return user
  }

  const signUp = async (email: string, password: string, name?: string) => {
    const { user } = await authService.signUp(email, password, name)
    return user
  }

  const signOut = async () => {
    await authService.signOut()
    setUser(null)
    setProfile(null)
  }

  const updateProfile = async (updates: {
    name?: string
    whatsapp?: string
    avatar_url?: string
  }) => {
    if (!user) throw new Error('User must be logged in')
    
    const updated = await authService.updateProfile(user.id, updates)
    setProfile(updated)
    return updated
  }

  return {
    user,
    profile,
    loading,
    signIn,
    signUp,
    signOut,
    updateProfile,
    isAuthenticated: !!user,
  }
}
