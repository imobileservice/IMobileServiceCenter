"use client"

import type React from "react"

import { useState, useRef } from "react"
import { motion } from "framer-motion"
import { Link, useNavigate } from "react-router-dom"
import { User, Mail, Phone, Lock, Eye, EyeOff, AlertCircle, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuthStore } from "@/lib/store"
import { authService } from "@/lib/supabase/services/auth"
import { validatePassword, validateEmail } from "@/lib/utils/auth-validation"
import { toast } from "sonner"
import HCaptcha from "@hcaptcha/react-hcaptcha"

export default function SignUpPage() {
  const navigate = useNavigate()
  const setUser = useAuthStore((state) => state.setUser)
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    whatsapp: "",
    password: "",
    confirmPassword: "",
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [passwordValidation, setPasswordValidation] = useState<{ isValid: boolean; errors: string[] } | null>(null)
  const [successMessage, setSuccessMessage] = useState("")
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const captchaRef = useRef<HCaptcha>(null)
  // MIGRATION: Support both Vite (VITE_*) and Next.js (NEXT_PUBLIC_*) env var names
  const hcaptchaSiteKey = import.meta.env.VITE_HCAPTCHA_SITE_KEY || import.meta.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY
  const showSignupCaptchaUI = (import.meta.env.VITE_SHOW_SIGNUP_CAPTCHA_UI || import.meta.env.NEXT_PUBLIC_SHOW_SIGNUP_CAPTCHA_UI) === "true"
  const enforceSignupCaptcha = (import.meta.env.VITE_ENFORCE_SIGNUP_CAPTCHA || import.meta.env.NEXT_PUBLIC_ENFORCE_SIGNUP_CAPTCHA) === "true"

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    
    // Clear error for this field
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }))
    }

    // Validate password in real-time
    if (name === "password" && value) {
      const validation = validatePassword(value)
      setPasswordValidation(validation)
    } else if (name === "password" && !value) {
      setPasswordValidation(null)
    }

    // Clear success message on change
    if (successMessage) {
      setSuccessMessage("")
    }
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.fullName.trim()) {
      newErrors.fullName = "Full name is required"
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required"
    } else if (!validateEmail(formData.email)) {
      newErrors.email = "Please enter a valid email address"
    }

    if (!formData.whatsapp.trim()) {
      newErrors.whatsapp = "WhatsApp number is required"
    }

    // Password validation
    if (!formData.password) {
      newErrors.password = "Password is required"
    } else {
      const validation = validatePassword(formData.password)
      if (!validation.isValid) {
        newErrors.password = validation.errors[0]
        setPasswordValidation(validation)
      }
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      toast.error("Please fix the errors in the form")
      return
    }

    // If captcha enforcement is enabled, ensure token is present
    if (enforceSignupCaptcha && !captchaToken) {
      setErrors({ general: "Please complete the captcha verification" })
      toast.error("Please complete the captcha verification")
      return
    }

    setIsLoading(true)
    setErrors({})
    setSuccessMessage("")

    let timeoutId: NodeJS.Timeout | undefined

    try {
      // Sign up with Supabase with a timeout guard to avoid indefinite hangs
      // We increased this to 60s to be extra safe during cloud deployments
      const timeoutDuration = 60000

      const signUpPromise = authService.signUp(
        formData.email,
        formData.password,
        formData.fullName,
        formData.whatsapp,
        enforceSignupCaptcha ? captchaToken || undefined : undefined
      )
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            new Error(
              `Signup request timed out after ${timeoutDuration / 1000}s. Please check your internet connection and Supabase availability, then try again.`
            )
          )
        }, timeoutDuration)
      })

      const { user, session } = await Promise.race([signUpPromise, timeoutPromise]) as any
      if (timeoutId) clearTimeout(timeoutId)

      if (user) {
        // Note: Profile update is handled in the background by authService.signUp
        // The database trigger should create the profile automatically
        // If we need to update it immediately, we can do so, but it's not critical
        // The background update in authService will handle it with retries
        
        // Optionally, try to update profile here as well (non-blocking)
        if (user.id && (formData.whatsapp || formData.fullName)) {
          // Run in background, don't block signup flow
          setTimeout(async () => {
            try {
              // Wait a bit for the trigger to create the profile
              await new Promise((resolve) => setTimeout(resolve, 2000))
              
              const updates: { name?: string; whatsapp?: string } = {}
              if (formData.fullName) updates.name = formData.fullName
              if (formData.whatsapp) updates.whatsapp = formData.whatsapp
              
              await authService.updateProfile(user.id, updates)
              console.log("Profile updated successfully in background")
            } catch (profileError: any) {
              // Non-critical error - profile update can happen later
              console.warn("Background profile update failed (non-critical):", {
                message: profileError?.message,
                code: profileError?.code,
              })
              // User can update their profile later from their account settings
            }
          }, 100)
        }

        // Store email for verification page
        if (typeof window !== "undefined") {
          localStorage.setItem("signup_email", formData.email)
        }

        // Check if email confirmation is required
        if (session) {
          // User is immediately signed in
          setUser({
            id: user.id,
            name: formData.fullName,
            email: user.email || formData.email,
            whatsapp: formData.whatsapp,
          })
          toast.success("Account created successfully!")
          navigate("/")
        } else {
          // Email confirmation required
          setSuccessMessage(
            "Account created! Please check your email to verify your account before signing in."
          )
          toast.success("Please check your email to verify your account", {
            description: "You can also enter the verification code on the next page",
            duration: 5000,
          })
          // Redirect to verification page
          setTimeout(() => {
            navigate(`/verify-email?email=${encodeURIComponent(formData.email)}`)
          }, 2000)
        }
      }
    } catch (error: any) {
      if (timeoutId) clearTimeout(timeoutId)
      console.error("Sign up error:", error)
      
      // Reset captcha on error
      if (captchaRef.current) {
        captchaRef.current.resetCaptcha()
      }
      setCaptchaToken(null)
      
      // Handle specific error cases
      if (error.message?.includes("already registered") || error.message?.includes("Account already exists")) {
        // Check if it's an OAuth account
        if (error.code === 'ACCOUNT_EXISTS_OAUTH' || error.message?.includes("Google sign-in")) {
          setErrors({ 
            email: "An account with this email already exists using Google sign-in. Please sign in with Google instead.",
            general: "You can sign in using the 'Sign in with Google' button on the sign in page."
          })
          toast.error("Account exists with Google", {
            description: "Please use Google OAuth to sign in with this email",
            duration: 6000
          })
        } else {
          setErrors({ email: "This email is already registered. Please sign in instead." })
          toast.error("Email already registered", {
            description: "Use the sign in page to access your account"
          })
        }
      } else if (error.message?.includes("invalid email")) {
        setErrors({ email: "Please enter a valid email address" })
        toast.error("Invalid email address")
      } else if (error.message?.includes("Password")) {
        setErrors({ password: error.message })
        toast.error("Password validation failed")
      } else if (error.message?.includes("captcha")) {
        const message = "Captcha verification failed. Please complete the captcha again and ensure the site key matches the Supabase configuration."
        setErrors({ general: message })
        toast.error("Captcha verification failed", { description: message })
      } else if (error.message?.includes("timed out") || error.message?.includes("timeout")) {
        // Account may have been created on the server but response didn't return in time
        const message = "The request timed out, but your account may have been created. Please try signing in with your email and password."
        setErrors({ general: message })
        toast.error("Request timed out", { 
          description: "Try signing in — your account may already exist!",
          duration: 8000
        })
      } else {
        setErrors({ general: error.message || "Failed to create account. Please try again." })
        toast.error(error.message || "Failed to create account")
      }
    } finally {
      setIsLoading(false)
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted flex items-center justify-center p-4">
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center text-white mx-auto mb-4">
            📱
          </div>
          <h1 className="text-3xl font-bold mb-2">Create Account</h1>
          <p className="text-muted-foreground">Join IMobile Service Center and start shopping</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-8 space-y-4">
          {/* Success Message */}
          {successMessage && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-green-800 dark:text-green-200">{successMessage}</p>
            </div>
          )}

          {/* General Error */}
          {errors.general && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
              <p className="text-sm text-destructive">{errors.general}</p>
            </div>
          )}

          {/* Full Name */}
          <div>
            <label className="block text-sm font-semibold mb-2">Full Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type="text"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                placeholder="John Doe"
                className="pl-10"
                required
              />
            </div>
            {errors.fullName && <p className="text-xs text-destructive mt-1">{errors.fullName}</p>}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-semibold mb-2">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="you@example.com"
                className="pl-10"
              />
            </div>
            {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
          </div>

          {/* WhatsApp */}
          <div>
            <label className="block text-sm font-semibold mb-2">WhatsApp Number</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type="tel"
                name="whatsapp"
                value={formData.whatsapp}
                onChange={handleChange}
                placeholder="+1 (555) 123-4567"
                className="pl-10"
              />
            </div>
            {errors.whatsapp && <p className="text-xs text-destructive mt-1">{errors.whatsapp}</p>}
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-semibold mb-2">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type={showPassword ? "text" : "password"}
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="••••••••"
                className="pl-10 pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-destructive mt-1">{errors.password}</p>}
            {passwordValidation && !passwordValidation.isValid && formData.password && (
              <div className="mt-2 space-y-1">
                {passwordValidation.errors.map((error, idx) => (
                  <p key={idx} className="text-xs text-muted-foreground flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {error}
                  </p>
                ))}
              </div>
            )}
            {passwordValidation?.isValid && formData.password && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Password meets all requirements
              </p>
            )}
            {!passwordValidation && formData.password && (
              <p className="text-xs text-muted-foreground mt-1">
                Password must be at least 6 characters and include lowercase, uppercase, digits, and symbols
              </p>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm font-semibold mb-2">Confirm Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type={showPassword ? "text" : "password"}
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="••••••••"
                className="pl-10 pr-10"
                required
              />
            </div>
            {errors.confirmPassword && <p className="text-xs text-destructive mt-1">{errors.confirmPassword}</p>}
            {formData.confirmPassword && formData.password === formData.confirmPassword && !errors.confirmPassword && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Passwords match
              </p>
            )}
          </div>

          {/* Terms */}
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="w-4 h-4 rounded mt-0.5" required />
            <span>
              I agree to the{" "}
              <a href="#" className="text-primary hover:underline">
                Terms of Service
              </a>{" "}
              and{" "}
              <a href="#" className="text-primary hover:underline">
                Privacy Policy
              </a>
            </span>
          </label>

          {/* hCaptcha */}
          {showSignupCaptchaUI && hcaptchaSiteKey ? (
            <div className="flex justify-center">
              <HCaptcha
                ref={captchaRef}
                sitekey={hcaptchaSiteKey!}
                onVerify={(token) => {
                  setCaptchaToken(token)
                  setErrors((prev) => {
                    const newErrors = { ...prev }
                    delete newErrors.general
                    return newErrors
                  })
                }}
                onExpire={() => {
                  setCaptchaToken(null)
                }}
                onError={(error) => {
                  console.error("hCaptcha error:", error)
                  setCaptchaToken(null)
                  setErrors({ general: "Captcha verification failed. Please try again." })
                  toast.error("Captcha verification failed")
                }}
              />
            </div>
          ) : null}

          {/* Submit Button */}
          <Button type="submit" className="w-full" disabled={isLoading || (enforceSignupCaptcha && !captchaToken)}>
            {isLoading ? "Creating account..." : "Create Account"}
          </Button>
        </form>

        {/* Sign In Link */}
        <p className="text-center text-sm text-muted-foreground mt-6">
          Already have an account?{" "}
          <Link to="/signin" className="text-primary font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
