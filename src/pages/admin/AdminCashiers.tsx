"use client"

import React, { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Search, Plus, Trash2, Shield, User, Mail, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import AdminLayout from "@/components/admin-layout"
import { toast } from "sonner"
import { getApiUrl } from "@/lib/utils/api"

export default function AdminCashiers() {
  const [cashiers, setCashiers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [isAdding, setIsAdding] = useState(false)

  useEffect(() => {
    fetchCashiers()
  }, [])

  const fetchCashiers = async () => {
    try {
      setLoading(true)
      const res = await fetch(getApiUrl('/api/admin/cashiers'))
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setCashiers(json.data || [])
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch cashiers')
    } finally {
      setLoading(false)
    }
  }

  const handleAddCashier = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    try {
      setIsAdding(true)
      const res = await fetch(getApiUrl('/api/admin/cashiers'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success('Cashier account created successfully')
      setEmail("")
      setPassword("")
      setName("")
      fetchCashiers()
    } catch (err: any) {
      toast.error(err.message || 'Failed to create cashier')
    } finally {
      setIsAdding(false)
    }
  }

  const handleDeleteCashier = async (id: string, email: string) => {
    if (!confirm(`Are you sure you want to delete cashier ${email}?`)) return
    try {
      const res = await fetch(getApiUrl(`/api/admin/cashiers/${id}`), {
        method: 'DELETE'
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success('Cashier deleted successfully')
      setCashiers(prev => prev.filter(c => c.id !== id))
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete cashier')
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Cashier Management</h1>
          <p className="text-muted-foreground mt-1">Manage standalone cashier terminal accounts.</p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Add New Cashier Form */}
          <div className="lg:col-span-1 bg-card border border-border rounded-xl p-6 shadow-sm">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" /> Create Cashier
            </h2>
            <form onSubmit={handleAddCashier} className="space-y-4">
              <div>
                <label className="text-sm font-semibold mb-1 block">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input 
                    placeholder="e.g. John Doe" 
                    className="pl-9" 
                    value={name} 
                    onChange={e => setName(e.target.value)} 
                    required 
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold mb-1 block">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input 
                    type="email" 
                    placeholder="cashier@shop.com" 
                    className="pl-9" 
                    value={email} 
                    onChange={e => setEmail(e.target.value)} 
                    required 
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold mb-1 block">Login Password</label>
                <Input 
                  type="password" 
                  placeholder="••••••••" 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  required 
                />
              </div>
              <Button type="submit" className="w-full mt-2" disabled={isAdding}>
                {isAdding ? "Creating..." : "Create Account"}
              </Button>
            </form>
          </div>

          {/* List Cashiers */}
          <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6 shadow-sm">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-primary" /> Active Cashiers
            </h2>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading accounts...</div>
            ) : cashiers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                <p>No cashier accounts found</p>
                <p className="text-sm mt-1">Create one using the form on the left</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cashiers.map(c => (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={c.id} 
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border border-border rounded-lg bg-background hover:border-primary/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
                        {c.name ? c.name.charAt(0).toUpperCase() : c.email.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground">{c.name || 'Unnamed'}</h3>
                        <p className="text-sm text-muted-foreground">{c.email}</p>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1 font-mono uppercase">
                          <Shield className="w-3 h-3 text-green-500" />
                          Role: {c.role}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 sm:mt-0 flex items-center gap-4">
                      <div className="text-xs text-right text-muted-foreground hidden sm:block">
                        <div className="flex items-center justify-end gap-1"><Calendar className="w-3 h-3"/> Joined</div>
                        {new Date(c.created_at).toLocaleDateString()}
                      </div>
                      <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600 hover:bg-red-500/10 shrink-0" onClick={() => handleDeleteCashier(c.id, c.email)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
