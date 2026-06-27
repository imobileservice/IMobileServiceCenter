import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const EXCHANGE_TIMEOUT_MS = 30000

let callbackExchangePromise: Promise<void> | null = null

type SupabaseTokenResponse = {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    expires_at?: number
    token_type?: string
    user?: unknown
    error?: string
    error_description?: string
    msg?: string
    message?: string
}

function getSupabaseConfig() {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase is not configured for website login. Please check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
    }

    return {
        supabaseUrl: String(supabaseUrl).replace(/\/+$/, ''),
        supabaseAnonKey: String(supabaseAnonKey),
    }
}

function getProjectRef(supabaseUrl: string) {
    try {
        return new URL(supabaseUrl).hostname.split('.')[0]
    } catch {
        return ''
    }
}

function readCookie(name: string) {
    if (typeof document === 'undefined') return null

    const prefix = `${name}=`
    const cookie = document.cookie
        .split(';')
        .map((item) => item.trim())
        .find((item) => item.startsWith(prefix))

    if (!cookie) return null

    try {
        return decodeURIComponent(cookie.slice(prefix.length))
    } catch {
        return cookie.slice(prefix.length)
    }
}

function readStoredValue(name: string) {
    const directCookie = readCookie(name)
    if (directCookie) return directCookie

    try {
        const directLocal = localStorage.getItem(name)
        if (directLocal) return directLocal
    } catch {
        // Ignore storage access errors.
    }

    const chunks: string[] = []
    for (let index = 0; index < 20; index += 1) {
        const chunkName = `${name}.${index}`
        let chunk = readCookie(chunkName)

        if (!chunk) {
            try {
                chunk = localStorage.getItem(chunkName)
            } catch {
                chunk = null
            }
        }

        if (!chunk) break
        chunks.push(chunk)
    }

    return chunks.length ? chunks.join('') : null
}

function parseStoredString(value: string | null) {
    if (!value) return ''

    try {
        const parsed = JSON.parse(value)
        return typeof parsed === 'string' ? parsed : value
    } catch {
        return value
    }
}

function removeStoredValue(name: string) {
    if (typeof document !== 'undefined') {
        document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`
        document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax; Secure`
    }

    try {
        localStorage.removeItem(name)
    } catch {
        // Ignore storage access errors.
    }

    for (let index = 0; index < 20; index += 1) {
        const chunkName = `${name}.${index}`
        if (typeof document !== 'undefined') {
            document.cookie = `${chunkName}=; Path=/; Max-Age=0; SameSite=Lax`
            document.cookie = `${chunkName}=; Path=/; Max-Age=0; SameSite=Lax; Secure`
        }

        try {
            localStorage.removeItem(chunkName)
        } catch {
            // Ignore storage access errors.
        }
    }
}

function getPkceVerifier(supabaseUrl: string) {
    const projectRef = getProjectRef(supabaseUrl)
    const verifierKey = projectRef ? `sb-${projectRef}-auth-token-code-verifier` : ''
    const storedVerifier = verifierKey ? parseStoredString(readStoredValue(verifierKey)) : ''
    const [codeVerifier] = storedVerifier.split('/')
    let foundInLocalStorage = false

    try {
        foundInLocalStorage = verifierKey ? Boolean(localStorage.getItem(verifierKey) || localStorage.getItem(`${verifierKey}.0`)) : false
    } catch {
        foundInLocalStorage = false
    }

    return {
        verifierKey,
        codeVerifier,
        foundInCookie: verifierKey ? Boolean(readCookie(verifierKey) || readCookie(`${verifierKey}.0`)) : false,
        foundInLocalStorage,
    }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs)

    try {
        return await fetch(url, {
            ...init,
            signal: controller.signal,
        })
    } finally {
        window.clearTimeout(timeout)
    }
}

async function exchangeCodeDirectly(code: string): Promise<SupabaseTokenResponse> {
    const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig()
    const verifier = getPkceVerifier(supabaseUrl)

    console.log('[AuthCallback] PKCE verifier status:', {
        key: verifier.verifierKey,
        inCookies: verifier.foundInCookie,
        inLocalStorage: verifier.foundInLocalStorage,
    })

    if (!verifier.codeVerifier) {
        throw new Error(
            'Login session expired or your browser blocked the secure login verifier.\n\n' +
            'Please start sign-in again. If you are using Brave, disable Shields for this site or allow cookies for imobileservicecenter.lk.'
        )
    }

    console.log(`[AuthCallback] Starting direct PKCE token exchange (${EXCHANGE_TIMEOUT_MS / 1000}s timeout)...`)

    let response: Response
    try {
        response = await fetchWithTimeout(`${supabaseUrl}/auth/v1/token?grant_type=pkce`, {
            method: 'POST',
            headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${supabaseAnonKey}`,
                'Content-Type': 'application/json;charset=UTF-8',
                'X-Client-Info': 'imobile-auth-callback',
            },
            body: JSON.stringify({
                auth_code: code,
                code_verifier: verifier.codeVerifier,
            }),
            cache: 'no-store',
        }, EXCHANGE_TIMEOUT_MS)
    } catch (error: any) {
        if (error?.name === 'AbortError') {
            throw new Error(
                'Login exchange timed out after 30 seconds.\n\n' +
                'Please check your connection and try signing in again. If Brave Shields or an ad blocker is enabled, allow this site and try again.'
            )
        }
        throw error
    }

    let payload: SupabaseTokenResponse = {}
    const rawPayload = await response.text()
    if (rawPayload) {
        try {
            payload = JSON.parse(rawPayload)
        } catch {
            throw new Error(`Supabase returned an invalid login response (${response.status}).`)
        }
    }

    if (!response.ok) {
        const message = payload.error_description || payload.msg || payload.message || payload.error || `Supabase token exchange failed (${response.status}).`
        throw new Error(message)
    }

    if (!payload.access_token || !payload.refresh_token) {
        throw new Error('Login exchange completed but no session token was returned.')
    }

    if (verifier.verifierKey) {
        removeStoredValue(verifier.verifierKey)
    }

    return payload
}

export default function AuthCallback() {
    const navigate = useNavigate()
    const [error, setError] = useState<string | null>(null)
    const [retrying, setRetrying] = useState(false)
    const started = React.useRef(false)

    const processAuth = React.useCallback(async (isRetry = false) => {
        if (started.current && !isRetry) {
            console.log('[AuthCallback] Exchange already started, skipping duplicate run.')
            return
        }

        try {
            const params = new URLSearchParams(window.location.search)
            const code = params.get('code')

            if (!code) {
                throw new Error('Authorization code missing in URL.')
            }

            started.current = true
            console.log('[AuthCallback] Code found in URL, performing direct local exchange...')

            callbackExchangePromise ??= (async () => {
                const session = await exchangeCodeDirectly(code)
                const { getApiUrl } = await import('../lib/utils/api')

                try {
                    localStorage.setItem('supabase_session_token', session.access_token!)
                } catch {
                    // The backend redirect also passes the token back to the app.
                }

                const forwardParams = new URLSearchParams()
                forwardParams.append('session_token', session.access_token!)
                forwardParams.append('refresh_token', session.refresh_token!)

                params.forEach((val, key) => {
                    if (key !== 'code') forwardParams.append(key, val)
                })

                const backendUrl = getApiUrl('/api/auth/callback?' + forwardParams.toString())
                console.log('[AuthCallback] Exchange successful. Redirecting to backend callback:', backendUrl)
                window.location.href = backendUrl
            })()

            await callbackExchangePromise
        } catch (err: any) {
            console.error('[AuthCallback] Auth callback error:', err)
            callbackExchangePromise = null
            started.current = false
            setError(err.message || 'An error occurred during sign-in')
            setRetrying(false)
        }
    }, [])

    useEffect(() => {
        processAuth()
    }, [processAuth])

    const handleRetry = () => {
        setRetrying(true)
        callbackExchangePromise = null
        navigate('/signin')
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
                                {retrying ? 'Opening login...' : 'Try Again'}
                            </button>
                            <button
                                onClick={() => navigate('/')}
                                className="bg-primary hover:bg-primary/90 text-black font-semibold py-2 px-6 rounded-lg transition-colors"
                            >
                                Return Home
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
