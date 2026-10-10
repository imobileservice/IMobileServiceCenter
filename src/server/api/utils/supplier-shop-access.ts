import { NextFunction, Request, Response } from 'express'
import { isSupplierShopOwner } from '../../../config/features'
import { requireAdmin } from './panel-auth'

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
