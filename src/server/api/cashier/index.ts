import { Router } from 'express'
import { loginCashierHandler, logoutCashierHandler } from './login'

const router = Router()

// Cashier Auth endpoints
router.post('/login', loginCashierHandler)
router.post('/logout', logoutCashierHandler)

export default router
