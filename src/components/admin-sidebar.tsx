"use client"

import { useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { motion } from "framer-motion"
import { LayoutDashboard, Package, ShoppingCart, Users, MessageSquare, LogOut, Menu, X, FolderTree, Settings, Image, Filter as FilterIcon, BookOpen, Database, Barcode } from "lucide-react"
import { useAdminStore } from "@/lib/admin-store"
import { Button } from "@/components/ui/button"

const MENU_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/admin/dashboard" },
  { icon: Package, label: "Products", href: "/admin/products" },
  { icon: FolderTree, label: "Categories", href: "/admin/categories" },
  { icon: Database, label: "Inventory", href: "/admin/inventory", color: "text-green-500" },
  { icon: Barcode, label: "Sales History", href: "/admin/sales", color: "text-purple-500" },
  { icon: ShoppingCart, label: "Orders", href: "/admin/orders" },
  { icon: Users, label: "Customers", href: "/admin/customers" },
  { icon: MessageSquare, label: "Messages", href: "/admin/messages" },
  { icon: Image, label: "Hero Slides", href: "/admin/hero-slides" },
  { icon: Settings, label: "Settings", href: "/admin/settings" },
  { icon: Users, label: "Cashier Mgmt", href: "/admin/cashiers", color: "text-orange-500" },
  { icon: BookOpen, label: "Guide", href: "/admin/guide" },
]

export default function AdminSidebar() {
  const location = useLocation()
  const pathname = location.pathname
  const logout = useAdminStore((state) => state.logout)
  const [isOpen, setIsOpen] = useState(false)

  const handleLogout = () => {
    logout()
    window.location.href = "/admin/login"
  }

  return (
    <>
      {/* Mobile Menu Button - Fixed position */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-card border-b border-border z-40 flex items-center px-4">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 hover:bg-muted rounded-lg border transition-colors"
          aria-label="Toggle Menu"
        >
          {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
        <span className="ml-4 font-bold text-lg">I Mobile Admin</span>
      </div>

      {/* Desktop Sidebar - Fixed position */}
      <aside className="hidden lg:flex lg:flex-col w-64 bg-card border-r border-border h-screen fixed left-0 top-0 z-50 overflow-y-auto scrollbar-thin">
        <div className="p-8">
          <h1 className="text-2xl font-bold tracking-tight">I Mobile</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">Admin Panel</p>
        </div>

        <nav className="px-4 space-y-1.5 flex-1">
          {MENU_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            return (
              <Link key={item.href} to={item.href}>
                <motion.button
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.98 }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 ${isActive 
                      ? "bg-primary text-primary-foreground shadow-md font-medium" 
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? "text-primary-foreground" : "text-muted-foreground"}`} />
                  <span className="text-sm">{item.label}</span>
                </motion.button>
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-border bg-card/50 backdrop-blur-sm">
          <Button 
            onClick={handleLogout} 
            variant="ghost" 
            className="w-full justify-start gap-3 hover:bg-red-500/10 hover:text-red-500 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm font-medium">Logout</span>
          </Button>
        </div>
      </aside>

      {/* Mobile Sidebar - Slide-over style */}
      <motion.aside
        initial={{ x: -256 }}
        animate={{ x: isOpen ? 0 : -256 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="lg:hidden fixed left-0 top-0 h-screen w-64 bg-card border-r border-border z-50 flex flex-col shadow-2xl"
      >
        <div className="p-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">I Mobile</h1>
            <p className="text-xs text-muted-foreground">Admin Panel</p>
          </div>
          <button onClick={() => setIsOpen(false)} className="p-2 lg:hidden rounded-full hover:bg-muted">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="px-4 space-y-1.5 flex-1 overflow-y-auto pt-4">
          {MENU_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            return (
              <Link key={item.href} to={item.href} onClick={() => setIsOpen(false)}>
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${isActive 
                      ? "bg-primary text-primary-foreground shadow-lg" 
                      : "text-muted-foreground hover:bg-muted"
                    }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </motion.button>
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <Button onClick={handleLogout} variant="destructive" className="w-full gap-2 rounded-xl">
            <LogOut className="w-4 h-4" />
            Logout
          </Button>
        </div>
      </motion.aside>

      {/* Mobile Overlay */}
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden" 
          onClick={() => setIsOpen(false)} 
        />
      )}
    </>
  )
}
