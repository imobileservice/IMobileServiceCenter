"use client"

import { useEffect, useState } from "react"
import { Navigate, useLocation } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useSupplierStore } from "@/lib/supplier-store"
import { supplierPortalService } from "@/lib/services/supplier-portal.service"

/**
 * Gate for everything under /supplier.
 *
 * The persisted store is only a hint: it lives in localStorage, so anyone can
 * type a token into it. Before a single product is rendered this asks the API
 * to confirm the session (GET /api/supplier/session, which sits behind
 * requireSupplier), and a rejected token is cleared and bounced to the login
 * screen. Nothing of the portal is painted until that answer comes back, so a
 * forged or stale session never sees another shop's catalogue - not even for
 * the frame before a redirect.
 *
 * The server remains the real authority; this only stops the portal from
 * showing a shell it has no right to.
 */
export default function SupplierGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const token = useSupplierStore((state) => state.token)
  const isAuthenticated = useSupplierStore((state) => state.isAuthenticated)
  const isSessionExpired = useSupplierStore((state) => state.isSessionExpired)
  const logout = useSupplierStore((state) => state.logout)

  const hasLocalSession = isAuthenticated && Boolean(token) && !isSessionExpired()
  const [status, setStatus] = useState<"checking" | "allowed" | "denied">(
    hasLocalSession ? "checking" : "denied"
  )

  useEffect(() => {
    if (!hasLocalSession) {
      setStatus("denied")
      return
    }

    let cancelled = false
    setStatus("checking")

    supplierPortalService
      .getSession()
      .then(() => {
        if (!cancelled) setStatus("allowed")
      })
      .catch((err: any) => {
        if (cancelled) return
        // 401/403 means this token is not (or no longer) a valid shop session.
        // Anything else is our side being unreachable, and signing the shop out
        // over a dropped connection would be its own bug.
        if (err?.status === 401 || err?.status === 403) {
          logout()
          setStatus("denied")
        } else {
          setStatus("allowed")
        }
      })

    return () => {
      cancelled = true
    }
    // Re-verify whenever the token itself changes (fresh login, forced logout).
  }, [hasLocalSession, token, logout])

  // The session has a fixed lifetime, so a portal left open overnight is walked
  // back to the login screen instead of sitting there failing every request.
  useEffect(() => {
    if (status !== "allowed") return
    const timer = setInterval(() => {
      if (useSupplierStore.getState().isSessionExpired()) {
        logout()
        setStatus("denied")
      }
    }, 60_000)
    return () => clearInterval(timer)
  }, [status, logout])

  if (status === "denied") {
    return <Navigate to="/supplier/login" replace state={{ from: location.pathname }} />
  }

  if (status === "checking") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground font-medium">Checking your sign-in...</p>
      </div>
    )
  }

  return <>{children}</>
}
