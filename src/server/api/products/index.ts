import { Router } from 'express'
import { listHandler } from './list'
import { categoriesHandler } from './categories'
import { detailHandler } from './detail'
import { featuredHandler } from './featured'
import { compatibilityBrandsHandler, compatibilityModelsHandler } from './compatibility'

const router = Router()

router.get('/list', listHandler)
router.get('/categories', categoriesHandler)
router.get('/featured', featuredHandler)
// Phone compatibility lookups must be declared before '/:id', otherwise
// "compatibility" is read as a product id.
router.get('/compatibility/brands', compatibilityBrandsHandler)
router.get('/compatibility/models', compatibilityModelsHandler)
router.get('/:id', detailHandler)

export default router

