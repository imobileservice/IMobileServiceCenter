"use client"

import { ReactNode, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { LogOut, Calculator } from "lucide-react"
import { useCashierStore } from "@/lib/cashier-store"
import { Button } from "@/components/ui/button"

interface CashierLayoutProps {
  children: ReactNode
}

export default function CashierLayout({ children }: CashierLayoutProps) {
  const navigate = useNavigate()
  const { cashier, isAuthenticated, logout } = useCashierStore()

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/cashier/login")
    }
  }, [isAuthenticated, navigate])

  const handleLogout = () => {
    logout()
    navigate("/cashier/login")
  }

  if (!isAuthenticated) {
    return null // or loading spinner
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Header Navigation */}
      <header className="h-16 border-b border-border bg-card shadow-sm z-50 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-lg text-primary">
            <Calculator className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight tracking-tight">IMobile POS</h1>
            <p className="text-[10px] text-muted-foreground uppercase font-semibold">Cashier Terminal</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-foreground">{cashier?.name}</p>
            <p className="text-[10px] text-muted-foreground capitalize">{cashier?.role}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-red-500 hover:text-red-600 hover:bg-red-50">
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-4 sm:p-6 mx-auto w-full max-w-[1920px]">
        {children}
      </main>
    </div>
  )
}
