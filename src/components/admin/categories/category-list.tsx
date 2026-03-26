"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Edit2, Trash2, ChevronRight, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Category } from "@/lib/supabase/services/categories"

interface CategoryWithChildren extends Category {
    children?: CategoryWithChildren[]
}

interface CategoryListProps {
    categories: Category[]
    onEdit: (id: string) => void
    onDelete: (id: string) => void
}

export default function CategoryList({ categories, onEdit, onDelete }: CategoryListProps) {
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

    // Build hierarchy from flat list based on slug patterns
    const buildHierarchy = (cats: Category[]): CategoryWithChildren[] => {
        const categoryMap = new Map<string, CategoryWithChildren>()
        const roots: CategoryWithChildren[] = []

        // First pass: create map of all categories
        cats.forEach(cat => {
            categoryMap.set(cat.slug, { ...cat, children: [] })
        })

        // Second pass: build parent-child relationships
        cats.forEach(cat => {
            const category = categoryMap.get(cat.slug)!

            // Check if this is a child category (contains hyphen and parent exists)
            const parts = cat.slug.split('-')
            if (parts.length > 1) {
                // Try to find parent by removing last part
                const potentialParentSlug = parts.slice(0, -1).join('-')
                const parent = categoryMap.get(potentialParentSlug)

                if (parent) {
                    parent.children!.push(category)
                    return
                }
            }

            // If no parent found, it's a root category
            roots.push(category)
        })

        return roots
    }

    const hierarchicalCategories = buildHierarchy(categories)

    const toggleExpand = (slug: string) => {
        setExpandedCategories(prev => {
            const next = new Set(prev)
            if (next.has(slug)) {
                next.delete(slug)
            } else {
                next.add(slug)
            }
            return next
        })
    }

    const renderCategory = (category: CategoryWithChildren, level: number = 0) => {
        const hasChildren = category.children && category.children.length > 0
        const isExpanded = expandedCategories.has(category.slug)

        return (
            <div key={category.id}>
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="border-b border-border hover:bg-muted/50 transition-colors"
                >
                    <div className="flex items-center py-4 px-6">
                        {/* Indentation for hierarchy */}
                        <div style={{ width: `${level * 24}px` }} />

                        {/* Expand/Collapse button */}
                        {hasChildren ? (
                            <button
                                onClick={() => toggleExpand(category.slug)}
                                className="mr-2 p-1 hover:bg-muted rounded"
                            >
                                {isExpanded ? (
                                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                ) : (
                                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                )}
                            </button>
                        ) : (
                            <div className="w-6 mr-2" />
                        )}

                        {/* Name with Icon */}
                        <div className="flex items-center gap-3 flex-1">
                            {category.icon && (
                                <span className="text-2xl">{category.icon}</span>
                            )}
                            <div>
                                <span className="font-semibold">{category.name}</span>
                                {category.description && (
                                    <p className="text-xs text-muted-foreground mt-0.5">{category.description}</p>
                                )}
                            </div>
                        </div>

                        {/* Status */}
                        <div className="px-4">
                            <span
                                className={`px-3 py-1 rounded-full text-xs font-semibold ${category.is_active
                                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                        : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                    }`}
                            >
                                {category.is_active ? "Active" : "Inactive"}
                            </span>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onEdit(category.id)}
                                className="gap-2"
                            >
                                <Edit2 className="w-4 h-4" />
                                Edit
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onDelete(category.id)}
                                className="gap-2 text-red-600 hover:text-red-700 bg-transparent"
                            >
                                <Trash2 className="w-4 h-4" />
                                Delete
                            </Button>
                        </div>
                    </div>
                </motion.div>

                {/* Render children if expanded */}
                {hasChildren && isExpanded && (
                    <div>
                        {category.children!.map(child => renderCategory(child, level + 1))}
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
            {hierarchicalCategories.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                    No categories found
                </div>
            ) : (
                <div>
                    {hierarchicalCategories.map(category => renderCategory(category))}
                </div>
            )}
        </div>
    )
}
