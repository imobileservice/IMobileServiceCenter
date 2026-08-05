"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Lock, Mail, ShieldCheck, ArrowLeft, RefreshCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAdminStore } from "@/lib/admin-store"
import { getApiUrl } from "@/lib/utils/api"
import { toast } from "sonner"

const OTP_LENGTH = 6

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const login = useAdminStore((state) => state.login)

  const [step, setStep] = useState<"credentials" | "otp">("credentials")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [maskedEmail, setMaskedEmail] = useState("")
  const [otp, setOtp] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [resendIn, setResendIn] = useState(0)
  const [devOtp, setDevOtp] = useState("")

  // The shared Input is a plain function component (no ref forwarding), so the
  // OTP field is focused by id instead.
  const focusOtpInput = () => {
    requestAnimationFrame(() => document.getElementById("admin-otp-input")?.focus())
  }

  // Code expiry countdown
  useEffect(() => {
    if (step !== "otp" || secondsLeft <= 0) return
    const timer = setInterval(() => setSecondsLeft((prev) => Math.max(0, prev - 1)), 1000)
    return () => clearInterval(timer)
  }, [step, secondsLeft])

  // Resend cooldown countdown
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
    setIsLoading(true)

    try {
      const response = await fetch(getApiUrl("/api/admin/login/init"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.details ? `${data.error}: ${data.details}` : data.error || "Login failed")
      }

      setOtp("")
      setStep("otp")
      applyOtpSent(data)
      if (data.emailDelivered !== false) {
        toast.success(`Verification code sent to ${data.maskedEmail || email}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed"
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
      const response = await fetch(getApiUrl("/api/admin/login/verify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, otp }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Verification failed")
      }

      await login(email, otp, data.admin)
      toast.success("Login successful!")
      navigate("/admin/dashboard")
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

  const handleResend = async () => {
    if (resendIn > 0 || isLoading) return
    setError("")
    setIsLoading(true)

    try {
      const response = await fetch(getApiUrl("/api/admin/login/resend"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.retryAfter) setResendIn(Number(data.retryAfter))
        throw new Error(data.error || "Could not resend the code")
      }

      setOtp("")
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

  const backToCredentials = () => {
    setStep("credentials")
    setOtp("")
    setError("")
    setDevOtp("")
    setSecondsLeft(0)
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

          <AnimatePresence mode="wait">
            {step === "credentials" ? (
              <motion.form
                key="credentials"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                onSubmit={handleRequestCode}
                className="space-y-6"
              >
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

                <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  A verification code will be emailed to you
                </p>
              </motion.form>
            ) : (
              <motion.form
                key="otp"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                onSubmit={handleVerify}
                className="space-y-6"
              >
                <div className="text-center">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <ShieldCheck className="w-7 h-7 text-primary" />
                  </div>
                  <h2 className="text-lg font-bold">Check your email</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    We sent a {OTP_LENGTH}-digit code to{" "}
                    <span className="font-semibold text-foreground">{maskedEmail || email}</span>
                  </p>
                </div>

                {devOtp && (
                  <div className="bg-amber-100 dark:bg-amber-900/20 border border-amber-300 text-amber-900 dark:text-amber-300 p-3 rounded-lg text-sm text-center">
                    <p className="font-bold">Email could not be sent (development mode)</p>
                    <p className="mt-1">
                      Your code is <span className="font-mono font-black text-lg tracking-widest">{devOtp}</span>
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold mb-2 text-center">Verification code</label>
                  <Input
                    id="admin-otp-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH))}
                    placeholder="000000"
                    className="text-center text-3xl font-black tracking-[0.5em] h-16"
                    required
                    disabled={isLoading}
                  />
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    {secondsLeft > 0 ? (
                      <>
                        Code expires in <span className="font-bold text-foreground">{formatTime(secondsLeft)}</span>
                      </>
                    ) : (
                      <span className="text-red-500 font-semibold">Code expired — request a new one</span>
                    )}
                  </p>
                </div>

                <Button type="submit" className="w-full" disabled={isLoading || otp.length !== OTP_LENGTH}>
                  {isLoading ? "Verifying..." : "Verify & Log In"}
                </Button>

                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={backToCredentials}
                    className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                    disabled={isLoading}
                  >
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendIn > 0 || isLoading}
                    className="flex items-center gap-1.5 font-semibold text-primary hover:underline disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed"
                  >
                    <RefreshCcw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                    {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}
