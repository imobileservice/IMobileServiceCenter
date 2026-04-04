import { Router, Request, Response, NextFunction } from 'express'
import authRouter from './auth'
import productsRouter from './products'
import adminRouter from './admin'
import ordersRouter from './orders'
import addressesRouter from './addresses'
import profileRouter from './profile'
import userRouter from './user'
import cartRouter from './cart'
import heroSlidesRouter from './hero-slides'
import emailRouter from './email'
import inventoryRouter from './inventory'
import { testEnvHandler } from './test-env'
import cashierRouter from './cashier'

const router = Router()

// Async error wrapper for route handlers
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      console.error('[API Router] Unhandled async error:', error)
      if (!res.headersSent) {
        res.status(error.status || 500).json({
          error: error.message || 'Internal Server Error',
          ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
        })
      }
    })
  }
}

// Mount route handlers
router.use('/auth', authRouter)
router.use('/products', productsRouter)
router.use('/admin', adminRouter)
router.use('/cashier', cashierRouter)
router.use('/orders', ordersRouter)
router.use('/addresses', addressesRouter)
router.use('/profile', profileRouter)
router.use('/user', userRouter)
router.use('/cart', cartRouter)
router.use('/hero-slides', heroSlidesRouter)
router.use('/email', emailRouter)
router.use('/inventory', inventoryRouter)
router.get('/test-env', asyncHandler(testEnvHandler))

export default router

