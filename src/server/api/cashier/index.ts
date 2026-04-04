import { Router } from 'express'
import { initCashierLoginHandler, verifyCashierLoginHandler } from './login'

const router = Router()

// Cashier Auth endpoints
router.post('/login/init', initCashierLoginHandler)
router.post('/login/verify', verifyCashierLoginHandler)

export default router
