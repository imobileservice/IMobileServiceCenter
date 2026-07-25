"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { ArrowLeft, KeyRound, Lock, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAdminStore } from "@/lib/admin-store"
import { getApiUrl } from "@/lib/utils/api"
import { toast } from "sonner"

const RESEND_COOLDOWN_SECONDS = 60

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const login = useAdminStore((state) => state.login)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [otp, setOtp] = useState("")
  const [step, setStep] = useState<"credentials" | "otp">("credentials")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [resendIn, setResendIn] = useState(0)

  // Countdown that re-enables the "Resend code" action
  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  const requestOtp = async () => {
    const response = await fetch(getApiUrl("/api/admin/login/init"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })

    const data = await response.json()

    if (!response.ok) {
      const errorMessage = data.details
        ? `${data.error}: ${data.details}`
        : data.error || "Login failed"
      throw new Error(errorMessage)
    }

    setResendIn(RESEND_COOLDOWN_SECONDS)

    // Development-only convenience: the server echoes the code when NODE_ENV=development
    if (data.otp) {
      console.log(`[DEV] Admin OTP for ${email}: ${data.otp}`)
    }

    return data
  }

  const handleInitLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      await requestOtp()
      setStep("otp")
      setOtp("")
      toast.success("Verification code sent. Check your email.")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to initiate login"
      setError(message)
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendOtp = async () => {
    if (resendIn > 0 || isLoading) return

    setError("")
    setIsLoading(true)

    try {
      await requestOtp()
      setOtp("")
      toast.success("A new verification code has been sent.")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to resend code"
      setError(message)
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      const response = await fetch(getApiUrl("/api/admin/login/verify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, otp }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Invalid verification code")
      }

      // Login successful - update admin store
      await login(email, otp, data.admin)
      toast.success("Login successful!")
      navigate("/admin/dashboard")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid verification code"
      setError(message)
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleBackToCredentials = () => {
    setStep("credentials")
    setOtp("")
    setError("")
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="bg-card border border-border rounded-lg p-8 shadow-lg">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Admin Panel</h1>
            <p className="text-muted-foreground">I Mobile Service Center</p>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-400 p-3 rounded-lg mb-6 text-sm"
            >
              {error}
            </motion.div>
          )}

          {step === "credentials" ? (
            <form onSubmit={handleInitLogin} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold mb-2">Admin Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@imobile.com"
                    className="pl-10"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-10"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Sending code..." : "Continue"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-6">
              <div className="text-center text-sm text-muted-foreground">
                We sent a 6-digit verification code to
                <br />
                <span className="font-semibold text-foreground">{email}</span>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Verification Code</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    className="pl-10 tracking-[0.5em] text-center text-lg"
                    maxLength={6}
                    required
                    autoFocus
                    disabled={isLoading}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">The code expires in 10 minutes.</p>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading || otp.length !== 6}>
                {isLoading ? "Verifying..." : "Verify & Log In"}
              </Button>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={handleBackToCredentials}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>

                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={isLoading || resendIn > 0}
                  className="text-primary hover:underline disabled:opacity-50 disabled:no-underline"
                >
                  {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
                </button>
              </div>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  )
}
