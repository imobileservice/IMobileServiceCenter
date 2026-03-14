import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createClient } from '../lib/supabase/client'

export default function AuthCallback() {
    const navigate = useNavigate()
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let mounted = true

        const processAuth = async () => {
            try {
                // Determine if there is a code in the URL (PKCE flow)
                // If there is, redirect the browser entirely to the backend Express route
                if (window.location.search.includes('code=')) {
                    // Extract PKCE code verifier since the backend (on a different domain) needs it
                    let codeVerifier = ''
                    console.log('[AuthCallback] 🧩 Code found in URL, attempting PKCE exchange...')
                    
                    // 1. Try to get it from cookies
                    const cookies = document.cookie.split(';')
                    for (const cookie of cookies) {
                        const [name, ...rest] = cookie.trim().split('=')
                        if (name.includes('-auth-token-code-verifier')) {
                            codeVerifier = decodeURIComponent(rest.join('='))
                            console.log('[AuthCallback] ✅ Found verifier in cookie')
                            break
                        }
                    }

                    // 2. Fallback to localStorage
                    if (!codeVerifier) {
                        for (let i = 0; i < localStorage.length; i++) {
                            const key = localStorage.key(i)
                            if (key && key.includes('-auth-token-code-verifier')) {
                               codeVerifier = localStorage.getItem(key) || ''
                               console.log('[AuthCallback] ✅ Found verifier in localStorage')
                               break
                            }
                        }
                    }

                    if (codeVerifier) {
                        codeVerifier = codeVerifier.replace(/^"|"$/g, '')
                    }

                    const { getApiUrl } = await import('../lib/utils/api')
                    const params = new URLSearchParams(window.location.search)
                    if (codeVerifier) {
                        params.append('code_verifier', codeVerifier)
                    }
                    
                    console.log('[AuthCallback] 🚀 Redirecting to backend...')
                    window.location.href = getApiUrl('/api/auth/callback?' + params.toString())
                    return
                }

                // Handle errors passed in URL (like invalid_flow_state)
                const urlParams = new URLSearchParams(window.location.search)
                const errorInUrl = urlParams.get('error') || urlParams.get('error_description')
                if (errorInUrl) {
                    console.error('[AuthCallback] ❌ Error in redirect URL:', errorInUrl)
                    if (errorInUrl.includes('flow_state')) {
                        setError("Login session expired or was blocked by browser. Please try signing in again.")
                    } else {
                        setError(errorInUrl)
                    }
                    return
                }

                const supabase = createClient()
                console.log('[AuthCallback] Checking current Supabase session...')
                const { data: { session }, error: sessionError } = await supabase.auth.getSession()

                if (sessionError) throw sessionError

                if (session && mounted) {
                    console.log('[AuthCallback] ✅ Active session found, storing token...')
                    localStorage.setItem('supabase_session_token', session.access_token)
                    navigate('/?oauth=success', { replace: true })
                } else if (mounted) {
                    console.log('[AuthCallback] No session yet, waiting for retry...')
                    setTimeout(async () => {
                        const { data: retrySession } = await supabase.auth.getSession()
                        if (retrySession?.session && mounted) {
                            console.log('[AuthCallback] ✅ Session found on retry!')
                            localStorage.setItem('supabase_session_token', retrySession.session.access_token)
                            navigate('/?oauth=success', { replace: true })
                        } else if (mounted) {
                            console.warn('[AuthCallback] ❌ No session after retry')
                            setError("Authentication failed or session was not created. Please try again.")
                        }
                    }, 2000)
                }
            } catch (err: any) {
                console.error('Auth callback error:', err)
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
