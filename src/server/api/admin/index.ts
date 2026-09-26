import { Router } from 'express'
import { initAdminLoginHandler, verifyAdminLoginHandler, resendAdminOtpHandler } from './login'
import { getOrdersHandler, getOrderByIdHandler, getCustomersHandler, getMessagesHandler, getStatsHandler } from './data'
import {
  createProductHandler,
  updateProductHandler,
  deleteProductHandler,
  updateOrderStatusHandler,
  downloadDeliveryBillHandler,
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
import { getBrandsHandler, createBrandHandler, getBrandModelsHandler } from './brands'
import {
  getPhoneModelsHandler,
  createPhoneModelHandler,
  bulkCreatePhoneModelsHandler,
  updatePhoneModelHandler,
  deletePhoneModelHandler,
  getProductCompatibilityHandler,
  setProductCompatibilityHandler,
  bulkProductCompatibilityHandler,
} from './phone-models'
import { importCompatibilityHandler } from './compatibility-import'
import { guardAdminApi } from '../utils/panel-auth'
import { adminLogoutHandler, adminSessionHandler } from './session'
import {
    approveAssistantRequestHandler,
    assistantActivityHandler,
    createAssistantHandler,
    deleteAssistantHandler,
    getAssistantHandler,
    listAssistantRequestsHandler,
    listAssistantsHandler,
    rejectAssistantRequestHandler,
    resendAssistantVerificationHandler,
    resetAssistantPasswordHandler,
    revokeAssistantSessionsHandler,
    setAssistantStatusHandler,
    updateAssistantHandler,
} from './assistants'


const router = Router()
console.log('✅ Admin Router Module Loaded and Initialized');

// Diagnostic middleware for all admin routes
router.use((req, res, next) => {
    console.log(`[Admin Router] Request received: ${req.method} ${req.originalUrl}`);
    next();
});

// Two-step login: credentials -> emailed one-time code
router.post('/login/init', initAdminLoginHandler)
router.post('/login/resend', resendAdminOtpHandler)
router.post('/login/verify', verifyAdminLoginHandler)

// Everything below this line requires an administrator session.
//
// The routes above are the only way to obtain one, so they sit in front of the
// gate; /orders/:id/delivery-bill is also let through, because the cashier
// terminal opens it with window.open() and a new tab cannot carry a header.
// See guardAdminApi for the exact exemption list and the emergency override.
router.use(guardAdminApi)

router.get('/session', adminSessionHandler)
router.post('/logout', adminLogoutHandler)

// Diagnostic SMTP test (Admin only)
import { testEmailHandler } from './test-email'
router.get('/test-email', testEmailHandler)

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

// Phone model compatibility: one product <-> many phone models.
// Declared before nothing else touches /products/:id, so ordering is free here.
// Declared before '/products/:id/compatibility' so "compatibility" is not read
// as a product id.
router.post('/products/compatibility/bulk', bulkProductCompatibilityHandler)
router.get('/products/:id/compatibility', getProductCompatibilityHandler)
router.put('/products/:id/compatibility', setProductCompatibilityHandler)

router.get('/phone-models', getPhoneModelsHandler)
router.post('/phone-models', createPhoneModelHandler)
router.post('/phone-models/bulk', bulkCreatePhoneModelsHandler)
router.put('/phone-models/:id', updatePhoneModelHandler)
router.delete('/phone-models/:id', deletePhoneModelHandler)

// Spreadsheet import: SKU | Product | Compatible Models
router.post('/compatibility/import', importCompatibilityHandler)

// Product auto-search endpoint (POST for production, GET for diagnostic check)
router.post('/product-search', productSearchHandler)
router.get('/product-search', (req, res) => {
    res.json({ message: 'Product search endpoint is active. Use POST to perform a search.', method: 'GET' });
})


router.put('/orders/:id/status', updateOrderStatusHandler)
router.get('/orders/:id/delivery-bill', downloadDeliveryBillHandler)

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

// Admin brand endpoints
router.get('/brands', getBrandsHandler)
router.post('/brands', createBrandHandler)
router.get('/brands/:name/models', getBrandModelsHandler)

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

import {
    getCashiersHandler,
    createCashierHandler,
    deleteCashierHandler,
    updateCashierHandler,
    getTillsHandler,
    createTillHandler,
    updateTillHandler,
} from './cashiers'
router.get('/cashiers', getCashiersHandler)
router.post('/cashiers', createCashierHandler)
router.put('/cashiers/:id', updateCashierHandler)
router.delete('/cashiers/:id', deleteCashierHandler)
router.get('/tills', getTillsHandler)
router.post('/tills', createTillHandler)
router.put('/tills/:id', updateTillHandler)

// Assistant admin accounts - creating them, setting what they may do, and
// reading everything they have done. See admin/assistants.ts.
router.get('/assistants', listAssistantsHandler)
router.post('/assistants', createAssistantHandler)
router.get('/assistants/:id', getAssistantHandler)
router.put('/assistants/:id', updateAssistantHandler)
router.delete('/assistants/:id', deleteAssistantHandler)
router.post('/assistants/:id/status', setAssistantStatusHandler)
router.post('/assistants/:id/password', resetAssistantPasswordHandler)
router.post('/assistants/:id/resend-verification', resendAssistantVerificationHandler)
router.post('/assistants/:id/revoke-sessions', revokeAssistantSessionsHandler)

// The approval queue: an assistant's edits and deletions wait here.
router.get('/assistant-requests', listAssistantRequestsHandler)
router.post('/assistant-requests/:id/approve', approveAssistantRequestHandler)
router.post('/assistant-requests/:id/reject', rejectAssistantRequestHandler)

router.get('/assistant-activity', assistantActivityHandler)

export default router
