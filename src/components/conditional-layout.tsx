import { useLocation } from "react-router-dom"
import { Suspense } from "react"
import Navbar from "@/components/navbar"
import Footer from "@/components/footer"
import { MessageCircle } from "lucide-react"
import { motion } from "framer-motion"
import { lazyWithRetry } from "@/lib/chunk-recovery"

// Lazy load components for code splitting
const PageLoadAnimation = lazyWithRetry(() => import("@/components/page-load-animation"))
const ScrollToTop = lazyWithRetry(() => import("@/components/scroll-to-top"))
const ScrollToTopOnNavigation = lazyWithRetry(() => import("@/components/scroll-to-top-on-navigation"))
const PerformanceMonitor = lazyWithRetry(() => import("@/components/performance-monitor"))
const BottomNavigation = lazyWithRetry(() => import("@/components/bottom-navigation"))
const FloatingContactButtons = lazyWithRetry(() => import("@/components/floating-contact-buttons"))

interface ConditionalLayoutProps {
  children: React.ReactNode
}

export default function ConditionalLayout({ children }: ConditionalLayoutProps) {
  const location = useLocation()

  // For admin and cashier pages, only render the children (no navbar/footer/floating buttons)
  if (location.pathname.startsWith('/admin') || location.pathname.startsWith('/cashier')) {
    return <>{children}</>
  }

  // For regular pages, render with navbar, footer, and other client-side components
  return (
    <>
      <Suspense fallback={null}>
        <ScrollToTopOnNavigation />
        <PageLoadAnimation />
      </Suspense>
      <Navbar />
      <main className="min-h-screen pb-24 md:pb-0">{children}</main>
      <Footer />
      <Suspense fallback={null}>
        <ScrollToTop />
        <PerformanceMonitor />
      </Suspense>


      {/* Floating Contact Buttons (Call & WhatsApp) */}
      <Suspense fallback={null}>
        <FloatingContactButtons />
      </Suspense>

      {/* Bottom Navigation - Mobile Only */}
      <div className="lg:hidden">
        <Suspense fallback={null}>
          <BottomNavigation />
        </Suspense>
      </div>
    </>
  )
}
