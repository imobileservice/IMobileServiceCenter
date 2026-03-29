"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Search, Edit2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { customersService } from "@/lib/supabase/services/customers"
import CustomerModal from "@/components/admin/customer-modal"
import AdminLayout from "@/components/admin-layout"
import { formatCurrency } from "@/lib/utils/currency"
import type { Customer } from "@/lib/supabase/services/customers"

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const fetchCustomers = async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      const data = await customersService.getAll()
      setCustomers(data || [])
    } catch (error) {
      console.error('Failed to fetch customers:', error)
      if (!silent) setCustomers([])
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    fetchCustomers()
    
    // Listen for customer updates
    const handleCustomerUpdate = () => {
      fetchCustomers(true)
    }
    window.addEventListener('customerUpdated', handleCustomerUpdate)
    
    return () => {
      window.removeEventListener('customerUpdated', handleCustomerUpdate)
    }
  }, [])

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this customer?')) return
    try {
      await customersService.delete(id)
      setCustomers(prev => prev.filter(c => c.id !== id))
    } catch (error) {
      console.error('Failed to delete customer:', error)
      alert('Failed to delete customer')
    }
  }

  const handleEdit = (id: string) => {
    setEditingCustomerId(id)
    setIsModalOpen(true)
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
    setEditingCustomerId(null)
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Customers</h1>
            <p className="text-muted-foreground mt-1">Manage and view your customer database</p>
          </div>
        </div>
      </motion.div>

      {/* Search */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search customers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </motion.div>

      {/* Customers Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-card border border-border rounded-lg overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left py-4 px-6 font-semibold">Name</th>
                <th className="text-left py-4 px-6 font-semibold">Email</th>
                <th className="text-left py-4 px-6 font-semibold">Phone</th>
                <th className="text-left py-4 px-6 font-semibold">Orders</th>
                <th className="text-left py-4 px-6 font-semibold">Total Spent</th>
                <th className="text-left py-4 px-6 font-semibold">Status</th>
                <th className="text-left py-4 px-6 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">Loading customers...</td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">No customers found</td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => (
                <motion.tr
                  key={customer.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="border-b border-border hover:bg-muted/50 transition-colors"
                >
                  <td className="py-4 px-6 font-semibold">{customer.name}</td>
                  <td className="py-4 px-6">{customer.email}</td>
                  <td className="py-4 px-6">{customer.phone || 'N/A'}</td>
                  <td className="py-4 px-6">{customer.totalOrders}</td>
                  <td className="py-4 px-6 font-semibold">{formatCurrency(customer.totalSpent)}</td>
                  <td className="py-4 px-6">
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-semibold ${
                        customer.status === "Active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {customer.status}
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleEdit(customer.id)} className="gap-2">
                        <Edit2 className="w-4 h-4" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(customer.id)}
                        className="gap-2 text-red-600 hover:text-red-700 bg-transparent"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </Button>
                    </div>
                  </td>
                </motion.tr>
              ))
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Customer Modal */}
      <CustomerModal isOpen={isModalOpen} onClose={handleModalClose} editingCustomerId={editingCustomerId} />
      </div>
    </AdminLayout>
  )
}
