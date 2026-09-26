"use client"

import { ReactNode, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAssistantStore } from "@/lib/assistant-store"
import AssistantSidebar from "./assistant-sidebar"
import CaptureGuard from "./capture-guard"

interface AssistantLayoutProps {
  children: ReactNode
  /**
   * The permission this screen needs. Absent means "any signed-in assistant".
   * The server enforces the same key on every route the screen calls; this only
   * decides whether to draw the screen or the refusal.
   */
  permission?: string
  title?: string
  description?: string
}

/**
 * The shell every assistant screen sits in.
 *
 * It re-checks the session with the server on each mount rather than trusting
 * what the browser kept. That is what makes a suspension or a withdrawn
 * permission take effect on the assistant's next click: the store is refreshed
 * from /api/assistant/session, and if the account is gone, suspended, or the
 * session has expired, they land back on the login screen.
 */
export default function AssistantLayout({
  children,
  permission,
  title,
  description,
}: AssistantLayoutProps) {
  const navigate = useNavigate()
  const user = useAssistantStore((state) => state.user)
  const isAuthenticated = useAssistantStore((state) => state.isAuthenticated)
  const refresh = useAssistantStore((state) => state.refresh)
  const can = useAssistantStore((state) => state.can)

  const [checked, setChecked] = useState(false)

  useEffect(() => {
    let cancelled = false

    refresh().then((valid) => {
      if (cancelled) return
      setChecked(true)
      if (!valid) navigate("/assistant/login", { replace: true })
    })

    return () => {
      cancelled = true
    }
    // Intentionally on mount only: each screen is its own mount, so this runs
    // on every navigation without re-running on every store update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A password reset by an administrator parks the account here. The server
  // refuses every other assistant route until it is done, so sending them
  // straight to the form is the only useful thing the UI can do.
  useEffect(() => {
    if (checked && user?.mustChangePassword) {
      navigate("/assistant/change-password", { replace: true })
    }
  }, [checked, user?.mustChangePassword, navigate])

  if (!checked && !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    )
  }

  if (!isAuthenticated || !user) return null

  const allowed = !permission || can(permission)

  return (
    <div className="assistant-shell min-h-screen bg-background">
      <CaptureGuard email={user.email} />
      <AssistantSidebar />

      <main className="min-h-screen transition-all duration-300 lg:pl-64">
        <div className="mx-auto max-w-[1600px] p-4 pt-20 sm:p-6 lg:p-8">
          {(title || description) && (
            <header className="mb-6">
              {title && <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>}
              {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
            </header>
          )}

          {allowed ? (
            children
          ) : (
            <div className="rounded-2xl border border-border bg-card p-10 text-center">
              <h2 className="text-lg font-semibold">You do not have access to this</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                The administrator has not given your account this permission. Ask them to enable it if
                you need it for your work.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
