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
// Import global styles
import '@/globals.css'
import './index.css' // Additional styles if needed

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
                <App />
              </ConditionalLayout>
            </AuthProvider>
            <Toaster position="top-center" richColors />
          </ThemeProvider>
        </BrowserRouter>
      </HelmetProvider>
    </ErrorBoundary>
  </React.StrictMode>
)

