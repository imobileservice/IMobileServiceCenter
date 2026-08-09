import { Router } from 'express'
import {
  loginSupplierHandler,
  logoutSupplierHandler,
  requireSupplier,
  supplierSessionHandler,
} from './auth'
import { supplierCatalogHandler } from './catalog'
import {
  cancelSupplierOrderHandler,
  createSupplierOrderHandler,
  listSupplierOrdersHandler,
} from './orders'

const router = Router()

// Public: the only routes a signed-out shop can reach.
router.post('/login', loginSupplierHandler)
router.post('/logout', logoutSupplierHandler)

/*
 * Everything below is behind requireSupplier, which pins the shop id from the
 * session onto the request. Keep it that way: a route added above this line
 * would be reachable by anyone on the internet.
 */
router.use(requireSupplier)

router.get('/session', supplierSessionHandler)
router.get('/catalog', supplierCatalogHandler)
router.get('/orders', listSupplierOrdersHandler)
router.post('/orders', createSupplierOrderHandler)
router.post('/orders/:id/cancel', cancelSupplierOrderHandler)

export default router
