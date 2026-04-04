"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  Package, 
  Search, 
  AlertTriangle, 
  ArrowUpRight, 
  ArrowDownRight, 
  RefreshCcw,
  Plus,
  Minus,
  Edit3,
  History,
  FileText,
  Barcode
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import AdminLayout from "@/components/admin-layout"
import { formatCurrency } from "@/lib/utils/currency"
import { inventoryStockService, inventoryProductsService } from "@/lib/services/inventory.service"
import { toast } from "sonner"

export default function InventoryPage() {
  const [stockData, setStockData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [filter, setFilter] = useState<'all' | 'low'>('all')
  const [selectedItem, setSelectedItem] = useState<any>(null)
  const [isAdjusting, setIsAdjusting] = useState(false)
  const [adjustmentValue, setAdjustmentValue] = useState(0)
  const [adjustmentType, setAdjustmentType] = useState<'add' | 'subtract' | 'set'>('add')
  const [adjustmentNotes, setAdjustmentNotes] = useState("")

  const fetchStock = async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      const res = await inventoryStockService.getAll(filter === 'low')
      setStockData(res.data || [])
    } catch (err) {
      console.error('Failed to fetch stock:', err)
      toast.error("Failed to load inventory data")
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    fetchStock()

    // Listen for product updates to refresh inventory automatically
    const handleUpdate = () => {
      fetchStock(true) // silent background refresh
    }
    
    window.addEventListener('productUpdated', handleUpdate)
    window.addEventListener('inventoryUpdated', handleUpdate)
    
    return () => {
      window.removeEventListener('productUpdated', handleUpdate)
      window.removeEventListener('inventoryUpdated', handleUpdate)
    }
  }, [filter])

  const handleAdjust = async () => {
    if (!selectedItem) return
    try {
      await inventoryStockService.adjust(selectedItem.product_id, {
        quantity: adjustmentValue,
        adjustment_type: adjustmentType,
        notes: adjustmentNotes,
        created_by: 'admin'
      })
      toast.success("Stock adjusted successfully")
      setIsAdjusting(false)
      setAdjustmentValue(0)
      setAdjustmentNotes("")
      fetchStock(true)
    } catch (err: any) {
      toast.error(err.message || "Failed to adjust stock")
    }
  }

  const getDisplayName = (product: any) => {
    if (!product) return 'Unknown Product';
    const model = product.specs?.model;
    if (model && !(product.name || '').includes(model)) {
      return `${product.name} (${model})`;
    }
    return product.name || 'Unknown Product';
  }

  const filteredStock = stockData.filter(item => {
    const displayName = getDisplayName(item.products);
    return displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
           item.products?.barcode?.toLowerCase().includes(searchTerm.toLowerCase());
  })

  const lowStockCount = stockData.filter(item => item.is_low_stock).length

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Inventory Management</h1>
            <p className="text-muted-foreground mt-1">Monitor stock levels, set thresholds, and track movements.</p>
          </div>
          <div className="flex gap-2">
             <Button variant="outline" onClick={() => fetchStock()} className="gap-2">
               <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
             </Button>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border p-6 rounded-2xl shadow-sm bg-gradient-to-br from-card to-primary/5"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-xl">
                 <Package className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Total Items</p>
                <p className="text-3xl font-black">{stockData.reduce((acc, curr) => acc + (curr.quantity || 0), 0)}</p>
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className={`bg-card border p-6 rounded-2xl shadow-sm transition-colors ${lowStockCount > 0 ? 'border-red-200 bg-red-50/50' : 'border-border'}`}
          >
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${lowStockCount > 0 ? 'bg-red-100' : 'bg-green-100'}`}>
                 <AlertTriangle className={`w-6 h-6 ${lowStockCount > 0 ? 'text-red-600' : 'text-green-600'}`} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Low Stock Alerts</p>
                <p className={`text-3xl font-black ${lowStockCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {lowStockCount}
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-card border border-border p-6 rounded-2xl shadow-sm bg-gradient-to-br from-card to-blue-50/50"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 rounded-xl">
                 <Barcode className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Unique Categories</p>
                <p className="text-3xl font-black">{new Set(stockData.map(i => i.products?.category)).size}</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Filters and Search */}
        <div className="flex flex-col sm:flex-row gap-4 items-center bg-card border border-border p-4 rounded-xl shadow-sm">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search by name or barcode..." 
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex bg-muted p-1 rounded-lg w-full sm:w-auto">
            <button 
              onClick={() => setFilter('all')}
              className={`flex-1 px-4 py-2 rounded-md text-sm font-bold transition-all ${filter === 'all' ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              All Stock
            </button>
            <button 
              onClick={() => setFilter('low')}
              className={`flex-1 px-4 py-2 rounded-md text-sm font-bold transition-all ${filter === 'low' ? 'bg-card shadow-sm text-red-600' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Low Stock
            </button>
          </div>
        </div>

        {/* Stock Table */}
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="p-4 font-bold text-xs uppercase tracking-wider text-muted-foreground">Product</th>
                  <th className="p-4 font-bold text-xs uppercase tracking-wider text-muted-foreground">Info</th>
                  <th className="p-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-center">Current Stock</th>
                  <th className="p-4 font-bold text-xs uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="p-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                   [...Array(5)].map((_, i) => (
                    <tr key={i} className="animate-pulse border-b border-border">
                       <td className="p-4"><div className="h-12 w-12 bg-muted rounded-lg" /></td>
                       <td className="p-4"><div className="h-4 w-32 bg-muted rounded mb-2" /><div className="h-3 w-16 bg-muted rounded" /></td>
                       <td className="p-4"><div className="h-8 w-16 bg-muted rounded mx-auto" /></td>
                       <td className="p-4"><div className="h-6 w-20 bg-muted rounded-full" /></td>
                       <td className="p-4"><div className="h-8 w-24 bg-muted rounded flex-shrink-0 ml-auto" /></td>
                    </tr>
                   ))
                ) : filteredStock.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-muted-foreground italic">
                       No products found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredStock.map(item => (
                    <tr key={item.id} className="border-b border-border hover:bg-muted/30 transition-colors group">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                           <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden border border-border">
                             {item.products?.image ? (
                               <img src={item.products.image} alt="" className="w-full h-full object-cover" />
                             ) : <Package className="w-6 h-6 text-muted-foreground" />}
                           </div>
                           <div>
                              <h4 className="font-bold leading-tight line-clamp-1">{getDisplayName(item.products)}</h4>
                              <p className="text-[10px] text-muted-foreground font-mono">{item.products?.barcode || 'NO BARCODE'}</p>
                           </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline" className="w-fit text-[9px] uppercase font-black">{item.products?.category}</Badge>
                          <span className="text-xs font-bold text-primary">{formatCurrency(item.products?.price)}</span>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <span className="text-2xl font-black">{item.quantity}</span>
                        <p className="text-[10px] text-muted-foreground">Min. Threshold: {item.low_stock_threshold}</p>
                      </td>
                      <td className="p-4">
                         {item.is_low_stock ? (
                           <Badge className="bg-red-500 hover:bg-red-600 border-0 flex items-center gap-1 w-fit">
                             <AlertTriangle className="w-3 h-3" /> LOW STOCK
                           </Badge>
                         ) : (
                           <Badge className="bg-green-500 hover:bg-green-600 border-0 flex items-center gap-1 w-fit">
                             <CheckCircle2 className="w-3 h-3" /> IN STOCK
                           </Badge>
                         )}
                      </td>
                      <td className="p-4 text-right">
                         <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-8 gap-1 font-bold text-xs"
                              onClick={() => {
                                setSelectedItem(item)
                                setIsAdjusting(true)
                                setAdjustmentType('add')
                              }}
                            >
                               <RefreshCcw className="w-3 h-3" /> ADJUST
                            </Button>
                         </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Adjustment Modal */}
      <AnimatePresence>
        {isAdjusting && (
           <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
             <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               className="bg-card border border-border p-6 rounded-2xl shadow-2xl w-full max-w-md"
             >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold">Adjust Manual Stock</h3>
                  <button onClick={() => setIsAdjusting(false)} className="p-1 hover:bg-muted rounded-full">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="mb-6 p-4 bg-muted/50 rounded-xl border border-border">
                   <p className="text-xs text-muted-foreground uppercase font-black mb-1">Product</p>
                   <p className="font-bold">{getDisplayName(selectedItem?.products)}</p>
                   <p className="text-sm font-medium mt-2">Current quantity: <span className="text-xl font-black text-primary">{selectedItem?.quantity}</span></p>
                </div>

                <div className="space-y-4">
                   <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'add', label: 'ADD', icon: Plus },
                        { id: 'subtract', label: 'REMOVE', icon: Minus },
                        { id: 'set', label: 'SET TOTAL', icon: Edit3 },
                      ].map(type => (
                        <button
                          key={type.id}
                          onClick={() => setAdjustmentType(type.id as any)}
                          className={`p-3 rounded-lg border-2 text-[10px] font-black tracking-widest flex flex-col items-center gap-1 transition-all ${adjustmentType === type.id ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
                        >
                           <type.icon className="w-4 h-4" /> {type.label}
                        </button>
                      ))}
                   </div>

                   <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase text-muted-foreground">Adjustment Quantity</label>
                      <Input 
                        type="number" 
                        value={adjustmentValue} 
                        onChange={(e) => setAdjustmentValue(Number(e.target.value))}
                        className="text-2xl h-14 font-black text-center"
                      />
                   </div>

                   <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase text-muted-foreground">Notes / Reason</label>
                      <Input 
                        placeholder="e.g. Damaged, Manual re-count, Restock..." 
                        value={adjustmentNotes}
                        onChange={(e) => setAdjustmentNotes(e.target.value)}
                      />
                   </div>
                </div>

                <div className="mt-8 flex flex-col gap-2">
                   <Button className="h-12 font-bold w-full" onClick={handleAdjust}>UPDATE STOCK LEVELS</Button>
                   <Button variant="ghost" className="w-full" onClick={() => setIsAdjusting(false)}>CANCEL</Button>
                </div>
             </motion.div>
           </div>
        )}
      </AnimatePresence>
    </AdminLayout>
  )
}

function CheckCircle2(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

function X(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}
