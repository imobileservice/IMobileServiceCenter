"use client"

import { useState, useEffect } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { productsService } from "@/lib/supabase/services/products"
import { filtersService, type Filter } from "@/lib/supabase/services/filters"
import { categoriesService, type Category } from "@/lib/supabase/services/categories"

interface ExtendedCategory extends Category {
  count?: number
  subcategories?: Array<{
    id: string
    name: string
    count: number
  }>
}

interface FilterSidebarProps {
  selectedCategory: string | null
  selectedBrand: string | null
  priceRange: [number, number]
  dynamicFilters: Record<string, any>
  onCategoryChange: (category: string | null) => void
  onBrandChange: (brand: string | null) => void
  onPriceChange: (range: [number, number]) => void
  onDynamicFilterChange: (key: string, value: any) => void
}

export default function FilterSidebar({
  selectedCategory,
  selectedBrand,
  priceRange,
  dynamicFilters = {},
  onCategoryChange,
  onBrandChange,
  onPriceChange,
  onDynamicFilterChange,
}: FilterSidebarProps) {
  const [categories, setCategories] = useState<ExtendedCategory[]>([])
  const [filters, setFilters] = useState<Filter[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    category: true,
    price: true,
  })

  // Load categories
  useEffect(() => {
    const loadCategories = async () => {
      try {
        // Use products service to get categories with counts and structure
        const data = await productsService.getCategoriesWithCounts()
        setCategories(data as any) // Type might not perfectly match but structure is compatible for UI
      } catch (error) {
        console.error("Error loading categories:", error)
      }
    }
    loadCategories()
  }, [])

  // Load filters based on selected category
  useEffect(() => {
    const loadFilters = async () => {
      try {
        setLoading(true)
        let data: Filter[] = []

        if (selectedCategory) {
          // Find category ID by slug
          const category = categories.find(c => c.slug === selectedCategory)
          if (category) {
            data = await filtersService.getByCategoryId(category.id)
          } else {
            // If category not found (maybe it's a subcategory slug?), try fetching all active global filters?
            // For now, let's just fetch all filters that are global (no category assigned)
            const allFilters = await filtersService.getAll()
            // Filter client-side for those with no categories or matching category
            // This is afallback pattern. Ideally getByCategoryId should handle it or we use a different query.
            // But getByCategoryId returns filters LINKED to the category.
            // We also want global filters (filters with NO category links).
            // Let's rely on getAll() for now and filter client side to be safe if query is complex.
            data = allFilters.filter(f => !f.categories || f.categories.length === 0)
          }
        } else {
          // No category selected, fetch only global filters
          const allFilters = await filtersService.getAll()
          data = allFilters.filter(f => !f.categories || f.categories.length === 0)
        }

        setFilters(data)

        // Initialize expanded sections for new filters
        const newExpanded = { ...expandedSections }
        data.forEach(f => {
          if (newExpanded[f.key] === undefined) {
            newExpanded[f.key] = true
          }
        })
        setExpandedSections(newExpanded)

      } catch (error) {
        console.error("Error loading filters:", error)
      } finally {
        setLoading(false)
      }
    }

    // Only load filters if categories are loaded (to map slug to ID)
    if (categories.length > 0) {
      loadFilters()
    } else {
      // If no categories yet, maybe just try loading global filters? 
      // Or wait for categories.
    }
  }, [selectedCategory, categories])

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  const handleCategoryClick = (slug: string) => {
    onCategoryChange(slug)
    // Dynamic filters should probably be reset when category changes
    // But that's up to the parent component or we can do it here if we had a clear handler
  }

  const renderFilter = (filter: Filter) => {
    const isExpanded = expandedSections[filter.key]
    const selectedValue = dynamicFilters[filter.key]

    return (
      <div key={filter.id} className="border border-border rounded-lg p-4 bg-white dark:bg-card">
        <button
          onClick={() => toggleSection(filter.key)}
          className="flex items-center justify-between w-full font-bold text-base mb-4 text-gray-900 dark:text-white uppercase"
        >
          {filter.name}
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? "" : "-rotate-90"
              }`}
          />
        </button>

        {isExpanded && (
          <div className="space-y-2">
            {filter.type === 'select' || filter.type === 'multiselect' ? (
              // Render checkboxes for options
              (Array.isArray(filter.options) ? filter.options : []).map((opt: any, idx: number) => {
                const label = typeof opt === 'string' ? opt : opt.label
                const value = typeof opt === 'string' ? opt : opt.value
                const isChecked = Array.isArray(selectedValue)
                  ? selectedValue.includes(value)
                  : selectedValue === value

                return (
                  <label key={idx} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded">
                    <input
                      type={filter.type === 'multiselect' ? "checkbox" : "radio"}
                      name={filter.key}
                      checked={isChecked}
                      onChange={(e) => {
                        if (filter.type === 'multiselect') {
                          const current = Array.isArray(selectedValue) ? selectedValue : []
                          const updated = e.target.checked
                            ? [...current, value]
                            : current.filter((v: any) => v !== value)
                          onDynamicFilterChange(filter.key, updated)
                        } else {
                          // For radio/select, if clicking checked, maybe deselect? 
                          // Standard radio behavior is cannot deselect. 
                          // Let's implement toggle for radio if it's the only way to clear
                          if (isChecked) {
                            onDynamicFilterChange(filter.key, null)
                          } else {
                            onDynamicFilterChange(filter.key, value)
                          }
                        }
                      }}
                      className="w-4 h-4 accent-primary"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                  </label>
                )
              })
            ) : filter.type === 'range' ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span>Min: {filter.min_value}</span>
                  <span>Max: {filter.max_value}</span>
                </div>
                {/* Placeholder for dual slider - for now use inputs */}
                <div className="flex gap-2">
                  <input
                    type="number"
                    className="w-full border rounded px-2 py-1 text-sm bg-background"
                    placeholder="Min"
                    value={selectedValue?.[0] || ''}
                    onChange={(e) => onDynamicFilterChange(filter.key, [Number(e.target.value), selectedValue?.[1] || filter.max_value || 1000])}
                  />
                  <input
                    type="number"
                    className="w-full border rounded px-2 py-1 text-sm bg-background"
                    placeholder="Max"
                    value={selectedValue?.[1] || ''}
                    onChange={(e) => onDynamicFilterChange(filter.key, [selectedValue?.[0] || filter.min_value || 0, Number(e.target.value)])}
                  />
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* PRODUCT CATEGORIES Section */}
      <div className="border border-border rounded-lg p-4 bg-white dark:bg-card">
        <button
          onClick={() => toggleSection("category")}
          className="flex items-center justify-between w-full font-bold text-base mb-4 text-gray-900 dark:text-white uppercase"
        >
          PRODUCT CATEGORIES
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${expandedSections.category ? "" : "-rotate-90"
              }`}
          />
        </button>

        {expandedSections.category && (
          <div className="space-y-1 max-h-[600px] overflow-y-auto scrollbar-thin">
            {/* "All Products" option */}
            <button
              onClick={() => handleCategoryClick("")}
              className={`flex items-center justify-between w-full text-left py-2 px-2 rounded transition-colors text-sm font-semibold ${!selectedCategory
                ? "text-primary font-semibold bg-primary/10"
                : "text-gray-700 dark:text-gray-300 hover:text-primary hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
            >
              <span>All Products</span>
            </button>

            {categories.map((category) => {
              // Check if this category or any of its subcategories is selected
              const isSelected = selectedCategory === category.id
              const isSubSelected = category.subcategories?.some(sub =>
                selectedCategory === `${category.id}-${sub.id}` || // if slug is constructed like logical-slug
                selectedCategory === sub.id // if using direct subcategory slug
              )
              // We'll expand if it's selected, sub-selected, or user manually toggled
              const isExpanded = expandedSections[`cat-${category.id}`] || isSelected || isSubSelected

              return (
                <div key={category.id} className="space-y-1">
                  <div className="flex items-center justify-between w-full">
                    <button
                      onClick={() => {
                        if (category.subcategories && category.subcategories.length > 0) {
                          toggleSection(`cat-${category.id}`)
                        } else {
                          handleCategoryClick(category.id)
                        }
                      }}
                      className={`flex-1 flex items-center justify-between text-left py-2 px-2 rounded transition-colors text-sm ${isSelected
                        ? "text-primary font-semibold bg-primary/10"
                        : "text-gray-700 dark:text-gray-300 hover:text-primary hover:bg-gray-50 dark:hover:bg-gray-800"
                        }`}
                    >
                      <span className="flex-1">
                        {category.name}
                        {category.count !== undefined && !category.subcategories?.length && (
                          <span className="ml-2 text-xs text-gray-500">({category.count})</span>
                        )}
                      </span>

                      {category.subcategories && category.subcategories.length > 0 && (
                        <ChevronRight
                          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                        />
                      )}
                    </button>
                  </div>

                  {/* Subcategories Dropdown */}
                  {category.subcategories && category.subcategories.length > 0 && isExpanded && (
                    <div className="pl-4 space-y-1 border-l-2 border-gray-100 dark:border-gray-800 ml-2">
                      {category.subcategories.map((sub) => {
                        // Construct the slug for the subcategory filter. 
                        // Based on products.ts, subcategories are brand filters essentially within that category context
                        // If the user clicks a subcategory (e.g. "iPhone"), 
                        // we probably want to set category={parent} and brand={sub.name}
                        // However, the current logic often treats subcategories as distinct slugs (mobile-phones-iphone).
                        // Let's assume the slug passed to onCategoryChange should be the subcategory slug if it exists as a distinct category.
                        // Or if we want to filter by Brand, we set Brand.

                        // Given the requirement: "click this one of category the drop down come and show brand names"
                        // It implies clicking these should filter by that brand.

                        // Reconstruct the actual slug used in DB/logic
                        // For 'mobile-phones' sub 'iphone', the slug is 'mobile-phones-iphone'
                        // For 'used-items' sub 'iphone', the slug is 'used-items-iphone'

                        const fullSlug = `${category.id}-${sub.id}`
                        const isSubActive = selectedCategory === fullSlug

                        return (
                          <button
                            key={sub.id}
                            onClick={() => handleCategoryClick(fullSlug)}
                            className={`flex items-center justify-between w-full text-left py-1.5 px-2 rounded transition-colors text-sm ${isSubActive
                              ? "text-primary font-medium bg-primary/5"
                              : "text-gray-600 dark:text-gray-400 hover:text-primary hover:bg-gray-50 dark:hover:bg-gray-800"
                              }`}
                          >
                            <span>{sub.name}</span>
                            {sub.count !== undefined && (
                              <span className="text-xs text-gray-400">({sub.count})</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* PRICE FILTER */}
      <div className="border border-border rounded-lg p-4 bg-white dark:bg-card">
        <button
          onClick={() => toggleSection("price")}
          className="flex items-center justify-between w-full font-bold text-base mb-4 text-gray-900 dark:text-white uppercase"
        >
          FILTER BY PRICE
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${expandedSections.price ? "" : "-rotate-90"
              }`}
          />
        </button>

        {expandedSections.price && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300">
              <span>Price:</span>
              <span className="text-primary font-semibold">
                Rs. {priceRange[0].toLocaleString()} - Rs. {priceRange[1].toLocaleString()}
              </span>
            </div>

            <div className="space-y-4">
              <input
                type="range"
                min="0"
                max="1500000"
                step="1000"
                value={priceRange[1]}
                onChange={(e) => onPriceChange([priceRange[0], Number(e.target.value)])}
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>
          </div>
        )}
      </div>

      {/* DYNAMIC FILTERS */}
      {filters.map(renderFilter)}

    </div>
  )
}
