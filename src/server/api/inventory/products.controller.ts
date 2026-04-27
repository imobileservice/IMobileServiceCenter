import { Router, Request, Response } from 'express'
import { getSupabaseAdmin } from './supabase-admin'

const router = Router()

// GET /api/inventory/products - List products with stock info
router.get('/', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { search, category } = req.query

    let query = supabase
      .from('products')
      .select(`
        *,
        inv_stock (
          quantity,
          qty_meegoda,
          qty_padukka,
          qty_padukka_new,
          low_stock_threshold
        ),
        product_images (
          url,
          is_primary,
          display_order
        )
      `)
      .order('created_at', { ascending: false })

    if (search && typeof search === 'string') {
      // Allow searching by name, barcode, or the model name stored inside the JSONB specs column
      query = query.or(`name.ilike.%${search}%,barcode.ilike.%${search}%,specs->>model.ilike.%${search}%`)
    }

    if (category && typeof category === 'string') {
      query = query.eq('category_id', category)
    }

    const { data, error } = await query

    if (error) throw error

    // Debug log to see raw data from Supabase
    console.log(`[Inventory Products] Fetched ${data?.length || 0} products. First product inv_stock:`, data?.[0]?.inv_stock);

    const products = (data || []).map((p: any) => {
      // Find primary image or use the first one available
      const primaryImage = p.product_images?.find((img: any) => img.is_primary)?.url || 
                           p.product_images?.[0]?.url || 
                           null;

      // Handle both array and single object formats for inv_stock join
      const stockRec = Array.isArray(p.inv_stock) ? p.inv_stock[0] : p.inv_stock;

      return {
        ...p,
        image: primaryImage, // attach the resolved image to the product root for the frontend
        stock_quantity: stockRec ? (stockRec.quantity ?? 0) : (p.stock ?? 0),
        qty_meegoda: stockRec ? (stockRec.qty_meegoda ?? 0) : 0,
        qty_padukka: stockRec ? (stockRec.qty_padukka ?? 0) : 0,
        qty_padukka_new: stockRec ? (stockRec.qty_padukka_new ?? 0) : 0,
        low_stock_threshold: stockRec ? (stockRec.low_stock_threshold ?? 5) : 5,
        is_low_stock: (stockRec ? (stockRec.quantity ?? 0) : (p.stock ?? 0)) <= (stockRec ? (stockRec.low_stock_threshold ?? 5) : 5),
      };
    })

    res.json({ data: products })
  } catch (error: any) {
    console.error('[Inventory Products] GET error:', error)
    res.status(500).json({ error: error.message })
  }
})

// GET /api/inventory/products/:id - Get single product with stock
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('products')
      .select(`*, inv_stock (quantity, qty_meegoda, qty_padukka, qty_padukka_new, low_stock_threshold)`)
      .eq('id', req.params.id)
      .single()

    if (error) throw error

    const stockRec = data.inv_stock?.[0];

    res.json({
      data: {
        ...data,
        stock_quantity: stockRec ? (stockRec.quantity ?? 0) : (data.stock ?? 0),
        qty_meegoda: stockRec ? (stockRec.qty_meegoda ?? 0) : (data.stock ?? 0),
        qty_padukka: stockRec ? (stockRec.qty_padukka ?? 0) : 0,
        qty_padukka_new: stockRec ? (stockRec.qty_padukka_new ?? 0) : 0,
        low_stock_threshold: stockRec ? (stockRec.low_stock_threshold ?? 5) : 5,
      }
    })
  } catch (error: any) {
    console.error('[Inventory Products] GET/:id error:', error)
    res.status(500).json({ error: error.message })
  }
})

// GET /api/inventory/products/barcode/:barcode - Lookup by barcode
router.get('/barcode/:barcode', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('products')
      .select(`*, inv_stock (quantity, qty_meegoda, qty_padukka, qty_padukka_new, low_stock_threshold)`)
      .eq('barcode', req.params.barcode)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Product not found with this barcode' })
      }
      throw error
    }

    const stockRec = data.inv_stock?.[0];

    res.json({
      data: {
        ...data,
        stock_quantity: stockRec ? (stockRec.quantity ?? 0) : (data.stock ?? 0),
        qty_meegoda: stockRec ? (stockRec.qty_meegoda ?? 0) : (data.stock ?? 0),
        qty_padukka: stockRec ? (stockRec.qty_padukka ?? 0) : 0,
        qty_padukka_new: stockRec ? (stockRec.qty_padukka_new ?? 0) : 0,
        low_stock_threshold: stockRec ? (stockRec.low_stock_threshold ?? 5) : 5,
      }
    })
  } catch (error: any) {
    console.error('[Inventory Products] barcode lookup error:', error)
    res.status(500).json({ error: error.message })
  }
})

// POST /api/inventory/products - Create product
router.post('/', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { 
      name, description, price, cost_price, category, brand, 
      condition, image, images, specs, barcode, stock,
      qty_meegoda, qty_padukka, qty_padukka_new
    } = req.body

    if (!name || !price || !category) {
      return res.status(400).json({ error: 'Name, price, and category are required' })
    }

    // Generate barcode if not provided
    let finalBarcode = barcode
    if (!finalBarcode) {
      const prefix = (brand || 'IM').substring(0, 3).toUpperCase()
      const timestamp = Date.now().toString(36).toUpperCase()
      const random = Math.random().toString(36).substring(2, 6).toUpperCase()
      finalBarcode = `${prefix}-${timestamp}-${random}`
    }

    const { data: product, error: productError } = await supabase
      .from('products')
      .insert({
        name,
        description: description || null,
        price: Number(price),
        cost_price: Number(cost_price || 0),
        category,
        brand: brand || null,
        condition: condition || 'new',
        image: image || null,
        images: images || null,
        specs: specs || null,
        barcode: finalBarcode,
        // We still keep the legacy stock column for compatibility if needed, 
        // but the trigger on inv_stock will manage the total quantity.
        stock: Number(stock || 0),
      })
      .select()
      .single()

    if (productError) throw productError

    // Initialize/Update stock record
    const { error: stockError } = await supabase
      .from('inv_stock')
      .upsert({
        product_id: product.id,
        qty_meegoda: Number(qty_meegoda || 0),
        qty_padukka: Number(qty_padukka || 0),
        qty_padukka_new: Number(qty_padukka_new || 0),
        low_stock_threshold: 5,
      }, { onConflict: 'product_id' })

    if (stockError) {
      console.warn('[Inventory] Stock init warning:', stockError)
    }

    res.status(201).json({ data: { ...product, stock_quantity: Number(stock || 0) } })
  } catch (error: any) {
    console.error('[Inventory Products] POST error:', error)
    res.status(500).json({ error: error.message })
  }
})

// PUT /api/inventory/products/:id - Update product
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { 
      qty_meegoda, qty_padukka, qty_padukka_new, low_stock_threshold, 
      stock_quantity, is_low_stock, image, ...productUpdates 
    } = req.body

    // 1. Update product metadata
    const { data: product, error: productError } = await supabase
      .from('products')
      .update({
        ...productUpdates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single()

    if (productError) throw productError

    // 2. Update shop-specific stock if provided
    if (qty_meegoda !== undefined || qty_padukka !== undefined || qty_padukka_new !== undefined) {
      const stockUpdates: any = { product_id: req.params.id }
      if (qty_meegoda !== undefined) stockUpdates.qty_meegoda = Number(qty_meegoda)
      if (qty_padukka !== undefined) stockUpdates.qty_padukka = Number(qty_padukka)
      if (qty_padukka_new !== undefined) stockUpdates.qty_padukka_new = Number(qty_padukka_new)
      if (low_stock_threshold !== undefined) stockUpdates.low_stock_threshold = Number(low_stock_threshold)

      const { error: stockError } = await supabase
        .from('inv_stock')
        .upsert(stockUpdates, { onConflict: 'product_id' })

      if (stockError) {
        console.error('[Inventory] Stock update error:', stockError)
      }
    }

    res.json({ data: product })
  } catch (error: any) {
    console.error('[Inventory Products] PUT error:', error)
    res.status(500).json({ error: error.message })
  }
})

// DELETE /api/inventory/products/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', req.params.id)

    if (error) throw error

    res.json({ success: true })
  } catch (error: any) {
    console.error('[Inventory Products] DELETE error:', error)
    res.status(500).json({ error: error.message })
  }
})

// POST /api/inventory/products/:id/generate-barcode - Generate unique barcode
router.post('/:id/generate-barcode', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabaseAdmin()

    // Get product info
    const { data: product, error: fetchError } = await supabase
      .from('products')
      .select('id, name, brand, category')
      .eq('id', req.params.id)
      .single()

    if (fetchError) throw fetchError

    // Generate unique barcode: BRAND-CATEGORY_CODE-UNIQUE_ID
    const brandCode = (product.brand || 'IM').substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '')
    const catCode = (product.category || 'GEN').substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '')
    const uniquePart = product.id.substring(0, 8).toUpperCase()
    const barcode = `${brandCode}${catCode}${uniquePart}`

    // Update product with barcode
    const { data, error } = await supabase
      .from('products')
      .update({ barcode })
      .eq('id', req.params.id)
      .select()
      .single()

    if (error) throw error

    res.json({ data, barcode })
  } catch (error: any) {
    console.error('[Inventory Products] Generate barcode error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
