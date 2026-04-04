import { Router, Request, Response } from 'express'
import { getSupabaseAdmin } from './supabase-admin'

const router = Router()

// GET /api/inventory/stock - List all stock levels
router.get('/', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { low_only } = req.query

    const { data, error } = await supabase
      .from('inv_stock')
      .select(`
        *,
        products (
          id, name, category_id, brand, barcode, price, cost_price,
          product_images (url, is_primary)
        )
      `)
      .order('updated_at', { ascending: false })

    if (error) throw error

    let result = (data || []).map((s: any) => ({
      ...s,
      products: {
        ...s.products,
        image: s.products?.product_images?.find((img: any) => img.is_primary)?.url || 
               s.products?.product_images?.[0]?.url || 
               null
      },
      is_low_stock: s.quantity <= s.low_stock_threshold,
    }))

    if (low_only === 'true') {
      result = result.filter((s: any) => s.is_low_stock)
    }

    res.json({ data: result })
  } catch (error: any) {
    console.error('[Inventory Stock] GET error:', error)
    res.status(500).json({ error: error.message })
  }
})

// GET /api/inventory/stock/low - Low stock alerts
router.get('/low', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase.rpc('get_low_stock_items')

    // Fallback if RPC doesn't exist
    if (error) {
      const { data: stockData, error: stockError } = await supabase
        .from('inv_stock')
        .select(`*, products (id, name, category_id, brand, barcode, price)`)

      if (stockError) throw stockError

      const lowStock = (stockData || []).filter((s: any) => s.quantity <= s.low_stock_threshold)
      return res.json({ data: lowStock })
    }

    res.json({ data })
  } catch (error: any) {
    console.error('[Inventory Stock] Low stock error:', error)
    res.status(500).json({ error: error.message })
  }
})

// PUT /api/inventory/stock/:product_id - Manual stock adjustment
router.put('/:product_id', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { product_id } = req.params
    const { quantity, adjustment_type, notes, created_by } = req.body

    if (quantity === undefined || quantity === null) {
      return res.status(400).json({ error: 'Quantity is required' })
    }

    const adjustmentQty = Number(quantity)

    // Get current stock
    const { data: currentStock, error: fetchError } = await supabase
      .from('inv_stock')
      .select('quantity')
      .eq('product_id', product_id)
      .single()

    if (fetchError) {
      // If no stock record exists, create one
      if (fetchError.code === 'PGRST116') {
        const newQty = adjustment_type === 'set' ? adjustmentQty : adjustmentQty
        if (newQty < 0) {
          return res.status(400).json({ error: 'Stock cannot go negative' })
        }

        const { data: newStock, error: insertError } = await supabase
          .from('inv_stock')
          .insert({ product_id, quantity: newQty, low_stock_threshold: 5 })
          .select()
          .single()

        if (insertError) throw insertError

        // Log movement
        await supabase.from('inv_stock_movements').insert({
          product_id,
          type: 'adjustment',
          quantity: newQty,
          notes: notes || 'Initial stock set',
          created_by: created_by || 'admin',
        })

        return res.json({ data: newStock })
      }
      throw fetchError
    }

    // Calculate new quantity
    let newQuantity: number
    if (adjustment_type === 'set') {
      newQuantity = adjustmentQty
    } else if (adjustment_type === 'subtract') {
      newQuantity = currentStock.quantity - Math.abs(adjustmentQty)
    } else {
      // Default: add
      newQuantity = currentStock.quantity + adjustmentQty
    }

    if (newQuantity < 0) {
      return res.status(400).json({ error: 'Stock cannot go negative. Current: ' + currentStock.quantity })
    }

    // Update stock
    const { data: updatedStock, error: updateError } = await supabase
      .from('inv_stock')
      .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
      .eq('product_id', product_id)
      .select()
      .single()

    if (updateError) throw updateError

    // Log movement
    const movementQty = adjustment_type === 'set'
      ? newQuantity - currentStock.quantity
      : (adjustment_type === 'subtract' ? -Math.abs(adjustmentQty) : adjustmentQty)

    await supabase.from('inv_stock_movements').insert({
      product_id,
      type: 'adjustment',
      quantity: movementQty,
      notes: notes || `Manual adjustment: ${adjustment_type || 'add'}`,
      created_by: created_by || 'admin',
    })

    res.json({ data: updatedStock })
  } catch (error: any) {
    console.error('[Inventory Stock] PUT error:', error)
    res.status(500).json({ error: error.message })
  }
})

// GET /api/inventory/stock/movements/:product_id - Stock movement history
router.get('/movements/:product_id', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('inv_stock_movements')
      .select('*')
      .eq('product_id', req.params.product_id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error

    res.json({ data })
  } catch (error: any) {
    console.error('[Inventory Stock] Movements error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
