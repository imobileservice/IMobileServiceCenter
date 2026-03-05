"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { X, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { filtersService, type Filter, type FilterType } from "@/lib/supabase/services/filters"
import { categoriesService, type Category } from "@/lib/supabase/services/categories"
import { notifyUpdate } from "@/hooks/use-realtime-updates"
import { toast } from "sonner"

interface FilterModalProps {
    isOpen: boolean
    onClose: () => void
    editingFilterId?: string | null
}

export default function FilterModal({ isOpen, onClose, editingFilterId }: FilterModalProps) {
    const [loading, setLoading] = useState(false)
    const [fetching, setFetching] = useState(false)
    const [categories, setCategories] = useState<Category[]>([])

    const [formData, setFormData] = useState({
        name: "",
        key: "",
        type: "select" as FilterType,
        options: [] as { label: string; value: string }[],
        min_value: "",
        max_value: "",
        step: "1",
        is_active: true,
        sort_order: 0,
        category_ids: [] as string[],
    })

    // Load categories on mount
    useEffect(() => {
        const loadCategories = async () => {
            try {
                const data = await categoriesService.getAll()
                setCategories(data)
            } catch (error) {
                console.error("Failed to load categories:", error)
                toast.error("Failed to load categories")
            }
        }
        loadCategories()
    }, [])

    useEffect(() => {
        if (!isOpen) {
            setLoading(false)
            setFetching(false)
            return
        }

        setLoading(false)
        setFetching(false)

        if (editingFilterId) {
            const fetchFilter = async () => {
                try {
                    setFetching(true)
                    const filter = await filtersService.getById(editingFilterId)
                    if (filter) {
                        // Parse options if it's stored as JSON
                        let options: { label: string; value: string }[] = []
                        if (Array.isArray(filter.options)) {
                            options = filter.options.map((opt: any) => {
                                if (typeof opt === 'string') return { label: opt, value: opt }
                                return opt
                            })
                        }

                        setFormData({
                            name: filter.name,
                            key: filter.key,
                            type: filter.type,
                            options,
                            min_value: filter.min_value?.toString() || "",
                            max_value: filter.max_value?.toString() || "",
                            step: filter.step?.toString() || "1",
                            is_active: filter.is_active,
                            sort_order: filter.sort_order,
                            category_ids: filter.categories?.map(c => c.category_id) || [],
                        })
                    }
                } catch (error) {
                    console.error('Failed to fetch filter:', error)
                    toast.error('Failed to load filter details')
                } finally {
                    setFetching(false)
                }
            }
            fetchFilter()
        } else {
            // Reset form
            setFormData({
                name: "",
                key: "",
                type: "select",
                options: [],
                min_value: "",
                max_value: "",
                step: "1",
                is_active: true,
                sort_order: 0,
                category_ids: [],
            })
        }
    }, [editingFilterId, isOpen])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target
        if (name === 'sort_order') {
            setFormData((prev) => ({ ...prev, [name]: parseInt(value) || 0 }))
        } else if (name === 'is_active') {
            setFormData((prev) => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }))
        } else {
            setFormData((prev) => ({ ...prev, [name]: value }))
        }
    }

    // Handle category selection
    const toggleCategory = (categoryId: string) => {
        setFormData(prev => {
            if (prev.category_ids.includes(categoryId)) {
                return { ...prev, category_ids: prev.category_ids.filter(id => id !== categoryId) }
            } else {
                return { ...prev, category_ids: [...prev.category_ids, categoryId] }
            }
        })
    }

    // Options management
    const addOption = () => {
        setFormData(prev => ({
            ...prev,
            options: [...prev.options, { label: "", value: "" }]
        }))
    }

    const removeOption = (index: number) => {
        setFormData(prev => ({
            ...prev,
            options: prev.options.filter((_, i) => i !== index)
        }))
    }

    const updateOption = (index: number, field: 'label' | 'value', value: string) => {
        setFormData(prev => ({
            ...prev,
            options: prev.options.map((opt, i) => i === index ? { ...opt, [field]: value } : opt)
        }))
    }

    // Auto-fill key from name
    useEffect(() => {
        if (!editingFilterId && formData.name && !formData.key) {
            const key = formData.name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '_')
                .replace(/^_+|_+$/g, '')
            setFormData(prev => ({ ...prev, key }))
        }
    }, [formData.name, editingFilterId])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (loading) return

        // Validate
        if (!formData.name || !formData.key) {
            toast.error('Name and Key are required')
            return
        }

        if ((formData.type === 'select' || formData.type === 'multiselect') && formData.options.length === 0) {
            toast.error('Please add at least one option')
            return
        }

        if (formData.type === 'range') {
            if (!formData.min_value || !formData.max_value) {
                toast.error('Min and Max values are required for range filters')
                return
            }
        }

        setLoading(true)

        try {
            const filterData = {
                name: formData.name,
                key: formData.key,
                type: formData.type,
                options: formData.options,
                min_value: formData.min_value ? parseFloat(formData.min_value) : undefined,
                max_value: formData.max_value ? parseFloat(formData.max_value) : undefined,
                step: formData.step ? parseFloat(formData.step) : undefined,
                is_active: formData.is_active,
                sort_order: formData.sort_order,
                category_ids: formData.category_ids
            }

            if (editingFilterId) {
                await filtersService.update(editingFilterId, filterData)
                toast.success('Filter updated successfully')
            } else {
                await filtersService.create(filterData)
                toast.success('Filter created successfully')
            }

            onClose()
            notifyUpdate('filters')
        } catch (error: any) {
            console.error('Failed to save filter:', error)
            toast.error(error.message || 'Failed to save filter')
        } finally {
            setLoading(false)
        }
    }

    if (!isOpen) return null

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-card border border-border rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold">{editingFilterId ? "Edit Filter" : "Add Filter"}</h2>
                    <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {fetching ? (
                    <div className="text-center py-8">Loading filter details...</div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Left Column: Basic Info */}
                            <div className="space-y-4">
                                <h3 className="font-semibold text-lg border-b pb-2">Basic Info</h3>

                                <div>
                                    <label className="block text-sm font-semibold mb-2">Filter Name *</label>
                                    <Input
                                        name="name"
                                        value={formData.name}
                                        onChange={handleChange}
                                        placeholder="Storage Capacity"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold mb-2">Key (Database Field) *</label>
                                    <Input
                                        name="key"
                                        value={formData.key}
                                        onChange={handleChange}
                                        placeholder="storage"
                                        required
                                    />
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Matches the key in product specs (e.g., "storage", "ram", "color")
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold mb-2">Filter Type *</label>
                                    <select
                                        name="type"
                                        value={formData.type}
                                        onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as FilterType }))}
                                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                                    >
                                        <option value="select">Select (Dropdown)</option>
                                        <option value="multiselect">Multi-Select (Checkboxes)</option>
                                        <option value="range">Range Slider (Price, etc.)</option>
                                        <option value="text">Text Input</option>
                                    </select>
                                </div>

                                <div className="flex items-center gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold mb-2">Sort Order</label>
                                        <Input
                                            type="number"
                                            name="sort_order"
                                            value={formData.sort_order}
                                            onChange={handleChange}
                                            min="0"
                                        />
                                    </div>
                                    <div className="flex items-center pt-8">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                name="is_active"
                                                checked={formData.is_active}
                                                onChange={handleChange}
                                                className="w-4 h-4"
                                            />
                                            <span className="text-sm font-semibold">Active</span>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Configuration */}
                            <div className="space-y-4">
                                <h3 className="font-semibold text-lg border-b pb-2">Configuration</h3>

                                {/* Range Configuration */}
                                {formData.type === 'range' && (
                                    <div className="grid grid-cols-3 gap-2">
                                        <div>
                                            <label className="block text-sm font-semibold mb-2">Min *</label>
                                            <Input
                                                type="number"
                                                name="min_value"
                                                value={formData.min_value}
                                                onChange={handleChange}
                                                placeholder="0"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold mb-2">Max *</label>
                                            <Input
                                                type="number"
                                                name="max_value"
                                                value={formData.max_value}
                                                onChange={handleChange}
                                                placeholder="1000"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold mb-2">Step</label>
                                            <Input
                                                type="number"
                                                name="step"
                                                value={formData.step}
                                                onChange={handleChange}
                                                placeholder="1"
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Options Configuration */}
                                {(formData.type === 'select' || formData.type === 'multiselect') && (
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <label className="block text-sm font-semibold">Options</label>
                                            <Button type="button" size="sm" onClick={addOption} variant="outline" className="h-8">
                                                <Plus className="w-4 h-4 mr-1" /> Add Option
                                            </Button>
                                        </div>

                                        <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1">
                                            {formData.options.length === 0 && (
                                                <div className="text-center py-4 text-muted-foreground text-sm border border-dashed rounded-lg">
                                                    No options added.
                                                </div>
                                            )}
                                            {formData.options.map((option, index) => (
                                                <div key={index} className="flex gap-2">
                                                    <Input
                                                        placeholder="Label (e.g., Red)"
                                                        value={option.label}
                                                        onChange={(e) => updateOption(index, 'label', e.target.value)}
                                                    />
                                                    <Input
                                                        placeholder="Value (e.g., red)"
                                                        value={option.value}
                                                        onChange={(e) => updateOption(index, 'value', e.target.value)}
                                                    />
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="ghost"
                                                        onClick={() => removeOption(index)}
                                                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Category Association */}
                                <div className="pt-4">
                                    <label className="block text-sm font-semibold mb-2">Assign to Categories</label>
                                    <div className="border border-border rounded-lg p-3 max-h-[200px] overflow-y-auto grid grid-cols-2 gap-2">
                                        {categories.map(category => (
                                            <label key={category.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.category_ids.includes(category.id)}
                                                    onChange={() => toggleCategory(category.id)}
                                                    className="w-4 h-4"
                                                />
                                                <span className="text-sm">{category.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Leave empty to apply to ALL categories.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 pt-6 border-t border-border">
                            <Button type="submit" className="flex-1" disabled={loading}>
                                {loading ? "Saving..." : editingFilterId ? "Update Filter" : "Create Filter"}
                            </Button>
                            <Button type="button" variant="outline" onClick={onClose} className="flex-1" disabled={loading}>
                                Cancel
                            </Button>
                        </div>
                    </form>
                )}
            </motion.div>
        </motion.div>
    )
}
