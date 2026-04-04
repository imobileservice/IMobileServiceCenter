"use client"

import type React from "react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { Lock, Mail, Key, Store } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useCashierStore } from "@/lib/cashier-store"
import { getApiUrl } from "@/lib/utils/api"
import { toast } from "sonner"

export default function CashierLoginPage() {
  const navigate = useNavigate()
  const login = useCashierStore((state) => state.login)
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
      const response = await fetch(getApiUrl("/api/cashier/login/init"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (!response.ok) throw new Error(data.error || "Login failed")

      setOtpSent(true)
      setStep("otp")
      toast.success("Validation successful. Check your email for OTP.")

      if (data.otp && process.env.NODE_ENV === "development") {
        console.log(`[DEV] Cashier OTP for ${email}: ${data.otp}`)
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
      const response = await fetch(getApiUrl("/api/cashier/login/verify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, otp }),
      })

      const data = await response.json()

      if (!response.ok) throw new Error(data.error || "Invalid OTP")

      login(email, otp, data.cashier)
      toast.success("Login successful!")
      navigate("/cashier/pos")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid OTP")
      toast.error(err instanceof Error ? err.message : "Invalid OTP")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted flex items-center justify-center px-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-md">
        <div className="bg-card border border-border rounded-lg p-8 shadow-2xl">
          <div className="text-center mb-8 flex flex-col items-center">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Store className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-black tracking-tight mb-1">CASHIER TERMINAL</h1>
            <p className="text-muted-foreground text-sm font-medium">IMobile POS System</p>
          </div>

          {error && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-400 p-3 rounded-lg mb-6 text-sm">
              {error}
            </motion.div>
          )}

          {step === "credentials" ? (
            <form onSubmit={handleInitLogin} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold mb-2">Cashier Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cashier@-imobile.com" className="pl-10 h-12" required disabled={isLoading} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="pl-10 h-12" required disabled={isLoading} />
                </div>
              </div>
              <Button type="submit" className="w-full h-12 text-md font-bold" disabled={isLoading}>
                {isLoading ? "Validating..." : "Enter Terminal"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold mb-2">Security Verification Code</label>
                <div className="relative">
                  <Key className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                  <Input type="text" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" className="pl-10 h-16 text-center text-3xl tracking-[1em] font-mono" required disabled={isLoading} maxLength={6} />
                </div>
                {otpSent && <p className="text-xs text-muted-foreground mt-2 text-center">Code sent to your email. (Valid for 1 week)</p>}
              </div>
              <Button type="submit" className="w-full h-12 text-md font-bold" disabled={isLoading || otp.length !== 6}>
                {isLoading ? "Verifying..." : "Confirm & Access POS"}
              </Button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  )
}
