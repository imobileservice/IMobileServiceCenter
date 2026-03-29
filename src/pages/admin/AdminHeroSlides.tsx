"use client"

import { useState, useEffect, useCallback } from "react"
import { motion } from "framer-motion"
import { Plus, Edit2, Trash2, ArrowUp, ArrowDown, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { heroSlidesService, type HeroSlide } from "@/lib/supabase/services/hero-slides"
import { productsService } from "@/lib/supabase/services/products"
import AdminLayout from "@/components/admin-layout"
import { toast } from "sonner"
import { getApiUrl } from "@/lib/utils/api"

export default function AdminHeroSlidesPage() {
  const [slides, setSlides] = useState<HeroSlide[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingSlide, setEditingSlide] = useState<HeroSlide | null>(null)
  const [products, setProducts] = useState<any[]>([])
  const [formData, setFormData] = useState({
    product_id: "",
    brand: "",
    title: "",
    subtitle: "",
    image: "",
    image2: "",
    display_order: 0,
    is_active: true,
  })

  const fetchSlides = async () => {
    try {
      setLoading(true)
      const data = await heroSlidesService.getAllForAdmin()
      setSlides(data || [])
    } catch (error: any) {
      console.error('Failed to fetch hero slides:', error)
      toast.error("Failed to load hero slides: " + error.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchProducts = async () => {
    try {
      const data = await productsService.getAll()
      setProducts(data || [])
    } catch (error) {
      console.error('Failed to fetch products:', error)
    }
  }

  useEffect(() => {
    fetchSlides()
    fetchProducts()

    // Listen for updates
    const handleUpdate = () => {
      fetchSlides()
    }
    window.addEventListener('heroSlidesUpdated', handleUpdate)
    return () => window.removeEventListener('heroSlidesUpdated', handleUpdate)
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this slide?')) return
    try {
      await heroSlidesService.delete(id)
      setSlides(prev => prev.filter(s => s.id !== id))
      toast.success("Slide deleted successfully")
      window.dispatchEvent(new CustomEvent('heroSlidesUpdated'))
    } catch (error: any) {
      console.error('Failed to delete slide:', error)
      toast.error("Failed to delete slide: " + error.message)
    }
  }

  const handleEdit = (slide: HeroSlide) => {
    setEditingSlide(slide)
    setFormData({
      product_id: slide.product_id || "",
      brand: slide.brand,
      title: slide.title,
      subtitle: slide.subtitle || "",
      image: slide.image,
      image2: slide.image2 || "",
      display_order: slide.display_order,
      is_active: slide.is_active,
    })
    setIsModalOpen(true)
  }

  const handleAdd = () => {
    setEditingSlide(null)
    setFormData({
      product_id: "",
      brand: "",
      title: "",
      subtitle: "",
      image: "",
      image2: "",
      display_order: slides.length,
      is_active: true,
    })
    setIsModalOpen(true)
  }

  const buildSubtitleFromProduct = (product: any) => {
    if (product?.description) {
      const firstLine = product.description.split("\n").find((line: string) => line.trim().length > 0)
      if (firstLine) return firstLine.trim()
    }

    if (product?.specs) {
      let specsObj = product.specs
      if (typeof specsObj === "string") {
        try {
          specsObj = JSON.parse(specsObj)
        } catch {
          specsObj = {}
        }
      }
      if (specsObj && typeof specsObj === "object") {
        const parts = [specsObj.Storage || specsObj.storage, specsObj.RAM || specsObj.ram, specsObj.Warranty || specsObj.warranty]
          .filter(Boolean)
          .map((val: string) => String(val))
        if (parts.length) {
          return parts.join(" • ")
        }
      }
    }

    return ""
  }

  const handleProductSelect = useCallback((productId: string) => {
    const selectedProduct = products.find((p) => p.id === productId)

    setFormData((prev) => {
      if (!selectedProduct) {
        return { ...prev, product_id: productId }
      }

      const productImages = selectedProduct.images || []
      const primaryImage = selectedProduct.image || productImages[0] || prev.image
      const secondaryImage = productImages.find((img: string) => img !== primaryImage) || productImages[1] || prev.image2

      return {
        ...prev,
        product_id: productId,
        brand: selectedProduct.brand || prev.brand,
        title: selectedProduct.name || prev.title,
        subtitle: buildSubtitleFromProduct(selectedProduct) || prev.subtitle,
        image: primaryImage || prev.image,
        image2: secondaryImage || prev.image2,
      }
    })
  }, [products])

  const handleSave = async () => {
    try {
      if (!formData.brand || !formData.title || !formData.image) {
        toast.error("Please fill in all required fields (Brand, Title, Image)")
        return
      }

      if (editingSlide) {
        await heroSlidesService.update(editingSlide.id, formData)
        toast.success("Slide updated successfully")
      } else {
        await heroSlidesService.create(formData)
        toast.success("Slide created successfully")
      }

      setIsModalOpen(false)
      fetchSlides()
      window.dispatchEvent(new CustomEvent('heroSlidesUpdated'))
    } catch (error: any) {
      console.error('Failed to save slide:', error)
      toast.error("Failed to save slide: " + error.message)
    }
  }

  const handleToggleActive = async (slide: HeroSlide) => {
    try {
      await heroSlidesService.update(slide.id, { is_active: !slide.is_active })
      toast.success(`Slide ${slide.is_active ? 'deactivated' : 'activated'}`)
      fetchSlides()
      window.dispatchEvent(new CustomEvent('heroSlidesUpdated'))
    } catch (error: any) {
      toast.error("Failed to update slide: " + error.message)
    }
  }

  const handleMoveOrder = async (slide: HeroSlide, direction: 'up' | 'down') => {
    const currentIndex = slides.findIndex(s => s.id === slide.id)
    if (currentIndex === -1) return

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (newIndex < 0 || newIndex >= slides.length) return

    const targetSlide = slides[newIndex]
    const newOrder = targetSlide.display_order
    const targetNewOrder = slide.display_order

    try {
      await Promise.all([
        heroSlidesService.update(slide.id, { display_order: newOrder }),
        heroSlidesService.update(targetSlide.id, { display_order: targetNewOrder }),
      ])
      fetchSlides()
      window.dispatchEvent(new CustomEvent('heroSlidesUpdated'))
    } catch (error: any) {
      toast.error("Failed to reorder slides: " + error.message)
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Hero Slides</h1>
              <p className="text-muted-foreground mt-1">Manage promotional content on the home page</p>
            </div>
            <Button onClick={handleAdd} className="gap-2 self-start sm:self-auto shadow-md">
              <Plus className="w-4 h-4" />
              Add Slide
            </Button>
          </div>
        </motion.div>

        {/* Slides List */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading slides...</p>
          </div>
        ) : slides.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No slides yet. Add your first slide to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {slides.map((slide, index) => (
              <motion.div
                key={slide.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className="bg-card border border-border rounded-lg p-4 space-y-3"
              >
                <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
                  <img
                    src={slide.image || "/placeholder.svg"}
                    alt={slide.title}
                    className="w-full h-full object-cover"
                  />
                  {!slide.is_active && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="text-white font-semibold">Inactive</span>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase">{slide.brand}</p>
                  <p className="font-semibold">{slide.title}</p>
                  {slide.subtitle && (
                    <p className="text-sm text-muted-foreground line-clamp-1">{slide.subtitle}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">Order: {slide.display_order}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(slide)}
                    className="flex-1"
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleToggleActive(slide)}
                    className="flex-1"
                  >
                    {slide.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleMoveOrder(slide, 'up')}
                    disabled={index === 0}
                  >
                    <ArrowUp className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleMoveOrder(slide, 'down')}
                    disabled={index === slides.length - 1}
                  >
                    <ArrowDown className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(slide.id)}
                    className="text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-card border border-border rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            >
              <h2 className="text-2xl font-bold mb-4">
                {editingSlide ? "Edit Slide" : "Add Slide"}
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Product (Optional)</label>
                  <select
                    value={formData.product_id}
                    onChange={(e) => handleProductSelect(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                  >
                    <option value="">None - Custom Slide</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Selecting a product auto-fills brand, title, subtitle, and images. You can still edit them manually.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Brand *</label>
                  <Input
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    placeholder="Apple"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Title *</label>
                  <Input
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="iPhone 16 Pro"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Subtitle</label>
                  <Input
                    value={formData.subtitle}
                    onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                    placeholder="Hello, Apple Intelligence."
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Main Image URL *</label>
                  <Input
                    value={formData.image}
                    onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                    placeholder="/iphone-16-pro.png"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Secondary Image URL</label>
                  <Input
                    value={formData.image2}
                    onChange={(e) => setFormData({ ...formData, image2: e.target.value })}
                    placeholder="/iphone-16-pro-2.jpg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Display Order</label>
                  <Input
                    type="number"
                    value={formData.display_order}
                    onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                    min="0"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <label htmlFor="is_active" className="text-sm font-semibold">
                    Active (visible on home page)
                  </label>
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <Button onClick={handleSave} className="flex-1">
                  {editingSlide ? "Update" : "Create"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}

