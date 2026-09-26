"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Lock, Mail, ShieldCheck, ArrowLeft, RefreshCcw, MailWarning } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAssistantStore } from "@/lib/assistant-store"
import { getApiUrl } from "@/lib/utils/api"
import { toast } from "sonner"

const OTP_LENGTH = 6

/**
 * Assistant admin sign-in.
 *
 * Same two steps as the administrator's login - password, then a code emailed
 * at that moment - with one extra state to handle: an account whose email has
 * not been confirmed yet. That case is told apart deliberately (see
 * initAssistantLoginHandler), because it is the one failure where "invalid
 * email or password" would send someone hunting for a password problem that
 * does not exist.
 */
export default function AssistantLoginPage() {
  const navigate = useNavigate()
  const login = useAssistantStore((state) => state.login)

  const [step, setStep] = useState<"credentials" | "otp">("credentials")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [maskedEmail, setMaskedEmail] = useState("")
  const [otp, setOtp] = useState("")
  const [error, setError] = useState("")
  const [needsVerification, setNeedsVerification] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [resendIn, setResendIn] = useState(0)
  const [devOtp, setDevOtp] = useState("")

  const focusOtpInput = () => {
    requestAnimationFrame(() => document.getElementById("assistant-otp-input")?.focus())
  }

  useEffect(() => {
    if (step !== "otp" || secondsLeft <= 0) return
    const timer = setInterval(() => setSecondsLeft((prev) => Math.max(0, prev - 1)), 1000)
    return () => clearInterval(timer)
  }, [step, secondsLeft])

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setInterval(() => setResendIn((prev) => Math.max(0, prev - 1)), 1000)
    return () => clearInterval(timer)
  }, [resendIn])

  useEffect(() => {
    if (step === "otp") focusOtpInput()
  }, [step])

  const formatTime = (total: number) => {
    const minutes = Math.floor(total / 60)
    const seconds = total % 60
    return `${minutes}:${String(seconds).padStart(2, "0")}`
  }

  const applyOtpSent = (data: any) => {
    setSecondsLeft(Number(data.expiresIn || 600))
    setResendIn(60)
    if (data.maskedEmail) setMaskedEmail(data.maskedEmail)
    if (data.devOtp) {
      setDevOtp(data.devOtp)
      toast.warning("Email delivery failed - development code shown below")
    } else {
      setDevOtp("")
    }
  }

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setNeedsVerification(false)
    setIsLoading(true)

    try {
      const response = await fetch(getApiUrl("/api/assistant/login/init"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.code === "EMAIL_NOT_VERIFIED") setNeedsVerification(true)
        throw new Error(data.error || "Sign-in failed")
      }

      setOtp("")
      setStep("otp")
      applyOtpSent(data)
      if (data.emailDelivered !== false) {
        toast.success(`Verification code sent to ${data.maskedEmail || email}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign-in failed"
      setError(message)
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendIn > 0 || isLoading) return
    setIsLoading(true)
    try {
      const response = await fetch(getApiUrl("/api/assistant/login/resend"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Could not resend the code")

      applyOtpSent(data)
      if (data.emailDelivered !== false) toast.success("A new code is on its way")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not resend the code"
      setError(message)
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (otp.length !== OTP_LENGTH) {
      setError(`Enter the ${OTP_LENGTH}-digit code from your email`)
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch(getApiUrl("/api/assistant/login/verify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, otp }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Verification failed")

      login(
        {
          id: data.assistant.id,
          email: data.assistant.email,
          name: data.assistant.name || data.assistant.email,
          role: "assistant_admin",
          permissions: data.assistant.permissions || {},
          mustChangePassword: Boolean(data.assistant.mustChangePassword),
        },
        data.token
      )

      toast.success("Signed in")
      navigate(data.assistant.mustChangePassword ? "/assistant/change-password" : "/assistant", {
        replace: true,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Verification failed"
      setError(message)
      toast.error(message)
      setOtp("")
      focusOtpInput()
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <ShieldCheck className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Assistant Panel</h1>
          <p className="mt-1 text-sm text-muted-foreground">I Mobile Service Center</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <AnimatePresence mode="wait">
            {step === "credentials" ? (
              <motion.form
                key="credentials"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                onSubmit={handleRequestCode}
                className="space-y-4"
              >
                <div>
                  <label className="mb-1.5 block text-sm font-medium" htmlFor="assistant-email">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="assistant-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="pl-9"
                      autoComplete="username"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium" htmlFor="assistant-password">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="assistant-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Your password"
                      className="pl-9"
                      autoComplete="current-password"
                      required
                    />
                  </div>
                </div>

                {error && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
                    {error}
                    {needsVerification && (
                      <p className="mt-2 flex items-start gap-2 text-xs">
                        <MailWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        Open the confirmation link in your inbox. If it has expired, ask the
                        administrator to send a new one.
                      </p>
                    )}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Checking..." : "Continue"}
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  A 6-digit code will be emailed to you to finish signing in.
                </p>
              </motion.form>
            ) : (
              <motion.form
                key="otp"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                onSubmit={handleVerify}
                className="space-y-4"
              >
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">
                    Enter the code sent to{" "}
                    <span className="font-medium text-foreground">{maskedEmail || email}</span>
                  </p>
                </div>

                <Input
                  id="assistant-otp-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={OTP_LENGTH}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH))}
                  placeholder="000000"
                  className="text-center font-mono text-2xl tracking-[0.5em]"
                />

                {devOtp && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-center text-sm">
                    Development code: <span className="font-mono font-bold">{devOtp}</span>
                  </div>
                )}

                {error && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
                    {error}
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{secondsLeft > 0 ? `Expires in ${formatTime(secondsLeft)}` : "Code expired"}</span>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendIn > 0 || isLoading}
                    className="inline-flex items-center gap-1 font-medium text-primary disabled:opacity-50"
                  >
                    <RefreshCcw className="h-3 w-3" />
                    {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
                  </button>
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Verifying..." : "Sign in"}
                </Button>

                <button
                  type="button"
                  onClick={() => {
                    setStep("credentials")
                    setError("")
                    setOtp("")
                  }}
                  className="inline-flex w-full items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-3 w-3" />
                  Use a different account
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          This panel is limited to products, categories and inventory. Edits and deletions are sent
          to the administrator for approval.
        </p>
      </motion.div>
    </div>
  )
}
