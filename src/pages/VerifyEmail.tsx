"use client"

import type React from "react"

import { Suspense, useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { Mail, ArrowLeft, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { authService } from "@/lib/supabase/services/auth"
import { getApiUrl } from "@/lib/utils/api"
import { toast } from "sonner"

function VerifyEmailContent() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState("")
  const [verificationCode, setVerificationCode] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [isVerified, setIsVerified] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    // Get email from URL params or localStorage
    const emailParam = searchParams.get("email")
    const storedEmail = typeof window !== "undefined" ? localStorage.getItem("signup_email") : null
    
    if (emailParam) {
      setEmail(emailParam)
      if (typeof window !== "undefined") {
        localStorage.setItem("signup_email", emailParam)
      }
    } else if (storedEmail) {
      setEmail(storedEmail)
    }
  }, [searchParams])

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!verificationCode.trim()) {
      setError("Please enter the verification code")
      return
    }

    if (!email) {
      setError("Email address is required")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      // Call server API to avoid client-side network/cors issues
      const res = await fetch(getApiUrl('/api/auth/verify-otp'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token: verificationCode, type: 'signup' }),
      })
      
      // Check content type before parsing JSON
      const contentType = res.headers.get('content-type')
      let data: any = {}
      
      if (contentType && contentType.includes('application/json')) {
        try {
          data = await res.json()
        } catch (jsonError) {
          // If JSON parsing fails, try to get text for debugging
          const text = await res.text().catch(() => 'Unknown error')
          console.error('Failed to parse JSON response:', text)
          throw new Error(`Server returned invalid JSON: ${text.substring(0, 100)}`)
        }
      } else {
        // Server returned non-JSON (probably HTML error page)
        const text = await res.text().catch(() => 'Unknown error')
        console.error('Server returned non-JSON response:', text.substring(0, 200))
        throw new Error(`Server error: Received ${contentType || 'unknown'} instead of JSON. Please check your server configuration.`)
      }

      if (!res.ok) {
        throw new Error(data?.error || 'Verification failed')
      }

      if (data.user) {
        setIsVerified(true)
        toast.success("Email verified successfully!")
        
        // Clear stored email
        if (typeof window !== "undefined") {
          localStorage.removeItem("signup_email")
        }

        // Redirect to sign in after a short delay
        setTimeout(() => {
          navigate("/signin?verified=true")
        }, 2000)
      }
    } catch (err: any) {
      console.error("Verification error:", err)
      setError(
        err.message || "Invalid verification code. Please check and try again."
      )
      toast.error("Verification failed", {
        description: err.message || "Please check your code and try again",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendCode = async () => {
    if (!email) {
      toast.error("Email address is required")
      return
    }

    setIsResending(true)
    setError("")

    try {
      await authService.resendEmailConfirmation(email)
      toast.success("Verification email sent! Please check your inbox.")
    } catch (err: any) {
      console.error("Resend error:", err)
      setError(err.message || "Failed to resend verification email")
      toast.error("Failed to resend email", {
        description: err.message || "Please try again later",
      })
    } finally {
      setIsResending(false)
    }
  }

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 },
    },
  }

  if (isVerified) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted flex items-center justify-center p-4">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="w-full max-w-md"
        >
          <div className="bg-card border border-border rounded-xl p-8 space-y-6 text-center">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-2xl font-bold">Email Verified!</h1>
            <p className="text-muted-foreground">
              Your email has been successfully verified. Redirecting to sign in...
            </p>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted flex items-center justify-center p-4">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="w-full max-w-md"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center text-white mx-auto mb-4">
            <Mail className="w-6 h-6" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Verify Your Email</h1>
          <p className="text-muted-foreground">
            Enter the verification code sent to your email
          </p>
        </div>

        {/* Form */}
        <div className="bg-card border border-border rounded-xl p-8 space-y-6">
          {/* Error Message */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Info Message */}
          <div className="bg-muted rounded-lg p-4 space-y-2">
            <p className="text-sm text-muted-foreground">
              We sent a verification email to{" "}
              <span className="font-semibold text-foreground">{email || "your email"}</span>.
            </p>
            <p className="text-sm text-muted-foreground">
              <strong>Option 1:</strong> Click the verification link in your email (easiest method)
            </p>
            <p className="text-sm text-muted-foreground">
              <strong>Option 2:</strong> If you received a 6-digit code, enter it below
            </p>
          </div>

          <form onSubmit={handleVerifyCode} className="space-y-4">
            {/* Email (if not set) */}
            {!email && (
              <div>
                <label className="block text-sm font-semibold mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="pl-10"
                    required
                  />
                </div>
              </div>
            )}

            {/* Verification Code */}
            <div>
              <label className="block text-sm font-semibold mb-2">
                Verification Code
              </label>
              <Input
                type="text"
                value={verificationCode}
                onChange={(e) => {
                  setVerificationCode(e.target.value)
                  setError("")
                }}
                placeholder="Enter 6-digit code"
                className="text-center text-2xl tracking-widest font-mono"
                maxLength={6}
                required
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-2">
                Enter the 6-digit code from your email
              </p>
            </div>

            {/* Submit Button */}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Verifying..." : "Verify Email"}
            </Button>
          </form>

          {/* Resend Code */}
          <div className="pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground text-center mb-3">
              Didn't receive the code?
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleResendCode}
              disabled={isResending || !email}
            >
              {isResending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4 mr-2" />
                  Resend Verification Code
                </>
              )}
            </Button>
          </div>

          {/* Alternative: Email Link */}
          <div className="pt-4 border-t border-border">
            <p className="text-sm font-semibold text-center mb-2">
              Prefer clicking a link?
            </p>
            <p className="text-xs text-muted-foreground text-center mb-3">
              Check your email for a verification link. Click it to verify your account automatically.
            </p>
            <p className="text-xs text-muted-foreground text-center">
              If you don't see the email, check your spam folder or wait a few minutes.
            </p>
          </div>

          {/* Back to Sign In */}
          <div className="pt-4 border-t border-border">
            <Link
              to="/signin"
              className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Sign In
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted">
          <div className="animate-pulse text-muted-foreground">Loading verification page...</div>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  )
}

