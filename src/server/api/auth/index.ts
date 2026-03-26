import { Router, Request, Response, NextFunction } from 'express'
import { signinHandler } from './signin'
import { signupHandler } from './signup'
import { verifyOtpHandler } from './verify-otp'
import { callbackHandler } from './callback'
import { sessionHandler } from './session'
import { signoutHandler } from './signout'
import { verifyEmailHandler, resendVerificationHandler } from './verify-email'

const router = Router()

// Async error wrapper to catch promise rejections
const asyncHandler = (fn: (req: Request, res: Response, next?: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Set Content-Type immediately for API routes
    res.setHeader('Content-Type', 'application/json')

    Promise.resolve(fn(req, res, next)).catch((error) => {
      console.error('[asyncHandler] Caught error:', error)
      console.error('[asyncHandler] Error stack:', error?.stack)
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'application/json')
        res.status(error.status || 500).json({
          error: error.message || 'Internal Server Error',
          ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
        })
      } else {
        console.error('[asyncHandler] Cannot send error response - headers already sent')
      }
    })
  }
}

router.post('/signin', asyncHandler(signinHandler))
router.post('/signup', asyncHandler(signupHandler))
router.post('/verify-otp', asyncHandler(verifyOtpHandler))
router.post('/verify-email', asyncHandler(verifyEmailHandler))
router.post('/resend-verification', asyncHandler(resendVerificationHandler))
router.get('/callback', asyncHandler(callbackHandler))
router.get('/session', asyncHandler(sessionHandler))
router.post('/signout', asyncHandler(signoutHandler))

export default router

