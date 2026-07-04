"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  Search, 
  ArrowLeft, 
  ArrowRight, 
  Download, 
  Eye, 
  Trash2,
  User, 
  CreditCard,
  FileText,
  Filter,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import AdminLayout from "@/components/admin-layout"
import { formatCurrency } from "@/lib/utils/currency"
import { inventorySalesService } from "@/lib/services/inventory.service"
import { toast } from "sonner"
import Barcode from "react-barcode"

export default function SalesHistoryPage() {
  const [sales, setSales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedSale, setSelectedSale] = useState<any>(null)
  const [deletingSaleId, setDeletingSaleId] = useState<string | null>(null)
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

  const handleDelete = async (sale: any) => {
    const invoice = sale.invoice_number || sale.id
    if (!confirm(`Are you sure you want to delete sale ${invoice}? This cannot be undone.`)) return

    try {
      setDeletingSaleId(sale.id)
      await inventorySalesService.delete(sale.id)
      setSales(prev => prev.filter(item => item.id !== sale.id))
      if (selectedSale?.id === sale.id) setSelectedSale(null)
      await fetchSummary()
      window.dispatchEvent(new CustomEvent('inventoryUpdated', { detail: { type: 'sale', id: sale.id, action: 'delete' } }))
      localStorage.setItem('adminUpdate_inventory', JSON.stringify({ type: 'inventory', action: 'delete-sale', timestamp: Date.now() }))
      toast.success(`Sale ${invoice} deleted`)
    } catch (err) {
      console.error('Failed to delete sale:', err)
      toast.error("Failed to delete sale")
    } finally {
      setDeletingSaleId(null)
    }
  }

  const getPaymentIcon = (method: string) => {
    switch(method) {
      case 'cash': return <ArrowRight className="w-4 h-4 text-green-500" />
      case 'card': return <CreditCard className="w-4 h-4 text-blue-500" />
      default: return <ArrowRight className="w-4 h-4 text-purple-500" />
    }
  }

  const formatPaymentMethod = (method?: string | null) => {
    const labels: Record<string, string> = {
      cash: 'Cash',
      card: 'Card',
      bank_transfer: 'Bank',
      online: 'Online',
    }
    const value = method || 'cash'
    return labels[value] || value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
  }

  const formatReceiptAmount = (value: any) => {
    return formatCurrency(Number(value || 0)).replace('Rs. ', '')
  }

  const getSaleItems = (sale: any) => sale?.inv_sale_items || []

  const getSaleItemPrice = (item: any) => Number(item.unit_price ?? item.price ?? 0)

  const getSaleItemTotal = (item: any) => {
    return Number(item.total_price ?? (getSaleItemPrice(item) * Number(item.quantity || 0)))
  }

  const escapeHtml = (value: any) => {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  const formatReceiptDate = (value: any) => {
    return new Date(value || Date.now())
      .toLocaleString('en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
      .replace(',', '')
  }

  const buildPrintableReceipt = (sale: any, barcodeHtml: string) => {
    const items = getSaleItems(sale)
    const itemsHtml = items.map((item: any, idx: number) => {
      const price = getSaleItemPrice(item).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      const total = getSaleItemTotal(item).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

      return `
        <div class="item-row">
          <div class="item-name">${idx + 1}) ${escapeHtml(item.product_name || 'PRODUCT').toUpperCase()}</div>
          <div class="item-line">
            <span></span>
            <span class="net">${price}</span>
            <span class="qty">${escapeHtml(item.quantity)}</span>
            <span class="total">${total}</span>
          </div>
        </div>
      `
    }).join('')

    return `
      <div class="receipt">
        <div class="center header">
          <h1>IMobile Service & Repair Center</h1>
          <p>Colombo Road, Negombo</p>
          <p>Tel: 077 123 4567 / 077 765 4321</p>
          <p class="mt">Date: ${escapeHtml(formatReceiptDate(sale.created_at))}</p>
          <p># ${escapeHtml(sale.invoice_number)}</p>
          <p>Cashier : ${escapeHtml(sale.created_by || sale.cashier_name || 'Admin')}</p>
          <p>Till : ${escapeHtml(sale.till_code || 'N/A')}</p>
          <p>Customer : ${escapeHtml(sale.customer_name || 'Walk-in Customer')}</p>
          <p>Payment : ${escapeHtml(formatPaymentMethod(sale.payment_method))}</p>
        </div>

        <div class="title">Receipt - Reprint Copy</div>

        <div class="table-head">
          <span>#Item</span>
          <span class="net">Net</span>
          <span class="qty">Qty</span>
          <span class="total">Total</span>
        </div>

        <div class="items">${itemsHtml}</div>

        <div class="totals">
          <div><span>Sub Total</span><strong>${escapeHtml(formatReceiptAmount(sale.total_amount))}</strong></div>
          <div><span>Total Discount</span><strong>${escapeHtml(formatReceiptAmount(sale.discount_amount))}</strong></div>
        </div>

        <div class="pay">
          <div class="grand"><span>Total</span><strong>${escapeHtml(formatReceiptAmount(sale.net_amount || sale.total_amount))}</strong></div>
          <div><span>Paid ${escapeHtml(formatPaymentMethod(sale.payment_method).toUpperCase())}</span><strong>${escapeHtml(formatReceiptAmount(sale.net_amount || sale.total_amount))}</strong></div>
          <div><span>Balance</span><strong>0.00</strong></div>
          <div><span>Outstanding</span><strong>0.00</strong></div>
        </div>

        <div class="barcode">${barcodeHtml || `<p>${escapeHtml(sale.invoice_number)}</p>`}</div>

        <div class="center footer">
          <p><strong>Thank you for your business.</strong></p>
          <p>Please keep this receipt for returns and warranty claims.</p>
        </div>
      </div>
    `
  }

  const buildPrintDocument = (sale: any, barcodeHtml: string) => {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Reprint ${escapeHtml(sale.invoice_number || 'invoice')}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #fff;
      color: #000;
      font-family: "Courier New", monospace;
      font-size: 11px;
      line-height: 1.25;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .receipt { width: 80mm; max-width: 80mm; padding: 4mm; background: #fff; color: #000; }
    .center { text-align: center; }
    .header { margin-bottom: 10px; }
    .header h1 { font-size: 14px; margin: 0 0 4px; font-weight: 900; }
    p { margin: 0; }
    .mt { margin-top: 4px; }
    .title { text-align: center; font-weight: 900; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 4px 0; margin-bottom: 8px; }
    .table-head, .item-line { display: grid; grid-template-columns: 1fr 60px 30px 65px; gap: 0; align-items: baseline; }
    .table-head { font-weight: 900; border-bottom: 1px dashed #000; padding-bottom: 4px; margin-bottom: 8px; }
    .items { border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
    .item-row { margin-bottom: 8px; break-inside: avoid; }
    .item-name { font-weight: 900; margin-bottom: 2px; }
    .net, .total { text-align: right; }
    .qty { text-align: center; font-weight: 900; }
    .total { font-weight: 900; }
    .totals, .pay { border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
    .totals div, .pay div { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 2px; }
    .grand { font-size: 14px; font-weight: 900; }
    .barcode { display: flex; justify-content: center; overflow: hidden; margin: 10px 0; }
    .barcode svg { max-width: 72mm; height: auto; }
    .footer { font-size: 9px; margin-top: 12px; }
  </style>
</head>
<body>${buildPrintableReceipt(sale, barcodeHtml)}</body>
</html>`
  }

  const handlePrintInvoice = () => {
    if (!selectedSale) return
    const printWindow = window.open('', '_blank', 'width=420,height=720')

    if (!printWindow) {
      toast.error("Please allow popups for this site to re-print invoices")
      return
    }

    const barcodeHtml = document.getElementById('sales-reprint-barcode')?.innerHTML || ''
    printWindow.document.write(buildPrintDocument(selectedSale, barcodeHtml))
    printWindow.document.close()

    let printed = false
    const printOnce = () => {
      if (printed) return
      printed = true
      printWindow.focus()
      printWindow.print()
    }

    printWindow.onload = () => setTimeout(printOnce, 150)
    setTimeout(printOnce, 700)
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
                  <th className="p-4 font-bold text-xs uppercase tracking-wider text-muted-foreground text-right w-40">Actions</th>
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
                            <span className="text-xs uppercase font-bold">{formatPaymentMethod(sale.payment_method)}</span>
                         </div>
                      </td>
                      <td className="p-4 text-right">
                         <span className="font-black text-primary">{formatCurrency(sale.net_amount)}</span>
                      </td>
                      <td className="p-2 text-right">
                         <div className="flex items-center justify-end gap-2">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-8 gap-1.5"
                              onClick={() => setSelectedSale(sale)}
                            >
                               <Eye className="w-4 h-4" />
                               View
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5 text-red-600 hover:text-red-700 bg-transparent"
                              disabled={deletingSaleId === sale.id}
                              onClick={() => handleDelete(sale)}
                            >
                               <Trash2 className="w-4 h-4" />
                               {deletingSaleId === sale.id ? "Deleting" : "Delete"}
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
                            <span className="text-xs uppercase font-bold">{formatPaymentMethod(selectedSale.payment_method)}</span>
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
                         {getSaleItems(selectedSale).map((item: any) => (
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

                <div id="sales-reprint-barcode" className="fixed -left-[10000px] top-0 bg-white">
                  {selectedSale.invoice_number && (
                    <Barcode
                      value={selectedSale.invoice_number}
                      displayValue={false}
                      height={40}
                      width={1.5}
                      margin={10}
                      background="#ffffff"
                      lineColor="#000000"
                    />
                  )}
                </div>

                <div className="p-6 border-t border-border bg-muted/10 flex gap-4">
                    <Button variant="outline" className="flex-1 gap-2 border-primary text-primary hover:bg-primary/5" onClick={handlePrintInvoice}>
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
