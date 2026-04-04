"use client"

import type React from "react"

import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { Lock, Mail, Key } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAdminStore } from "@/lib/admin-store"
import { getApiUrl } from "@/lib/utils/api"
import { toast } from "sonner"

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const login = useAdminStore((state) => state.login)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [otp, setOtp] = useState("")
  const [step, setStep] = useState<"credentials" | "otp">("credentials")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [otpSent, setOtpSent] = useState(false)

  const handleInitLogin = async (e: React.FormEvent) => {
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
        const errorMessage = data.details 
          ? `${data.error}: ${data.details}`
          : (data.error || "Login failed")
        throw new Error(errorMessage)
      }

      setOtpSent(true)
      setStep("otp")
      toast.success("Validation successful. Check your email for OTP.")

      // In development, show OTP in console
      if (data.otp && process.env.NODE_ENV === "development") {
        console.log(`[DEV] OTP for ${email}: ${data.otp}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initiate login")
      toast.error(err instanceof Error ? err.message : "Failed to initiate login")
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
        throw new Error(data.error || "Invalid OTP")
      }

      // Login successful - update admin store
      await login(email, otp, data.user)
      toast.success("Login successful!")
      navigate("/admin/dashboard")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid OTP")
      toast.error(err instanceof Error ? err.message : "Invalid OTP")
    } finally {
      setIsLoading(false)
    }
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
                {isLoading ? "Validating..." : "Log In"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold mb-2">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="email"
                    value={email}
                    disabled
                    className="pl-10 bg-muted"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStep("credentials")
                    setOtp("")
                    setOtpSent(false)
                  }}
                  className="text-xs text-primary mt-1 hover:underline"
                >
                  Change email
                </button>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Email OTP Code</label>
                <div className="relative">
                  <Key className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="Enter 6-digit Code"
                    className="pl-10 text-center text-lg tracking-widest"
                    required
                    disabled={isLoading}
                    maxLength={6}
                  />
                </div>
                {otpSent && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Code sent to your email. (Valid for 10 minutes)
                  </p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isLoading || otp.length !== 6}>
                {isLoading ? "Verifying..." : "Verify & Login"}
              </Button>
            </form>
          )}

          <div className="mt-6 p-4 bg-muted rounded-lg text-sm text-muted-foreground">
            <p className="font-semibold mb-2">Security Notice:</p>
            <p>1. Enter your admin credentials.</p>
            <p>2. You will receive a verification code in your email.</p>
            <p className="mt-2 text-xs">Ensure your email address is valid and accessible.</p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
