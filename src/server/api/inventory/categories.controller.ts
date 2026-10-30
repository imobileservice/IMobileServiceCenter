import { Router } from 'express'
import { getSupabaseAdmin } from './supabase-admin'
import { allowedCashierCategoryIds } from '../utils/cashier-catalog-access'

const router = Router()
router.get('/', async (req, res) => {
  try {
    let query = getSupabaseAdmin().from('categories').select('id, name, slug').order('name')
    if (req.cashierCatalogRestricted) query = query.in('id', allowedCashierCategoryIds)
    const { data, error } = await query
    if (error) throw error
    res.json({ data })
  } catch {
    res.status(500).json({ error: 'Unable to load categories' })
  }
})
export default router
