"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Plus, Edit2, Trash2, Search, Tag, PackagePlus, X, Check, Loader2, FileSpreadsheet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { productsService } from "@/lib/supabase/services/products"
import { notifyUpdate } from "@/hooks/use-realtime-updates"
import ProductModal from "@/components/admin/product-modal"
import AdminLayout from "@/components/admin-layout"
import { formatCurrency } from "@/lib/utils/currency"
import type { Database } from "@/lib/supabase/types"
import BarcodeLabelModal from "@/components/admin/barcode-label-modal"
import CompatibilityImportModal from "@/components/admin/compatibility-import-modal"
import { printLabelCopies } from "@/lib/labels/print-labels"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { inventoryStockService } from "@/lib/services/inventory.service"

type Branch = 'all' | 'meegoda' | 'padukka' | 'padukka_new'
type BranchStock = {
  product_id: string
  qty_meegoda?: number | null
  qty_padukka?: number | null
  qty_padukka_new?: number | null
}
const branches: { id: Branch; label: string }[] = [
  { id: 'all', label: 'All branches' },
  { id: 'meegoda', label: 'Meegoda' },
  { id: 'padukka', label: 'Padukka' },
  { id: 'padukka_new', label: 'Padukka New' },
]

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
  const [selectedBranch, setSelectedBranch] = useState<Branch>('all')
  const [branchStocks, setBranchStocks] = useState<Record<string, BranchStock> | null>(null)
  const [branchStockLoading, setBranchStockLoading] = useState(true)
  const [branchStockError, setBranchStockError] = useState(false)
  const fetchSequence = useRef(0)
  const [stockFilter, setStockFilter] = useState<'all' | 'very_low' | 'low'>('all')
  const [showCompatibilityImport, setShowCompatibilityImport] = useState(false)

  const [restockProduct, setRestockProduct] = useState<any>(null)
  const [restockQtyMeegoda, setRestockQtyMeegoda] = useState("")
  const [restockQtyPadukka, setRestockQtyPadukka] = useState("")
  const [restockQtyPadukkaNew, setRestockQtyPadukkaNew] = useState("")
  const [restockCurrentStock, setRestockCurrentStock] = useState<any>(null)
  const [isRestocking, setIsRestocking] = useState(false)

  // Inline "Qty Label" editing
  const [editingQtyLabelId, setEditingQtyLabelId] = useState<string | null>(null)
  const [qtyLabelDraft, setQtyLabelDraft] = useState("")
  const [savingQtyLabel, setSavingQtyLabel] = useState(false)

  const fetchProducts = async (silent = false) => {
    const sequence = ++fetchSequence.current
    if (!silent) setLoading(true)
    setBranchStockLoading(true)
    // Branch stock is read separately so its lookup never delays the existing
    // product table, and never exposes inventory quantities on the storefront.
    const stockRequest = inventoryStockService.getAll().then((result) => {
      if (sequence !== fetchSequence.current) return
      if (!Array.isArray(result.data)) throw new Error('Invalid stock response')
      setBranchStocks(Object.fromEntries(result.data.map((stock: BranchStock) => [stock.product_id, stock])))
      setBranchStockError(false)
    }).catch((error) => {
      if (sequence !== fetchSequence.current) return
      console.error('Failed to fetch branch stock:', error)
      setBranchStocks(null)
      setBranchStockError(true)
    }).finally(() => {
      if (sequence === fetchSequence.current) setBranchStockLoading(false)
    })
    try {
      const data = await productsService.getAll()
      if (sequence === fetchSequence.current) setProducts(data)
    } catch (error) {
      console.error('Failed to fetch products:', error)
    } finally {
      if (sequence === fetchSequence.current) setLoading(false)
    }
    await stockRequest
  }

  useEffect(() => {
    fetchProducts()
    
    // Listen for product updates
    const handleProductUpdate = () => {
      fetchProducts(true)
    }
    window.addEventListener('productUpdated', handleProductUpdate)
    window.addEventListener('inventoryUpdated', handleProductUpdate)
    
    return () => {
      ++fetchSequence.current
      window.removeEventListener('productUpdated', handleProductUpdate)
      window.removeEventListener('inventoryUpdated', handleProductUpdate)
    }
  }, [])

  const categories = ["All", ...Array.from(new Set(products.map(p => p.category))).filter(Boolean).sort()]

  const branchLabel = branches.find(branch => branch.id === selectedBranch)!.label
  const getStock = (product: Product): number | null => {
    if (selectedBranch !== 'all' && !branchStocks) return null
    const value = selectedBranch === 'all'
      ? product.stock
      : branchStocks?.[product.id]?.[`qty_${selectedBranch}`] ?? 0
    const quantity = Number(value)
    return Number.isFinite(quantity) ? Math.max(0, quantity) : 0
  }
  const matchingProducts = products.filter((product) => {
    const query = searchTerm.toLowerCase()
    const matchesSearch = String(product.name || '').toLowerCase().includes(query) ||
      String(product.category || '').toLowerCase().includes(query)
    return matchesSearch && (selectedCategory === 'All' || product.category === selectedCategory)
  })
  const filteredProducts = matchingProducts.filter((product) => {
    const stock = getStock(product)
    if (stockFilter === 'all') return true
    if (stock === null) return false
    return stockFilter === 'very_low' ? stock < 4 : stock >= 4 && stock <= 5
  })
  const veryLowStockCount = matchingProducts.filter(product => {
    const stock = getStock(product)
    return stock !== null && stock < 4
  }).length
  const lowStockCount = matchingProducts.filter(product => {
    const stock = getStock(product)
    return stock !== null && stock >= 4 && stock <= 5
  }).length
  const allVisibleSelected = filteredProducts.length > 0 && filteredProducts.every(product => selectedProductIds.includes(product.id))
  const stockViews = [
    { id: 'all' as const, label: 'All Products', count: matchingProducts.length },
    { id: 'very_low' as const, label: 'Very Low Stock', count: veryLowStockCount },
    { id: 'low' as const, label: 'Low Stock', count: lowStockCount },
  ]

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

  /** One sticker straight to the printer - no modal in between. */
  const handleQuickPrint = (product: { id?: string; name: string; barcode: string; price?: number }) => {
    if (!product.barcode) return
    const sent = printLabelCopies({
      id: product.id || product.barcode,
      name: product.name,
      barcode: product.barcode,
      price: product.price,
    }, 1)
    if (sent) toast.success(`Printing label · ${product.barcode}`)
    else toast.error('Could not open the printer')
  }

  const handleProductSaved = (product: {
    id?: string
    name: string
    barcode: string
    price: number
    brand?: string
    model?: string
  }) => {
    // Auto-open barcode print modal for newly created products. The id is what
    // lets that modal offer one sticker per compatible phone model.
    setPrintingProducts([{
      id: product.id,
      name: product.name,
      barcode: product.barcode,
      price: product.price,
      brand: product.brand,
      model: product.model,
    }])
    // Refresh product list
    fetchProducts(true)
  }

  const toggleSelection = (id: string) => {
    setSelectedProductIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const toggleAll = () => {
    const visibleIds = new Set(filteredProducts.map(product => product.id))
    setSelectedProductIds(previous => allVisibleSelected
      ? previous.filter(id => !visibleIds.has(id))
      : Array.from(new Set([...previous, ...visibleIds])))
  }

  const handleBulkPrint = () => {
    const selected = products.filter(p => selectedProductIds.includes(p.id));
    setPrintingProducts(selected.map(p => ({
      id: p.id,
      name: getDisplayName(p),
      barcode: (p as any).barcode,
      price: p.price,
      brand: (p as any).brand || undefined,
      model: (p as any).specs?.model || undefined,
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

  const startEditQtyLabel = (product: any) => {
    setEditingQtyLabelId(product.id)
    setQtyLabelDraft(product.qty_label || "")
  }

  const cancelEditQtyLabel = () => {
    setEditingQtyLabelId(null)
    setQtyLabelDraft("")
  }

  const handleSaveQtyLabel = async (productId: string) => {
    if (savingQtyLabel) return
    const value = qtyLabelDraft.trim()
    setSavingQtyLabel(true)
    try {
      await productsService.update(productId, { qty_label: value || null })
      setProducts(prev => prev.map(p => (p.id === productId ? { ...p, qty_label: value || null } : p)))
      toast.success(value ? 'Qty label updated' : 'Qty label removed')
      cancelEditQtyLabel()
      setTimeout(() => notifyUpdate('product'), 300)
    } catch (error: any) {
      console.error('Failed to update qty label:', error)
      toast.error(error?.message || 'Failed to update qty label')
    } finally {
      setSavingQtyLabel(false)
    }
  }

  const getDisplayName = (product: any) => {
    const model = product.specs?.model;
    if (model && !product.name.includes(model)) {
      return `${product.name} (${model})`;
    }
    return product.name;
  }

  const renderProductActions = (product: Product) => (
    <div className="flex items-center gap-1.5">
      <Button
        size="icon"
        variant="outline"
        onClick={() => handleOpenRestock(product)}
        className="w-8 h-8 shrink-0 text-blue-600 hover:text-blue-700 bg-transparent border-border hover:bg-blue-50"
        title="Restock in Inventory"
      >
        <PackagePlus className="w-4 h-4" />
      </Button>
      <Button
        size="icon"
        variant="outline"
        onClick={() => handleEdit(product.id)}
        className="w-8 h-8 shrink-0 text-foreground bg-transparent border-border hover:bg-muted"
        title="Edit Product"
      >
        <Edit2 className="w-4 h-4" />
      </Button>
      <Button
        size="icon"
        variant="outline"
        onClick={(e) => {
          const barcode = (product as any).barcode
          if (!barcode) return
          // brand + model let the label modal swap in another
          // compatible phone's name without changing the barcode
          const item = {
            id: product.id,
            name: getDisplayName(product),
            barcode,
            price: product.price,
            brand: (product as any).brand || undefined,
            model: (product as any).specs?.model || undefined,
          }
          // Shift/Ctrl-click skips the modal and sends one sticker straight out.
          if (e.shiftKey || e.ctrlKey || e.metaKey) handleQuickPrint(item)
          else setPrintingProducts([item])
        }}
        disabled={!(product as any).barcode}
        className="w-8 h-8 shrink-0 text-foreground bg-transparent border-border hover:bg-muted"
        title={(product as any).barcode ? "Print Barcode Label (Shift+Click prints 1 immediately)" : "No barcode generated"}
      >
        <Tag className="w-4 h-4" />
      </Button>
      <Button
        size="icon"
        variant="outline"
        onClick={() => handleDelete(product.id)}
        className="w-8 h-8 shrink-0 text-red-600 hover:text-red-700 bg-transparent border-border hover:bg-red-50"
        title="Delete Product"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  )

  const renderQtyLabel = (product: Product) => (
    editingQtyLabelId === product.id ? (
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          type="text"
          value={qtyLabelDraft}
          onChange={(e) => setQtyLabelDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleSaveQtyLabel(product.id)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              cancelEditQtyLabel()
            }
          }}
          placeholder="e.g. Box of 25"
          maxLength={40}
          disabled={savingQtyLabel}
          className="h-8 w-32 min-w-0 flex-1 text-xs"
        />
        <Button
          size="icon"
          variant="outline"
          onClick={() => handleSaveQtyLabel(product.id)}
          disabled={savingQtyLabel}
          className="w-8 h-8 shrink-0 text-green-600 hover:text-green-700 bg-transparent border-border hover:bg-green-50"
          title="Save qty label (Enter)"
        >
          {savingQtyLabel ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        </Button>
        <Button
          size="icon"
          variant="outline"
          onClick={cancelEditQtyLabel}
          disabled={savingQtyLabel}
          className="w-8 h-8 shrink-0 text-muted-foreground bg-transparent border-border hover:bg-muted"
          title="Cancel (Esc)"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    ) : (
      <button
        type="button"
        onClick={() => startEditQtyLabel(product)}
        className="max-w-full text-left"
        title="Click to edit qty label"
      >
        {(product as any).qty_label ? (
          <span className="inline-block max-w-full truncate align-middle px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors" title={product.qty_label || undefined}>
            {(product as any).qty_label}
          </span>
        ) : (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap border border-dashed border-border text-muted-foreground/60 hover:text-foreground hover:border-foreground/40 transition-colors">
            + Add label
          </span>
        )}
      </button>
    )
  )

  const renderStockBadge = (product: Product) => {
    const stock = getStock(product)
    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
        stock === null ? 'bg-muted text-muted-foreground' : stock >= 10
          ? 'bg-green-100 text-green-800' : stock >= 4
            ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-600 border border-red-200'
      }`}>
        {stock === null ? 'Unavailable' : `${stock} ${stock === 1 ? 'unit' : 'units'}`}
      </span>
    )
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
        <div className="flex flex-wrap gap-2" role="group" aria-label="Stock branch">
          {branches.map(branch => (
            <Button
              key={branch.id}
              variant={selectedBranch === branch.id ? 'default' : 'outline'}
              aria-pressed={selectedBranch === branch.id}
              disabled={branch.id !== 'all' && !branchStocks}
              onClick={() => { setSelectedBranch(branch.id); cancelEditQtyLabel() }}
              className="rounded-full px-4"
              size="sm"
            >
              {branch.label}
            </Button>
          ))}
          {branchStockLoading && <span className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading branch stock...</span>}
        </div>
        {branchStockError && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            Branch stock is unavailable. Please retry to view accurate branch quantities.
            <Button variant="outline" size="sm" disabled={branchStockLoading} onClick={() => fetchProducts(true)}>Retry stock</Button>
          </div>
        )}

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
               variant="outline"
               onClick={() => setShowCompatibilityImport(true)}
               className="w-full sm:w-auto gap-2 font-bold"
             >
               <FileSpreadsheet className="w-4 h-4" />
               Compatible Models
             </Button>

           </div>
        </div>
      </motion.div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Product stock view">
        {stockViews.map(view => (
          <Button
            key={view.id}
            variant={stockFilter === view.id ? 'default' : 'outline'}
            aria-pressed={stockFilter === view.id}
            onClick={() => { setStockFilter(view.id); cancelEditQtyLabel() }}
            className={`rounded-full gap-2 ${view.id === 'very_low'
              ? stockFilter === view.id ? 'bg-red-600 text-white hover:bg-red-700' : 'text-red-500 hover:text-red-400'
              : view.id === 'low'
                ? stockFilter === view.id ? 'bg-orange-500 text-white hover:bg-orange-600' : 'text-orange-500 hover:text-orange-400'
                : ''}`}
          >
            {view.label}<span className="text-xs opacity-75 tabular-nums">({view.id === 'all' || selectedBranch === 'all' || branchStocks ? view.count : '—'})</span>
          </Button>
        ))}
      </div>

      {/* Products Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className={stockFilter === 'all' ? 'bg-card border border-border rounded-lg overflow-hidden' : 'space-y-4'}
        aria-label={`${branchLabel} ${stockFilter === 'all' ? 'products' : stockFilter === 'very_low' ? 'very low stock' : 'low stock'}`}
      >
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading products...</div>
        ) : selectedBranch !== 'all' && !branchStocks ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">Branch stock is unavailable. Retry the stock lookup above.</div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No products found</div>
        ) : stockFilter !== 'all' ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <p>{branchLabel} · {stockFilter === 'very_low' ? 'Fewer than 4 units' : '4–5 units'} · {filteredProducts.length} products</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="h-4 w-4 rounded border-border" checked={allVisibleSelected} onChange={toggleAll} />
                Select all
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4" data-testid="stock-card-grid">
              {filteredProducts.map(product => (
                <article key={product.id} className="flex flex-col rounded-xl border border-border bg-card overflow-hidden" data-testid="stock-card">
                  <div className="flex items-start gap-3 p-4">
                    <img src={product.image || '/placeholder.svg'} alt={product.name} className="h-16 w-16 shrink-0 rounded-lg border border-border bg-muted/30 object-contain" />
                    <div className="min-w-0 flex-1">
                      <h2 className="text-sm font-semibold leading-snug line-clamp-2" title={getDisplayName(product)}>{getDisplayName(product)}</h2>
                      <p className="mt-1 text-xs text-muted-foreground break-words">{product.category}</p>
                    </div>
                    <input type="checkbox" aria-label={`Select ${getDisplayName(product)}`} className="h-4 w-4 mt-0.5 shrink-0 rounded border-border" checked={selectedProductIds.includes(product.id)} onChange={() => toggleSelection(product.id)} />
                  </div>
                  <div className="px-4 pb-4 space-y-4 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{selectedBranch === 'all' ? 'Total stock' : `${branchLabel} stock`}</span>
                      {renderStockBadge(product)}
                    </div>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-lg bg-muted/30 p-3 text-xs">
                      <div><dt className="text-muted-foreground mb-1">Buy</dt><dd className="font-medium text-muted-foreground">{product.cost_price ? formatCurrency(product.cost_price) : '—'}</dd></div>
                      <div><dt className="text-muted-foreground mb-1">Inventory</dt><dd className="font-medium text-blue-400">{product.buy_price ? formatCurrency(product.buy_price) : '—'}</dd></div>
                      <div><dt className="text-muted-foreground mb-1">Website</dt><dd className="font-semibold">{formatCurrency(product.price)}</dd></div>
                      <div><dt className="text-muted-foreground mb-1">Discount</dt><dd className="font-medium text-green-500">{product.discount_price ? formatCurrency(product.discount_price) : '—'}</dd></div>
                    </dl>
                    <div>{renderQtyLabel(product)}</div>
                  </div>
                  <div className="border-t border-border px-4 py-3">{renderProductActions(product)}</div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="py-4 px-4 w-12 text-center">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-border"
                      checked={allVisibleSelected}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="text-left py-4 px-3 font-semibold">Product Name</th>
                  <th className="text-left py-4 px-3 font-semibold">Category</th>
                  <th className="text-right py-4 px-2 font-semibold text-xs">Buy</th>
                  <th className="text-right py-4 px-2 font-semibold text-xs">Inventory</th>
                  <th className="text-right py-4 px-2 font-semibold text-xs">Website</th>
                  <th className="text-right py-4 px-2 font-semibold text-xs">Discount</th>
                  <th className="text-left py-4 px-3 font-semibold whitespace-nowrap">{selectedBranch === 'all' ? 'Stock' : `${branchLabel} Stock`}</th>
                  <th className="text-left py-4 px-3 font-semibold whitespace-nowrap">Qty Label</th>
                  <th className="text-left py-4 px-3 font-semibold">Actions</th>
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
                  <td className="py-4 px-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={product.image || "/placeholder.svg"}
                        alt={product.name}
                        className="w-10 h-10 rounded object-cover border border-border shrink-0"
                      />
                      <span className="font-semibold text-sm">{getDisplayName(product)}</span>
                    </div>
                  </td>
                  <td className="py-4 px-3 text-sm">{product.category}</td>
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
                  <td className="py-4 px-3">
                    {renderStockBadge(product)}
                  </td>
                  <td className="py-4 px-3">
                    {renderQtyLabel(product)}
                  </td>
                  <td className="py-4 px-3">
                    {renderProductActions(product)}
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

      {/* Compatible models: tick a table, or paste SKU | Product | Models */}
      <CompatibilityImportModal
        isOpen={showCompatibilityImport}
        onClose={() => setShowCompatibilityImport(false)}
        onImported={() => fetchProducts(true)}
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          brand: p.brand,
          sku: (p as any).sku ?? null,
        }))}
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
