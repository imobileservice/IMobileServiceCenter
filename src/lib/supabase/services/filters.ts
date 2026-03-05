import { createClient } from '../client'

export type FilterType = 'select' | 'multiselect' | 'range' | 'checkbox' | 'text' | 'number'

export interface FilterOption {
    label: string
    value: string
}

export interface Filter {
    id: string
    name: string
    key: string
    type: FilterType
    options?: FilterOption[] | string[]
    min_value?: number
    max_value?: number
    step?: number
    is_active: boolean
    sort_order: number
    created_at: string
    updated_at: string
    categories?: { category_id: string }[]
}

export interface CreateFilterData {
    name: string
    key: string
    type: FilterType
    options?: FilterOption[] | string[]
    min_value?: number
    max_value?: number
    step?: number
    is_active?: boolean
    sort_order?: number
    category_ids?: string[]
}

export interface UpdateFilterData extends Partial<CreateFilterData> { }

export const filtersService = {
    async getAll() {
        const supabase = createClient()
        const { data, error } = await supabase
            .from('filters')
            .select(`
        *,
        categories:filter_categories(category_id)
      `)
            .order('sort_order', { ascending: true })

        if (error) throw error
        return data as Filter[]
    },

    async getById(id: string) {
        const supabase = createClient()
        const { data, error } = await supabase
            .from('filters')
            .select(`
        *,
        categories:filter_categories(category_id)
      `)
            .eq('id', id)
            .single()

        if (error) throw error
        return data as Filter
    },

    async getByCategoryId(categoryId: string) {
        const supabase = createClient()
        // First get filter IDs for this category
        const { data: filterIds, error: linkError } = await supabase
            .from('filter_categories')
            .select('filter_id')
            .eq('category_id', categoryId)

        if (linkError) throw linkError

        if (!filterIds || filterIds.length === 0) return []

        const ids = filterIds.map((f: { filter_id: string }) => f.filter_id)

        // Then fetch the actual filters
        const { data, error } = await supabase
            .from('filters')
            .select('*')
            .in('id', ids)
            .eq('is_active', true)
            .order('sort_order', { ascending: true })

        if (error) throw error
        return data as Filter[]
    },

    async create(filterData: CreateFilterData) {
        const { category_ids, ...data } = filterData

        // 1. Create filter
        const supabase = createClient()
        const { data: newFilter, error } = await supabase
            .from('filters')
            .insert(data)
            .select()
            .single()

        if (error) throw error

        // 2. Link categories if provided
        if (category_ids && category_ids.length > 0) {
            const links = category_ids.map(catId => ({
                filter_id: newFilter.id,
                category_id: catId
            }))

            const { error: linkError } = await supabase
                .from('filter_categories')
                .insert(links)

            if (linkError) {
                // Cleanup if linking fails (optional but good practice)
                await supabase.from('filters').delete().eq('id', newFilter.id)
                throw linkError
            }
        }

        return newFilter
    },

    async update(id: string, filterData: UpdateFilterData) {
        const { category_ids, ...data } = filterData

        // 1. Update filter details
        const supabase = createClient()
        const { data: updatedFilter, error } = await supabase
            .from('filters')
            .update(data)
            .eq('id', id)
            .select()
            .single()

        if (error) throw error

        // 2. Update category links if provided
        if (category_ids !== undefined) {
            // First delete existing links
            const { error: deleteError } = await supabase
                .from('filter_categories')
                .delete()
                .eq('filter_id', id)

            if (deleteError) throw deleteError

            // Then insert new ones
            if (category_ids.length > 0) {
                const links = category_ids.map(catId => ({
                    filter_id: id,
                    category_id: catId
                }))

                const { error: linkError } = await supabase
                    .from('filter_categories')
                    .insert(links)

                if (linkError) throw linkError
            }
        }

        return updatedFilter
    },

    async delete(id: string) {
        const supabase = createClient()
        const { error } = await supabase
            .from('filters')
            .delete()
            .eq('id', id)

        if (error) throw error
        return true
    },

    async reorder(items: { id: string; sort_order: number }[]) {
        // This might be better done with a stored procedure for atomicity,
        // but a loop is fine for small datasets like filters.
        const supabase = createClient()
        for (const item of items) {
            const { error } = await supabase
                .from('filters')
                .update({ sort_order: item.sort_order })
                .eq('id', item.id)

            if (error) throw error
        }
        return true
    }
}
