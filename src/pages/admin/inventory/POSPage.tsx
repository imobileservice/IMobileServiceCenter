"use client"

import React, { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  ShoppingCart, 
  User, 
  CreditCard, 
  Banknote, 
  Printer, 
  CheckCircle2, 
  AlertCircle,
  X,
  ScanBarcode,
  History
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import AdminLayout from "@/components/admin-layout"
import { formatCurrency } from "@/lib/utils/currency"
import { inventoryProductsService, inventorySalesService, inventoryCustomersService } from "@/lib/services/inventory.service"
import { toast } from "sonner"

interface CartItem {
  id: string
  name: string
  price: number
  quantity: number
  stock: number
  image?: string
}

export default function POSPage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'bank_transfer'>('cash')
  const [isProcessing, setIsProcessing] = useState(false)
  const [lastSale, setLastSale] = useState<any>(null)
  const [showReceipt, setShowReceipt] = useState(false)
  
  const searchInputRef = useRef<HTMLInputElement>(null)
  const barcodeBuffer = useRef("")
  const lastKeyTime = useRef(0)

  // Auto-focus search input for barcode scanning
  useEffect(() => {
    const focusTimer = setInterval(() => {
      if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        searchInputRef.current?.focus()
      }
    }, 1000)
    return () => clearInterval(focusTimer)
  }, [])

  // Handle barcode scanner input (most scanners act as rapid keyboard entry + Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const now = Date.now()
      
      // If keystrokes are very fast (e.g. < 50ms), it's likely a scanner
      if (now - lastKeyTime.current < 50) {
        if (e.key === 'Enter') {
          handleBarcodeScan(barcodeBuffer.current)
          barcodeBuffer.current = ""
        } else if (e.key.length === 1) {
          barcodeBuffer.current += e.key
        }
      } else {
        // Reset if too slow
        barcodeBuffer.current = e.key.length === 1 ? e.key : ""
      }
      lastKeyTime.current = now
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleBarcodeScan = async (barcode: string) => {
    if (!barcode) return
    try {
      const res = await inventoryProductsService.getByBarcode(barcode)
      if (res.data) {
        addToCart(res.data)
        toast.success(`Added ${res.data.name}`)
      }
    } catch (err) {
      console.error('Barcode lookup failed:', err)
    }
  }

  const searchProducts = async (term: string) => {
    if (!term || term.length < 2) {
      setSearchResults([])
      return
    }
    try {
      const res = await inventoryProductsService.getAll({ search: term })
      setSearchResults(res.data || [])
    } catch (err) {
      console.error('Product search failed:', err)
    }
  }

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      searchProducts(searchTerm)
    }, 300)
    return () => clearTimeout(delayDebounceFn)
  }, [searchTerm])

  const addToCart = (product: any) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id)
      if (existing) {
        if (existing.quantity >= product.stock_quantity) {
          toast.error("Not enough stock available")
          return prev
        }
        return prev.map(item => 
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        )
      }
      return [...prev, {
        id: product.id,
        name: product.name,
        price: product.price,
        quantity: 1,
        stock: product.stock_quantity,
        image: product.image
      }]
    })
    setSearchTerm("")
    setSearchResults([])
  }

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.max(1, item.quantity + delta)
        if (newQty > item.stock && delta > 0) {
          toast.error("Exceeds available stock")
          return item
        }
        return { ...item, quantity: newQty }
      }
      return item
    }))
  }

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id))
  }

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)
  const discount = 0 // Basic version
  const total = subtotal - discount

  const handleCheckout = async () => {
    if (cart.length === 0) return
    setIsProcessing(true)
    try {
      const saleData = {
        customer_id: selectedCustomer?.id,
        customer_name: selectedCustomer?.name || 'Walk-in Customer',
        payment_method: paymentMethod,
        source: 'pos' as const,
        items: cart.map(item => ({
          product_id: item.id,
          quantity: item.quantity,
          price: item.price
        }))
      }

      const res = await inventorySalesService.create(saleData)
      setLastSale(res.data)
      setShowReceipt(true)
      setCart([])
      setSelectedCustomer(null)
      toast.success("Transaction completed successfully!")
    } catch (err: any) {
      toast.error(err.message || "Failed to process sale")
    } finally {
      setIsProcessing(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const closeReceipt = () => {
    setShowReceipt(false)
    setLastSale(null)
    searchInputRef.current?.focus()
  }

  return (
    <AdminLayout>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-120px)]">
        
        {/* Left Column: Product Selection */}
        <div className="lg:col-span-8 flex flex-col gap-6 overflow-hidden">
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder="Scan barcode or type product name..."
                className="pl-12 h-12 text-lg rounded-lg border-primary/20 focus:border-primary shadow-inner"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded-full"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Quick Search Results */}
            <AnimatePresence>
              {searchResults.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute z-50 left-0 right-0 mt-2 bg-card border border-border rounded-xl shadow-2xl max-h-[400px] overflow-y-auto mx-4 lg:mx-0 p-2"
                >
                  {searchResults.map(product => (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className="w-full flex items-center gap-4 p-3 hover:bg-muted rounded-lg transition-colors text-left border-b border-border/50 last:border-0"
                    >
                      <div className="w-12 h-12 rounded bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                        {product.image ? (
                          <img src={product.image} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <ScanBarcode className="w-6 h-6 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-bold text-foreground">{product.name}</h4>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Badge variant="outline" className="text-[10px] uppercase">{product.category}</Badge>
                          <span>Stock: {product.stock_quantity}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-primary">{formatCurrency(product.price)}</p>
                        <p className="text-[10px] text-muted-foreground">{product.barcode || 'NO-BARCODE'}</p>
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="bg-card border border-border rounded-xl flex-1 flex flex-col overflow-hidden shadow-sm">
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-primary" />
                <h3 className="font-bold">Current Cart</h3>
                <Badge variant="secondary" className="ml-2">{cart.length} items</Badge>
              </div>
              {cart.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setCart([])} className="text-red-500 hover:text-red-600 hover:bg-red-50">
                  <Trash2 className="w-4 h-4 mr-1" /> Clear
                </Button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50 p-12 text-center">
                  <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center mb-4">
                    <ScanBarcode className="w-12 h-12" />
                  </div>
                  <p className="text-lg font-medium">Your cart is empty</p>
                  <p className="text-sm">Scan items or use search to begin</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {cart.map(item => (
                    <motion.div 
                      key={item.id}
                      layout
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-4 p-4 hover:bg-muted/50 rounded-lg group transition-all border border-transparent hover:border-border"
                    >
                      <div className="w-14 h-14 rounded bg-muted flex-shrink-0 flex items-center justify-center overflow-hidden">
                         {item.image ? (
                          <img src={item.image} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <ScanBarcode className="w-6 h-6 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-bold leading-tight line-clamp-1">{item.name}</h4>
                        <p className="text-sm text-primary font-semibold">{formatCurrency(item.price)}</p>
                      </div>
                      <div className="flex items-center gap-1 bg-background border border-border rounded-lg p-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 rounded-md"
                          onClick={() => updateQuantity(item.id, -1)}
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                        <span className="w-8 text-center font-bold text-lg">{item.quantity}</span>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 rounded-md"
                          onClick={() => updateQuantity(item.id, 1)}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="w-24 text-right">
                        <p className="font-bold text-lg">{formatCurrency(item.price * item.quantity)}</p>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => removeFromCart(item.id)}
                        className="text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Checkout Summary */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Customer Selection */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <h3 className="font-bold flex items-center gap-2 mb-4">
              <User className="w-4 h-4 text-primary" /> Customer
            </h3>
            <div className="space-y-3">
               <div className="flex items-center gap-2">
                 <div className="flex-1 bg-muted/50 p-3 rounded-lg border border-border flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-foreground">{selectedCustomer?.name || 'Walk-in Customer'}</p>
                      <p className="text-[10px] text-muted-foreground">{selectedCustomer?.phone || 'Guest Checkout'}</p>
                    </div>
                    {selectedCustomer && (
                       <button onClick={() => setSelectedCustomer(null)} className="text-red-500 p-1 hover:bg-red-50 rounded">
                        <X className="w-4 h-4" />
                       </button>
                    )}
                 </div>
                 <Button variant="outline" size="icon" className="h-full px-3">
                   <Plus className="w-4 h-4" />
                 </Button>
               </div>
            </div>
          </div>

          {/* Payment Method */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <h3 className="font-bold flex items-center gap-2 mb-4">
               <CreditCard className="w-4 h-4 text-primary" /> Payment Method
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'cash', icon: Banknote, label: 'Cash' },
                { id: 'card', icon: CreditCard, label: 'Card' },
                { id: 'bank_transfer', icon: History, label: 'Bank' },
              ].map(method => (
                <button
                  key={method.id}
                  onClick={() => setPaymentMethod(method.id as any)}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all gap-1 ${
                    paymentMethod === method.id 
                      ? "border-primary bg-primary/5 text-primary" 
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <method.icon className="w-6 h-6" />
                  <span className="text-[10px] font-bold uppercase">{method.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Order Summary & Actions */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-lg flex-1 flex flex-col bg-gradient-to-br from-card to-muted/20">
            <h3 className="font-bold mb-6 text-lg">Order Summary</h3>
            
            <div className="space-y-4 mb-8">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="font-semibold">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Discount</span>
                <span className="font-semibold text-green-600">-{formatCurrency(discount)}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Tax (0%)</span>
                <span className="font-semibold">{formatCurrency(0)}</span>
              </div>
              <div className="pt-4 border-t border-border flex items-center justify-between">
                <span className="text-xl font-bold">Total</span>
                <span className="text-3xl font-black text-primary">{formatCurrency(total)}</span>
              </div>
            </div>

            <div className="mt-auto grid grid-cols-1 gap-3">
               <Button 
                className="w-full h-16 text-xl font-bold shadow-xl shadow-primary/20" 
                size="lg"
                disabled={cart.length === 0 || isProcessing}
                onClick={handleCheckout}
               >
                 {isProcessing ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Processing...
                    </div>
                 ) : (
                   <span className="flex items-center gap-2">COMPLETE PAYMENT <CheckCircle2 className="w-6 h-6" /></span>
                 )}
               </Button>
               <Button variant="outline" size="lg" className="h-14 font-bold" onClick={() => setCart([])}>
                 CANCEL ORDER
               </Button>
            </div>
          </div>
        </div>
      </div>

      {/* POS Receipt Modal (Hidden by default, shown after checkout) */}
      <AnimatePresence>
        {showReceipt && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm print:bg-white print:p-0">
             <motion.div 
               initial={{ scale: 0.9, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               className="bg-background border border-border rounded-2xl shadow-2xl overflow-hidden w-full max-w-[400px] flex flex-col group print:border-0 print:shadow-none print:w-full"
             >
                <div className="p-6 overflow-y-auto max-h-[80vh] print:max-h-none print:p-0">
                  {/* Actual Printable Area */}
                  <div id="pos-receipt" className="bg-white text-black p-4 font-mono text-[12px] leading-relaxed">
                    <div className="text-center mb-4 pb-4 border-b border-dashed border-gray-300">
                      <h2 className="text-lg font-black tracking-tighter uppercase">I Mobile Service</h2>
                      <p className="text-[10px]">Colombo Road, Negombo</p>
                      <p className="text-[10px]">Tel: 077 123 4567</p>
                    </div>

                    <div className="flex justify-between mb-1">
                      <span>Invoice:</span>
                      <span className="font-bold">{lastSale?.invoice_number}</span>
                    </div>
                    <div className="flex justify-between mb-4">
                      <span>Date:</span>
                      <span>{new Date().toLocaleString()}</span>
                    </div>

                    <div className="border-b border-dashed border-gray-300 mb-4 text-[10px] uppercase font-bold grid grid-cols-12 gap-1 pb-1">
                      <div className="col-span-1">#</div>
                      <div className="col-span-6">Item</div>
                      <div className="col-span-2 text-center">Qty</div>
                      <div className="col-span-3 text-right">Price</div>
                    </div>

                    <div className="space-y-2 mb-4 border-b border-dashed border-gray-300 pb-4">
                       {lastSale?.items?.map((item: any, idx: number) => (
                          <div key={idx} className="grid grid-cols-12 gap-1">
                             <div className="col-span-1">{idx+1}</div>
                             <div className="col-span-6 line-clamp-2">{item.product_name || 'Product'}</div>
                             <div className="col-span-2 text-center">x{item.quantity}</div>
                             <div className="col-span-3 text-right">{formatCurrency(item.total_price || item.price * item.quantity)}</div>
                          </div>
                       ))}
                    </div>

                    <div className="space-y-1 mb-4 border-b border-dashed border-gray-300 pb-4 text-right uppercase">
                      <div className="flex justify-between">
                        <span>Total Items:</span>
                        <span>{lastSale?.items_count}</span>
                      </div>
                      <div className="flex justify-between text-sm font-black">
                        <span>NET TOTAL:</span>
                        <span>{formatCurrency(lastSale?.net_amount || lastSale?.total_amount)}</span>
                      </div>
                    </div>

                    <div className="text-center pt-2">
                       <p className="text-[10px]">Payment Method: {paymentMethod.toUpperCase()}</p>
                       <p className="mt-2 font-bold uppercase">Thank you for your business!</p>
                       <p className="text-[9px]">Goods once sold cannot be returned.</p>
                       <div className="mt-4 flex justify-center opacity-70">
                          {/* Placeholder for order ID barcode */}
                          <div className="h-8 w-full bg-gray-200 flex items-center justify-center text-[8px]">
                             |||| || ||||| || ||| |||| ||
                          </div>
                       </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-muted border-t border-border grid grid-cols-2 gap-4 print:hidden">
                  <Button onClick={handlePrint} className="gap-2 h-12">
                    <Printer className="w-4 h-4" /> PRINT RECEIPT
                  </Button>
                  <Button variant="outline" onClick={closeReceipt} className="h-12">
                    DONE
                  </Button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </AdminLayout>
  )
}
