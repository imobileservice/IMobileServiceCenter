"use client"

import React, { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Search, Package, AlertCircle } from "lucide-react"
import CashierLayout from "@/components/cashier-layout"
import { useCashierStore } from "@/lib/cashier-store"
import { formatCurrency } from "@/lib/utils/currency"
import { inventoryProductsService } from "@/lib/services/inventory.service"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

export default function CashierInventory() {
  const { cashier } = useCashierStore()
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")

  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async (search?: string) => {
    try {
      setLoading(true)
      const res = await inventoryProductsService.getAll({ search })
      setProducts(res.data || [])
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch inventory')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchProducts(searchTerm)
    }, 500)
    return () => clearTimeout(delayDebounceFn)
  }, [searchTerm])

  const getShopStock = (product: any) => {
    const shopName = cashier?.shop || 'Meegoda'
    if (shopName === 'Padukka') return product.qty_padukka || 0
    if (shopName === 'Padukka new') return product.qty_padukka_new || 0
    return product.qty_meegoda || 0
  }

  const getInventoryPrice = (product: any) => {
    const inventoryPrice = Number(product.inventory_price ?? product.buy_price ?? 0)
    return inventoryPrice > 0 ? inventoryPrice : Number(product.price || 0)
  }

  return (
    <CashierLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Inventory Lookup</h1>
            <p className="text-muted-foreground mt-1">Check stock availability for {cashier?.shop || 'Meegoda'}</p>
          </div>
          
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search products or barcode..."
              className="pl-9 bg-card border-border"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground uppercase font-semibold text-[10px] tracking-wider">
                <tr>
                  <th className="px-6 py-4">Product Name</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4">Barcode</th>
                  <th className="px-6 py-4 text-right">Price</th>
                  <th className="px-6 py-4 text-right">Shop Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {loading && products.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground animate-pulse">
                      Loading inventory data...
                    </td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-2 opacity-50">
                        <AlertCircle className="w-8 h-8" />
                        <p>No products found matching your search.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  products.map((product: any) => {
                    const shopStock = getShopStock(product)
                    const isOutOfStock = shopStock <= 0
                    
                    return (
                      <motion.tr 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        key={product.id} 
                        className="hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
                              {product.image ? (
                                <img src={product.image} alt="" className="w-full h-full object-cover rounded" />
                              ) : (
                                <Package className="w-4 h-4 text-muted-foreground" />
                              )}
                            </div>
                            <span className="font-bold">{product.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="secondary" className="text-[10px]">{product.category}</Badge>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs">{product.barcode || '-'}</td>
                        <td className="px-6 py-4 text-right font-black text-primary">
                          {formatCurrency(getInventoryPrice(product))}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Badge 
                            variant="outline" 
                            className={`font-bold px-3 py-1 text-[11px] ${
                              isOutOfStock 
                                ? 'bg-red-500/10 text-red-500 border-red-500/20' 
                                : 'bg-green-500/10 text-green-500 border-green-500/20'
                            }`}
                          >
                            {shopStock} in stock
                          </Badge>
                        </td>
                      </motion.tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </CashierLayout>
  )
}
