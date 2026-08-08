import { Router } from 'express'
import {
  loginSupplierHandler,
  logoutSupplierHandler,
  requireSupplier,
  supplierSessionHandler,
} from './auth'
import { supplierRestockHandler, supplierRespondHandler } from './portal'

const router = Router()

// Public: the only routes a signed-out supplier can reach.
router.post('/login', loginSupplierHandler)
router.post('/logout', logoutSupplierHandler)

/*
 * Everything below is behind requireSupplier, which pins the supplier id from
 * the session onto the request. Keep it that way: a route added above this line
 * would be reachable by anyone on the internet.
 */
router.use(requireSupplier)

router.get('/session', supplierSessionHandler)
router.get('/restock', supplierRestockHandler)
router.post('/respond', supplierRespondHandler)

export default router
