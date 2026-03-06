import { Router } from 'express'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const router = Router()

// Server-side Supabase client (uses process.env, not import.meta.env)
function getSupabase() {
    const url = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) throw new Error('Supabase env vars not configured')
    return createSupabaseClient(url, key)
}

// Get all filters
router.get('/', async (req, res) => {
    try {
        const supabase = getSupabase()
        const { data, error } = await supabase
            .from('filters')
            .select(`*, categories:filter_categories(category_id)`)
            .order('sort_order', { ascending: true })
        if (error) throw error
        res.json(data)
    } catch (error: any) {
        console.error('Error fetching filters:', error)
        res.status(500).json({ error: error.message || 'Failed to fetch filters' })
    }
})

// Get filter by ID
router.get('/:id', async (req, res) => {
    try {
        const supabase = getSupabase()
        const { data, error } = await supabase
            .from('filters')
            .select(`*, categories:filter_categories(category_id)`)
            .eq('id', req.params.id)
            .single()
        if (error) throw error
        if (!data) return res.status(404).json({ error: 'Filter not found' })
        res.json(data)
    } catch (error: any) {
        console.error('Error fetching filter:', error)
        res.status(500).json({ error: error.message || 'Failed to fetch filter' })
    }
})

// Create filter
router.post('/', async (req, res) => {
    try {
        const { category_ids, ...filterData } = req.body
        const supabase = getSupabase()
        const { data: newFilter, error } = await supabase
            .from('filters')
            .insert(filterData)
            .select()
            .single()
        if (error) throw error

        if (category_ids && category_ids.length > 0) {
            const links = category_ids.map((catId: string) => ({
                filter_id: newFilter.id,
                category_id: catId
            }))
            const { error: linkError } = await supabase.from('filter_categories').insert(links)
            if (linkError) {
                await supabase.from('filters').delete().eq('id', newFilter.id)
                throw linkError
            }
        }
        res.status(201).json(newFilter)
    } catch (error: any) {
        console.error('Error creating filter:', error)
        res.status(500).json({ error: error.message || 'Failed to create filter' })
    }
})

// Update filter
router.put('/:id', async (req, res) => {
    try {
        const { category_ids, ...filterData } = req.body
        const supabase = getSupabase()
        const { data: updatedFilter, error } = await supabase
            .from('filters')
            .update(filterData)
            .eq('id', req.params.id)
            .select()
            .single()
        if (error) throw error

        if (category_ids !== undefined) {
            await supabase.from('filter_categories').delete().eq('filter_id', req.params.id)
            if (category_ids.length > 0) {
                const links = category_ids.map((catId: string) => ({
                    filter_id: req.params.id,
                    category_id: catId
                }))
                const { error: linkError } = await supabase.from('filter_categories').insert(links)
                if (linkError) throw linkError
            }
        }
        res.json(updatedFilter)
    } catch (error: any) {
        console.error('Error updating filter:', error)
        res.status(500).json({ error: error.message || 'Failed to update filter' })
    }
})

// Delete filter
router.delete('/:id', async (req, res) => {
    try {
        const supabase = getSupabase()
        const { error } = await supabase.from('filters').delete().eq('id', req.params.id)
        if (error) throw error
        res.json({ success: true })
    } catch (error: any) {
        console.error('Error deleting filter:', error)
        res.status(500).json({ error: error.message || 'Failed to delete filter' })
    }
})

// Reorder filters
router.post('/reorder', async (req, res) => {
    try {
        const { items } = req.body
        if (!Array.isArray(items)) {
            return res.status(400).json({ error: 'Items must be an array' })
        }
        const supabase = getSupabase()
        for (const item of items) {
            const { error } = await supabase
                .from('filters')
                .update({ sort_order: item.sort_order })
                .eq('id', item.id)
            if (error) throw error
        }
        res.json({ success: true })
    } catch (error: any) {
        console.error('Error reordering filters:', error)
        res.status(500).json({ error: error.message || 'Failed to reorder filters' })
    }
})

export const filtersRouter = router
