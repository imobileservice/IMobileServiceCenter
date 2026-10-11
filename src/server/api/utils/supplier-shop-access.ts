import { NextFunction, Request, Response } from 'express'
import { isSupplierShopOwner } from '../../../config/features'
import { requireAdmin } from './panel-auth'
import { hasValidTillSession } from './inventory-guard'

// Always require a verified administrator session, even when the inventory
// guard is permissive or ADMIN_API_OPEN is enabled elsewhere.
export async function requireSupplierShopOwner(req: Request, res: Response, next: NextFunction) {
  return requireAdmin(req, res, () => {
    if (!isSupplierShopOwner({ email: req.actor?.email, role: req.actor?.type })) {
      return res.status(403).json({ error: 'Supplier shop access is restricted to the owner', code: 'FORBIDDEN' })
    }
    next()
  })
}

// Cashiers may list registered shops and process orders through an open till.
// Supplier management, password access, cancellation and deletion stay owner-only.
export async function requireSupplierShopStaff(req: Request, res: Response, next: NextFunction) {
  const path = req.originalUrl.split('?')[0].replace(/\/+$/, '')
  const shopsList = req.method === 'GET' && path === '/api/inventory/suppliers' && req.query.with_stats !== 'true'
  const ordersRoot = path === '/api/inventory/supplier-orders'
  const orderDetail = /^\/api\/inventory\/supplier-orders\/[^/]+$/.test(path)
  const orderAction = (req.method === 'GET' && (ordersRoot || orderDetail)) ||
    (req.method === 'POST' && ordersRoot) ||
    (req.method === 'PUT' && orderDetail && ['confirmed', 'ready', 'completed'].includes(req.body?.status))
  if ((shopsList || orderAction) && await hasValidTillSession(req)) return next()
  return requireSupplierShopOwner(req, res, next)
}
