"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { Lock, Mail, Store } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useSupplierStore } from "@/lib/supplier-store"
import { supplierPortalService } from "@/lib/services/supplier-portal.service"
import { toast } from "sonner"

export default function SupplierLoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const login = useSupplierStore((state) => state.login)
  const isAuthenticated = useSupplierStore((state) => state.isAuthenticated)
  const isSessionExpired = useSupplierStore((state) => state.isSessionExpired)

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  // Where the guard turned them away from, so a bookmarked portal link still
  // lands where it was pointing once they sign in.
  const redirectTo =
    typeof (location.state as any)?.from === "string" && (location.state as any).from.startsWith("/supplier")
      ? (location.state as any).from
      : "/supplier"

  // Someone arriving with a session still in date goes straight through.
  useEffect(() => {
    if (isAuthenticated && !isSessionExpired()) navigate(redirectTo, { replace: true })
  }, [isAuthenticated, isSessionExpired, navigate, redirectTo])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      const result = await supplierPortalService.login(email.trim(), password)
      login(result.supplier, result.token, result.expiresAt)
      toast.success(`Welcome, ${result.supplier.name}`)
      navigate(redirectTo, { replace: true })
    } catch (err: any) {
      setError(err.message || "Could not sign in")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-md">
        <div className="bg-card border border-border rounded-lg p-8 shadow-2xl">
          <div className="text-center mb-8 flex flex-col items-center">
            <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mb-4">
              <Store className="w-8 h-8 text-blue-500" />
            </div>
            <h1 className="text-2xl font-black tracking-tight mb-1">SHOP PORTAL</h1>
            <p className="text-muted-foreground text-sm font-medium">IMobile Service Center</p>
          </div>

          {error && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-400 p-3 rounded-lg mb-6 text-sm">
              {error}
            </motion.div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="shop@example.com" className="pl-10 h-12" required disabled={isLoading} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" className="pl-10 h-12" required disabled={isLoading} />
              </div>
            </div>

            <Button type="submit" className="w-full h-12 text-md font-bold" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center mt-6 leading-relaxed">
            Your login is created by IMobile Service Center.
            <br />
            Contact us if you cannot sign in.
          </p>
        </div>
      </motion.div>
    </div>
  )
}
