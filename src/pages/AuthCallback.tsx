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
                // so the backend can set the secure HTTP-only cookies and database session
                if (window.location.search.includes('code=')) {
                    const { getApiUrl } = await import('../lib/utils/api')
                    window.location.href = getApiUrl('/api/auth/callback' + window.location.search)
                    return
                }

                const supabase = createClient()
                const { data: { session }, error: sessionError } = await supabase.auth.getSession()

                if (sessionError) throw sessionError

                if (session && mounted) {
                    localStorage.setItem('supabase_session_token', session.access_token)
                    navigate('/?oauth=success', { replace: true })
                } else if (mounted) {
                    setTimeout(async () => {
                        const { data: retrySession } = await supabase.auth.getSession()
                        if (retrySession?.session && mounted) {
                            localStorage.setItem('supabase_session_token', retrySession.session.access_token)
                            navigate('/?oauth=success', { replace: true })
                        } else if (mounted) {
                            setError("Authentication failed or was cancelled.")
                        }
                    }, 1500)
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
