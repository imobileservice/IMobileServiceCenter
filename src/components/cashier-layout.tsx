"use client"

import { ReactNode, useEffect } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { LogOut, Calculator, ClipboardList, LayoutDashboard, Package, Receipt, ShoppingCart, Truck } from "lucide-react"
import { useCashierStore } from "@/lib/cashier-store"
import { Button } from "@/components/ui/button"
import { getApiUrl } from "@/lib/utils/api"

const SESSION_CHECK_INTERVAL_MS = 30 * 1000

interface CashierLayoutProps {
  children: ReactNode
}

/** The tabs across the top of the till, in the order a cashier reaches for them. */
const NAV_ITEMS = [
  { path: "/cashier/pos", label: "POS Terminal", shortLabel: "POS", Icon: ShoppingCart },
  { path: "/cashier/orders", label: "Order History", shortLabel: "Orders", Icon: Receipt },
  { path: "/cashier/supplier-orders", label: "Supplier Orders", shortLabel: "Suppliers", Icon: Truck },
  { path: "/cashier/website", label: "Website Terminal", shortLabel: "Website", Icon: ClipboardList },
  { path: "/cashier/dashboard", label: "Daily Summary", shortLabel: "Summary", Icon: LayoutDashboard },
  { path: "/cashier/inventory", label: "Inventory Look-up", shortLabel: "Inventory", Icon: Package },
]

export default function CashierLayout({ children }: CashierLayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { cashier, tillSession, isAuthenticated, logout, isTillSessionExpired } = useCashierStore()

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/cashier/login")
      return
    }

    if (isTillSessionExpired()) {
      logout()
      navigate("/cashier/login")
      return
    }

    const intervalId = window.setInterval(() => {
      const state = useCashierStore.getState()
      if (state.isTillSessionExpired()) {
        state.logout()
        navigate("/cashier/login")
      }
    }, SESSION_CHECK_INTERVAL_MS)

    return () => window.clearInterval(intervalId)
  }, [isAuthenticated, isTillSessionExpired, logout, navigate])

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
            {NAV_ITEMS.map(({ path, label, Icon }) => (
              <Button
                key={path}
                variant={location.pathname === path ? 'default' : 'ghost'}
                size="sm"
                className="gap-2 whitespace-nowrap"
                onClick={() => navigate(path)}
              >
                <Icon className="w-4 h-4" /> {label}
              </Button>
            ))}
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
        {NAV_ITEMS.map(({ path, shortLabel, Icon }) => (
          <Button
            key={path}
            variant={location.pathname === path ? 'default' : 'outline'}
            size="sm"
            className="gap-2 whitespace-nowrap"
            onClick={() => navigate(path)}
          >
            <Icon className="w-4 h-4" /> {shortLabel}
          </Button>
        ))}
      </div>

      {/* Main Content Area */}
      <main className="flex-1 p-4 sm:p-6 mx-auto w-full max-w-[1920px]">
        {children}
      </main>
    </div>
  )
}
