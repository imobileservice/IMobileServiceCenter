"use client"

import { useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { motion } from "framer-motion"
import { LayoutDashboard, Package, ShoppingCart, Users, MessageSquare, LogOut, Menu, X, FolderTree, Settings, Image, Filter as FilterIcon, BookOpen } from "lucide-react"
import { useAdminStore } from "@/lib/admin-store"
import { Button } from "@/components/ui/button"

const MENU_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/admin/dashboard" },
  { icon: Package, label: "Products", href: "/admin/products" },
  { icon: FolderTree, label: "Categories", href: "/admin/categories" },
  { icon: FilterIcon, label: "Filters", href: "/admin/filters" },
  { icon: ShoppingCart, label: "Orders", href: "/admin/orders" },
  { icon: Users, label: "Customers", href: "/admin/customers" },
  { icon: MessageSquare, label: "Messages", href: "/admin/messages" },
  { icon: Image, label: "Hero Slides", href: "/admin/hero-slides" },
  { icon: Settings, label: "Settings", href: "/admin/settings" },
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
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 left-4 z-50 lg:hidden p-2 hover:bg-muted rounded-lg bg-background border"
      >
        {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 bg-card border-r border-border h-screen">
        <div className="p-6">
          <h1 className="text-2xl font-bold">I Mobile</h1>
          <p className="text-sm text-muted-foreground">Admin Panel</p>
        </div>

        <nav className="px-4 space-y-2 flex-1">
          {MENU_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            return (
              <Link key={item.href} to={item.href}>
                <motion.button
                  whileHover={{ x: 4 }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                    }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </motion.button>
              </Link>
            )
          })}
        </nav>

        <div className="p-4">
          <Button onClick={handleLogout} variant="outline" className="w-full gap-2 bg-transparent">
            <LogOut className="w-4 h-4" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Mobile Sidebar */}
      <motion.aside
        initial={{ x: -300 }}
        animate={{ x: isOpen ? 0 : -300 }}
        transition={{ duration: 0.3 }}
        className="lg:hidden fixed left-0 top-0 h-screen w-64 bg-card border-r border-border z-40 flex flex-col"
      >
        <div className="p-6">
          <h1 className="text-2xl font-bold">I Mobile</h1>
          <p className="text-sm text-muted-foreground">Admin Panel</p>
        </div>

        <nav className="px-4 space-y-2 flex-1">
          {MENU_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            return (
              <Link key={item.href} to={item.href}>
                <motion.button
                  whileHover={{ x: 4 }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                    }`}
                  onClick={() => setIsOpen(false)}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </motion.button>
              </Link>
            )
          })}
        </nav>

        <div className="p-4">
          <Button onClick={handleLogout} variant="outline" className="w-full gap-2 bg-transparent">
            <LogOut className="w-4 h-4" />
            Logout
          </Button>
        </div>
      </motion.aside>

      {/* Mobile Overlay */}
      {isOpen && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setIsOpen(false)} />}
    </>
  )
}
