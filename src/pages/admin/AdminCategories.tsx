"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { categoriesService, type Category } from "@/lib/supabase/services/categories"
import { notifyUpdate } from "@/hooks/use-realtime-updates"
import CategoryModal from "@/components/admin/category-modal"
import CategoryList from "@/components/admin/categories/category-list"
import AdminLayout from "@/components/admin-layout"

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<string | null>(null)

  const fetchCategories = async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      console.log('[AdminCategories] Fetching categories...')

      const data = await categoriesService.getAll()

      console.log('[AdminCategories] Categories fetched:', data?.length || 0)
      setCategories(data || [])
    } catch (error: any) {
      console.error('[AdminCategories] Failed to fetch categories:', error)
      if (!silent) setCategories([])
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    fetchCategories()

    // Listen for category updates
    const handleCategoryUpdate = () => {
      fetchCategories(true)
    }
    window.addEventListener('categoryUpdated', handleCategoryUpdate)

    return () => {
      window.removeEventListener('categoryUpdated', handleCategoryUpdate)
    }
  }, [])

  const filteredCategories = categories.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.slug.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this category? Products using this category will need to be updated.')) return
    try {
      await categoriesService.delete(id)
      setCategories(prev => prev.filter(c => c.id !== id))
      notifyUpdate('admin')
    } catch (error) {
      console.error('Failed to delete category:', error)
      alert('Failed to delete category')
    }
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
    setEditingCategory(null)
  }

  const handleEdit = (id: string) => {
    setEditingCategory(id)
    setIsModalOpen(true)
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Categories</h1>
              <p className="text-muted-foreground mt-1">Manage product categories and hierarchy</p>
            </div>
            <Button onClick={() => setIsModalOpen(true)} className="gap-2 self-start sm:self-auto shadow-md">
              <Plus className="w-4 h-4" />
              Add Category
            </Button>
          </div>
        </motion.div>

        {/* Search */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="relative">
            <Search className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search categories..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </motion.div>

        {/* Categories List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {loading ? (
            <div className="p-8 text-center text-muted-foreground bg-card border border-border rounded-lg">
              Loading categories...
            </div>
          ) : filteredCategories.length === 0 ? (
            <div className="p-8 text-center space-y-4 bg-card border border-border rounded-lg">
              <p className="text-muted-foreground">No categories found</p>
              {categories.length === 0 && (
                <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <p className="text-sm text-yellow-600 dark:text-yellow-400 font-semibold mb-2">
                    Categories table may not exist
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Please run the database migration: <code className="bg-muted px-2 py-1 rounded">supabase/migrations/add_categories_table.sql</code>
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Or check the browser console for detailed error messages.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <CategoryList
              categories={filteredCategories}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          )}
        </motion.div>

        {/* Category Modal */}
        <CategoryModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          editingCategoryId={editingCategory}
          categories={categories}
        />
      </div>
    </AdminLayout>
  )
}

