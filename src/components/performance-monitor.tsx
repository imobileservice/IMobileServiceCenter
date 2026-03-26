"use client"

import { useEffect } from "react"

export default function PerformanceMonitor() {
  useEffect(() => {
    // Only run in development
    // MIGRATION: Vite uses import.meta.env.DEV or import.meta.env.MODE
    if (!import.meta.env.DEV && import.meta.env.MODE !== 'development') return

    // Monitor Core Web Vitals
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'largest-contentful-paint') {
          console.log('LCP:', entry.startTime)
        }
        if (entry.entryType === 'first-input') {
          console.log('FID:', entry.processingStart - entry.startTime)
        }
        if (entry.entryType === 'layout-shift') {
          console.log('CLS:', entry.value)
        }
      }
    })

    observer.observe({ entryTypes: ['largest-contentful-paint', 'first-input', 'layout-shift'] })

    // Monitor bundle size
    if (typeof window !== 'undefined') {
      const scripts = document.querySelectorAll('script[src]')
      scripts.forEach((script) => {
        const src = script.getAttribute('src')
        if (src) {
          // Only fetch scripts from the same origin to avoid CORS errors
          try {
            const url = new URL(src, window.location.origin)
            if (url.origin === window.location.origin) {
              fetch(src)
                .then(response => {
                  if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`)
                  }
                  return response.blob()
                })
                .then(blob => {
                  console.log(`Script ${src}: ${(blob.size / 1024).toFixed(2)} KB`)
                })
                .catch(error => {
                  // Silently ignore fetch errors to prevent console noise
                  // Only log if it's a critical error
                  // MIGRATION: Vite uses import.meta.env.DEV or import.meta.env.MODE
                  if ((import.meta.env.DEV || import.meta.env.MODE === 'development') && error.message !== 'Failed to fetch') {
                    console.debug(`Could not fetch script size for ${src}:`, error.message)
                  }
                })
            }
          } catch (error) {
            // Invalid URL or cross-origin script - skip silently
          }
        }
      })
    }

    return () => observer.disconnect()
  }, [])

  return null
}
