/**
 * /api/assistant - the assistant admin surface.
 *
 * Everything below /login and /verify-email requires a live session, and every
 * working route additionally names the permission it needs. The three-line
 * summary of the whole design is here: a route either exists in this file, in
 * which case an assistant may reach it with the right permission, or it does
 * not exist for them at all.
 */
import { Router } from 'express'
import { attachActor, requireAssistant } from '../utils/panel-auth'
import {
  assistantLogoutHandler,
  assistantSessionHandler,
  changeAssistantPasswordHandler,
  initAssistantLoginHandler,
  resendAssistantOtpHandler,
  verifyAssistantEmailHandler,
  verifyAssistantLoginHandler,
} from './auth'
import {
  assistantAdjustStockHandler,
  assistantCancelRequestHandler,
  assistantCreateCategoryHandler,
  assistantCreateProductHandler,
  assistantListCategoriesHandler,
  assistantListProductsHandler,
  assistantListRequestsHandler,
  assistantOverviewHandler,
  assistantRequestCategoryDeleteHandler,
  assistantRequestCategoryEditHandler,
  assistantRequestProductDeleteHandler,
  assistantRequestProductEditHandler,
  assistantSecurityEventHandler,
  assistantStockHandler,
} from './controller'

const router = Router()

/* --- Public: obtaining a session, and confirming an address --------- */
router.post('/login/init', initAssistantLoginHandler)
router.post('/login/resend', resendAssistantOtpHandler)
router.post('/login/verify', verifyAssistantLoginHandler)
router.post('/verify-email', verifyAssistantEmailHandler)

/* --- Everything past here is resolved against a session ------------- */
router.use(attachActor)

router.post('/logout', assistantLogoutHandler)
router.get('/session', assistantSessionHandler)

// Reachable while must_change_password is set - it is the way out of that
// state - so it is mounted before the permission-checking middleware.
router.post('/password', changeAssistantPasswordHandler)

router.post('/security-event', requireAssistant(), assistantSecurityEventHandler)

/* --- Dashboard ------------------------------------------------------ */
router.get('/overview', requireAssistant('dashboard.view'), assistantOverviewHandler)

/* --- Products ------------------------------------------------------- */
router.get('/products', requireAssistant('products.view'), assistantListProductsHandler)
router.post('/products', requireAssistant('products.create'), assistantCreateProductHandler)
router.post(
  '/products/:id/edit-request',
  requireAssistant('products.edit_request'),
  assistantRequestProductEditHandler
)
router.post(
  '/products/:id/delete-request',
  requireAssistant('products.delete_request'),
  assistantRequestProductDeleteHandler
)

/* --- Categories ----------------------------------------------------- */
router.get('/categories', requireAssistant('categories.view'), assistantListCategoriesHandler)
router.post('/categories', requireAssistant('categories.create'), assistantCreateCategoryHandler)
router.post(
  '/categories/:id/edit-request',
  requireAssistant('categories.edit_request'),
  assistantRequestCategoryEditHandler
)
router.post(
  '/categories/:id/delete-request',
  requireAssistant('categories.delete_request'),
  assistantRequestCategoryDeleteHandler
)

/* --- Inventory ------------------------------------------------------ */
router.get('/inventory/stock', requireAssistant('inventory.view'), assistantStockHandler)
router.put(
  '/inventory/stock/:productId',
  requireAssistant('inventory.adjust'),
  assistantAdjustStockHandler
)

/* --- Own approval queue --------------------------------------------- */
router.get('/requests', requireAssistant(), assistantListRequestsHandler)
router.post('/requests/:id/cancel', requireAssistant(), assistantCancelRequestHandler)

export default router
