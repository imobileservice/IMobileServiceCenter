import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Link, useLocation } from "react-router-dom"
import { Home, Store, Info, Phone, X, Settings, ShieldCheck, HelpCircle } from "lucide-react"

interface MobileMenuProps {
  isOpen: boolean
  onClose: () => void
}

export default function MobileMenu({ isOpen, onClose }: MobileMenuProps) {
  const location = useLocation()

  // Prevent scrolling when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = "unset"
    }
    return () => {
      document.body.style.overflow = "unset"
    }
  }, [isOpen])

  // Close menu when route changes
  useEffect(() => {
    if (isOpen) {
      onClose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  const menuItems = [
    { href: "/", icon: Home, label: "Home", desc: "Go to storefront" },
    { href: "/shop", icon: Store, label: "Shop", desc: "Browse all products" },
    { href: "/about", icon: Info, label: "About Us", desc: "Learn about IMobile" },
    { href: "/contact", icon: Phone, label: "Contact", desc: "Get in touch with us" },
  ]

  const supportItems = [
    { href: "/problem", icon: HelpCircle, label: "Troubleshooting", desc: "Report an issue" },
    { href: "#", icon: ShieldCheck, label: "Privacy Policy", desc: "How we protect data" },
    { href: "#", icon: Settings, label: "Terms of Service", desc: "Rules and guidelines" },
  ]

  const isActive = (href: string) => {
    if (href === "/") return location.pathname === "/"
    return location.pathname.startsWith(href)
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm md:hidden"
          />

          {/* Drawer */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[70] bg-background border-t border-border rounded-t-3xl overflow-hidden md:hidden shadow-2xl max-h-[85vh] flex flex-col"
          >
            {/* Handle/Drag Indicator */}
            <div className="w-full flex justify-center pt-3 pb-1" onClick={onClose}>
              <div className="w-12 h-1.5 bg-muted-foreground/20 rounded-full" />
            </div>

            <div className="flex items-center justify-between px-6 py-4">
              <h2 className="text-xl font-bold tracking-tight">Menu</h2>
              <button
                onClick={onClose}
                className="p-2 -mr-2 rounded-full bg-muted/50 hover:bg-muted text-muted-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto px-4 pb-12">
              <div className="space-y-1 mt-2">
                {menuItems.map((item) => {
                  const Icon = item.icon
                  const active = isActive(item.href)

                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      className={`flex items-center gap-4 p-4 rounded-2xl transition-all ${
                        active 
                          ? "bg-primary/10 text-primary" 
                          : "hover:bg-muted/60 text-foreground"
                      }`}
                    >
                      <div className={`p-2.5 rounded-xl ${active ? "bg-primary/20" : "bg-muted"}`}>
                        <Icon strokeWidth={active ? 2.5 : 2} className="w-5 h-5" />
                      </div>
                      <div className="flex flex-col">
                        <span className={`font-semibold ${active ? "text-primary" : ""}`}>
                          {item.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {item.desc}
                        </span>
                      </div>
                    </Link>
                  )
                })}
              </div>

              <div className="mt-8 mb-4 px-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                  Support & Legal
                </h3>
                <div className="space-y-4">
                  {supportItems.map((item, idx) => {
                    const Icon = item.icon
                    return (
                      <Link
                        key={idx}
                        to={item.href}
                        className="flex items-center gap-3 text-muted-foreground hover:text-foreground transition-colors group"
                      >
                        <div className="p-1.5 rounded-lg bg-muted/50 group-hover:bg-muted transition-colors">
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-medium">{item.label}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
