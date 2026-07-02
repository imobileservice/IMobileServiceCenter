"use client"

import type React from "react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { Coins, Hash, Lock, Mail, Store } from "lucide-react"
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
  const [tillCode, setTillCode] = useState("")
  const [openingFloat, setOpeningFloat] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const getDeviceFingerprint = () => {
    if (typeof window === "undefined") return "server"
    return [
      window.navigator.userAgent,
      window.navigator.language,
      window.screen.width,
      window.screen.height,
      window.devicePixelRatio,
    ].join("|")
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      const response = await fetch(getApiUrl("/api/cashier/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          till_code: tillCode,
          opening_float: Number(openingFloat || 0),
          device_fingerprint: getDeviceFingerprint(),
        }),
      })

      const data = await response.json()

      if (!response.ok) throw new Error(data.error || "Login failed")

      login(data.cashier, data.tillSession)
      toast.success("Till session opened")
      navigate("/cashier/pos")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to login"
      setError(message)
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-md">
        <div className="bg-card border border-border rounded-lg p-8 shadow-2xl">
          <div className="text-center mb-8 flex flex-col items-center">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Store className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-black tracking-tight mb-1">POS TERMINAL</h1>
            <p className="text-muted-foreground text-sm font-medium">Cashier / Manager Till Login</p>
          </div>

          {error && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-400 p-3 rounded-lg mb-6 text-sm">
              {error}
            </motion.div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold mb-2">Staff Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cashier@imobile.com" className="pl-10 h-12" required disabled={isLoading} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Password / PIN</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password or PIN" className="pl-10 h-12" required disabled={isLoading} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Till Code</label>
              <div className="relative">
                <Hash className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                <Input value={tillCode} onChange={(e) => setTillCode(e.target.value.toUpperCase())} placeholder="MEG-01" className="pl-10 h-12 uppercase" required disabled={isLoading} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Opening Cash Float</label>
              <div className="relative">
                <Coins className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                <Input type="number" min="0" step="0.01" value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} placeholder="0.00" className="pl-10 h-12" disabled={isLoading} />
              </div>
            </div>

            <Button type="submit" className="w-full h-12 text-md font-bold" disabled={isLoading}>
              {isLoading ? "Opening Till..." : "Open Till Session"}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  )
}
