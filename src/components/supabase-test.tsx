"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

/**
 * Temporary test component to verify Supabase setup.
 * Add this to any page temporarily to test your configuration.
 * 
 * Usage: <SupabaseTest />
 */
export default function SupabaseTest() {
  const [envStatus, setEnvStatus] = useState<{
    url: string | undefined
    key: string | undefined
  }>({ url: undefined, key: undefined })
  
  const [connectionTest, setConnectionTest] = useState<{
    status: 'idle' | 'testing' | 'success' | 'error'
    message: string
    data?: any
    error?: any
  }>({ status: 'idle', message: '' })

  useEffect(() => {
    // Test 1: Check environment variables
    // MIGRATION: Support both Vite (VITE_*) and Next.js (NEXT_PUBLIC_*) env var names
    const url = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    
    console.log('🔍 Environment Variables Check:')
    console.log('VITE_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL:', url || '❌ undefined')
    console.log('VITE_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY:', key ? '✅ Loaded (hidden)' : '❌ undefined')
    
    setEnvStatus({ url, key })

    // Test 2: Test Supabase connection
    if (url && key) {
      testSupabaseConnection()
    } else {
      setConnectionTest({
        status: 'error',
        message: 'Cannot test connection: Environment variables are missing'
      })
    }
  }, [])

  async function testSupabaseConnection() {
    setConnectionTest({ status: 'testing', message: 'Testing Supabase connection...' })
    
    try {
      const supabase = createClient()
      
      // Try to get the current user (this tests auth connection)
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      if (authError && authError.message !== 'Invalid JWT: Unable to decode or verify signature') {
        // This error is expected if not logged in, but other errors are real issues
        throw authError
      }

      // Try to query a table (test database connection)
      // Using a common table that should exist - adjust if needed
      const { data, error } = await supabase
        .from('products')
        .select('id')
        .limit(1)

      if (error) {
        // If products table doesn't exist, try profiles
        const { error: profileError } = await supabase
          .from('profiles')
          .select('id')
          .limit(1)

        if (profileError) {
          throw new Error(`Database connection failed: ${error.message}`)
        }
      }

      setConnectionTest({
        status: 'success',
        message: '✅ Supabase connection successful!',
        data: {
          user: user ? 'Logged in' : 'Not logged in (expected)',
          database: 'Connected',
        }
      })
      
      console.log('✅ Supabase connection test passed!')
    } catch (error: any) {
      console.error('❌ Supabase connection test failed:', error)
      setConnectionTest({
        status: 'error',
        message: `Connection failed: ${error.message}`,
        error: error
      })
    }
  }

  return (
    <div className="fixed bottom-4 right-4 bg-background border border-border rounded-lg shadow-lg p-4 max-w-md z-50">
      <h3 className="font-bold text-lg mb-3">🔍 Supabase Test</h3>
      
      {/* Environment Variables Status */}
      <div className="mb-4">
        <h4 className="font-semibold mb-2">Environment Variables:</h4>
        <div className="space-y-1 text-sm">
          <div>
            <span className="font-mono">NEXT_PUBLIC_SUPABASE_URL:</span>{' '}
            {envStatus.url ? (
              <span className="text-green-600">✅ Loaded</span>
            ) : (
              <span className="text-red-600">❌ Missing</span>
            )}
          </div>
          <div>
            <span className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY:</span>{' '}
            {envStatus.key ? (
              <span className="text-green-600">✅ Loaded</span>
            ) : (
              <span className="text-red-600">❌ Missing</span>
            )}
          </div>
        </div>
      </div>

      {/* Connection Test Status */}
      <div>
        <h4 className="font-semibold mb-2">Connection Test:</h4>
        <div className="text-sm">
          {connectionTest.status === 'idle' && (
            <span className="text-gray-500">Waiting...</span>
          )}
          {connectionTest.status === 'testing' && (
            <span className="text-blue-600">🔄 {connectionTest.message}</span>
          )}
          {connectionTest.status === 'success' && (
            <div className="text-green-600">
              <div>✅ {connectionTest.message}</div>
              {connectionTest.data && (
                <div className="mt-1 text-xs text-gray-600">
                  {JSON.stringify(connectionTest.data, null, 2)}
                </div>
              )}
            </div>
          )}
          {connectionTest.status === 'error' && (
            <div className="text-red-600">
              <div>❌ {connectionTest.message}</div>
              {connectionTest.error && (
                <div className="mt-1 text-xs text-gray-600">
                  {connectionTest.error.message || String(connectionTest.error)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-4 pt-4 border-t border-border text-xs text-gray-500">
        <p>💡 Check browser console for detailed logs</p>
        <p>Remove this component after testing</p>
      </div>
    </div>
  )
}

