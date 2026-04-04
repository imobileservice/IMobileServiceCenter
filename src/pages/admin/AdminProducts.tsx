"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Plus, Edit2, Trash2, Search, Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { productsService } from "@/lib/supabase/services/products"
import { notifyUpdate } from "@/hooks/use-realtime-updates"
import ProductModal from "@/components/admin/product-modal"
import AdminLayout from "@/components/admin-layout"
import { formatCurrency } from "@/lib/utils/currency"
import type { Database } from "@/lib/supabase/types"
import BarcodeLabelModal from "@/components/admin/barcode-label-modal"

type Product = Database['public']['Tables']['products']['Row']

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<string | null>(null)
  const [printingProducts, setPrintingProducts] = useState<any[] | null>(null)
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])

  const fetchProducts = async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      const data = await productsService.getAll()
      setProducts(data)
    } catch (error) {
      console.error('Failed to fetch products:', error)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    fetchProducts()
    
    // Listen for product updates
    const handleProductUpdate = () => {
      fetchProducts(true)
    }
    window.addEventListener('productUpdated', handleProductUpdate)
    
    return () => {
      window.removeEventListener('productUpdated', handleProductUpdate)
    }
  }, [])

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.category.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return
    try {
      await productsService.delete(id)
      setProducts(prev => prev.filter(p => p.id !== id))
      // Notify all pages about the product deletion (real-time refresh)
      // Small delay to ensure database transaction is committed
      setTimeout(() => {
        notifyUpdate('product')
      }, 300)
    } catch (error) {
      console.error('Failed to delete product:', error)
      alert(error instanceof Error ? error.message : 'Failed to delete product')
    }
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
    setEditingProduct(null)
    // Products will be refetched via the event listener
  }

  const handleProductSaved = (product: { name: string; barcode: string; price: number }) => {
    // Auto-open barcode print modal for newly created products
    setPrintingProducts([{ name: product.name, barcode: product.barcode, price: product.price }])
    // Refresh product list
    fetchProducts(true)
  }

  const toggleSelection = (id: string) => {
    setSelectedProductIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const toggleAll = () => {
    if (selectedProductIds.length === filteredProducts.length) {
      setSelectedProductIds([])
    } else {
      setSelectedProductIds(filteredProducts.map(p => p.id))
    }
  }

  const handleBulkPrint = () => {
    const selected = products.filter(p => selectedProductIds.includes(p.id));
    setPrintingProducts(selected.map(p => ({
      id: p.id,
      name: getDisplayName(p),
      barcode: (p as any).barcode,
      price: p.price
    })));
  }

  const handleEdit = (id: string) => {
    setEditingProduct(id)
    setIsModalOpen(true)
  }

  const getDisplayName = (product: any) => {
    const model = product.specs?.model;
    if (model && !product.name.includes(model)) {
      return `${product.name} (${model})`;
    }
    return product.name;
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Products</h1>
            <p className="text-muted-foreground mt-1">Manage your product inventory and stock levels</p>
          </div>
          <div className="flex items-center gap-3 self-start sm:self-auto">
            {selectedProductIds.length > 0 && (
              <Button onClick={handleBulkPrint} variant="secondary" className="gap-2 shadow-md bg-primary text-primary-foreground hover:bg-primary/90 font-bold border-2 border-primary">
                <Tag className="w-4 h-4" />
                Bulk Print ({selectedProductIds.length})
              </Button>
            )}
            <Button onClick={() => setIsModalOpen(true)} className="gap-2 shadow-md">
              <Plus className="w-4 h-4" />
              Add Product
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Low Stock Alerts */}
      {products.some(p => p.stock < 5) && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }} 
          animate={{ opacity: 1, height: "auto" }}
          className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6"
        >
          <div className="flex items-start gap-3">
            <div className="bg-red-100 p-2 rounded-full mt-1">
              <Trash2 className="w-4 h-4 text-red-600 rotate-180" /> {/* Using Trash2 as a warning placeholder or could use AlertCircle */}
            </div>
            <div>
              <h3 className="text-red-800 font-bold text-lg">Low Stock Warning!</h3>
              <p className="text-red-700">
                The following products have less than 5 units left. Please order new quantities soon:
              </p>
              <ul className="mt-2 list-disc list-inside text-red-600 font-medium">
                {products.filter(p => p.stock < 5).map(p => (
                  <li key={p.id}>{getDisplayName(p)} ({p.stock} units left)</li>
                ))}
              </ul>
            </div>
          </div>
        </motion.div>
      )}

      {/* Search */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </motion.div>

      {/* Products Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-card border border-border rounded-lg overflow-hidden"
      >
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading products...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No products found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="py-4 px-6 w-12 text-center">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-border"
                      checked={selectedProductIds.length > 0 && selectedProductIds.length === filteredProducts.length}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="text-left py-4 px-6 font-semibold">Product Name</th>
                  <th className="text-left py-4 px-6 font-semibold">Category</th>
                  <th className="text-left py-4 px-6 font-semibold">Price</th>
                  <th className="text-left py-4 px-6 font-semibold">Stock</th>
                  <th className="text-left py-4 px-6 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                <motion.tr
                  key={product.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="border-b border-border hover:bg-muted/50 transition-colors"
                >
                  <td className="py-4 px-6 w-12 text-center">
                    <input 
                      type="checkbox"
                      className="w-4 h-4 rounded border-border"
                      checked={selectedProductIds.includes(product.id)}
                      onChange={() => toggleSelection(product.id)}
                    />
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <img
                        src={product.image || "/placeholder.svg"}
                        alt={product.name}
                        className="w-10 h-10 rounded object-cover border border-border"
                      />
                      <span className="font-semibold">{getDisplayName(product)}</span>
                    </div>
                  </td>
                  <td className="py-4 px-6">{product.category}</td>
                  <td className="py-4 px-6 font-semibold">{formatCurrency(product.price)}</td>
                  <td className="py-4 px-6">
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-semibold ${
                        product.stock >= 10
                          ? "bg-green-100 text-green-800"
                          : product.stock >= 5
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-600 border border-red-200"
                      }`}
                    >
                      {product.stock} units
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleEdit(product.id)} className="gap-2">
                        <Edit2 className="w-4 h-4" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(product.id)}
                        className="gap-2 text-red-600 hover:text-red-700 bg-transparent"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => (product as any).barcode && setPrintingProducts([{ id: product.id, name: getDisplayName(product), barcode: (product as any).barcode, price: product.price }])}
                        disabled={!(product as any).barcode}
                        className="gap-2"
                        title={(product as any).barcode ? "Print Barcode Label" : "No barcode generated"}
                      >
                        <Tag className="w-4 h-4" />
                        Label
                      </Button>
                    </div>
                  </td>
                </motion.tr>
              ))}
                </tbody>
              </table>
            </div>
          )}
      </motion.div>

      {/* Product Modal */}
      <ProductModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        editingProductId={editingProduct}
        onProductSaved={handleProductSaved}
      />

      {/* Barcode Print Modal */}
      <BarcodeLabelModal
        isOpen={!!printingProducts}
        onClose={() => setPrintingProducts(null)}
        products={printingProducts}
      />
      </div>
    </AdminLayout>
  )
}
