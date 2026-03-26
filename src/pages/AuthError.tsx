"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams, useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import { Link } from "react-router-dom"
import { AlertCircle, Mail, RefreshCw, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { authService } from "@/lib/supabase/services/auth"
import { toast } from "sonner"

function AuthErrorContent() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [isResending, setIsResending] = useState(false)

  const errorCode = searchParams.get("error_code")
  const errorDescription = searchParams.get("error_description")
  const error = searchParams.get("error")

  // Extract email from error description if available
  useEffect(() => {
    if (errorDescription) {
      const emailMatch = errorDescription.match(/[\w\.-]+@[\w\.-]+\.\w+/)
      if (emailMatch) {
        setEmail(emailMatch[0])
      }
    }
  }, [errorDescription])

  const handleResendVerification = async () => {
    if (!email) {
      toast.error("Please enter your email address")
      return
    }

    setIsResending(true)
    try {
      // Note: Supabase doesn't have a direct "resend verification" API
      // Users need to sign up again or use password reset
      toast.info("Please use the 'Sign Up' page to create a new account or use 'Forgot Password' if you already have an account")
      navigate("/signup")
    } catch (error: any) {
      console.error("Resend error:", error)
      toast.error("Failed to resend verification. Please try signing up again.")
    } finally {
      setIsResending(false)
    }
  }

  const getErrorMessage = () => {
    if (errorCode === "otp_expired" || error === "otp_expired") {
      return {
        title: "Verification Link Expired",
        message: "The email verification link has expired. Email verification links are valid for 1 hour (3600 seconds) as configured in your settings.",
        solution: "Please request a new verification email or sign up again.",
      }
    } else if (errorCode === "access_denied" || error === "access_denied") {
      return {
        title: "Access Denied",
        message: errorDescription || "Your request was denied. This could happen if the link was already used or is invalid.",
        solution: "Please try signing up again or contact support if the problem persists.",
      }
    } else {
      return {
        title: "Authentication Error",
        message: errorDescription || error || "An error occurred during authentication.",
        solution: "Please try again or contact support if the problem persists.",
      }
    }
  }

  const errorInfo = getErrorMessage()

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="bg-card border border-border rounded-xl p-8 space-y-6 text-center">
          {/* Error Icon */}
          <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>

          {/* Error Title */}
          <h1 className="text-2xl font-bold">{errorInfo.title}</h1>

          {/* Error Message */}
          <p className="text-muted-foreground">{errorInfo.message}</p>

          {/* Solution */}
          <div className="bg-muted rounded-lg p-4">
            <p className="text-sm font-medium mb-2">What you can do:</p>
            <p className="text-sm text-muted-foreground">{errorInfo.solution}</p>
          </div>

          {/* Email Input for Resend (if OTP expired) */}
          {(errorCode === "otp_expired" || error === "otp_expired") && (
            <div className="space-y-4 pt-4 border-t border-border">
              <p className="text-sm font-medium">Request a new verification email:</p>
              <div className="flex gap-2">
                <Button
                  onClick={() => navigate("/signup")}
                  variant="outline"
                  className="flex-1"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Sign Up Again
                </Button>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col gap-3 pt-4">
            <Button onClick={() => navigate("/signin")} className="w-full">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go to Sign In
            </Button>
            <Button
              onClick={() => navigate("/signup")}
              variant="outline"
              className="w-full"
            >
              Create New Account
            </Button>
          </div>

          {/* Help Text */}
          <p className="text-xs text-muted-foreground">
            Need help?{" "}
            <Link to="/contact" className="text-primary hover:underline">
              Contact Support
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  )
}

export default function AuthErrorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted">
          <div className="animate-pulse text-muted-foreground">Loading error details...</div>
        </div>
      }
    >
      <AuthErrorContent />
    </Suspense>
  )
}

