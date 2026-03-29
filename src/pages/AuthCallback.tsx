import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createClient } from '../lib/supabase/client'

export default function AuthCallback() {
    const navigate = useNavigate()
    const [error, setError] = useState<string | null>(null)
    const [retrying, setRetrying] = useState(false)
    const started = React.useRef(false)

    const processAuth = React.useCallback(async (isRetry = false) => {
        if (started.current && !isRetry) {
            console.log('[AuthCallback] ⏭️ Exchange already started, skipping duplicate run.')
            return
        }

        try {
            // Determine if there is a code in the URL (PKCE flow)
            if (window.location.search.includes('code=')) {
                started.current = true
                console.log('[AuthCallback] 🧩 Code found in URL, performing local exchange...')
                const supabase = createClient()
                const params = new URLSearchParams(window.location.search)
                const code = params.get('code')

                if (!code) throw new Error('Authorization code missing in URL')

                // DEBUG: Log PKCE verifier availability
                const projectRef = (import.meta.env.VITE_SUPABASE_URL || '').split('//')[1]?.split('.')[0] || 'unknown'
                const verifierCookieName = `sb-${projectRef}-auth-token-code-verifier`
                const hasCookieVerifier = document.cookie.includes('code-verifier')
                const hasLocalStorageVerifier = !!localStorage.getItem(verifierCookieName)
                console.log('[AuthCallback] 🔍 PKCE verifier status:', {
                    cookieName: verifierCookieName,
                    inCookies: hasCookieVerifier,
                    inLocalStorage: hasLocalStorageVerifier,
                    allCookies: document.cookie.substring(0, 200),
                })

                // EXCHANGE CODE WITH TIMEOUT - prevents infinite hang
                console.log('[AuthCallback] ⏳ Starting exchangeCodeForSession (15s timeout)...')
                const exchangePromise = supabase.auth.exchangeCodeForSession(code)
                const timeoutPromise = new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error(
                        'Login exchange timed out after 15 seconds. This usually happens when the login session cookie was lost during the redirect.\n\nPlease try signing in again.'
                    )), 15000)
                )

                const { data, error: exchangeError } = await Promise.race([exchangePromise, timeoutPromise]) as any
                console.log('[AuthCallback] 📥 Exchange response received:', { hasSession: !!data?.session, hasError: !!exchangeError })

                if (exchangeError) {
                    console.error('[AuthCallback] Local exchange failed:', exchangeError)
                    if (exchangeError.message?.includes('flow_state') || exchangeError.message?.includes('code verifier')) {
                        throw new Error('Login session expired or blocked by browser. Please try signing in again.')
                    }
                    throw exchangeError
                }

                if (data?.session) {
                    console.log('[AuthCallback] ✅ Exchange successful! Forwarding tokens to backend...')
                    const { getApiUrl } = await import('../lib/utils/api')
                    const forwardParams = new URLSearchParams()
                    forwardParams.append('session_token', data.session.access_token)
                    forwardParams.append('refresh_token', data.session.refresh_token)

                    // We also pass any other params from the original redirect
                    params.forEach((val, key) => {
                        if (key !== 'code') forwardParams.append(key, val)
                    })

                    const backendUrl = getApiUrl('/api/auth/callback?' + forwardParams.toString())
                    console.log('[AuthCallback] 🚀 Redirecting to:', backendUrl)
                    window.location.href = backendUrl
                    return
                } else {
                    throw new Error('Exchange completed but no session was returned.')
                }
            }
        } catch (err: any) {
            console.error('[AuthCallback] ❌ Auth callback error:', err)
            started.current = false // Allow retry
            setError(err.message || "An error occurred during sign-in")
            setRetrying(false)
        }
    }, [])

    useEffect(() => {
        let mounted = true
        processAuth()
        return () => { mounted = false }
    }, [processAuth])

    const handleRetry = () => {
        setError(null)
        setRetrying(true)
        started.current = false
        processAuth(true)
    }

    return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 max-w-md w-full text-center shadow-xl">
                {error ? (
                    <>
                        <div className="text-red-500 mb-4 bg-red-500/10 p-4 rounded-full inline-flex mx-auto">
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">Login Failed</h2>
                        <p className="text-red-400 mb-6 whitespace-pre-line">{error}</p>
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={handleRetry}
                                disabled={retrying}
                                className="bg-zinc-700 hover:bg-zinc-600 text-white font-semibold py-2 px-6 rounded-lg transition-colors disabled:opacity-50"
                            >
                                {retrying ? 'Retrying...' : 'Try Again'}
                            </button>
                            <button
                                onClick={() => navigate('/signin')}
                                className="bg-primary hover:bg-primary/90 text-black font-semibold py-2 px-6 rounded-lg transition-colors"
                            >
                                Return to Login
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-6"></div>
                        <h2 className="text-xl font-bold text-white mb-2">Completing Login</h2>
                        <p className="text-zinc-400">Please wait while we securely sign you in...</p>
                    </>
                )}
            </div>
        </div>
    )
}
