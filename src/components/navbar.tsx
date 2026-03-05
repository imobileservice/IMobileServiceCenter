"use client"

import { useState, useEffect, useRef } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { Moon, Sun, Search, ShoppingCart, User, X, Bell } from "lucide-react"
import { useTheme } from "next-themes"
import { useAuthStore } from "@/lib/store"
import { useCartCount } from "@/hooks/use-cart-count"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"

export default function Navbar() {
  const [mounted, setMounted] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  const user = useAuthStore((state) => state.user)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const logout = useAuthStore((state) => state.logout)
  const { count: cartCount } = useCartCount()

  useEffect(() => {
    setMounted(true)
  }, [])

  // Focus search input when opened
  useEffect(() => {
    if (searchOpen && searchRef.current) {
      searchRef.current.focus()
    }
  }, [searchOpen])

  const handleLogout = async () => {
    try {
      await logout()
      toast.success("Logged out successfully")
      navigate("/")
    } catch (error) {
      toast.error("Failed to log out")
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      navigate(`/shop?search=${encodeURIComponent(searchQuery.trim())}`)
      setSearchOpen(false)
      setSearchQuery("")
    }
  }

  // Desktop nav links (only visible on desktop)
  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/shop", label: "Shop" },
    { href: "/about", label: "About" },
    { href: "/contact", label: "Contact" },
  ]
  const isActive = (href: string) => location.pathname === href

  return (
    <>
      <motion.header
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b border-border/50 shadow-sm"
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">

            {/* LEFT: Logo */}
            <Link to="/" className="flex items-center gap-2 flex-shrink-0">
              <img
                src="/imobile-logo.png"
                alt="IMobile"
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-contain"
              />
              <div className="hidden sm:flex flex-col leading-tight">
                <span className="font-bold text-base leading-none">iMobile</span>
                <span className="text-[10px] text-muted-foreground leading-none">Service Center</span>
              </div>
            </Link>

            {/* CENTER: Desktop Nav (only on desktop) */}
            <nav className="hidden md:flex items-center gap-6">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className={`text-sm font-medium transition-colors relative group ${isActive(link.href)
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                  {link.label}
                  {isActive(link.href) && (
                    <motion.span
                      layoutId="activeNavIndicator"
                      className="absolute -bottom-0.5 left-0 right-0 h-0.5 bg-primary rounded-full"
                    />
                  )}
                </Link>
              ))}
            </nav>

            {/* RIGHT: Icon Actions */}
            <div className="flex items-center gap-0.5 sm:gap-1">
              {/* Search button */}
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => setSearchOpen(true)}
                className="p-2 sm:p-2.5 rounded-xl hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                aria-label="Search"
              >
                <Search className="w-5 h-5" />
              </motion.button>

              {/* Theme toggle */}
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="p-2 sm:p-2.5 rounded-xl hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                aria-label="Toggle theme"
              >
                {mounted && theme === "dark" ? (
                  <Sun className="w-5 h-5" />
                ) : (
                  <Moon className="w-5 h-5" />
                )}
              </motion.button>

              {/* Cart (logged in only) */}
              {user && (
                <Link to="/cart">
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    className="relative p-2 sm:p-2.5 rounded-xl hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    aria-label="Cart"
                  >
                    <ShoppingCart className="w-5 h-5" />
                    <AnimatePresence>
                      {cartCount > 0 && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                          className="absolute top-1 right-1 bg-primary text-primary-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center"
                        >
                          {cartCount > 9 ? "9+" : cartCount}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.button>
                </Link>
              )}

              {/* User/Auth — desktop only */}
              <div className="hidden md:flex items-center gap-1 ml-1">
                {user ? (
                  <>
                    <Link
                      to="/profile"
                      className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-muted transition-colors"
                    >
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-primary" />
                      </div>
                      <span className="text-sm font-medium max-w-[100px] truncate">
                        {user.name?.split(" ")[0] || "Profile"}
                      </span>
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors"
                    >
                      Logout
                    </button>
                  </>
                ) : (
                  <Link
                    to="/signin"
                    className="px-4 py-1.5 text-sm font-semibold bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors"
                  >
                    Sign In
                  </Link>
                )}
              </div>

              {/* Profile icon on mobile (when logged in) */}
              {user && (
                <Link
                  to="/profile"
                  className="md:hidden p-2 sm:p-2.5 rounded-xl hover:bg-muted transition-colors"
                  aria-label="Profile"
                >
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                </Link>
              )}

              {/* Sign In on mobile (when not logged in) */}
              {!user && (
                <Link
                  to="/signin"
                  className="md:hidden px-3 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors"
                >
                  Sign In
                </Link>
              )}
            </div>
          </div>
        </div>
      </motion.header>

      {/* Full-Screen Search Overlay */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-md flex flex-col"
          >
            {/* Search Header */}
            <div className="flex items-center gap-3 px-4 pt-4 pb-2 border-b border-border">
              <div className="flex-1 flex items-center gap-3 bg-muted rounded-2xl px-4 py-3">
                <Search className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <form onSubmit={handleSearch} className="flex-1">
                  <input
                    ref={searchRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search phones, brands..."
                    className="w-full bg-transparent focus:outline-none text-sm placeholder:text-muted-foreground"
                  />
                </form>
              </div>
              <button
                onClick={() => { setSearchOpen(false); setSearchQuery("") }}
                className="p-2 rounded-xl hover:bg-muted transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick search suggestions */}
            <div className="px-4 py-4 space-y-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-3">Popular Searches</p>
              {["iPhone 15 Pro", "Samsung Galaxy", "OnePlus", "Xiaomi"].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    navigate(`/shop?search=${encodeURIComponent(suggestion)}`)
                    setSearchOpen(false)
                    setSearchQuery("")
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted transition-colors text-left"
                >
                  <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm">{suggestion}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
