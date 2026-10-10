import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'
import App from './App'
import ConditionalLayout from '@/components/conditional-layout'
import { AuthProvider } from '@/components/auth-provider'
import { ErrorBoundary } from './ErrorBoundary'
import { installSessionFetch } from './lib/session-fetch'
import { SupplierShopAccessProvider } from '@/components/supplier-shop-access'
// Import global styles
import '@/globals.css'
import './index.css' // Additional styles if needed

// Wraps window.fetch so every call to this app's own API carries the signed-in
// session. Must run before any component can fire a request.
installSessionFetch()

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root element not found')
}

const root = createRoot(container)

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <HelmetProvider>
        <BrowserRouter>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
            <AuthProvider>
              <ConditionalLayout>
                <SupplierShopAccessProvider>
                  <App />
                </SupplierShopAccessProvider>
              </ConditionalLayout>
            </AuthProvider>
            <Toaster position="top-center" richColors />
          </ThemeProvider>
        </BrowserRouter>
      </HelmetProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
