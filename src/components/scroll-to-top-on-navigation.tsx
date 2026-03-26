"use client"

import { useEffect } from "react"
import { useLocation } from "react-router-dom"

export default function ScrollToTopOnNavigation() {
  const location = useLocation()
  const pathname = location.pathname

  useEffect(() => {
    // Ensure we're in the browser
    if (typeof window === 'undefined') return

    // Scroll to top whenever the pathname changes
    const scrollToTop = () => {
      // Use multiple methods to ensure scrolling works
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
      
      // Also handle any scrollable containers
      const scrollableElements = document.querySelectorAll('[data-scrollable]')
      scrollableElements.forEach(element => {
        element.scrollTop = 0
      })
    }

    // Immediate scroll
    scrollToTop()

    // Additional scroll after a small delay to handle any layout shifts
    const timeoutId = setTimeout(scrollToTop, 100)

    // Handle browser back/forward navigation
    const handlePopState = () => {
      setTimeout(scrollToTop, 50)
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('popstate', handlePopState)
    }
  }, [pathname])

  return null
}
