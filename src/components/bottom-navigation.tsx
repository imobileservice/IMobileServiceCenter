import { Link, useLocation } from "react-router-dom"
import { Home, Store, Heart, ShoppingCart, User } from "lucide-react"
import { useAuthStore } from "@/lib/store"
import { useCartCount } from "@/hooks/use-cart-count"
import { motion, AnimatePresence } from "framer-motion"

export default function BottomNavigation() {
  const location = useLocation()
  const pathname = location.pathname
  const user = useAuthStore((state) => state.user)
  const { count: cartCount } = useCartCount()

  const navItems = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/shop", icon: Store, label: "Shop" },
    { href: "/wishlist", icon: Heart, label: "Wishlist", requiresAuth: true },
    { href: "/cart", icon: ShoppingCart, label: "Cart", showBadge: true, badge: cartCount, requiresAuth: true },
    { href: "/profile", icon: User, label: "Account", requiresAuth: true },
  ].filter(item => !item.requiresAuth || user)

  const isActive = (item: typeof navItems[0]) => {
    if (pathname.startsWith("/shop")) return item.href === "/shop"
    if (pathname === "/") return item.href === "/"
    return pathname.startsWith(item.href.split("?")[0])
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
      {/* Frosted glass effect */}
      <div className="bg-background/90 backdrop-blur-xl border-t border-border/60 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        <div className="flex items-center justify-around px-2 py-1 safe-area-pb">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item)

            return (
              <Link
                key={item.href}
                to={item.href}
                className="flex flex-col items-center justify-center px-3 py-2 relative min-w-[56px] group"
              >
                {/* Active indicator pill */}
                {active && (
                  <motion.div
                    layoutId="bottomNavActive"
                    className="absolute top-1 inset-x-2 h-1 bg-primary rounded-full"
                    transition={{ type: "spring", stiffness: 400, damping: 28 }}
                  />
                )}

                <div className="relative mt-1.5">
                  <motion.div
                    animate={{
                      scale: active ? 1.1 : 1,
                      y: active ? -1 : 0
                    }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  >
                    <Icon
                      className={`w-[22px] h-[22px] transition-colors ${active
                          ? "text-primary"
                          : "text-muted-foreground group-hover:text-foreground"
                        }`}
                      strokeWidth={active ? 2.5 : 1.75}
                    />
                  </motion.div>

                  {/* Badge */}
                  <AnimatePresence>
                    {item.showBadge && item.badge !== undefined && item.badge > 0 && (
                      <motion.span
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        className="absolute -top-1.5 -right-2 bg-primary text-primary-foreground text-[9px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center"
                      >
                        {item.badge > 9 ? "9+" : item.badge}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>

                <span
                  className={`text-[10px] mt-0.5 font-medium transition-colors leading-tight ${active
                      ? "text-primary"
                      : "text-muted-foreground group-hover:text-foreground"
                    }`}
                >
                  {item.label}
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
