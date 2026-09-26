"use client"

import { useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { motion } from "framer-motion"
import {
  LayoutDashboard,
  Package,
  FolderTree,
  Database,
  ClipboardList,
  LogOut,
  Menu,
  X,
  KeyRound,
  ShieldAlert,
} from "lucide-react"
import { useAssistantStore } from "@/lib/assistant-store"
import { Button } from "@/components/ui/button"

/**
 * The assistant's navigation.
 *
 * Only five destinations exist, and each is hidden unless the account holds the
 * permission behind it. Orders, customers, messages, suppliers, cashiers,
 * settings and hero slides are not listed because there is nothing to list -
 * those routes are not part of this panel at all, and typing one into the
 * address bar lands on the shop's own site, not on an admin screen.
 */
const MENU_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/assistant", permission: "dashboard.view" },
  { icon: Package, label: "Products", href: "/assistant/products", permission: "products.view" },
  { icon: FolderTree, label: "Categories", href: "/assistant/categories", permission: "categories.view" },
  { icon: Database, label: "Inventory", href: "/assistant/inventory", permission: "inventory.view" },
  { icon: ClipboardList, label: "My Requests", href: "/assistant/requests" },
]

export default function AssistantSidebar() {
  const location = useLocation()
  const pathname = location.pathname
  const [isOpen, setIsOpen] = useState(false)

  const user = useAssistantStore((state) => state.user)
  const logout = useAssistantStore((state) => state.logout)
  const can = useAssistantStore((state) => state.can)

  const items = MENU_ITEMS.filter((item) => !item.permission || can(item.permission))

  const handleLogout = () => {
    logout()
    window.location.href = "/assistant/login"
  }

  const nav = (onNavigate?: () => void) => (
    <nav className="flex-1 space-y-1.5 px-4">
      {items.map((item) => {
        const Icon = item.icon
        const isActive = pathname === item.href
        return (
          <Link key={item.href} to={item.href} onClick={onNavigate}>
            <motion.button
              whileHover={{ x: 4 }}
              whileTap={{ scale: 0.98 }}
              className={`flex w-full items-center gap-3 rounded-lg px-4 py-2.5 transition-all duration-200 ${
                isActive
                  ? "bg-primary font-medium text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-sm">{item.label}</span>
            </motion.button>
          </Link>
        )
      })}
    </nav>
  )

  const footer = (
    <div className="space-y-2 border-t border-border p-4">
      <div className="rounded-lg bg-muted/50 px-3 py-2">
        <p className="truncate text-xs font-medium text-foreground">{user?.name}</p>
        <p className="truncate text-[11px] text-muted-foreground">{user?.email}</p>
      </div>

      <Link to="/assistant/change-password">
        <Button variant="ghost" className="w-full justify-start gap-3">
          <KeyRound className="h-4 w-4" />
          <span className="text-sm">Change password</span>
        </Button>
      </Link>

      <Button
        onClick={handleLogout}
        variant="ghost"
        className="w-full justify-start gap-3 hover:bg-red-500/10 hover:text-red-500"
      >
        <LogOut className="h-4 w-4" />
        <span className="text-sm font-medium">Sign out</span>
      </Button>
    </div>
  )

  return (
    <>
      {/* Mobile top bar */}
      <div className="fixed left-0 right-0 top-0 z-40 flex h-16 items-center border-b border-border bg-card px-4 lg:hidden">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="rounded-lg border p-2 transition-colors hover:bg-muted"
          aria-label="Toggle menu"
        >
          {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
        <span className="ml-4 text-lg font-bold">Assistant Panel</span>
      </div>

      {/* Desktop */}
      <aside className="fixed left-0 top-0 z-50 hidden h-screen w-64 flex-col overflow-y-auto border-r border-border bg-card lg:flex">
        <div className="p-8">
          <h1 className="text-2xl font-bold tracking-tight">I Mobile</h1>
          <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
            Assistant Panel
          </p>
        </div>

        <div className="mx-4 mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
            Edits and deletions need the administrator's approval. Screen captures are logged.
          </p>
        </div>

        {nav()}
        {footer}
      </aside>

      {/* Mobile slide-over */}
      <motion.aside
        initial={{ x: -256 }}
        animate={{ x: isOpen ? 0 : -256 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r border-border bg-card shadow-2xl lg:hidden"
      >
        <div className="flex items-center justify-between p-6">
          <div>
            <h1 className="text-xl font-bold">I Mobile</h1>
            <p className="text-xs text-muted-foreground">Assistant Panel</p>
          </div>
          <button onClick={() => setIsOpen(false)} className="rounded-full p-2 hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        {nav(() => setIsOpen(false))}
        {footer}
      </motion.aside>

      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  )
}
