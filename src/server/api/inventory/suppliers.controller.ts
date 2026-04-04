import { Router, Request, Response } from 'express'
import { getSupabaseAdmin } from './supabase-admin'

const router = Router()

// GET /api/inventory/suppliers
router.get('/', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('inv_suppliers')
      .select('*')
      .order('name', { ascending: true })

    if (error) throw error
    res.json({ data })
  } catch (error: any) {
    console.error('[Inventory Suppliers] GET error:', error)
    res.status(500).json({ error: error.message })
  }
})

// POST /api/inventory/suppliers
router.post('/', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { name, contact_person, phone, email, address } = req.body

    if (!name) return res.status(400).json({ error: 'Supplier name is required' })

    const { data, error } = await supabase
      .from('inv_suppliers')
      .insert({ name, contact_person, phone, email, address })
      .select()
      .single()

    if (error) throw error
    res.status(201).json({ data })
  } catch (error: any) {
    console.error('[Inventory Suppliers] POST error:', error)
    res.status(500).json({ error: error.message })
  }
})

// PUT /api/inventory/suppliers/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('inv_suppliers')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) throw error
    res.json({ data })
  } catch (error: any) {
    console.error('[Inventory Suppliers] PUT error:', error)
    res.status(500).json({ error: error.message })
  }
})

// DELETE /api/inventory/suppliers/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { error } = await supabase
      .from('inv_suppliers')
      .delete()
      .eq('id', req.params.id)

    if (error) throw error
    res.json({ success: true })
  } catch (error: any) {
    console.error('[Inventory Suppliers] DELETE error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
