import type { NextFunction, Request, Response } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CASHIER_ALLOWED_CATEGORIES, isRestrictedCashier } from '../../../config/cashier-catalog-access'
import { getVerifiedTillSession, TILL_SESSION_HEADER } from './inventory-guard'
import { resolvePanelActor } from './panel-session'

export const allowedCashierCategoryIds = CASHIER_ALLOWED_CATEGORIES.map(category => category.id)

// Resolve identity from the server's live till session, never a claimed name/id/shop.
export async function attachCashierCatalogAccess(req: Request, res: Response, next: NextFunction) {
  // Express route matching is case insensitive by default.
  const path = req.path.toLowerCase().replace(/\/+$/, '')
  if (!/^\/(inventory|admin|products)(\/|$)/.test(path)) return next()
  if (!req.headers[TILL_SESSION_HEADER] && !req.body?.pos_session_token) {
    // A delivery PDF also contains products. A plain tab needs an admin session;
    // cashier screens fetch it with their till header before opening a blob URL.
    if (/^\/admin\/orders\/[^/]+\/delivery-bill$/.test(path)) {
      const actor = await resolvePanelActor(req)
      if (actor?.type !== 'admin') return res.status(401).json({ error: 'Sign in to view this invoice' })
      req.actor = actor
    }
    return next()
  }
  const session = await getVerifiedTillSession(req)
  if (!session) return res.status(401).json({ error: 'Invalid or expired till session. Please sign in again.' })
  if (!isRestrictedCashier({ id: session.cashier_id, role: session.role, shop: session.shop })) return next()
  req.cashierCatalogRestricted = true

  const readable = req.method === 'GET' && (
    /^\/inventory\/products(?:\/[^/]+|\/barcode\/[^/]+)?$/.test(path) ||
    path === '/inventory/categories' ||
    /^\/inventory\/sales(?:\/[^/]+|\/invoice\/[^/]+|\/today\/summary)?$/.test(path) ||
    /^\/inventory\/supplier-orders(?:\/[^/]+)?$/.test(path) ||
    path === '/inventory/customers' || path === '/inventory/suppliers'
  )
  const writable = (req.method === 'POST' && ['/inventory/sales', '/inventory/sales/return', '/inventory/customers', '/inventory/supplier-orders'].includes(path)) ||
    (req.method === 'PUT' && /^\/inventory\/supplier-orders\/[^/]+$/.test(path) && ['confirmed', 'ready', 'completed'].includes(req.body?.status))
  if (readable || writable) return next()
  return res.status(403).json({ error: 'This cashier can access only Display and On Off Ribbon products.', code: 'CASHIER_CATEGORY_RESTRICTED' })
}

export function cashierCanSeeProduct(req: Request, product: any) {
  return !req.cashierCatalogRestricted || allowedCashierCategoryIds.includes(product?.category_id)
}

export function cashierCategoryLabel(req: Request, product: any) {
  return req.cashierCatalogRestricted
    ? CASHIER_ALLOWED_CATEGORIES.find(category => category.id === product.category_id)?.name
    : product.category || product.category_id
}

export async function cashierCanAccessProducts(supabase: SupabaseClient, req: Request, ids: unknown[]) {
  if (!req.cashierCatalogRestricted) return true
  if (!ids.length || ids.some(id => typeof id !== 'string' || !id)) return false
  const unique = [...new Set(ids as string[])]
  for (let offset = 0; offset < unique.length; offset += 100) {
    const batch = unique.slice(offset, offset + 100)
    const { data, error } = await supabase.from('products').select('id, category_id').in('id', batch)
    if (error) throw error
    if (data?.length !== batch.length || data.some(product => !cashierCanSeeProduct(req, product))) return false
  }
  return true
}

async function filterCashierRecords(supabase: SupabaseClient, req: Request, sales: any[], itemsKey: string) {
  if (!req.cashierCatalogRestricted || !sales.length) return sales
  const ids = [...new Set(sales.flatMap(sale => (sale[itemsKey] || []).map((item: any) => item.product_id)).filter(Boolean))]
  const allowed = new Set<string>()
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await supabase.from('products').select('id, category_id').in('id', ids.slice(offset, offset + 100))
    if (error) throw error
    for (const product of data || []) if (cashierCanSeeProduct(req, product)) allowed.add(product.id)
  }
  // Hide mixed records as a whole, preserving the meaning of their stored totals.
  return sales.filter(sale => sale[itemsKey]?.length && sale[itemsKey].every((item: any) => allowed.has(item.product_id)))
}

export const filterCashierSales = (supabase: SupabaseClient, req: Request, sales: any[]) =>
  filterCashierRecords(supabase, req, sales, 'inv_sale_items')

export const filterCashierSupplierOrders = (supabase: SupabaseClient, req: Request, orders: any[]) =>
  filterCashierRecords(supabase, req, orders, 'inv_supplier_order_items')
