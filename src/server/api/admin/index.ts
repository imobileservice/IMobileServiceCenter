import { Router } from 'express'
import { initAdminLoginHandler, verifyAdminLoginHandler } from './login'
import { getOrdersHandler, getOrderByIdHandler, getCustomersHandler, getMessagesHandler, getStatsHandler } from './data'
import {
  createProductHandler,
  updateProductHandler,
  deleteProductHandler,
  updateOrderStatusHandler,
  updateMessageStatusHandler,
  updateCustomerHandler,
  deleteCustomerHandler,
  deleteMessageHandler,
} from './crud'
import {
  getCategoriesHandler,
  getCategoryHandler,
  createCategoryHandler,
  updateCategoryHandler,
  deleteCategoryHandler,
} from './categories'
import { getSettingHandler, updateSettingHandler } from './settings'
import {
  getAllSlidesHandler,
  createSlideHandler,
  updateSlideHandler,
  deleteSlideHandler,
} from './hero-slides'
import { productSearchHandler } from './product-search'


const router = Router()

// New 2-Factor Login Flow
router.post('/login/init', initAdminLoginHandler)
router.post('/login/verify', verifyAdminLoginHandler)

// Old OTP routes - Deprecated/Removed
// router.post('/otp/generate', generateOtpHandler)
// router.post('/otp/verify', verifyOtpHandler)

// Admin data endpoints (use service role key)
router.get('/data/orders', getOrdersHandler)
router.get('/data/orders/:id', getOrderByIdHandler)
router.get('/data/customers', getCustomersHandler)
router.get('/data/messages', getMessagesHandler)
router.get('/data/stats', getStatsHandler)

// Admin CRUD endpoints (use service role key)
router.post('/products', createProductHandler)
router.put('/products/:id', updateProductHandler)
router.delete('/products/:id', deleteProductHandler)

// Product auto-search endpoint
router.post('/product-search', productSearchHandler)


router.put('/orders/:id/status', updateOrderStatusHandler)

router.put('/customers/:id', updateCustomerHandler)
router.delete('/customers/:id', deleteCustomerHandler)

router.put('/messages/:id/status', updateMessageStatusHandler)
router.delete('/messages/:id', deleteMessageHandler)

// Admin category endpoints
router.get('/categories', getCategoriesHandler)
router.get('/categories/:id', getCategoryHandler)
router.post('/categories', createCategoryHandler)
router.put('/categories/:id', updateCategoryHandler)
router.delete('/categories/:id', deleteCategoryHandler)

// Admin settings endpoints
router.get('/settings/:key', getSettingHandler)
router.put('/settings/:key', updateSettingHandler)

// Admin hero slides endpoints
router.get('/hero-slides', getAllSlidesHandler)
router.post('/hero-slides', createSlideHandler)
router.put('/hero-slides/:id', updateSlideHandler)
router.delete('/hero-slides/:id', deleteSlideHandler)

// Admin filters endpoints
import { filtersRouter } from './filters'
router.use('/filters', filtersRouter)

export default router

