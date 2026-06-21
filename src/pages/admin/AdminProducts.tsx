"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Plus, Edit2, Trash2, Search, Tag, PackagePlus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { productsService } from "@/lib/supabase/services/products"
import { notifyUpdate } from "@/hooks/use-realtime-updates"
import ProductModal from "@/components/admin/product-modal"
import AdminLayout from "@/components/admin-layout"
import { formatCurrency } from "@/lib/utils/currency"
import type { Database } from "@/lib/supabase/types"
import BarcodeLabelModal from "@/components/admin/barcode-label-modal"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"

type Product = Database['public']['Tables']['products']['Row']

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<string | null>(null)
  const [printingProducts, setPrintingProducts] = useState<any[] | null>(null)
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>("All")
  const [stockFilter, setStockFilter] = useState<'all' | 'very_low' | 'low'>('all')

  const [restockProduct, setRestockProduct] = useState<any>(null)
  const [restockQtyMeegoda, setRestockQtyMeegoda] = useState("")
  const [restockQtyPadukka, setRestockQtyPadukka] = useState("")
  const [restockQtyPadukkaNew, setRestockQtyPadukkaNew] = useState("")
  const [restockCurrentStock, setRestockCurrentStock] = useState<any>(null)
  const [isRestocking, setIsRestocking] = useState(false)

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

  const categories = ["All", ...Array.from(new Set(products.map(p => p.category))).filter(Boolean).sort()]

  const filteredProducts = products.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.category.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = selectedCategory === "All" || p.category === selectedCategory;
    
    let matchesStock = true;
    if (stockFilter === 'very_low') {
      matchesStock = p.stock < 4;
    } else if (stockFilter === 'low') {
      matchesStock = p.stock >= 4 && p.stock <= 5;
    }

    return matchesSearch && matchesCategory && matchesStock;
  })

  const veryLowStockCount = products.filter(p => p.stock < 4).length;
  const lowStockCount = products.filter(p => p.stock >= 4 && p.stock <= 5).length;

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

  const handleOpenRestock = async (product: any) => {
    setRestockProduct(product)
    setRestockQtyMeegoda("")
    setRestockQtyPadukka("")
    setRestockQtyPadukkaNew("")
    setRestockCurrentStock(null)
    
    try {
      const supabase = createClient()
      const { data } = await supabase.from('inv_stock').select('*').eq('product_id', product.id).single()
      if (data) {
        setRestockCurrentStock(data)
      } else {
        setRestockCurrentStock({ qty_meegoda: 0, qty_padukka: 0, qty_padukka_new: 0, quantity: product.stock || 0 })
      }
    } catch (err) {
      console.error(err)
      setRestockCurrentStock({ qty_meegoda: 0, qty_padukka: 0, qty_padukka_new: 0, quantity: product.stock || 0 })
    }
  }

  const handleRestockSubmit = async () => {
    if (!restockProduct || !restockCurrentStock) return;
    setIsRestocking(true)
    
    const newMeegoda = (restockCurrentStock.qty_meegoda || 0) + (Number(restockQtyMeegoda) || 0);
    const newPadukka = (restockCurrentStock.qty_padukka || 0) + (Number(restockQtyPadukka) || 0);
    const newPadukkaNew = (restockCurrentStock.qty_padukka_new || 0) + (Number(restockQtyPadukkaNew) || 0);
    const newTotal = newMeegoda + newPadukka + newPadukkaNew;

    const totalAdded = (Number(restockQtyMeegoda) || 0) + (Number(restockQtyPadukka) || 0) + (Number(restockQtyPadukkaNew) || 0);

    try {
      const supabase = createClient()
      
      await supabase.from('inv_stock').upsert({
        product_id: restockProduct.id,
        qty_meegoda: newMeegoda,
        qty_padukka: newPadukka,
        qty_padukka_new: newPadukkaNew,
        quantity: newTotal,
        low_stock_threshold: 5,
      }, { onConflict: 'product_id' })

      await supabase.from('products').update({ stock: newTotal }).eq('id', restockProduct.id)

      if (totalAdded !== 0) {
         await supabase.from('inv_stock_movements').insert({
            product_id: restockProduct.id,
            type: 'adjustment',
            quantity: totalAdded,
            notes: `Restock: Meegoda(+${Number(restockQtyMeegoda)||0}), Padukka(+${Number(restockQtyPadukka)||0}), PadukkaNew(+${Number(restockQtyPadukkaNew)||0})`,
            created_by: 'admin'
         })
      }

      toast.success('Stock updated successfully')
      setRestockProduct(null)
      fetchProducts(true)
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Failed to restock')
    } finally {
      setIsRestocking(false)
    }
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

      {/* Category Tabs & Filters */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="flex flex-col gap-4 mb-6">
        {/* Category Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
           {categories.map(cat => (
             <Button 
               key={cat} 
               variant={selectedCategory === cat ? "default" : "outline"}
               onClick={() => setSelectedCategory(cat)}
               className="whitespace-nowrap rounded-full px-4"
               size="sm"
             >
               {cat}
             </Button>
           ))}
        </div>

        {/* Action / Filter Row */}
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card border border-border p-4 rounded-xl shadow-sm">
           <div className="relative flex-1 w-full max-w-md">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
             <Input
               type="text"
               placeholder="Search products..."
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               className="pl-10 h-10"
             />
           </div>
           
           <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
             <Button
               variant={stockFilter === 'very_low' ? "default" : "outline"}
               onClick={() => setStockFilter(stockFilter === 'very_low' ? 'all' : 'very_low')}
               className={`w-full sm:w-auto gap-2 font-bold ${stockFilter === 'very_low' ? 'bg-red-600 hover:bg-red-700 text-white' : 'border-red-200 text-red-600 hover:bg-red-50'}`}
             >
               Very Low Stock ({veryLowStockCount})
             </Button>
             <Button
               variant={stockFilter === 'low' ? "default" : "outline"}
               onClick={() => setStockFilter(stockFilter === 'low' ? 'all' : 'low')}
               className={`w-full sm:w-auto gap-2 font-bold ${stockFilter === 'low' ? 'bg-orange-500 hover:bg-orange-600 text-white' : 'border-orange-200 text-orange-500 hover:bg-orange-50'}`}
             >
               Low Stock ({lowStockCount})
             </Button>
           </div>
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
                  <th className="py-4 px-4 w-12 text-center">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-border"
                      checked={selectedProductIds.length > 0 && selectedProductIds.length === filteredProducts.length}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="text-left py-4 px-4 font-semibold">Product Name</th>
                  <th className="text-left py-4 px-4 font-semibold">Category</th>
                  <th className="text-right py-4 px-2 font-semibold text-xs">Buy</th>
                  <th className="text-right py-4 px-2 font-semibold text-xs">Inventory</th>
                  <th className="text-right py-4 px-2 font-semibold text-xs">Website</th>
                  <th className="text-right py-4 px-2 font-semibold text-xs">Discount</th>
                  <th className="text-left py-4 px-4 font-semibold">Stock</th>
                  <th className="text-left py-4 px-4 font-semibold">Actions</th>
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
                  <td className="py-4 px-4 w-12 text-center">
                    <input 
                      type="checkbox"
                      className="w-4 h-4 rounded border-border"
                      checked={selectedProductIds.includes(product.id)}
                      onChange={() => toggleSelection(product.id)}
                    />
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={product.image || "/placeholder.svg"}
                        alt={product.name}
                        className="w-10 h-10 rounded object-cover border border-border"
                      />
                      <span className="font-semibold text-sm">{getDisplayName(product)}</span>
                    </div>
                  </td>
                  <td className="py-4 px-4 text-sm">{product.category}</td>
                  <td className="py-4 px-2 text-right text-xs text-muted-foreground">
                    {(product as any).cost_price ? formatCurrency((product as any).cost_price) : <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="py-4 px-2 text-right text-xs text-blue-400 font-medium">
                    {(product as any).buy_price ? formatCurrency((product as any).buy_price) : <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="py-4 px-2 text-right text-xs font-semibold">
                    {formatCurrency(product.price)}
                  </td>
                  <td className="py-4 px-2 text-right text-xs">
                    {(product as any).discount_price ? (
                      <span className="text-green-500 font-medium">{formatCurrency((product as any).discount_price)}</span>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="py-4 px-4">
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold whitespace-nowrap ${
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
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-2">
                      <Button 
                        size="icon" 
                        variant="outline" 
                        onClick={() => handleOpenRestock(product)} 
                        className="w-8 h-8 text-blue-600 hover:text-blue-700 bg-transparent border-border hover:bg-blue-50"
                        title="Restock in Inventory"
                      >
                        <PackagePlus className="w-4 h-4" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="outline" 
                        onClick={() => handleEdit(product.id)} 
                        className="w-8 h-8 text-foreground bg-transparent border-border hover:bg-muted"
                        title="Edit Product"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => (product as any).barcode && setPrintingProducts([{ id: product.id, name: getDisplayName(product), barcode: (product as any).barcode, price: product.price }])}
                        disabled={!(product as any).barcode}
                        className="w-8 h-8 text-foreground bg-transparent border-border hover:bg-muted"
                        title={(product as any).barcode ? "Print Barcode Label" : "No barcode generated"}
                      >
                        <Tag className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => handleDelete(product.id)}
                        className="w-8 h-8 text-red-600 hover:text-red-700 bg-transparent border-border hover:bg-red-50"
                        title="Delete Product"
                      >
                        <Trash2 className="w-4 h-4" />
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

      {/* Restock Modal */}
      <AnimatePresence>
        {restockProduct && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="bg-card border border-border p-6 rounded-2xl shadow-2xl w-full max-w-md"
            >
               <div className="flex items-center justify-between mb-6">
                 <h3 className="text-xl font-bold">Restock Product</h3>
                 <button onClick={() => setRestockProduct(null)} className="p-1 hover:bg-muted rounded-full">
                   <X className="w-5 h-5" />
                 </button>
               </div>

               <div className="mb-6 p-4 bg-muted/50 rounded-xl border border-border">
                 <p className="text-xs text-muted-foreground uppercase font-black mb-1">Product</p>
                 <p className="font-bold">{getDisplayName(restockProduct)}</p>
               </div>

               <div className="space-y-4">
                 <div className="grid grid-cols-3 gap-2 text-center text-xs font-bold text-muted-foreground uppercase mb-2">
                   <div>Shop</div>
                   <div>Current</div>
                   <div>New Qty</div>
                 </div>

                 {/* Meegoda */}
                 <div className="grid grid-cols-3 gap-2 items-center">
                   <div className="font-semibold text-sm">Meegoda</div>
                   <div className="text-center font-mono">{restockCurrentStock?.qty_meegoda || 0}</div>
                   <div>
                     <Input type="number" value={restockQtyMeegoda} onChange={e => setRestockQtyMeegoda(e.target.value)} placeholder="+0" className="h-9 text-center font-mono font-bold" />
                   </div>
                 </div>

                 {/* Padukka */}
                 <div className="grid grid-cols-3 gap-2 items-center">
                   <div className="font-semibold text-sm">Padukka</div>
                   <div className="text-center font-mono">{restockCurrentStock?.qty_padukka || 0}</div>
                   <div>
                     <Input type="number" value={restockQtyPadukka} onChange={e => setRestockQtyPadukka(e.target.value)} placeholder="+0" className="h-9 text-center font-mono font-bold" />
                   </div>
                 </div>

                 {/* Padukka New */}
                 <div className="grid grid-cols-3 gap-2 items-center">
                   <div className="font-semibold text-sm">Padukka New</div>
                   <div className="text-center font-mono">{restockCurrentStock?.qty_padukka_new || 0}</div>
                   <div>
                     <Input type="number" value={restockQtyPadukkaNew} onChange={e => setRestockQtyPadukkaNew(e.target.value)} placeholder="+0" className="h-9 text-center font-mono font-bold" />
                   </div>
                 </div>

                 <div className="pt-4 mt-4 border-t border-border grid grid-cols-3 gap-2 items-center">
                   <div className="font-black text-primary">TOTAL</div>
                   <div className="text-center font-black font-mono text-lg">{restockCurrentStock?.quantity || 0}</div>
                   <div className="text-center font-black font-mono text-lg text-green-600">
                     +{ (Number(restockQtyMeegoda) || 0) + (Number(restockQtyPadukka) || 0) + (Number(restockQtyPadukkaNew) || 0) }
                   </div>
                 </div>
                 
                 <div className="grid grid-cols-3 gap-2 items-center text-primary mt-2">
                   <div className="font-black">NEW TOTAL</div>
                   <div className="col-span-2 text-right font-black font-mono text-2xl">
                     { (restockCurrentStock?.quantity || 0) + (Number(restockQtyMeegoda) || 0) + (Number(restockQtyPadukka) || 0) + (Number(restockQtyPadukkaNew) || 0) }
                   </div>
                 </div>
               </div>

               <div className="mt-8 flex flex-col gap-2">
                 <Button className="h-12 font-bold w-full" onClick={handleRestockSubmit} disabled={isRestocking || !restockCurrentStock}>
                   {isRestocking ? "UPDATING..." : "CONFIRM RESTOCK"}
                 </Button>
                 <Button variant="ghost" className="w-full" onClick={() => setRestockProduct(null)} disabled={isRestocking}>CANCEL</Button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      </div>
    </AdminLayout>
  )
}
