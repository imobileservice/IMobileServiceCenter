import { Router, Request, Response } from 'express'
import { getSupabaseAdmin } from './supabase-admin'

const router = Router()

// GET /api/inventory/customers
router.get('/', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { search } = req.query

    let query = supabase
      .from('inv_customers')
      .select('*')
      .order('name', { ascending: true })

    if (search && typeof search === 'string') {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`)
    }

    const { data, error } = await query

    if (error) throw error
    res.json({ data })
  } catch (error: any) {
    console.error('[Inventory Customers] GET error:', error)
    res.status(500).json({ error: error.message })
  }
})

// POST /api/inventory/customers
router.post('/', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { name, phone, email, address } = req.body

    if (!name) return res.status(400).json({ error: 'Customer name is required' })

    const { data, error } = await supabase
      .from('inv_customers')
      .insert({ name, phone, email, address })
      .select()
      .single()

    if (error) throw error
    res.status(201).json({ data })
  } catch (error: any) {
    console.error('[Inventory Customers] POST error:', error)
    res.status(500).json({ error: error.message })
  }
})

// PUT /api/inventory/customers/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('inv_customers')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) throw error
    res.json({ data })
  } catch (error: any) {
    console.error('[Inventory Customers] PUT error:', error)
    res.status(500).json({ error: error.message })
  }
})

// DELETE /api/inventory/customers/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { error } = await supabase
      .from('inv_customers')
      .delete()
      .eq('id', req.params.id)

    if (error) throw error
    res.json({ success: true })
  } catch (error: any) {
    console.error('[Inventory Customers] DELETE error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
