import { Router } from 'express'
import { listHandler } from './list'
import { categoriesHandler } from './categories'
import { detailHandler } from './detail'
import { featuredHandler } from './featured'
import {
  compatibilityBrandsHandler,
  compatibilityModelsHandler,
  customerModelsHandler,
} from './compatibility'

const router = Router()

router.get('/list', listHandler)
router.get('/categories', categoriesHandler)
router.get('/featured', featuredHandler)
// Phone compatibility lookups must be declared before '/:id', otherwise
// "compatibility" is read as a product id.
router.get('/compatibility/brands', compatibilityBrandsHandler)
router.get('/compatibility/models', compatibilityModelsHandler)
// Names one phone for a set of cart lines - never the full fit list.
router.post('/customer-models', customerModelsHandler)
router.get('/:id', detailHandler)

export default router

