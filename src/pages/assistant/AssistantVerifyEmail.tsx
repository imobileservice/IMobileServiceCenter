"use client"

import { useEffect, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { CheckCircle2, XCircle, Loader2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { assistantService } from "@/lib/services/assistant.service"

/**
 * The page the confirmation link in the account-created email opens.
 *
 * The token in the URL is single-use, so this must fire exactly once. React
 * StrictMode mounts effects twice in development, which would spend the token
 * on the first run and show "already used" from the second - hence the ref.
 */
export default function AssistantVerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get("token") || ""

  const [state, setState] = useState<"working" | "done" | "failed">("working")
  const [message, setMessage] = useState("")
  const attempted = useRef(false)

  useEffect(() => {
    if (attempted.current) return
    attempted.current = true

    if (!token) {
      setState("failed")
      setMessage("This link is missing its confirmation code. Open the link from your email again.")
      return
    }

    assistantService
      .verifyEmail(token)
      .then((response) => {
        setState("done")
        setMessage(response.message || "Email confirmed. You can sign in now.")
      })
      .catch((error) => {
        setState("failed")
        setMessage(error?.message || "This confirmation link could not be used.")
      })
  }, [token])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <ShieldCheck className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Assistant Panel</h1>
        <p className="mt-1 text-sm text-muted-foreground">I Mobile Service Center</p>

        <div className="mt-8 rounded-2xl border border-border bg-card p-8 shadow-sm">
          {state === "working" && (
            <>
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">Confirming your email address…</p>
            </>
          )}

          {state === "done" && (
            <>
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
              <h2 className="mt-4 text-lg font-semibold">Email confirmed</h2>
              <p className="mt-2 text-sm text-muted-foreground">{message}</p>
              <Link to="/assistant/login">
                <Button className="mt-6 w-full">Go to sign-in</Button>
              </Link>
            </>
          )}

          {state === "failed" && (
            <>
              <XCircle className="mx-auto h-10 w-10 text-red-500" />
              <h2 className="mt-4 text-lg font-semibold">Could not confirm</h2>
              <p className="mt-2 text-sm text-muted-foreground">{message}</p>
              <p className="mt-4 text-xs text-muted-foreground">
                Ask the administrator to send a new confirmation link from the Assistant Admins
                screen.
              </p>
              <Link to="/assistant/login">
                <Button variant="outline" className="mt-6 w-full">
                  Back to sign-in
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
