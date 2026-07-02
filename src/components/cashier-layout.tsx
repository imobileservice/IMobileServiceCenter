"use client"

import { ReactNode, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { LogOut, Calculator, ClipboardList, LayoutDashboard, Package, ShoppingCart } from "lucide-react"
import { useCashierStore } from "@/lib/cashier-store"
import { Button } from "@/components/ui/button"
import { getApiUrl } from "@/lib/utils/api"

interface CashierLayoutProps {
  children: ReactNode
}

export default function CashierLayout({ children }: CashierLayoutProps) {
  const navigate = useNavigate()
  const { cashier, tillSession, isAuthenticated, logout } = useCashierStore()

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/cashier/login")
    }
  }, [isAuthenticated, navigate])

  const handleLogout = async () => {
    if (tillSession?.id && tillSession?.token) {
      try {
        await fetch(getApiUrl("/api/cashier/logout"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: tillSession.id,
            session_token: tillSession.token,
            closed_by: cashier?.email,
          }),
        })
      } catch (error) {
        console.warn("Failed to close POS till session:", error)
      }
    }

    logout()
    navigate("/cashier/login")
  }

  if (!isAuthenticated) {
    return null // or loading spinner
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Header Navigation */}
      <header className="h-16 border-b border-border bg-card shadow-sm z-50 px-6 flex items-center justify-between sticky top-0">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-lg text-primary">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight tracking-tight">IMobile POS</h1>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Cashier Terminal</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1 bg-muted/50 p-1 rounded-lg">
            <Button
              variant={window.location.pathname === '/cashier/pos' ? 'default' : 'ghost'}
              size="sm"
              className="gap-2"
              onClick={() => navigate('/cashier/pos')}
            >
              <ShoppingCart className="w-4 h-4" /> POS Terminal
            </Button>
            <Button
              variant={window.location.pathname === '/cashier/website' ? 'default' : 'ghost'}
              size="sm"
              className="gap-2"
              onClick={() => navigate('/cashier/website')}
            >
              <ClipboardList className="w-4 h-4" /> Website Terminal
            </Button>
            <Button
              variant={window.location.pathname === '/cashier/dashboard' ? 'default' : 'ghost'}
              size="sm"
              className="gap-2"
              onClick={() => navigate('/cashier/dashboard')}
            >
              <LayoutDashboard className="w-4 h-4" /> Daily Summary
            </Button>
            <Button
              variant={window.location.pathname === '/cashier/inventory' ? 'default' : 'ghost'}
              size="sm"
              className="gap-2"
              onClick={() => navigate('/cashier/inventory')}
            >
              <Package className="w-4 h-4" /> Inventory Look-up
            </Button>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-foreground">{cashier?.name}</p>
            <p className="text-[10px] text-muted-foreground capitalize">
              {cashier?.role} • {cashier?.shop || 'Meegoda'} • {tillSession?.till?.code || 'Till'}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-red-500 hover:text-red-600 hover:bg-red-50">
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>
      
      {/* Mobile Navigation */}
      <div className="md:hidden flex items-center gap-2 overflow-x-auto p-4 border-b border-border bg-background">
         <Button
            variant={window.location.pathname === '/cashier/pos' ? 'default' : 'outline'}
            size="sm"
            className="gap-2 whitespace-nowrap"
            onClick={() => navigate('/cashier/pos')}
          >
            <ShoppingCart className="w-4 h-4" /> POS
          </Button>
          <Button
            variant={window.location.pathname === '/cashier/website' ? 'default' : 'outline'}
            size="sm"
            className="gap-2 whitespace-nowrap"
            onClick={() => navigate('/cashier/website')}
          >
            <ClipboardList className="w-4 h-4" /> Website
          </Button>
          <Button
            variant={window.location.pathname === '/cashier/dashboard' ? 'default' : 'outline'}
            size="sm"
            className="gap-2 whitespace-nowrap"
            onClick={() => navigate('/cashier/dashboard')}
          >
            <LayoutDashboard className="w-4 h-4" /> Summary
          </Button>
          <Button
            variant={window.location.pathname === '/cashier/inventory' ? 'default' : 'outline'}
            size="sm"
            className="gap-2 whitespace-nowrap"
            onClick={() => navigate('/cashier/inventory')}
          >
            <Package className="w-4 h-4" /> Inventory
          </Button>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 p-4 sm:p-6 mx-auto w-full max-w-[1920px]">
        {children}
      </main>
    </div>
  )
}
