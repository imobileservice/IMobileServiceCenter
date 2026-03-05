import { Router } from 'express'
import { filtersService } from '../../../lib/supabase/services/filters'

const router = Router()

// Get all filters
router.get('/', async (req, res) => {
    try {
        const filters = await filtersService.getAll()
        res.json(filters)
    } catch (error: any) {
        console.error('Error fetching filters:', error)
        res.status(500).json({ error: error.message || 'Failed to fetch filters' })
    }
})

// Get filter by ID
router.get('/:id', async (req, res) => {
    try {
        const filter = await filtersService.getById(req.params.id)
        if (!filter) {
            return res.status(404).json({ error: 'Filter not found' })
        }
        res.json(filter)
    } catch (error: any) {
        console.error('Error fetching filter:', error)
        res.status(500).json({ error: error.message || 'Failed to fetch filter' })
    }
})

// Create filter
router.post('/', async (req, res) => {
    try {
        const filter = await filtersService.create(req.body)
        res.status(201).json(filter)
    } catch (error: any) {
        console.error('Error creating filter:', error)
        res.status(500).json({ error: error.message || 'Failed to create filter' })
    }
})

// Update filter
router.put('/:id', async (req, res) => {
    try {
        const filter = await filtersService.update(req.params.id, req.body)
        res.json(filter)
    } catch (error: any) {
        console.error('Error updating filter:', error)
        res.status(500).json({ error: error.message || 'Failed to update filter' })
    }
})

// Delete filter
router.delete('/:id', async (req, res) => {
    try {
        await filtersService.delete(req.params.id)
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
        await filtersService.reorder(items)
        res.json({ success: true })
    } catch (error: any) {
        console.error('Error reordering filters:', error)
        res.status(500).json({ error: error.message || 'Failed to reorder filters' })
    }
})

export const filtersRouter = router
