"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { X } from "lucide-react"
import { categoriesService, type Category } from "@/lib/supabase/services/categories"
import { notifyUpdate } from "@/hooks/use-realtime-updates"
import { toast } from "sonner"
import CategoryForm, { type CategoryFormData } from "./categories/category-form"

interface CategoryModalProps {
  isOpen: boolean
  onClose: () => void
  editingCategoryId?: string | null
  categories?: Category[]
}

export default function CategoryModal({ isOpen, onClose, editingCategoryId, categories = [] }: CategoryModalProps) {
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)

  // Calculate max sort order for auto-setting
  const maxSortOrder = categories.length > 0
    ? Math.max(...categories.map(c => c.sort_order || 0))
    : 0

  useEffect(() => {
    if (!isOpen) {
      setLoading(false)
      setFetching(false)
      setEditingCategory(null)
      return
    }

    setLoading(false)
    setFetching(false)

    if (editingCategoryId) {
      const fetchCategory = async () => {
        try {
          setFetching(true)
          const category = await categoriesService.getById(editingCategoryId)
          if (category) {
            setEditingCategory(category)
          }
        } catch (error) {
          console.error('Failed to fetch category:', error)
          toast.error('Failed to load category details')
        } finally {
          setFetching(false)
        }
      }
      fetchCategory()
    } else {
      setEditingCategory(null)
    }
  }, [editingCategoryId, isOpen])

  const handleSubmit = async (formData: CategoryFormData) => {
    if (loading) return

    // Validate
    if (!formData.name || !formData.slug) {
      toast.error('Name and slug are required')
      return
    }

    // Validate fields
    for (const field of formData.fields) {
      if (!field.key || !field.label) {
        toast.error('All fields must have a key and label')
        return
      }
      if (field.type === 'select' && (!field.options || field.options.length === 0)) {
        toast.error(`Field "${field.label}" must have at least one option`)
        return
      }
    }

    // Check for duplicate keys
    const keys = formData.fields.map(f => f.key)
    if (new Set(keys).size !== keys.length) {
      toast.error('Field keys must be unique')
      return
    }

    setLoading(true)

    try {
      const categoryData = {
        name: formData.name,
        slug: formData.slug,
        description: formData.description || null,
        icon: formData.icon || null,
        field_config: {
          fields: formData.fields,
        },
        is_active: formData.is_active,
        sort_order: formData.sort_order,
      }

      if (editingCategoryId) {
        await categoriesService.update(editingCategoryId, categoryData)
        toast.success('Category updated successfully')
      } else {
        await categoriesService.create(categoryData)
        toast.success('Category created successfully')
      }

      onClose()
      notifyUpdate('category')
      setTimeout(() => {
        notifyUpdate('admin')
      }, 100)
    } catch (error: any) {
      console.error('Failed to save category:', error)
      toast.error(error.message || 'Failed to save category')
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
          <h2 className="text-2xl font-bold">{editingCategoryId ? "Edit Category" : "Add Category"}</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {fetching ? (
          <div className="text-center py-8">Loading category details...</div>
        ) : (
          <CategoryForm
            editingCategory={editingCategory}
            onSubmit={handleSubmit}
            loading={loading}
            maxSortOrder={maxSortOrder}
          />
        )}
      </motion.div>
    </motion.div>
  )
}

