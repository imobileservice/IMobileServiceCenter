"use client"

import type React from "react"
import { useState, useEffect, useMemo } from "react"
import { motion } from "framer-motion"
import { X, Plus, Trash2, Upload, Loader2, Sparkles, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { productsService } from "@/lib/supabase/services/products"
import { categoriesService, type Category } from "@/lib/supabase/services/categories"
import { storageService } from "@/lib/supabase/services/storage"
import { notifyUpdate } from "@/hooks/use-realtime-updates"
import { toast } from "sonner"

interface ProductModalProps {
  isOpen: boolean
  onClose: () => void
  editingProductId?: string | null
}

export default function ProductModal({ isOpen, onClose, editingProductId }: ProductModalProps) {
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [autoSearching, setAutoSearching] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [autoSearchStatus, setAutoSearchStatus] = useState('')
  const [autoSearchSuccess, setAutoSearchSuccess] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    brand: "",
    price: "",
    stock: "",
    image: "",
    images: [] as string[],
    description: "",
    condition: "new" as "new" | "used",
    specs: {} as Record<string, string>,
    is_featured: false,
    variants: {
      base_price: 0,
      storage: [] as Array<{ value: string; price_adjustment: number; stock?: number }>,
      ram: [] as Array<{ value: string; price_adjustment: number; stock?: number }>,
      color: [] as Array<{ value: string; hex?: string; image?: string; stock?: number }>,
    },
  })

  // Fetch categories when modal opens
  useEffect(() => {
    if (isOpen) {
      const loadCategories = async () => {
        try {
          const data = await categoriesService.getAll()
          setCategories(data)
        } catch (error) {
          console.error('Failed to load categories:', error)
        }
      }
      loadCategories()
    }
  }, [isOpen])

  // Get category-specific fields from database
  const categoryFields = useMemo(() => {
    if (!formData.category) return null
    const category = categories.find(c => c.slug === formData.category)
    if (!category || !category.field_config) return null
    return {
      label: `${category.name} Specifications`,
      fields: category.field_config.fields || [],
    }
  }, [formData.category, categories])

  useEffect(() => {
    // Reset loading state when modal opens/closes
    if (!isOpen) {
      setLoading(false)
      setFetching(false)
      return
    }

    // Reset loading state when opening modal
    setLoading(false)
    setFetching(false)

    if (editingProductId) {
      const fetchProduct = async () => {
        try {
          setFetching(true)
          const product = await productsService.getById(editingProductId)
          if (product) {
            // Parse specs if it's a string
            let specs = {}
            if (product.specs) {
              if (typeof product.specs === 'string') {
                try {
                  specs = JSON.parse(product.specs)
                } catch {
                  specs = {}
                }
              } else {
                specs = product.specs as Record<string, string>
              }
            }

            // Parse variants if it exists
            let variants = {
              base_price: product.price || 0,
              storage: [] as Array<{ value: string; price_adjustment: number; stock?: number }>,
              ram: [] as Array<{ value: string; price_adjustment: number; stock?: number }>,
              color: [] as Array<{ value: string; hex?: string; image?: string; stock?: number }>,
            }

            if ((product as any).variants) {
              try {
                const parsedVariants = typeof (product as any).variants === 'string'
                  ? JSON.parse((product as any).variants)
                  : (product as any).variants

                if (parsedVariants && typeof parsedVariants === 'object' && !Array.isArray(parsedVariants)) {
                  variants = {
                    base_price: parsedVariants.base_price || product.price || 0,
                    storage: Array.isArray(parsedVariants.storage) ? parsedVariants.storage : [],
                    ram: Array.isArray(parsedVariants.ram) ? parsedVariants.ram : [],
                    color: Array.isArray(parsedVariants.color) ? parsedVariants.color : [],
                  }
                }
              } catch (error) {
                console.error('Failed to parse variants:', error)
                // Use default empty variants
              }
            }

            setFormData({
              name: product.name || "",
              category: product.category || "",
              brand: product.brand || "",
              price: product.price?.toString() || "",
              stock: product.stock?.toString() || "0",
              image: product.image || product.images?.[0] || "",
              images: product.images || [],
              description: product.description || "",
              condition: (product.condition as "new" | "used") || "new",
              specs: specs,
              is_featured: Boolean((product as any).is_featured),
              variants: variants,
            })
            // Initialize search query with product name
            setSearchQuery(product.name || "")
          }
        } catch (error) {
          console.error('Failed to fetch product:', error)
          toast.error('Failed to load product details')
        } finally {
          setFetching(false)
        }
      }
      fetchProduct()
    } else {
      // Reset form for new product
      setFormData({
        name: "",
        category: "",
        brand: "",
        price: "",
        stock: "",
        image: "",
        images: [],
        description: "",
        condition: "new",
        specs: {},
        is_featured: false,
        variants: {
          base_price: 0,
          storage: [],
          ram: [],
          color: [],
        },
      })
      setSearchQuery("")
    }
  }, [editingProductId, isOpen])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target

    // Clear specs when category changes
    if (name === 'category') {
      setFormData((prev) => ({ ...prev, [name]: value, specs: {} }))
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }))
    }
  }

  const handleSpecChange = (key: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      specs: {
        ...prev.specs,
        [key]: value,
      },
    }))
  }

  const handleImageAdd = () => {
    if (formData.image.trim()) {
      setFormData((prev) => ({
        ...prev,
        images: [...prev.images, prev.image],
        image: "",
      }))
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)
    const errors: string[] = []
    const successfulUploads: string[] = []

    try {
      // Process files sequentially to avoid overwhelming the storage
      for (const file of Array.from(files)) {
        try {
          // Validate file type
          if (!file.type.startsWith('image/')) {
            errors.push(`${file.name} is not an image file`)
            continue
          }

          // Validate file size (max 5MB)
          if (file.size > 5 * 1024 * 1024) {
            errors.push(`${file.name} is too large. Maximum size is 5MB`)
            continue
          }

          // Upload to Supabase Storage
          const url = await storageService.uploadProductImage(file, editingProductId || undefined)
          successfulUploads.push(url)
        } catch (error: any) {
          errors.push(`${file.name}: ${error.message || 'Upload failed'}`)
        }
      }

      if (successfulUploads.length > 0) {
        setFormData((prev) => ({
          ...prev,
          images: [...prev.images, ...successfulUploads],
        }))
        toast.success(`Successfully uploaded ${successfulUploads.length} image(s)`)
      }

      if (errors.length > 0) {
        // Show first error in detail if it's a bucket error
        const firstError = errors[0]
        if (firstError.includes('Bucket not found')) {
          toast.error(
            'Storage bucket not configured. Please create the "product-images" bucket in Supabase Storage. Check the console for details.',
            { duration: 10000 }
          )
          console.error('📦 Storage Setup Required:\n', firstError)
        } else {
          toast.error(`Failed to upload ${errors.length} image(s): ${errors.slice(0, 2).join(', ')}${errors.length > 2 ? '...' : ''}`)
        }
      }
    } catch (error: any) {
      console.error('Failed to upload images:', error)
      if (error.message?.includes('Bucket not found')) {
        toast.error(
          'Storage bucket not configured. Please create the "product-images" bucket in Supabase Storage.',
          { duration: 10000 }
        )
        console.error('📦 Storage Setup Required:\n', error.message)
      } else {
        toast.error(error.message || 'Failed to upload images')
      }
    } finally {
      setUploading(false)
      // Reset file input
      e.target.value = ''
    }
  }

  const handleImageRemove = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }))
  }

  // Auto Search & Fill - searches the internet for product data
  const handleAutoSearchAndFill = async () => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      toast.error('Please enter a product model name first')
      return
    }

    setAutoSearching(true)
    setAutoSearchSuccess(false)
    setAutoSearchStatus('Searching Global Database & AI...')

    try {
      setAutoSearchStatus('Fetching specifications & AI insights...')

      const response = await fetch('/api/admin/product-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ modelName: searchQuery.trim() }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Search failed' }))
        throw new Error(err.error || 'Search failed')
      }

      const { data } = await response.json()

      setAutoSearchStatus('Filling in product details...')

      // Auto-fill ALL form fields
      setFormData(prev => {
        const newImages = data.images || []
        const primaryImage = newImages.length > 0 ? newImages[0] : prev.image

        return {
          ...prev,
          name: data.name || prev.name,
          brand: data.brand || prev.brand,
          category: data.category || prev.category || "mobile-phones",
          description: data.description || prev.description,
          // Fill images - if new images found, use them as primary and in the list
          images: newImages.length > 0 ? newImages : prev.images,
          image: '', // Clear the URL input field
          // Fill specs
          specs: data.specs && Object.keys(data.specs).some((k: string) => data.specs[k])
            ? Object.fromEntries(Object.entries(data.specs).filter(([, v]) => v && String(v).trim()).map(([k, v]) => [k, String(v)])) as Record<string, string>
            : prev.specs,
          // Fill variants
          variants: {
            base_price: data.price || Number.parseFloat(prev.price) || 0,
            storage: data.variants?.storage && data.variants.storage.length > 0 ? data.variants.storage : prev.variants.storage,
            ram: data.variants?.ram && data.variants.ram.length > 0 ? data.variants.ram : prev.variants.ram,
            color: data.variants?.color && data.variants.color.length > 0 ? data.variants.color : prev.variants.color,
          },
        }
      })

      setAutoSearchSuccess(true)
      const source = data.source === 'gsmarena' || data.source?.includes('gsmarena') ? 'GSMArena' : 'product database'
      const imageCount = data.images?.length || 0
      toast.success(
        `✅ Auto-filled from ${source}! Found ${data.variants?.storage?.length || 0} storage options, ${data.variants?.color?.length || 0} colors${imageCount > 0 ? `, ${imageCount} images` : ''}.`,
        { duration: 5000 }
      )

      // Reset success indicator after 3 seconds
      setTimeout(() => setAutoSearchSuccess(false), 3000)
    } catch (error: any) {
      console.error('[AutoSearch] Error:', error)
      toast.error(error.message || 'Could not find product data. Please fill in manually.')
    } finally {
      setAutoSearching(false)
      setAutoSearchStatus('')
    }
  }

  // Variant management functions
  const handleAutoFillVariants = async () => {
    // Now delegates to the full auto-search
    await handleAutoSearchAndFill()
  }

  const addStorageOption = () => {
    setFormData((prev) => ({
      ...prev,
      variants: {
        ...prev.variants,
        storage: [...prev.variants.storage, { value: '', price_adjustment: 0, stock: 0 }],
      },
    }))
  }

  const updateStorageOption = (index: number, field: 'value' | 'price_adjustment' | 'stock', value: string | number) => {
    setFormData((prev) => ({
      ...prev,
      variants: {
        ...prev.variants,
        storage: prev.variants.storage.map((item, i) =>
          i === index ? { ...item, [field]: value } : item
        ),
      },
    }))
  }

  const removeStorageOption = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      variants: {
        ...prev.variants,
        storage: prev.variants.storage.filter((_, i) => i !== index),
      },
    }))
  }

  const addRAMOption = () => {
    setFormData((prev) => ({
      ...prev,
      variants: {
        ...prev.variants,
        ram: [...prev.variants.ram, { value: '', price_adjustment: 0, stock: 0 }],
      },
    }))
  }

  const updateRAMOption = (index: number, field: 'value' | 'price_adjustment' | 'stock', value: string | number) => {
    setFormData((prev) => ({
      ...prev,
      variants: {
        ...prev.variants,
        ram: prev.variants.ram.map((item, i) =>
          i === index ? { ...item, [field]: value } : item
        ),
      },
    }))
  }

  const removeRAMOption = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      variants: {
        ...prev.variants,
        ram: prev.variants.ram.filter((_, i) => i !== index),
      },
    }))
  }

  const addColorOption = () => {
    setFormData((prev) => ({
      ...prev,
      variants: {
        ...prev.variants,
        color: [...prev.variants.color, { value: '', hex: '#000000', stock: 0 }],
      },
    }))
  }

  const updateColorOption = (index: number, field: 'value' | 'hex' | 'image' | 'stock', value: string | number) => {
    setFormData((prev) => ({
      ...prev,
      variants: {
        ...prev.variants,
        color: prev.variants.color.map((item, i) =>
          i === index ? { ...item, [field]: value } : item
        ),
      },
    }))
  }

  const removeColorOption = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      variants: {
        ...prev.variants,
        color: prev.variants.color.filter((_, i) => i !== index),
      },
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Prevent double submission
    if (loading) {
      return
    }

    setLoading(true)

    try {
      // Validate category-specific required fields
      const isApple = formData.brand.trim().toLowerCase() === 'apple'
      if (categoryFields) {
        const missingFields: string[] = []
        categoryFields.fields.forEach((field) => {
          // For Apple products, RAM is optional (only storage is required)
          if (field.key === 'ram' && isApple) {
            return
          }
          if (field.required && !formData.specs[field.key]) {
            missingFields.push(field.label)
          }
        })
        if (missingFields.length > 0) {
          toast.error(`Please fill in required fields: ${missingFields.join(', ')}`)
          setLoading(false)
          return
        }
      }

      const basePrice = Number.parseFloat(formData.price) || 0

      const productData: any = {
        name: formData.name,
        category: formData.category,
        brand: formData.brand || null,
        price: basePrice, // Base price
        stock: Number.parseInt(formData.stock) || 0,
        description: formData.description || null,
        condition: formData.condition,
        specs: Object.keys(formData.specs).length > 0 ? formData.specs : null,
        is_featured: formData.is_featured,
      }

      // Set primary image
      if (formData.images.length > 0) {
        productData.image = formData.images[0]
        productData.images = formData.images
      } else if (formData.image) {
        productData.image = formData.image
        productData.images = [formData.image]
      }

      // Add variants if configured
      const hasVariants = (formData.variants?.storage?.length || 0) > 0 ||
        (formData.variants?.ram?.length || 0) > 0 ||
        (formData.variants?.color?.length || 0) > 0

      if (hasVariants) {
        productData.variants = {
          base_price: basePrice,
          storage: (formData.variants?.storage || []).filter(s => s.value.trim() !== ''),
          ram: (formData.variants?.ram || []).filter(r => r.value.trim() !== ''),
          color: (formData.variants?.color || []).filter(c => c.value.trim() !== ''),
        }
      }

      if (editingProductId) {
        await productsService.update(editingProductId, productData)
        toast.success('Product updated successfully')
      } else {
        await productsService.create(productData)
        toast.success('Product created successfully')
      }

      onClose()
      // Notify all pages about the product update (real-time refresh)
      setTimeout(() => {
        notifyUpdate('product')
      }, 300)
    } catch (error: any) {
      console.error('Failed to save product:', error)
      toast.error(error.message || 'Failed to save product')
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
          <h2 className="text-2xl font-bold">{editingProductId ? "Edit Product" : "Add Product"}</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-muted rounded-lg"
            aria-label="Close modal"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {fetching ? (
          <div className="text-center py-8">Loading product details...</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Auto Search & Fill Banner */}
            <div className="rounded-xl border border-border bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground mb-1">🔍 Auto Search & Fill</p>
                  <p className="text-xs text-muted-foreground">Type the product model name below and click the button to automatically fill all fields from the internet.</p>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g. iPhone 15 Pro Max, Samsung Galaxy S24 Ultra..."
                  className="flex-1"
                  disabled={autoSearching}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAutoSearchAndFill()
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleAutoSearchAndFill}
                  disabled={autoSearching || !searchQuery.trim()}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 whitespace-nowrap ${autoSearchSuccess
                    ? 'bg-green-500 text-white'
                    : autoSearching
                      ? 'bg-blue-500/80 text-white cursor-not-allowed'
                      : 'bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700 shadow-lg hover:shadow-blue-500/25'
                    } disabled:opacity-60`}
                >
                  {autoSearchSuccess ? (
                    <><CheckCircle className="w-4 h-4" /> Filled!</>
                  ) : autoSearching ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {autoSearchStatus || 'Searching...'}</>
                  ) : (
                    <><Sparkles className="w-4 h-4" /> Auto Search & Fill</>
                  )}
                </button>
              </div>
              {autoSearching && (
                <div className="mt-2 flex items-center gap-2 text-xs text-blue-400">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  {autoSearchStatus}
                </div>
              )}
            </div>

            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold border-b border-border pb-2">Basic Information</h3>

              <div>
                <label className="block text-sm font-semibold mb-2">Product Name *</label>
                <Input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="iPhone 15 Pro Max"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="category-select" className="block text-sm font-semibold mb-2">Category *</label>
                  <select
                    id="category-select"
                    name="category"
                    value={formData.category}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                    required
                    aria-label="Select product category"
                  >
                    <option value="">Select category</option>
                    {categories
                      .filter(c => c.is_active)
                      .map((category) => (
                        <option key={category.id} value={category.slug}>
                          {category.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Brand</label>
                  <Input
                    type="text"
                    name="brand"
                    value={formData.brand}
                    onChange={handleChange}
                    placeholder="Apple, Samsung, etc."
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="condition-select" className="block text-sm font-semibold mb-2">Condition *</label>
                  <select
                    id="condition-select"
                    name="condition"
                    value={formData.condition}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                    required
                    aria-label="Select product condition"
                  >
                    <option value="new">New</option>
                    <option value="used">Used</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Stock *</label>
                  <Input
                    type="number"
                    name="stock"
                    value={formData.stock}
                    onChange={handleChange}
                    placeholder="10"
                    min="0"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Pricing */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold border-b border-border pb-2">Pricing</h3>

              <div>
                <label className="block text-sm font-semibold mb-2">Base Price *</label>
                <Input
                  type="number"
                  name="price"
                  value={formData.price}
                  onChange={handleChange}
                  placeholder="100000"
                  step="0.01"
                  min="0"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Base price. Variant price adjustments will be added to this.
                </p>
              </div>
            </div>

            {/* Product Variants */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <h3 className="text-lg font-semibold">Product Variants</h3>
                <span className="text-xs text-muted-foreground">Use "Auto Search & Fill" above to auto-populate</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Configure storage, RAM (non-iPhone), and color options with price adjustments. Base price + adjustments = final price.
              </p>

              {/* Storage Options */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-semibold">Storage Options</label>
                  <Button type="button" variant="outline" size="sm" onClick={addStorageOption} className="gap-1">
                    <Plus className="w-3 h-3" />
                    Add Storage
                  </Button>
                </div>
                <div className="space-y-2">
                  {(formData.variants?.storage || []).map((storage, index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <Input
                        type="text"
                        placeholder="128GB"
                        value={storage.value}
                        onChange={(e) => updateStorageOption(index, 'value', e.target.value)}
                        className="flex-1"
                      />
                      <div className="relative w-32">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">Rs.</span>
                        <Input
                          type="number"
                          placeholder="Price"
                          value={((Number.parseFloat(formData.price) || 0) + (storage.price_adjustment || 0))}
                          onChange={(e) => {
                            const newPrice = Number.parseFloat(e.target.value) || 0
                            const basePrice = Number.parseFloat(formData.price) || 0
                            updateStorageOption(index, 'price_adjustment', newPrice - basePrice)
                          }}
                          className="pl-8"
                          step="0.01"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeStorageOption(index)}
                        className="text-red-500 hover:text-red-700"
                        aria-label={`Remove storage option ${index + 1}`}
                        title="Remove storage option"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  {(formData.variants?.storage || []).length === 0 && (
                    <p className="text-xs text-muted-foreground">No storage options added. Click "Add Storage" to add options.</p>
                  )}
                </div>
              </div>

              {/* RAM Options (Hidden for Apple) */}
              {formData.brand.trim().toLowerCase() !== 'apple' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-semibold">RAM Options</label>
                    <Button type="button" variant="outline" size="sm" onClick={addRAMOption} className="gap-1">
                      <Plus className="w-3 h-3" />
                      Add RAM
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {(formData.variants?.ram || []).map((ram, index) => (
                      <div key={index} className="flex gap-2 items-center">
                        <Input
                          type="text"
                          placeholder="8GB"
                          value={ram.value}
                          onChange={(e) => updateRAMOption(index, 'value', e.target.value)}
                          className="flex-1"
                        />
                        <Input
                          type="number"
                          placeholder="Price adjustment"
                          value={ram.price_adjustment}
                          onChange={(e) => updateRAMOption(index, 'price_adjustment', Number.parseFloat(e.target.value) || 0)}
                          className="w-32"
                          step="0.01"
                        />
                        <Input
                          type="number"
                          placeholder="Stock"
                          value={ram.stock || 0}
                          onChange={(e) => updateRAMOption(index, 'stock', Number.parseInt(e.target.value) || 0)}
                          className="w-24"
                          min="0"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeRAMOption(index)}
                          className="text-red-500 hover:text-red-700"
                          aria-label={`Remove RAM option ${index + 1}`}
                          title="Remove RAM option"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                    {(formData.variants?.ram || []).length === 0 && (
                      <p className="text-xs text-muted-foreground">No RAM options added. Click "Add RAM" to add options.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Color Options */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-semibold">Color Options</label>
                  <Button type="button" variant="outline" size="sm" onClick={addColorOption} className="gap-1">
                    <Plus className="w-3 h-3" />
                    Add Color
                  </Button>
                </div>
                <div className="space-y-2">
                  {(formData.variants?.color || []).map((color, index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <Input
                        type="text"
                        placeholder="Color name (e.g., Black)"
                        value={color.value}
                        onChange={(e) => updateColorOption(index, 'value', e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        type="color"
                        value={color.hex || '#000000'}
                        onChange={(e) => updateColorOption(index, 'hex', e.target.value)}
                        className="w-16 h-10"
                        title="Color"
                      />
                      <Input
                        type="text"
                        placeholder="Image URL (optional)"
                        value={color.image || ''}
                        onChange={(e) => updateColorOption(index, 'image', e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        placeholder="Stock"
                        value={color.stock || 0}
                        onChange={(e) => updateColorOption(index, 'stock', Number.parseInt(e.target.value) || 0)}
                        className="w-24"
                        min="0"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeColorOption(index)}
                        className="text-red-500 hover:text-red-700"
                        aria-label={`Remove color option ${index + 1}`}
                        title="Remove color option"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  {(formData.variants?.color || []).length === 0 && (
                    <p className="text-xs text-muted-foreground">No color options added. Click "Add Color" to add options.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Category-Specific Specifications */}
            {categoryFields && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold border-b border-border pb-2">{categoryFields.label}</h3>
                <div className="grid grid-cols-2 gap-4">
                  {categoryFields.fields.map((field) => {
                    const isApple = formData.brand.trim().toLowerCase() === 'apple'
                    const isRamField = field.key === 'ram'
                    const isRequired = field.required && !(isApple && isRamField)

                    return (
                      <div key={field.key}>
                        <label className="block text-sm font-semibold mb-2">
                          {field.label} {isRequired && '*'}
                        </label>
                        {field.type === 'select' ? (
                          <select
                            id={`spec-${field.key}`}
                            value={formData.specs[field.key] || ''}
                            onChange={(e) => handleSpecChange(field.key, e.target.value)}
                            className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                            required={isRequired}
                            aria-label={`Select ${field.label}`}
                          >
                            <option value="">Select {field.label}</option>
                            {field.options?.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            type={field.type}
                            value={formData.specs[field.key] || ''}
                            onChange={(e) => handleSpecChange(field.key, e.target.value)}
                            placeholder={field.placeholder}
                            required={isRequired}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Images */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold border-b border-border pb-2">Product Images</h3>

              {/* File Upload */}
              <div>
                <label className="block text-sm font-semibold mb-2">Upload Images</label>
                <div className="flex gap-2">
                  <label className="flex-1">
                    <input
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      multiple
                      onChange={handleFileUpload}
                      disabled={uploading || loading}
                      className="hidden"
                      id="image-upload"
                    />
                    <div className={`flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-border rounded-lg bg-background hover:bg-muted cursor-pointer transition-colors ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      {uploading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-sm">Uploading images...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-5 h-5" />
                          <span className="text-sm">Click to upload or drag and drop</span>
                        </>
                      )}
                    </div>
                  </label>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Supported formats: JPG, PNG, WebP. Max size: 5MB per image. You can select multiple images at once.
                </p>
              </div>

              {/* Image URL Input (Alternative method) */}
              <div>
                <label className="block text-sm font-semibold mb-2">Or Add Image URL</label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={formData.image}
                    onChange={(e) => setFormData(prev => ({ ...prev, image: e.target.value }))}
                    placeholder="/iphone-15-pro-max.png or https://example.com/image.jpg"
                  />
                  <Button
                    type="button"
                    onClick={handleImageAdd}
                    disabled={!formData.image.trim()}
                    className="gap-2"
                    aria-label="Add image from URL"
                    title="Add image from URL"
                  >
                    <Plus className="w-4 h-4" />
                    Add URL
                  </Button>
                </div>
              </div>

              {formData.images.length > 0 && (
                <div className="space-y-2">
                  <label className="block text-sm font-semibold">Product Images ({formData.images.length})</label>
                  <div className="grid grid-cols-3 gap-2">
                    {formData.images.map((img, index) => (
                      <div key={index} className="relative group">
                        <img
                          src={img}
                          alt={`Product ${index + 1}`}
                          className="w-full h-24 object-cover rounded-lg border border-border"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/placeholder.svg'
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleImageRemove(index)}
                          className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label={`Remove image ${index + 1}`}
                          title="Remove image"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                        {index === 0 && (
                          <span className="absolute bottom-1 left-1 px-2 py-0.5 bg-primary text-primary-foreground text-xs rounded">
                            Primary
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Description */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold border-b border-border pb-2">Description</h3>
              <div>
                <label className="block text-sm font-semibold mb-2">Product Description</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Detailed product description..."
                  rows={4}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                />
              </div>
            </div>

            {/* Home Page Visibility */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold border-b border-border pb-2">Home Page</h3>
              <div className="flex items-center gap-2">
                <input
                  id="is_featured"
                  type="checkbox"
                  checked={formData.is_featured}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      is_featured: e.target.checked,
                    }))
                  }
                  className="w-4 h-4"
                />
                <label htmlFor="is_featured" className="text-sm">
                  Show this product in the <span className="font-semibold">Featured Products</span> section on the home
                  page
                </label>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4 border-t border-border">
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? "Saving..." : editingProductId ? "Update Product" : "Add Product"}
              </Button>
              <Button type="button" variant="outline" onClick={onClose} className="flex-1 bg-transparent" disabled={loading}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </motion.div>
    </motion.div>
  )
}
