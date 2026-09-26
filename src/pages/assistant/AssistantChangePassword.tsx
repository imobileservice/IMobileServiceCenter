"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { KeyRound, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { useAssistantStore } from "@/lib/assistant-store"
import { assistantService } from "@/lib/services/assistant.service"
import { assistantSessionToken } from "@/lib/session-fetch"

/**
 * Change your own password.
 *
 * Also the forced stop after an administrator resets it: while
 * must_change_password is set the server refuses every other assistant route,
 * so this page is deliberately outside AssistantLayout - the layout would
 * bounce straight back here.
 */
export default function AssistantChangePasswordPage() {
  const navigate = useNavigate()
  const user = useAssistantStore((state) => state.user)
  const isAuthenticated = useAssistantStore((state) => state.isAuthenticated)
  const refresh = useAssistantStore((state) => state.refresh)

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    refresh().then((valid) => {
      if (!valid) navigate("/assistant/login", { replace: true })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const forced = Boolean(user?.mustChangePassword)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (newPassword !== confirmPassword) {
      setError("The two new passwords do not match")
      return
    }

    setIsSaving(true)
    try {
      const response = await assistantService.changePassword(currentPassword, newPassword)

      // Changing the password ends every session on the account, including this
      // one. The server issues a replacement so this browser stays signed in.
      if (response.token) assistantSessionToken.set(response.token)

      await refresh()
      toast.success("Password changed. Every other device has been signed out.")
      navigate("/assistant", { replace: true })
    } catch (err: any) {
      const message = err?.message || "Could not change the password"
      setError(message)
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  if (!isAuthenticated) return null

  return (
    <div className="assistant-shell flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <KeyRound className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            {forced ? "Choose a new password" : "Change your password"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{user?.email}</p>
        </div>

        {forced && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-xs leading-relaxed text-amber-600 dark:text-amber-400">
              An administrator set your password. Choose your own before continuing — nothing else in
              the panel is available until you do.
            </p>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8"
        >
          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="current-password">
              Current password
            </label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="new-password">
              New password
            </label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              At least 12 characters, combining three of: lower case, upper case, numbers, symbols.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="confirm-password">
              Repeat the new password
            </label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isSaving}>
            {isSaving ? "Saving..." : "Change password"}
          </Button>

          {!forced && (
            <button
              type="button"
              onClick={() => navigate("/assistant")}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              Back to the dashboard
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
