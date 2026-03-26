"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Plus, Trash2, GripVertical } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Category, CategoryField } from "@/lib/supabase/services/categories"

interface CategoryFormProps {
    editingCategory?: Category | null
    onSubmit: (data: CategoryFormData) => Promise<void>
    loading: boolean
    maxSortOrder: number
}

export interface CategoryFormData {
    name: string
    slug: string
    description: string
    icon: string
    is_active: boolean
    sort_order: number
    fields: CategoryField[]
}

export default function CategoryForm({ editingCategory, onSubmit, loading, maxSortOrder }: CategoryFormProps) {
    const [activeTab, setActiveTab] = useState<'general' | 'configuration'>('general')
    const [formData, setFormData] = useState<CategoryFormData>({
        name: "",
        slug: "",
        description: "",
        icon: "",
        is_active: true,
        sort_order: maxSortOrder + 1,
        fields: [],
    })

    useEffect(() => {
        if (editingCategory) {
            setFormData({
                name: editingCategory.name || "",
                slug: editingCategory.slug || "",
                description: editingCategory.description || "",
                icon: editingCategory.icon || "",
                is_active: editingCategory.is_active ?? true,
                sort_order: editingCategory.sort_order || 0,
                fields: editingCategory.field_config?.fields || [],
            })
        } else {
            setFormData({
                name: "",
                slug: "",
                description: "",
                icon: "",
                is_active: true,
                sort_order: maxSortOrder + 1,
                fields: [],
            })
        }
    }, [editingCategory, maxSortOrder])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target
        if (name === 'sort_order') {
            setFormData((prev) => ({ ...prev, [name]: parseInt(value) || 0 }))
        } else if (name === 'is_active') {
            setFormData((prev) => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }))
        } else {
            setFormData((prev) => ({ ...prev, [name]: value }))
        }
    }

    // Auto-generate slug from name
    useEffect(() => {
        if (!editingCategory && formData.name && !formData.slug) {
            const slug = formData.name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '')
            setFormData((prev) => ({ ...prev, slug }))
        }
    }, [formData.name, editingCategory])

    const addField = () => {
        setFormData((prev) => ({
            ...prev,
            fields: [
                ...prev.fields,
                {
                    key: '',
                    label: '',
                    type: 'text',
                    required: false,
                },
            ],
        }))
    }

    const removeField = (index: number) => {
        setFormData((prev) => ({
            ...prev,
            fields: prev.fields.filter((_, i) => i !== index),
        }))
    }

    const updateField = (index: number, updates: Partial<CategoryField>) => {
        setFormData((prev) => ({
            ...prev,
            fields: prev.fields.map((field, i) => (i === index ? { ...field, ...updates } : field)),
        }))
    }

    const addOption = (fieldIndex: number) => {
        setFormData((prev) => ({
            ...prev,
            fields: prev.fields.map((field, i) => {
                if (i === fieldIndex) {
                    return {
                        ...field,
                        options: [...(field.options || []), ''],
                    }
                }
                return field
            }),
        }))
    }

    const updateOption = (fieldIndex: number, optionIndex: number, value: string) => {
        setFormData((prev) => ({
            ...prev,
            fields: prev.fields.map((field, i) => {
                if (i === fieldIndex) {
                    const newOptions = [...(field.options || [])]
                    newOptions[optionIndex] = value
                    return { ...field, options: newOptions }
                }
                return field
            }),
        }))
    }

    const removeOption = (fieldIndex: number, optionIndex: number) => {
        setFormData((prev) => ({
            ...prev,
            fields: prev.fields.map((field, i) => {
                if (i === fieldIndex) {
                    return {
                        ...field,
                        options: field.options?.filter((_, oi) => oi !== optionIndex) || [],
                    }
                }
                return field
            }),
        }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        await onSubmit(formData)
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* Tabs */}
            <div className="flex gap-2 border-b border-border">
                <button
                    type="button"
                    onClick={() => setActiveTab('general')}
                    className={`px-4 py-2 font-semibold transition-colors ${activeTab === 'general'
                            ? 'text-primary border-b-2 border-primary'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                >
                    General
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('configuration')}
                    className={`px-4 py-2 font-semibold transition-colors ${activeTab === 'configuration'
                            ? 'text-primary border-b-2 border-primary'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                >
                    Configuration
                </button>
            </div>

            {/* General Tab */}
            {activeTab === 'general' && (
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-semibold mb-2">Category Name *</label>
                        <Input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            placeholder="e.g., Mobile Phones"
                            required
                            autoFocus
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            The display name for this category
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold mb-2">Icon (Emoji)</label>
                        <Input
                            type="text"
                            name="icon"
                            value={formData.icon}
                            onChange={handleChange}
                            placeholder="📱"
                            maxLength={4}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            Add an emoji to make the category visually distinct
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold mb-2">Description</label>
                        <textarea
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            placeholder="Brief description of this category..."
                            rows={3}
                            className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                        />
                    </div>

                    <div className="flex items-center pt-2">
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
                        <p className="text-xs text-muted-foreground ml-6">
                            Inactive categories won't appear on the storefront
                        </p>
                    </div>
                </div>
            )}

            {/* Configuration Tab */}
            {activeTab === 'configuration' && (
                <div className="space-y-6">
                    {/* Advanced Settings */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-muted-foreground uppercase">Advanced Settings</h3>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-semibold mb-2">Slug *</label>
                                <Input
                                    type="text"
                                    name="slug"
                                    value={formData.slug}
                                    onChange={handleChange}
                                    placeholder="mobile-phones"
                                    required
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    Auto-generated from name. Use parent-child for subcategories.
                                </p>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-2">Sort Order</label>
                                <Input
                                    type="number"
                                    name="sort_order"
                                    value={formData.sort_order}
                                    onChange={handleChange}
                                    min="0"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    Lower numbers appear first
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Field Configuration */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-muted-foreground uppercase">Custom Fields</h3>
                            <Button type="button" onClick={addField} size="sm" className="gap-2">
                                <Plus className="w-4 h-4" />
                                Add Field
                            </Button>
                        </div>

                        {formData.fields.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground border border-dashed border-border rounded-lg">
                                No custom fields. Click "Add Field" to add category-specific attributes.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {formData.fields.map((field, index) => (
                                    <div key={index} className="border border-border rounded-lg p-4 space-y-3">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <GripVertical className="w-4 h-4 text-muted-foreground" />
                                                <span className="font-semibold">Field {index + 1}</span>
                                            </div>
                                            <Button
                                                type="button"
                                                onClick={() => removeField(index)}
                                                size="sm"
                                                variant="outline"
                                                className="text-red-600 hover:text-red-700"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>

                                        <div className="grid grid-cols-3 gap-4">
                                            <div>
                                                <label className="block text-sm font-semibold mb-2">Key *</label>
                                                <Input
                                                    type="text"
                                                    value={field.key}
                                                    onChange={(e) => updateField(index, { key: e.target.value })}
                                                    placeholder="storage"
                                                    required
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-semibold mb-2">Label *</label>
                                                <Input
                                                    type="text"
                                                    value={field.label}
                                                    onChange={(e) => updateField(index, { label: e.target.value })}
                                                    placeholder="Storage"
                                                    required
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-semibold mb-2">Type *</label>
                                                <select
                                                    value={field.type}
                                                    onChange={(e) => updateField(index, { type: e.target.value as 'text' | 'number' | 'select' })}
                                                    className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                                                    required
                                                >
                                                    <option value="text">Text</option>
                                                    <option value="number">Number</option>
                                                    <option value="select">Select</option>
                                                </select>
                                            </div>
                                        </div>

                                        {field.type === 'text' && (
                                            <div>
                                                <label className="block text-sm font-semibold mb-2">Placeholder</label>
                                                <Input
                                                    type="text"
                                                    value={field.placeholder || ''}
                                                    onChange={(e) => updateField(index, { placeholder: e.target.value })}
                                                    placeholder="Enter placeholder text"
                                                />
                                            </div>
                                        )}

                                        {field.type === 'select' && (
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <label className="block text-sm font-semibold">Options *</label>
                                                    <Button
                                                        type="button"
                                                        onClick={() => addOption(index)}
                                                        size="sm"
                                                        variant="outline"
                                                        className="gap-2"
                                                    >
                                                        <Plus className="w-3 h-3" />
                                                        Add Option
                                                    </Button>
                                                </div>
                                                {field.options?.map((option, optIndex) => (
                                                    <div key={optIndex} className="flex gap-2">
                                                        <Input
                                                            type="text"
                                                            value={option}
                                                            onChange={(e) => updateOption(index, optIndex, e.target.value)}
                                                            placeholder={`Option ${optIndex + 1}`}
                                                            required
                                                        />
                                                        <Button
                                                            type="button"
                                                            onClick={() => removeOption(index, optIndex)}
                                                            size="sm"
                                                            variant="outline"
                                                            className="text-red-600"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <div className="flex items-center pt-2">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={field.required || false}
                                                    onChange={(e) => updateField(index, { required: e.target.checked })}
                                                    className="w-4 h-4"
                                                />
                                                <span className="text-sm font-semibold">Required Field</span>
                                            </label>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4 border-t border-border">
                <Button type="submit" className="flex-1" disabled={loading}>
                    {loading ? "Saving..." : editingCategory ? "Update Category" : "Create Category"}
                </Button>
            </div>
        </form>
    )
}
