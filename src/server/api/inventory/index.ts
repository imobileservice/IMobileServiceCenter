import { Router } from 'express'
import productsController from './products.controller'
import stockController from './stock.controller'
import salesController from './sales.controller'
import purchasesController from './purchases.controller'
import suppliersController from './suppliers.controller'
import customersController from './customers.controller'
import reportsController from './reports.controller'

const router = Router()

// Mount inventory sub-routes
router.use('/products', productsController)
router.use('/stock', stockController)
router.use('/sales', salesController)
router.use('/purchases', purchasesController)
router.use('/suppliers', suppliersController)
router.use('/customers', customersController)
router.use('/reports', reportsController)

export default router
