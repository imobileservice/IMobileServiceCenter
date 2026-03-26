"use client"

import { ReactNode, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { 
  CheckCircle2, 
  AlertTriangle, 
  ShieldAlert, 
  Database, 
  Server, 
  PlugZap, 
  LifeBuoy, 
  ArrowRight,
  RefreshCw,
  Play,
  Code,
  Network,
  Activity,
  XCircle,
  Clock,
  Globe,
  Key,
  Settings,
  TestTube
} from "lucide-react"

import { checkSupabaseConfig } from "@/lib/utils/supabase-check"
import { createClient } from "@/lib/supabase/client"
import { ensureProfileForUser } from "@/lib/supabase/utils/ensure-profile"

type StatusLevel = "ok" | "warn" | "error" | "info" | "testing"

type CheckResult = {
  key: string
  title: string
  icon: ReactNode
  level: StatusLevel
  summary: string
  details?: string
  recommendations?: string[]
  responseTime?: number
  responseData?: any
  error?: string
}

type ApiTestResult = {
  endpoint: string
  method: string
  status: StatusLevel
  statusCode?: number
  responseTime?: number
  response?: any
  error?: string
  timestamp?: string
}

const STATUS_STYLES: Record<StatusLevel, string> = {
  ok: "border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-400",
  warn: "border-yellow-500/20 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  error: "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400",
  info: "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  testing: "border-purple-500/20 bg-purple-500/10 text-purple-700 dark:text-purple-400",
}

function getApiBaseUrl() {
  // In development, use relative URLs which will go through Vite proxy
  if (import.meta.env.DEV || import.meta.env.MODE === 'development') {
    // Use relative URLs - Vite proxy will handle routing to port 4000
    return ''
  }
  
  // In production, prioritize VITE_API_URL (for Cloudflare Tunnel or custom backend)
  const apiUrl = import.meta.env.VITE_API_URL
  if (apiUrl) {
    return apiUrl.startsWith("http") ? apiUrl : `https://${apiUrl}`
  }
  
  // Fallback to site URL if no API URL is configured
  const envUrl = import.meta.env.VITE_SITE_URL || import.meta.env.NEXT_PUBLIC_SITE_URL
  if (envUrl) {
    return envUrl.startsWith("http") ? envUrl : `https://${envUrl}`
  }

  // Last fallback - use current origin (not ideal for production)
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  
  return ''
}

async function testApiEndpoint(endpoint: string, method: string = 'GET', body?: any): Promise<ApiTestResult> {
  const startTime = Date.now()
  const apiBase = getApiBaseUrl()
  // Use relative URLs in dev (goes through Vite proxy), absolute in production
  const url = endpoint.startsWith('http') 
    ? endpoint 
    : apiBase 
      ? `${apiBase}${endpoint}` 
      : endpoint // Relative URL - will use Vite proxy in dev
  
  try {
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    }

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body)
    }

    const response = await fetch(url, options)
    const responseTime = Date.now() - startTime
    
    let responseData: any = null
    const contentType = response.headers.get('content-type')
    
    if (contentType && contentType.includes('application/json')) {
      try {
        responseData = await response.json()
      } catch (e) {
        responseData = { error: 'Failed to parse JSON response' }
      }
    } else {
      responseData = { text: await response.text() }
    }

    const status: StatusLevel = response.ok ? 'ok' : 'error'

    return {
      endpoint,
      method,
      status,
      statusCode: response.status,
      responseTime,
      response: responseData,
      timestamp: new Date().toISOString(),
    }
  } catch (error: any) {
    const responseTime = Date.now() - startTime
    return {
      endpoint,
      method,
      status: 'error',
      responseTime,
      error: error.message || 'Network error',
      timestamp: new Date().toISOString(),
    }
  }
}

async function runDiagnostics() {
  const envCheck = checkSupabaseConfig()
  const checks: CheckResult[] = []
  const apiBase = getApiBaseUrl()

  // Environment Variables Check
  checks.push({
    key: "env",
    title: "Environment Variables",
    icon: <PlugZap className="h-5 w-5" />,
    level: envCheck.isConfigured ? "ok" : "error",
    summary: envCheck.isConfigured
      ? "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are loaded."
      : "Missing Supabase URL or anon key in .env.",
    details: envCheck.isConfigured
      ? `URL detected: ${envCheck.url?.replace("https://", "")}`
      : envCheck.errors.join(" • "),
    recommendations: envCheck.isConfigured
      ? undefined
      : [
          "Copy the project URL and anon key from Supabase → Project Settings → API.",
          "Place them in .env.local and restart your dev server.",
        ],
  })

  // Backend Server Health Check
  const healthCheck = await testApiEndpoint('/health')
  checks.push({
    key: "backend-health",
    title: "Backend Server Health",
    icon: <Activity className="h-5 w-5" />,
    level: healthCheck.status,
    summary: healthCheck.status === 'ok' 
      ? `Backend server is running (${healthCheck.responseTime}ms)`
      : healthCheck.error || `Backend server check failed`,
    details: healthCheck.statusCode 
      ? `Status: ${healthCheck.statusCode} | Response time: ${healthCheck.responseTime}ms`
      : `Cannot reach backend at ${import.meta.env.DEV ? 'http://localhost:4000' : apiBase || 'backend server'}`,
    responseTime: healthCheck.responseTime,
    responseData: healthCheck.response,
    error: healthCheck.error,
    recommendations: healthCheck.status === 'error' ? [
      "Make sure the backend server is running: npm run dev:server",
      `Check if server is accessible at ${import.meta.env.DEV ? 'http://localhost:4000' : apiBase || 'backend server'}`,
      "In development, requests go through Vite proxy - ensure both servers are running",
      "Verify CORS settings if running on different ports",
    ] : undefined,
  })

  // Test Environment API
  const testEnvCheck = await testApiEndpoint('/api/test-env')
  checks.push({
    key: "api-test-env",
    title: "API: Test Environment",
    icon: <TestTube className="h-5 w-5" />,
    level: testEnvCheck.status,
    summary: testEnvCheck.status === 'ok'
      ? "Test environment endpoint is working"
      : "Test environment endpoint failed",
    details: testEnvCheck.response?.connection?.message || testEnvCheck.error,
    responseTime: testEnvCheck.responseTime,
    responseData: testEnvCheck.response,
    error: testEnvCheck.error,
  })

  // Products List API
  const productsListCheck = await testApiEndpoint('/api/products/list')
  checks.push({
    key: "api-products-list",
    title: "API: Products List",
    icon: <Database className="h-5 w-5" />,
    level: productsListCheck.status,
    summary: productsListCheck.status === 'ok'
      ? "Products list endpoint is working"
      : "Products list endpoint failed",
    details: productsListCheck.error || (productsListCheck.response?.error || 'Success'),
    responseTime: productsListCheck.responseTime,
    responseData: productsListCheck.response,
    error: productsListCheck.error,
  })

  // Products Categories API
  const categoriesCheck = await testApiEndpoint('/api/products/categories')
  checks.push({
    key: "api-products-categories",
    title: "API: Product Categories",
    icon: <Database className="h-5 w-5" />,
    level: categoriesCheck.status,
    summary: categoriesCheck.status === 'ok'
      ? "Categories endpoint is working"
      : "Categories endpoint failed",
    details: categoriesCheck.error || (categoriesCheck.response?.error || 'Success'),
    responseTime: categoriesCheck.responseTime,
    responseData: categoriesCheck.response,
    error: categoriesCheck.error,
  })

  // Supabase Client-side Database Check
  let supabase = null
  let databaseCheck: CheckResult = {
    key: "database",
    title: "Database (Client-side)",
    icon: <Database className="h-5 w-5" />,
    level: "info",
    summary: "Skipped because environment variables are missing.",
  }

  if (envCheck.isConfigured) {
    try {
      const startTime = Date.now()
      supabase = createClient()
      const { data, error } = await supabase.from("products").select("id").limit(1)
      const responseTime = Date.now() - startTime

      if (error) {
        databaseCheck = {
          key: "database",
          title: "Database (Client-side)",
          icon: <Database className="h-5 w-5" />,
          level: "error",
          summary: "Products query failed from the client.",
          details: error.message,
          responseTime,
          error: error.message,
          recommendations: [
            "Verify RLS policies on products allow public READ access.",
            "Ensure the products table actually exists in the project.",
          ],
        }
      } else {
        databaseCheck = {
          key: "database",
          title: "Database (Client-side)",
          icon: <Database className="h-5 w-5" />,
          level: "ok",
          summary: "Successfully queried the products table from the client.",
          details: `Client-side Supabase client can reach your database. (${responseTime}ms)`,
          responseTime,
        }
      }
    } catch (error: any) {
      databaseCheck = {
        key: "database",
        title: "Database (Client-side)",
        icon: <Database className="h-5 w-5" />,
        level: "error",
        summary: "Could not create a Supabase client.",
        details: error?.message ?? "Unknown error",
        error: error?.message,
        recommendations: [
          "Double-check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY for typos.",
          "Restart the dev server so the updated env vars are picked up.",
        ],
      }
    }
  }

  checks.push(databaseCheck)

  // Post-login / profile hydration check
  let postLoginCheck: CheckResult = {
    key: "post-login",
    title: "Post-login data access",
    icon: <ShieldAlert className="h-5 w-5" />,
    level: "info",
    summary: "Sign in to run this test.",
    details: "This section verifies the 'profiles' row that RLS policies expect once a user logs in.",
    recommendations: [
      "Sign in, then refresh this page to verify your profile row.",
    ],
  }

  if (supabase) {
    const { data: authData, error: authError } = await supabase.auth.getUser()
    const user = authData?.user

    // Check if error is just "no session" (expected when not logged in) vs actual error
    const isNoSessionError = authError && (
      authError.message?.includes('session') ||
      authError.message?.includes('JWT') ||
      authError.message?.includes('token') ||
      authError.message?.includes('Auth session missing') ||
      authError.message === 'Auth session missing!'
    )

    if (authError && !isNoSessionError) {
      // Real auth error (not just missing session)
      postLoginCheck = {
        key: "post-login",
        title: "Post-login data access",
        icon: <ShieldAlert className="h-5 w-5" />,
        level: "error",
        summary: "Failed to read the current Supabase session.",
        details: authError.message,
        error: authError.message,
        recommendations: [
          "Clear browser cookies and sign in again.",
          "Ensure Supabase Auth is properly configured.",
        ],
      }
    } else if (!user || isNoSessionError) {
      // No user logged in - this is expected and not an error
      postLoginCheck = {
        key: "post-login",
        title: "Post-login data access",
        icon: <ShieldAlert className="h-5 w-5" />,
        level: "info",
        summary: "No active session detected (expected when not signed in).",
        details: "This check verifies profile access after login. Sign in to test authenticated data access.",
        recommendations: [
          "Sign in to your account, then refresh this page to verify profile access.",
          "This check ensures RLS policies work correctly for authenticated users.",
        ],
      }
    } else {
      await ensureProfileForUser(supabase, user)

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id,email")
        .eq("id", user.id)
        .maybeSingle()

      if (profileError) {
        postLoginCheck = {
          key: "post-login",
          title: "Post-login data access",
          icon: <ShieldAlert className="h-5 w-5" />,
          level: "error",
          summary: "Logged-in user could not load their profile row.",
          details: profileError.message,
          error: profileError.message,
          recommendations: [
            "Re-run supabase/schema.sql to recreate the RLS policies and handle_new_user trigger.",
            "Confirm the auth trigger exists (Functions → handle_new_user).",
            "Manually insert a matching profile row if the trigger never ran.",
          ],
        }
      } else if (!profile) {
        postLoginCheck = {
          key: "post-login",
          title: "Post-login data access",
          icon: <ShieldAlert className="h-5 w-5" />,
          level: "warn",
          summary: "Profile row missing for the signed-in user.",
          details: "When no profile exists, RLS blocks every table that checks auth.uid().",
          recommendations: [
            "Run the SQL snippet in supabase/schema.sql (handle_new_user trigger).",
            "Insert the missing profile manually: INSERT INTO profiles (id, email) VALUES (auth.uid(), 'user@example.com');",
            "After inserting, refresh this page to confirm the warning disappears.",
          ],
        }
      } else {
        postLoginCheck = {
          key: "post-login",
          title: "Post-login data access",
          icon: <ShieldAlert className="h-5 w-5" />,
          level: "ok",
          summary: "Profile row located—RLS requirements satisfied.",
          details: `Detected profile for ${profile.email ?? user.email}.`,
        }
      }
    }
  }

  checks.push(postLoginCheck)

  const blockers = checks.filter((check) => check.level === "error").map((check) => check.title)

  return {
    checks,
    blockers,
    timestamp: new Date().toISOString(),
    apiBaseUrl: apiBase,
  }
}

export default function ProblemDiagnosticsPage() {
  const [diagnostics, setDiagnostics] = useState<{
    checks: CheckResult[]
    blockers: string[]
    timestamp: string
    apiBaseUrl: string
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [testingEndpoint, setTestingEndpoint] = useState<string | null>(null)
  const [manualTestResults, setManualTestResults] = useState<ApiTestResult[]>([])
  const [customEndpoint, setCustomEndpoint] = useState('')
  const [customMethod, setCustomMethod] = useState('GET')
  const [customBody, setCustomBody] = useState('')

  const runAllTests = async () => {
    setLoading(true)
    const result = await runDiagnostics()
    setDiagnostics(result)
    setLoading(false)
  }

  useEffect(() => {
    runAllTests()
  }, [])

  const testSingleEndpoint = async (endpoint: string, method: string = 'GET', body?: any) => {
    setTestingEndpoint(endpoint)
    const result = await testApiEndpoint(endpoint, method, body)
    setManualTestResults(prev => [result, ...prev].slice(0, 10)) // Keep last 10 results
    setTestingEndpoint(null)
    return result
  }

  const handleCustomTest = async () => {
    if (!customEndpoint) return
    
    let body = null
    if (customBody && customMethod !== 'GET') {
      try {
        body = JSON.parse(customBody)
      } catch (e) {
        alert('Invalid JSON in request body')
        return
      }
    }

    await testSingleEndpoint(customEndpoint, customMethod, body)
  }

  if (loading || !diagnostics) {
    return (
      <div className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-4">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
              <div className="text-muted-foreground">Running diagnostics...</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const permanentFixes = [
    {
      title: "Reapply schema & RLS policies",
      detail: "Open Supabase SQL editor and run the content of supabase/schema.sql. This recreates tables, public-read policies, and the handle_new_user trigger that hydrates the profiles table after sign-in.",
    },
    {
      title: "Seed both public and admin users",
      detail: "After schema import, run supabase/seed-data.sql or insert the admin (imobile.admin@gmail.com) plus at least one demo user. Without profiles, any auth-protected query will fail immediately after login.",
    },
    {
      title: "Lock in environment variables",
      detail: "Keep VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY inside .env and never mix credentials from two different Supabase projects. Changing keys without restarting the dev server causes the exact \"works before login, breaks after\" symptom.",
    },
    {
      title: "Start backend server",
      detail: "Make sure the backend server is running: npm run dev:server. The API endpoints require the Express server to be running on port 4000.",
    },
  ]

  const availableEndpoints = [
    { endpoint: '/health', method: 'GET', description: 'Backend server health check' },
    { endpoint: '/api/test-env', method: 'GET', description: 'Test environment and database connection' },
    { endpoint: '/api/products/list', method: 'GET', description: 'Get list of products' },
    { endpoint: '/api/products/categories', method: 'GET', description: 'Get product categories' },
    { endpoint: '/api/auth/signin', method: 'POST', description: 'User sign in (requires body)' },
    { endpoint: '/api/auth/signup', method: 'POST', description: 'User sign up (requires body)' },
    { endpoint: '/api/auth/verify-otp', method: 'POST', description: 'Verify OTP (requires body)' },
    { endpoint: '/api/auth/callback', method: 'GET', description: 'OAuth callback handler' },
  ]

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header */}
        <header className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Troubleshooting Hub
              </p>
              <h1 className="text-3xl font-bold tracking-tight">Problem Diagnostics & API Testing</h1>
              <p className="text-muted-foreground mt-2">
                Comprehensive testing panel for all APIs, backend connections, and database access. 
                Use this page to identify and diagnose issues with your application.
              </p>
            </div>
            <button
              onClick={runAllTests}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh All
            </button>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Globe className="h-3 w-3" />
              API Base: {diagnostics.apiBaseUrl || 'Using Vite proxy (relative URLs)'}
            </div>
            <div className="flex items-center gap-1">
              <Network className="h-3 w-3" />
              Backend: {import.meta.env.DEV ? 'http://localhost:4000 (proxied)' : diagnostics.apiBaseUrl || 'Same origin'}
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Last refreshed: {new Date(diagnostics.timestamp).toLocaleString()}
            </div>
          </div>
        </header>

        {/* Status Summary */}
        {diagnostics.blockers.length > 0 ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-6">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="text-lg font-semibold">Blocking issues detected ({diagnostics.blockers.length})</h3>
            </div>
            <p className="mt-2 text-sm text-red-700 dark:text-red-400">
              Fix these before attempting another sign-in. They are the reason the database works
              anonymously but collapses as soon as an authenticated session is created.
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-6 text-sm text-red-800 dark:text-red-300">
              {diagnostics.blockers.map((title) => (
                <li key={title}>{title}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-6">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-5 w-5" />
              <h3 className="text-lg font-semibold">All core systems look healthy</h3>
            </div>
            <p className="mt-2 text-sm text-green-700 dark:text-green-400">
              If data still disappears after login, focus on Row Level Security policies and the
              profile trigger—they are the only moving parts that change between anonymous and
              authenticated requests.
            </p>
          </div>
        )}

        {/* Diagnostic Checks Grid */}
        <section>
          <h2 className="text-xl font-semibold mb-4">System Diagnostics</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {diagnostics.checks.map((check) => (
              <div key={check.key} className="rounded-lg border border-border bg-card p-6 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="rounded-full border border-border bg-muted p-2 text-muted-foreground">
                      {check.icon}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Check</p>
                      <h3 className="text-base font-semibold">{check.title}</h3>
                    </div>
                  </div>
                  <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLES[check.level]}`}>
                    {check.level === "ok" && "✓ OK"}
                    {check.level === "warn" && "⚠ Warn"}
                    {check.level === "error" && "✗ Error"}
                    {check.level === "info" && "ℹ Info"}
                    {check.level === "testing" && "⟳ Testing"}
                  </div>
                </div>
                <div className="mt-4 space-y-2 text-sm">
                  <p className="font-medium">{check.summary}</p>
                  {check.details && <p className="text-muted-foreground text-xs">{check.details}</p>}
                  {check.responseTime && (
                    <p className="text-xs text-muted-foreground">
                      Response time: {check.responseTime}ms
                    </p>
                  )}
                  {check.error && (
                    <div className="rounded bg-red-500/10 border border-red-500/20 p-2 text-xs text-red-700 dark:text-red-400">
                      <strong>Error:</strong> {check.error}
                    </div>
                  )}
                  {check.recommendations && (
                    <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                      {check.recommendations.map((tip, idx) => (
                        <li key={idx}>{tip}</li>
                      ))}
                    </ul>
                  )}
                  {check.responseData && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                        View Response Data
                      </summary>
                      <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
                        {JSON.stringify(check.responseData, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Interactive API Testing Panel */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <TestTube className="h-5 w-5" />
              <h2 className="text-xl font-semibold">Interactive API Testing Panel</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Test any API endpoint manually. Results will appear below.
            </p>
          </div>

          {/* Quick Test Buttons */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold mb-3">Quick Tests</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {availableEndpoints.map((ep) => (
                <button
                  key={`${ep.method}-${ep.endpoint}`}
                  onClick={() => testSingleEndpoint(ep.endpoint, ep.method)}
                  disabled={testingEndpoint === ep.endpoint}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-semibold text-primary">{ep.method}</span>
                      <span className="text-xs truncate">{ep.endpoint}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{ep.description}</p>
                  </div>
                  {testingEndpoint === ep.endpoint && (
                    <RefreshCw className="h-3 w-3 animate-spin flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Test Form */}
          <div className="mb-6 rounded-lg border border-border bg-muted/50 p-4">
            <h3 className="text-sm font-semibold mb-3">Custom API Test</h3>
            <div className="grid gap-4 sm:grid-cols-12">
              <div className="sm:col-span-2">
                <select
                  value={customMethod}
                  onChange={(e) => setCustomMethod(e.target.value)}
                  className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
                  aria-label="HTTP Method"
                  title="Select HTTP method"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                  <option value="PATCH">PATCH</option>
                </select>
              </div>
              <div className="sm:col-span-6">
                <input
                  type="text"
                  value={customEndpoint}
                  onChange={(e) => setCustomEndpoint(e.target.value)}
                  placeholder="/api/endpoint"
                  className="w-full rounded border border-border bg-background px-3 py-2 text-sm font-mono"
                />
              </div>
              <div className="sm:col-span-4">
                <button
                  onClick={handleCustomTest}
                  disabled={!customEndpoint || testingEndpoint !== null}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <Play className="h-4 w-4" />
                  Test Endpoint
                </button>
              </div>
            </div>
            {(customMethod === 'POST' || customMethod === 'PUT' || customMethod === 'PATCH') && (
              <div className="mt-4">
                <label className="block text-xs font-medium mb-2">Request Body (JSON)</label>
                <textarea
                  value={customBody}
                  onChange={(e) => setCustomBody(e.target.value)}
                  placeholder='{"key": "value"}'
                  className="w-full rounded border border-border bg-background px-3 py-2 text-xs font-mono min-h-[80px]"
                />
              </div>
            )}
          </div>

          {/* Test Results */}
          {manualTestResults.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Test Results</h3>
              <div className="space-y-3">
                {manualTestResults.map((result, idx) => (
                  <div
                    key={idx}
                    className={`rounded-lg border p-4 ${
                      result.status === 'ok'
                        ? 'border-green-500/20 bg-green-500/5'
                        : 'border-red-500/20 bg-red-500/5'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                            result.status === 'ok' ? 'bg-green-500/20 text-green-700 dark:text-green-400' : 'bg-red-500/20 text-red-700 dark:text-red-400'
                          }`}>
                            {result.method}
                          </span>
                          <span className="text-sm font-mono truncate">{result.endpoint}</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {result.statusCode && (
                            <span>Status: {result.statusCode}</span>
                          )}
                          {result.responseTime && (
                            <span>Time: {result.responseTime}ms</span>
                          )}
                          {result.timestamp && (
                            <span>{new Date(result.timestamp).toLocaleTimeString()}</span>
                          )}
                        </div>
                      </div>
                      <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLES[result.status]}`}>
                        {result.status === 'ok' ? '✓ Success' : '✗ Failed'}
                      </div>
                    </div>
                    {result.error && (
                      <div className="mt-2 rounded bg-red-500/10 border border-red-500/20 p-2 text-xs text-red-700 dark:text-red-400">
                        <strong>Error:</strong> {result.error}
                      </div>
                    )}
                    {result.response && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                          View Response
                        </summary>
                        <pre className="mt-2 max-h-60 overflow-auto rounded bg-background border border-border p-3 text-xs">
                          {JSON.stringify(result.response, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Permanent Fixes */}
        <section className="grid gap-6 rounded-2xl border border-border bg-card p-6 shadow-sm md:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-xl font-semibold">Permanent fix checklist</h3>
            <p className="text-sm text-muted-foreground">
              Follow every step once after provisioning a Supabase project. When all four are done,
              you no longer need to recreate databases to get data back after login.
            </p>
          </div>
          <div className="space-y-4">
            {permanentFixes.map((item, idx) => (
              <div key={idx} className="flex items-start gap-3">
                <LifeBuoy className="mt-1 h-5 w-5 text-primary flex-shrink-0" />
                <div>
                  <p className="font-semibold text-sm">{item.title}</p>
                  <p className="text-sm text-muted-foreground">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Additional Resources */}
        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-2">
              <Server className="h-4 w-4" />
              Extra tools
            </div>
            <h3 className="text-lg font-semibold mb-2">Test pages</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Use these two routes whenever you suspect Supabase is misbehaving.
            </p>
            <div className="space-y-2 text-sm font-medium">
              <Link to="/test-supabase" className="inline-flex items-center gap-2 text-primary hover:underline">
                <ArrowRight className="h-4 w-4" />
                /test-supabase — client-side SDK check
              </Link>
              <Link
                to="/api/test-env"
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 text-primary hover:underline"
              >
                <ArrowRight className="h-4 w-4" />
                /api/test-env — serverless env & DB check
              </Link>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-2">
              <PlugZap className="h-4 w-4" />
              Why it breaks after sign-in
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Before login, anonymous queries only need the public anon key. After login, Supabase
              attaches the user&apos;s JWT, so every table protected by RLS now checks:
            </p>
            <ul className="list-disc space-y-1 pl-6 text-sm text-muted-foreground">
              <li>A matching row in public.profiles (trigger handle_new_user must exist).</li>
              <li>Policies that reference auth.uid() (cart, orders, wishlists, etc.).</li>
              <li>Admin-only email (imobile.admin@gmail.com) for product mutations.</li>
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">
              If any of these fail, Supabase returns empty responses, which looks like the database
              &quot;stops working.&quot; Fix the trigger/policies once and the issue is gone permanently.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
