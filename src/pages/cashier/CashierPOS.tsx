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
import CashierLayout from "@/components/cashier-layout"
import { useCashierStore } from "@/lib/cashier-store"
import { formatCurrency } from "@/lib/utils/currency"
import { inventoryProductsService, inventorySalesService, inventoryCustomersService } from "@/lib/services/inventory.service"
import { toast } from "sonner"
import Barcode from "react-barcode"

interface CartItem {
  id: string
  name: string
  price: number
  quantity: number
  stock: number
  image?: string
}

export default function CashierPOS() {
  const { cashier } = useCashierStore()
  const [searchTerm, setSearchTerm] = useState("")
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [cart, setCart] = useState<CartItem[]>([])

  const getDisplayName = (product: any) => {
    const model = product.specs?.model;
    if (model && !product.name.includes(model)) {
      return `${product.name} (${model})`;
    }
    return product.name;
  }
  const [customers, setCustomers] = useState<any[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'bank_transfer'>('cash')
  const [isProcessing, setIsProcessing] = useState(false)
  const [lastSale, setLastSale] = useState<any>(null)
  const [showReceipt, setShowReceipt] = useState(false)
  const [scannedSale, setScannedSale] = useState<any>(null)
  
  const searchInputRef = useRef<HTMLInputElement>(null)
  const barcodeBuffer = useRef("")
  const lastKeyTime = useRef(0)
  const [scanFlash, setScanFlash] = useState<'success' | 'error' | null>(null)

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
    if (!barcode || barcode.length < 3) return

    // 1) If it's an invoice barcode, fetch the sale for Returns/History
    if (barcode.toUpperCase().startsWith('INV-')) {
      try {
        const res = await inventorySalesService.getByInvoiceNumber(barcode.toUpperCase())
        if (res.data) {
          setScannedSale(res.data)
        } else {
          toast.error(`Invoice not found: ${barcode}`)
          setScanFlash('error')
          setTimeout(() => setScanFlash(null), 700)
        }
      } catch (err) {
        console.error('Invoice lookup failed:', err)
        toast.error(`Invoice not found: ${barcode}`)
        setScanFlash('error')
        setTimeout(() => setScanFlash(null), 700)
      }
      return
    }

    // 2) Otherwise it's a regular product barcode
    try {
      const res = await inventoryProductsService.getByBarcode(barcode)
      if (res.data) {
        addToCart(res.data)
        toast.success(`✅ Added: ${res.data.name} — ${formatCurrency(res.data.price)}`, { duration: 2000 })
        setScanFlash('success')
        setTimeout(() => setScanFlash(null), 700)
      } else {
        toast.error(`Barcode not found: ${barcode}`)
        setScanFlash('error')
        setTimeout(() => setScanFlash(null), 700)
      }
    } catch (err) {
      console.error('Barcode lookup failed:', err)
      toast.error(`Product not found for barcode: ${barcode}`)
      setScanFlash('error')
      setTimeout(() => setScanFlash(null), 700)
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
        name: getDisplayName(product),
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
        created_by: cashier?.email || 'cashier',
        items: cart.map(item => ({
          product_id: item.id,
          quantity: item.quantity,
          price: item.price
        }))
      }

      const res = await inventorySalesService.create(saleData)
      
      // The receipt rendering layout expects the sale structure with items
      setLastSale({
        ...res.data,
        items: cart.map(item => ({
          product_name: item.name,
          price: item.price,
          quantity: item.quantity,
          total_price: item.price * item.quantity
        }))
      })

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

  useEffect(() => {
    if (showReceipt) {
      setTimeout(() => handlePrint(), 500)
    }
  }, [showReceipt])

  return (
    <CashierLayout>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-120px)]">
        
        {/* Left Column: Product Selection */}
        <div className="lg:col-span-8 flex flex-col gap-6 overflow-hidden">
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm relative z-[100]">
            <div className={`relative transition-all duration-150 rounded-xl ${
                scanFlash === 'success' ? 'ring-4 ring-green-400 ring-opacity-80 shadow-[0_0_20px_rgba(74,222,128,0.5)]' :
                scanFlash === 'error'   ? 'ring-4 ring-red-400 ring-opacity-80 shadow-[0_0_20px_rgba(248,113,113,0.5)]' : ''
              }`}>
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder="Scan barcode or type product name..."
                className="pl-12 h-14 text-lg font-medium rounded-xl border-primary/20 focus:border-primary focus:ring-4 focus:ring-primary/10 shadow-inner"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  // If Enter is pressed in search box, try it as a barcode first
                  if (e.key === 'Enter' && searchTerm.trim()) {
                    e.preventDefault()
                    handleBarcodeScan(searchTerm.trim())
                    setSearchTerm("")
                    setSearchResults([])
                  }
                }}
              />
              {searchTerm && (
                <button 
                  onClick={() => {
                    setSearchTerm("")
                    setSearchResults([])
                  }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-2 hover:bg-muted rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              )}
            </div>

            {/* Quick Search Results Dropdown */}
            <AnimatePresence>
              {searchResults.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="absolute z-50 left-4 right-4 mt-2 bg-card border border-border rounded-xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] max-h-[400px] overflow-y-auto p-2"
                >
                  {searchResults.map(product => (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className="w-full flex items-center gap-4 px-3 py-2.5 hover:bg-muted/60 rounded-lg transition-all text-left group"
                    >
                      <div className="w-10 h-10 rounded-md bg-background flex items-center justify-center overflow-hidden flex-shrink-0 border border-border group-hover:border-primary/50 transition-colors">
                        {product.image ? (
                          <img src={product.image} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <ScanBarcode className="w-5 h-5 text-muted-foreground/50" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-sm text-foreground truncate">{getDisplayName(product)}</h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">{product.category}</Badge>
                          <span className="text-[10px] text-muted-foreground font-mono">ID: {product.barcode || 'NO-BARCODE'}</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-black text-primary text-sm">{formatCurrency(product.price)}</p>
                        <p className={`text-[10px] font-bold ${product.stock_quantity > 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {product.stock_quantity > 0 ? `Stock: ${product.stock_quantity}` : 'OUT OF STOCK'}
                        </p>
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
                        <h4 className="font-bold leading-tight line-clamp-1">{getDisplayName(item)}</h4>
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
                  <div id="pos-receipt" className="bg-white text-black p-4 font-mono text-[11px] leading-tight w-full max-w-[80mm] mx-auto">
                    
                    {/* Header */}
                    <div className="text-center mb-3">
                      <h2 className="text-sm font-black tracking-tight mb-1">IMobile Service & Repair Center</h2>
                      <p>Colombo Road, Negombo</p>
                      <p>Tel: 077 123 4567 / 077 765 4321</p>
                      <p className="mt-1">Date: {new Date().toLocaleString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(',', '')}</p>
                      <p># {lastSale?.invoice_number}</p>
                      <p>Cashier : {cashier?.name || cashier?.email?.split('@')[0] || 'Admin'}</p>
                      <p>Customer : {selectedCustomer?.name || 'Walk-in Customer'}</p>
                    </div>

                    <div className="text-center font-bold border-y border-dashed border-black py-1 mb-2">
                       Receipt - Original
                    </div>

                    {/* Table Headers */}
                    <div className="flex justify-between border-b border-dashed border-black pb-1 mb-2 font-bold text-[11px]">
                      <div className="flex-1">#Item</div>
                      <div className="w-[60px] text-right">Net</div>
                      <div className="w-[30px] text-center">Qty</div>
                      <div className="w-[65px] text-right">Total</div>
                    </div>

                    {/* Items List */}
                    <div className="space-y-2 mb-2 border-b border-dashed border-black pb-3">
                       {lastSale?.items?.map((item: any, idx: number) => (
                          <div key={idx}>
                             <div className="font-bold text-[11px] mb-0.5">
                               {idx + 1}) {item.product_name?.toUpperCase() || 'PRODUCT'}
                             </div>
                             <div className="flex justify-between text-[10px]">
                                <div className="flex-1"></div>
                                <div className="w-[60px] text-right text-gray-700">
                                   {Number(item.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                                <div className="w-[30px] text-center font-bold">
                                   {item.quantity}
                                </div>
                                <div className="w-[65px] text-right font-bold">
                                   {Number(item.total_price || (item.price * item.quantity)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                             </div>
                          </div>
                       ))}
                    </div>

                    {/* Totals Section */}
                    <div className="space-y-1 mb-2 border-b border-dashed border-black pb-2 text-right">
                      <div className="flex justify-between">
                        <span>Sub Total</span>
                        <span className="font-bold">{formatCurrency(lastSale?.total_amount || 0).replace('Rs. ', '')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total Discount</span>
                        <span className="font-bold">{formatCurrency(lastSale?.discount_amount || 0).replace('Rs. ', '')}</span>
                      </div>
                    </div>

                    <div className="space-y-1 mb-3 border-b border-dashed border-black pb-3 text-right">
                      <div className="flex justify-between text-sm font-black">
                        <span>Total</span>
                        <span>{formatCurrency(lastSale?.net_amount || lastSale?.total_amount || 0).replace('Rs. ', '')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Paid {paymentMethod.toUpperCase()}</span>
                        <span className="font-bold">{formatCurrency(lastSale?.net_amount || lastSale?.total_amount || 0).replace('Rs. ', '')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Balance</span>
                        <span className="font-bold">0.00</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Outstanding</span>
                        <span className="font-bold">0.00</span>
                      </div>
                    </div>

                    {/* Invoice Barcode */}
                    <div className="flex justify-center my-3 relative -left-2 overflow-hidden w-full">
                       {lastSale?.invoice_number && (
                         <div className="origin-top scale-75 transform text-center">
                            <Barcode 
                              value={lastSale.invoice_number} 
                              displayValue={false} 
                              height={40} 
                              width={1.5} 
                              margin={10} 
                              background="#ffffff" 
                              lineColor="#000000"
                            />
                         </div>
                       )}
                    </div>

                    {/* Terms & Conditions */}
                    <div className="text-[9px] mt-4 leading-normal">
                       <p className="font-bold text-[10px] mb-1">*** හුවමාරු කිරීම සඳහා මෙම බිල්පත ඉදිරිපත් කල යුතුයි.</p>
                       <ul className="list-disc pl-3 space-y-0.5 opacity-90">
                         <li>මිලදී ගැනීමෙන් පසු දින 3ක් ඇතුලත ආපසු භාර දිය හැක.</li>
                         <li>භාණ්ඩය නැවත විකිණිය හැකි තත්වයේ තිබිය යුතුයි.</li>
                         <li>වගකීම් රහිතව යලි භාරගනු නොලැබේ.</li>
                         <li>අවශ්‍ය ද්‍රව්‍ය නැවත ලබාගැනීමට හෝ වෙනස් කරගැනීමට බැරිය.</li>
                       </ul>
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

      {/* Scanned Sale / Return Window Modal */}
      <AnimatePresence>
        {scannedSale && (
           <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
             <motion.div 
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               className="bg-card border border-border p-0 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col"
             >
                <div className="p-6 border-b border-border bg-muted/30 flex items-center justify-between">
                   <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-bold">Scanned Receipt</h3>
                        <Badge variant="outline">{scannedSale.invoice_number}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 text-left">{new Date(scannedSale.created_at).toLocaleString()}</p>
                   </div>
                   <button onClick={() => setScannedSale(null)} className="p-1 hover:bg-muted rounded-full">
                     <X className="w-6 h-6 text-muted-foreground" />
                   </button>
                </div>

                <div className="p-6 overflow-y-auto max-h-[60vh]">
                   {/* 4-Day Expiration Check */}
                   {(() => {
                     const isExpired = (new Date().getTime() - new Date(scannedSale.created_at).getTime()) > 4 * 24 * 60 * 60 * 1000;
                     return isExpired && (
                       <div className="bg-red-500/10 border border-red-500 text-red-500 p-4 rounded-xl mb-6 flex flex-col items-center justify-center text-center">
                          <AlertCircle className="w-8 h-8 mb-2" />
                          <h4 className="font-black tracking-widest text-lg">RETURN WINDOW EXPIRED</h4>
                          <p className="text-sm font-medium mt-1">This invoice is strictly older than 4 business days. Returns are no longer accepted.</p>
                       </div>
                     )
                   })()}

                   <div className="grid grid-cols-2 gap-8 mb-8 text-left">
                      <div>
                         <p className="text-[10px] text-muted-foreground uppercase font-black mb-2">Customer Info</p>
                         <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-border">
                               <User className="w-5 h-5" />
                            </div>
                            <div>
                               <p className="font-bold">{scannedSale.customer_name || 'Walk-in Customer'}</p>
                               <p className="text-xs text-muted-foreground">{scannedSale.inv_customers?.phone || 'Guest Checkout'}</p>
                            </div>
                         </div>
                      </div>
                      <div className="text-right">
                         <p className="text-[10px] text-muted-foreground uppercase font-black mb-2">Transaction Total</p>
                         <div className="flex flex-col items-end">
                            <span className="font-black text-2xl text-primary">{formatCurrency(scannedSale.net_amount)}</span>
                            <Badge variant="secondary" className="uppercase font-black text-xs">{scannedSale.payment_method?.replace('_', ' ')}</Badge>
                         </div>
                      </div>
                   </div>

                   <table className="w-full text-left">
                      <thead>
                         <tr className="text-[10px] text-muted-foreground uppercase font-black border-b border-border">
                            <th className="py-2">Purchased Item</th>
                            <th className="py-2 text-center">Qty</th>
                            <th className="py-2 text-right">Price</th>
                            <th className="py-2 text-right">Total</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                         {scannedSale.inv_sale_items?.map((item: any) => (
                           <tr key={item.id}>
                              <td className="py-4 font-bold text-sm tracking-tight">{item.product_name}</td>
                              <td className="py-4 text-center font-black">{item.quantity}</td>
                              <td className="py-4 text-right text-sm">{formatCurrency(item.unit_price)}</td>
                              <td className="py-4 text-right font-black text-primary text-sm">{formatCurrency(item.total_price)}</td>
                           </tr>
                         ))}
                      </tbody>
                   </table>
                </div>

                <div className="p-6 border-t border-border bg-muted/10 flex gap-4">
                    <Button onClick={() => setScannedSale(null)} className="w-full font-bold h-12 text-sm tracking-widest bg-foreground text-background hover:bg-foreground/90 hover:scale-[1.02] transition-all">CLOSE VIEW</Button>
                </div>
             </motion.div>
           </div>
        )}
      </AnimatePresence>

    </CashierLayout>
  )
}
