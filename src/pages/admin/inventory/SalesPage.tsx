"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  History, 
  Search, 
  Calendar, 
  ArrowLeft, 
  ArrowRight, 
  Download, 
  Eye, 
  ShoppingCart, 
  User, 
  CreditCard,
  CheckCircle2,
  FileText,
  Filter,
  BarChart3
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import AdminLayout from "@/components/admin-layout"
import { formatCurrency } from "@/lib/utils/currency"
import { inventorySalesService } from "@/lib/services/inventory.service"
import { toast } from "sonner"

export default function SalesHistoryPage() {
  const [sales, setSales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedSale, setSelectedSale] = useState<any>(null)
  const [summary, setSummary] = useState<any>(null)
  const [dateRange, setDateRange] = useState({ from: '', to: '' })

  const fetchSales = async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      const res = await inventorySalesService.getAll({
        from_date: dateRange.from || undefined,
        to_date: dateRange.to || undefined
      })
      setSales(res.data || [])
    } catch (err) {
      console.error('Failed to fetch sales:', err)
      toast.error("Failed to load sales history")
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const fetchSummary = async () => {
    try {
      const res = await inventorySalesService.getTodaySummary()
      setSummary(res.data)
    } catch (err) {
      console.error('Failed to fetch summary:', err)
    }
  }

  useEffect(() => {
    fetchSales()
    fetchSummary()
  }, [dateRange])

  const filteredSales = sales.filter(sale => 
    sale.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sale.customer_name?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getPaymentIcon = (method: string) => {
    switch(method) {
      case 'cash': return <ArrowRight className="w-4 h-4 text-green-500" />
      case 'card': return <CreditCard className="w-4 h-4 text-blue-500" />
      default: return <ArrowRight className="w-4 h-4 text-purple-500" />
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Sales History</h1>
            <p className="text-muted-foreground mt-1">Review all POS and online transactions, and generate reports.</p>
          </div>
          <div className="flex gap-2">
             <Button variant="outline" className="gap-2">
               <Download className="w-4 h-4" /> Export CSV
             </Button>
          </div>
        </div>

        {/* Quick Stats */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
             <div className="bg-card border border-border p-4 rounded-xl shadow-sm">
                <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mb-1 leading-none">Today's Revenue</p>
                <p className="text-2xl font-black text-primary">{formatCurrency(summary.total_revenue)}</p>
             </div>
             <div className="bg-card border border-border p-4 rounded-xl shadow-sm">
                <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mb-1 leading-none">Total Sales</p>
                <p className="text-2xl font-black">{summary.total_sales}</p>
             </div>
             <div className="bg-card border border-border p-4 rounded-xl shadow-sm">
                <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mb-1 leading-none">POS / Online</p>
                <p className="text-2xl font-black text-blue-600">{summary.pos_sales} <span className="text-muted-foreground text-sm font-medium">/ {summary.web_sales}</span></p>
             </div>
             <div className="bg-card border border-border p-4 rounded-xl shadow-sm">
                <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mb-1 leading-none">Cash Ratio</p>
                <div className="w-full bg-muted h-2 rounded-full mt-2 overflow-hidden flex">
                    <div className="bg-green-500 h-full" style={{ width: `${(summary.cash_sales / summary.total_sales) * 100}%` }} />
                    <div className="bg-blue-500 h-full flex-1" />
                </div>
             </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col lg:flex-row gap-4 items-center bg-card border border-border p-4 rounded-xl shadow-sm">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search invoice or customer..." 
              className="pl-10 h-11"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 w-full lg:w-auto">
             <div className="flex items-center gap-2 bg-muted p-1 rounded-lg flex-1 lg:flex-initial">
                <Input 
                   type="date" 
                   className="h-9 border-0 bg-transparent shadow-none" 
                   value={dateRange.from}
                   onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                />
                <span className="text-muted-foreground"><ArrowRight className="w-4 h-4" /></span>
                <Input 
                   type="date" 
                   className="h-9 border-0 bg-transparent shadow-none"
                   value={dateRange.to}
                   onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                />
             </div>
             <Button variant="ghost" size="icon" onClick={() => setDateRange({ from: '', to: '' })}>
                <Filter className="w-4 h-4" />
             </Button>
          </div>
        </div>

        {/* Sales Table */}
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="p-4 font-bold text-xs uppercase tracking-wider text-muted-foreground">Invoice #</th>
                  <th className="p-4 font-bold text-xs uppercase tracking-wider text-muted-foreground">Customer</th>
                  <th className="p-4 font-bold text-xs uppercase tracking-wider text-muted-foreground">Date & Time</th>
                  <th className="p-4 font-bold text-xs uppercase tracking-wider text-muted-foreground">Items</th>
                  <th className="p-4 font-bold text-xs uppercase tracking-wider text-muted-foreground">Payment</th>
                  <th className="p-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-right">Net Amount</th>
                  <th className="p-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-right w-16"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                   [...Array(8)].map((_, i) => (
                    <tr key={i} className="animate-pulse border-b border-border">
                       <td className="p-4"><div className="h-6 w-24 bg-muted rounded" /></td>
                       <td className="p-4"><div className="h-4 w-32 bg-muted rounded mb-1" /><div className="h-3 w-16 bg-muted rounded" /></td>
                       <td className="p-4"><div className="h-4 w-28 bg-muted rounded" /></td>
                       <td className="p-4 text-center"><div className="h-4 w-8 bg-muted rounded mx-auto" /></td>
                       <td className="p-4"><div className="h-6 w-20 bg-muted rounded-full" /></td>
                       <td className="p-4 text-right"><div className="h-6 w-24 bg-muted rounded ml-auto" /></td>
                       <td className="p-4"></td>
                    </tr>
                   ))
                ) : filteredSales.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-muted-foreground">
                      No sales records found.
                    </td>
                  </tr>
                ) : (
                  filteredSales.map(sale => (
                    <tr key={sale.id} className="border-b border-border hover:bg-muted/30 transition-colors group">
                      <td className="p-4">
                        <span className="font-mono font-black text-sm">{sale.invoice_number}</span>
                        <div className="flex gap-1 mt-1">
                          <Badge variant={sale.source === 'pos' ? 'default' : 'outline'} className="text-[8px] h-4 px-1 leading-none uppercase">{sale.source}</Badge>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col">
                           <span className="font-bold text-sm leading-tight">{sale.customer_name || 'Walk-in Customer'}</span>
                           <span className="text-[10px] text-muted-foreground">{sale.created_by || 'Cashier'}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col">
                           <span className="text-xs font-medium">{new Date(sale.created_at).toLocaleDateString()}</span>
                           <span className="text-[10px] text-muted-foreground">{new Date(sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <Badge variant="secondary" className="font-bold">{sale.inv_sale_items?.length || 0}</Badge>
                      </td>
                      <td className="p-4">
                         <div className="flex items-center gap-2">
                            {getPaymentIcon(sale.payment_method)}
                            <span className="text-xs uppercase font-bold">{sale.payment_method?.replace('_', ' ')}</span>
                         </div>
                      </td>
                      <td className="p-4 text-right">
                         <span className="font-black text-primary">{formatCurrency(sale.net_amount)}</span>
                      </td>
                      <td className="p-2 text-right">
                         <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8"
                              onClick={() => setSelectedSale(sale)}
                            >
                               <Eye className="w-4 h-4" />
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

      {/* Sale Details Modal */}
      <AnimatePresence>
        {selectedSale && (
           <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
             <motion.div 
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               className="bg-card border border-border p-0 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
             >
                <div className="p-6 border-b border-border bg-muted/30 flex items-center justify-between">
                   <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-bold">Sale Details</h3>
                        <Badge>{selectedSale.invoice_number}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{new Date(selectedSale.created_at).toLocaleString()}</p>
                   </div>
                   <button onClick={() => setSelectedSale(null)} className="p-1 hover:bg-muted rounded-full">
                     <ArrowLeft className="w-5 h-5 rotate-180" />
                   </button>
                </div>

                <div className="p-6 overflow-y-auto max-h-[60vh]">
                   <div className="grid grid-cols-2 gap-8 mb-8">
                      <div>
                         <p className="text-[10px] text-muted-foreground uppercase font-black mb-2">Customer Info</p>
                         <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                               <User className="w-5 h-5" />
                            </div>
                            <div>
                               <p className="font-bold">{selectedSale.customer_name || 'Walk-in Customer'}</p>
                               <p className="text-xs text-muted-foreground">{selectedSale.inv_customers?.phone || 'Guest Checkout'}</p>
                            </div>
                         </div>
                      </div>
                      <div className="text-right">
                         <p className="text-[10px] text-muted-foreground uppercase font-black mb-2">Transaction</p>
                         <div className="flex items-center justify-end gap-2">
                            <span className="text-xs uppercase font-bold">{selectedSale.payment_method?.replace('_', ' ')}</span>
                            <div className="p-2 bg-muted rounded-lg">
                               {getPaymentIcon(selectedSale.payment_method)}
                            </div>
                         </div>
                      </div>
                   </div>

                   <table className="w-full text-left">
                      <thead>
                         <tr className="text-[10px] text-muted-foreground uppercase font-black border-b border-border">
                            <th className="py-2">Item</th>
                            <th className="py-2 text-center">Qty</th>
                            <th className="py-2 text-right">Price</th>
                            <th className="py-2 text-right">Total</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                         {selectedSale.inv_sale_items?.map((item: any) => (
                           <tr key={item.id}>
                              <td className="py-4 font-bold text-sm">{item.product_name}</td>
                              <td className="py-4 text-center font-bold">{item.quantity}</td>
                              <td className="py-4 text-right">{formatCurrency(item.unit_price)}</td>
                              <td className="py-4 text-right font-black">{formatCurrency(item.total_price)}</td>
                           </tr>
                         ))}
                      </tbody>
                   </table>

                   <div className="mt-8 space-y-2 border-t border-border pt-4">
                      <div className="flex justify-between text-muted-foreground font-medium">
                         <span>Subtotal</span>
                         <span>{formatCurrency(selectedSale.total_amount)}</span>
                      </div>
                      <div className="flex justify-between text-green-600 font-bold">
                         <span>Discount</span>
                         <span>-{formatCurrency(selectedSale.discount_amount)}</span>
                      </div>
                      <div className="flex justify-between text-xl font-black pt-4 border-t border-dashed border-border">
                         <span>Net Total</span>
                         <span className="text-primary">{formatCurrency(selectedSale.net_amount)}</span>
                      </div>
                   </div>
                </div>

                <div className="p-6 border-t border-border bg-muted/10 flex gap-4">
                    <Button variant="outline" className="flex-1 gap-2 border-primary text-primary hover:bg-primary/5">
                       <FileText className="w-4 h-4" /> RE-PRINT INVOICE
                    </Button>
                    <Button onClick={() => setSelectedSale(null)} className="px-8">CLOSE</Button>
                </div>
             </motion.div>
           </div>
        )}
      </AnimatePresence>
    </AdminLayout>
  )
}
