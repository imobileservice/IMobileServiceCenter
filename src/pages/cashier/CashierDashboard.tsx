"use client"

import React, { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { DollarSign, CreditCard, Banknote, Calendar as CalendarIcon, History, AlertCircle } from "lucide-react"
import CashierLayout from "@/components/cashier-layout"
import { useCashierStore } from "@/lib/cashier-store"
import { formatCurrency } from "@/lib/utils/currency"
import { inventorySalesService } from "@/lib/services/inventory.service"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { format, startOfDay, endOfDay } from "date-fns"

export default function CashierDashboard() {
  const { cashier } = useCashierStore()
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [recentSales, setRecentSales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [cashier, selectedDate])

  const fetchData = async () => {
    try {
      setLoading(true)
      const shop = cashier?.shop || 'Meegoda'

      const start = startOfDay(selectedDate).toISOString()
      const end = endOfDay(selectedDate).toISOString()

      const salesRes = await inventorySalesService.getAll({ 
        shop, 
        limit: 1000,
        from_date: start,
        to_date: end
      })
      
      setRecentSales(salesRes.data || [])
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch dashboard data')
    } finally {
      setLoading(false)
    }
  }

  // Calculate quick stats from sales
  const cashSales = recentSales.filter(s => s.payment_method === 'cash').reduce((sum, s) => sum + Number(s.net_amount), 0)
  const cardSales = recentSales.filter(s => s.payment_method === 'card').reduce((sum, s) => sum + Number(s.net_amount), 0)
  const bankSales = recentSales.filter(s => s.payment_method === 'bank_transfer').reduce((sum, s) => sum + Number(s.net_amount), 0)
  const totalToday = recentSales.reduce((sum, s) => sum + Number(s.net_amount), 0)
  const salesCount = recentSales.length

  return (
    <CashierLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Daily Summary</h1>
            <p className="text-muted-foreground flex items-center gap-2 mt-1">
              <CalendarIcon className="w-4 h-4" /> {selectedDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <Badge variant="outline" className="text-sm px-3 py-1 font-bold text-primary border-primary/50">
            {cashier?.shop || 'Meegoda'} Branch
          </Badge>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
            {[1,2,3,4].map(i => <div key={i} className="h-32 bg-muted rounded-xl" />)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card border border-border rounded-xl p-6 shadow-sm flex flex-col justify-between">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground">Today's Revenue</p>
                    <h3 className="text-2xl font-black mt-1 text-primary">{formatCurrency(totalToday)}</h3>
                  </div>
                  <div className="p-3 bg-primary/10 rounded-lg text-primary"><DollarSign className="w-5 h-5" /></div>
                </div>
                <p className="text-xs text-muted-foreground mt-4">{salesCount} Transactions</p>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card border border-border rounded-xl p-6 shadow-sm flex flex-col justify-between">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground">Cash Collected</p>
                    <h3 className="text-2xl font-black mt-1">{formatCurrency(cashSales)}</h3>
                  </div>
                  <div className="p-3 bg-green-500/10 rounded-lg text-green-500"><Banknote className="w-5 h-5" /></div>
                </div>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-card border border-border rounded-xl p-6 shadow-sm flex flex-col justify-between">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground">Card Payments</p>
                    <h3 className="text-2xl font-black mt-1">{formatCurrency(cardSales)}</h3>
                  </div>
                  <div className="p-3 bg-blue-500/10 rounded-lg text-blue-500"><CreditCard className="w-5 h-5" /></div>
                </div>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-card border border-border rounded-xl p-6 shadow-sm flex flex-col justify-between">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground">Bank Transfers</p>
                    <h3 className="text-2xl font-black mt-1">{formatCurrency(bankSales)}</h3>
                  </div>
                  <div className="p-3 bg-purple-500/10 rounded-lg text-purple-500"><History className="w-5 h-5" /></div>
                </div>
              </motion.div>
            </div>

            <div className="mt-8 bg-card border border-border rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-border bg-muted/30 flex justify-between items-center">
                <h3 className="font-bold flex items-center gap-2">Shop Transactions</h3>
                <div className="flex items-center gap-2">
                  <label htmlFor="date-filter" className="text-sm font-medium text-muted-foreground">Date:</label>
                  <input
                    id="date-filter"
                    type="date"
                    value={format(selectedDate, 'yyyy-MM-dd')}
                    onChange={(e) => {
                      if (e.target.value) {
                        setSelectedDate(new Date(e.target.value))
                      }
                    }}
                    className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/50 text-muted-foreground uppercase font-semibold text-[10px] tracking-wider">
                    <tr>
                      <th className="px-6 py-4">Time</th>
                      <th className="px-6 py-4">Invoice No</th>
                      <th className="px-6 py-4">Customer</th>
                      <th className="px-6 py-4">Method</th>
                      <th className="px-6 py-4 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {recentSales.map((sale: any) => (
                      <tr key={sale.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-4 text-muted-foreground">
                          {new Date(sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          <div className="text-[10px]">{new Date(sale.created_at).toLocaleDateString()}</div>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs">{sale.invoice_number}</td>
                        <td className="px-6 py-4 font-medium">{sale.customer_name || 'Walk-in'}</td>
                        <td className="px-6 py-4">
                          <Badge variant="outline" className="uppercase text-[9px]">
                            {sale.payment_method?.replace('_', ' ')}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right font-black text-primary">
                          {formatCurrency(sale.net_amount)}
                        </td>
                      </tr>
                    ))}
                    {recentSales.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                          <div className="flex flex-col items-center gap-2 opacity-50">
                            <AlertCircle className="w-8 h-8" />
                            <p>No transactions found for {format(selectedDate, 'MMM do, yyyy')}.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </CashierLayout>
  )
}
