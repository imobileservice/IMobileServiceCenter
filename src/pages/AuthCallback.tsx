import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createClient } from '../lib/supabase/client'

export default function AuthCallback() {
    const navigate = useNavigate()
    const [error, setError] = useState<string | null>(null)
    const started = React.useRef(false)

    useEffect(() => {
        let mounted = true

        const processAuth = async () => {
            if (started.current) {
                console.log('[AuthCallback] ⏭️ Exchange already started, skipping duplicate run.')
                return
            }

            try {
                // Determine if there is a code in the URL (PKCE flow)
                // If there is, redirect the browser entirely to the backend Express route
                if (window.location.search.includes('code=')) {
                    started.current = true
                    console.log('[AuthCallback] 🧩 Code found in URL, performing local exchange...')
                    const supabase = createClient()
                    const params = new URLSearchParams(window.location.search)
                    const code = params.get('code')

                    if (!code) throw new Error('Authorization code missing in URL')

                    // EXCHANGE CODE LOCALLY ON FRONTEND
                    console.log('[AuthCallback] ⏳ Starting exchangeCodeForSession...')
                    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
                    console.log('[AuthCallback] 📥 Exchange response received:', { hasSession: !!data?.session, hasError: !!exchangeError })

                    if (exchangeError) {
                        console.error('[AuthCallback] Local exchange failed:', exchangeError)
                        if (exchangeError.message.includes('flow_state')) {
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
                if (mounted) setError(err.message || "An error occurred during sign-in")
            }
        }


        processAuth()

        return () => {
            mounted = false
        }
    }, [navigate])

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
                        <p className="text-red-400 mb-6">{error}</p>
                        <button
                            onClick={() => navigate('/signin')}
                            className="bg-primary hover:bg-primary/90 text-black font-semibold py-2 px-6 rounded-lg transition-colors"
                        >
                            Return to Login
                        </button>
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
