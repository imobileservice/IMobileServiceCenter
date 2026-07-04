"use client"

import React, { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Calendar, Check, KeyRound, Loader2, Mail, MapPin, Pencil, Plus, Save, Shield, Trash2, User, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import AdminLayout from "@/components/admin-layout"
import { toast } from "sonner"
import { getApiUrl } from "@/lib/utils/api"

const SHOPS = ["Meegoda", "Padukka", "Padukka new"]
const TILL_STATUSES = ["active", "inactive"] as const
const SELECT_CLASS = "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"

type Cashier = {
  id: string
  email: string
  name?: string
  role: string
  shop?: string
  created_at: string
}

type TillStatus = typeof TILL_STATUSES[number]

type Till = {
  id: string
  code_hint: string
  label: string
  shop: string
  status: TillStatus
  created_at: string
  updated_at?: string
}

type TillDraft = {
  code: string
  label: string
  shop: string
  status: TillStatus
}

function buildTillDrafts(items: Till[]) {
  return items.reduce<Record<string, TillDraft>>((acc, till) => {
    acc[till.id] = {
      code: till.code_hint || "",
      label: till.label || "",
      shop: till.shop || "Meegoda",
      status: till.status || "active",
    }
    return acc
  }, {})
}

export default function AdminCashiers() {
  const [cashiers, setCashiers] = useState<Cashier[]>([])
  const [tills, setTills] = useState<Till[]>([])
  const [loading, setLoading] = useState(true)
  const [tillsLoading, setTillsLoading] = useState(true)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [shop, setShop] = useState("Meegoda")
  const [tillCode, setTillCode] = useState("")
  const [tillLabel, setTillLabel] = useState("")
  const [tillShop, setTillShop] = useState("Meegoda")
  const [tillStatus, setTillStatus] = useState<TillStatus>("active")
  const [isAdding, setIsAdding] = useState(false)
  const [isAddingTill, setIsAddingTill] = useState(false)
  const [updatingShopId, setUpdatingShopId] = useState<string | null>(null)
  const [editingTillId, setEditingTillId] = useState<string | null>(null)
  const [savingTillId, setSavingTillId] = useState<string | null>(null)
  const [tillDrafts, setTillDrafts] = useState<Record<string, TillDraft>>({})

  useEffect(() => {
    fetchCashiers()
    fetchTills()
  }, [])

  const fetchCashiers = async () => {
    try {
      setLoading(true)
      const res = await fetch(getApiUrl("/api/admin/cashiers"))
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setCashiers(json.data || [])
    } catch (err: any) {
      toast.error(err.message || "Failed to fetch cashiers")
    } finally {
      setLoading(false)
    }
  }

  const fetchTills = async () => {
    try {
      setTillsLoading(true)
      const res = await fetch(getApiUrl("/api/admin/tills"))
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      const nextTills = json.data || []
      setTills(nextTills)
      setTillDrafts(buildTillDrafts(nextTills))
    } catch (err: any) {
      toast.error(err.message || "Failed to fetch till codes")
    } finally {
      setTillsLoading(false)
    }
  }

  const handleAddCashier = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    try {
      setIsAdding(true)
      const res = await fetch(getApiUrl("/api/admin/cashiers"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name, shop }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success("Cashier account created successfully")
      setEmail("")
      setPassword("")
      setName("")
      setShop("Meegoda")
      await fetchCashiers()
    } catch (err: any) {
      toast.error(err.message || "Failed to create cashier")
    } finally {
      setIsAdding(false)
    }
  }

  const handleAddTill = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tillCode.trim()) return
    try {
      setIsAddingTill(true)
      const res = await fetch(getApiUrl("/api/admin/tills"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: tillCode,
          label: tillLabel,
          shop: tillShop,
          status: tillStatus,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success("Till code created successfully")
      setTillCode("")
      setTillLabel("")
      setTillShop("Meegoda")
      setTillStatus("active")
      await fetchTills()
    } catch (err: any) {
      toast.error(err.message || "Failed to create till code")
    } finally {
      setIsAddingTill(false)
    }
  }

  const handleDeleteCashier = async (id: string, cashierEmail: string) => {
    if (!confirm(`Are you sure you want to delete cashier ${cashierEmail}?`)) return
    try {
      const res = await fetch(getApiUrl(`/api/admin/cashiers/${id}`), {
        method: "DELETE",
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success("Cashier deleted successfully")
      setCashiers(prev => prev.filter(c => c.id !== id))
    } catch (err: any) {
      toast.error(err.message || "Failed to delete cashier")
    }
  }

  const handleUpdateShop = async (id: string, newShop: string) => {
    try {
      setUpdatingShopId(id)
      const res = await fetch(getApiUrl(`/api/admin/cashiers/${id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop: newShop }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success("Cashier shop updated successfully")
      await fetchCashiers()
    } catch (err: any) {
      toast.error(err.message || "Failed to update shop")
    } finally {
      setUpdatingShopId(null)
    }
  }

  const updateTillDraft = (id: string, patch: Partial<TillDraft>) => {
    setTillDrafts(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        ...patch,
      },
    }))
  }

  const handleCancelTillEdit = (till: Till) => {
    setTillDrafts(prev => ({
      ...prev,
      [till.id]: {
        code: till.code_hint || "",
        label: till.label || "",
        shop: till.shop || "Meegoda",
        status: till.status || "active",
      },
    }))
    setEditingTillId(null)
  }

  const handleUpdateTill = async (till: Till) => {
    const draft = tillDrafts[till.id]
    if (!draft) return

    const payload: Record<string, string> = {}
    const nextCode = draft.code.trim().toUpperCase()
    const nextLabel = draft.label.trim()

    if (nextCode && nextCode !== till.code_hint) payload.code = nextCode
    if (nextLabel && nextLabel !== till.label) payload.label = nextLabel
    if (draft.shop !== till.shop) payload.shop = draft.shop
    if (draft.status !== till.status) payload.status = draft.status

    if (!Object.keys(payload).length) {
      setEditingTillId(null)
      return
    }

    try {
      setSavingTillId(till.id)
      const res = await fetch(getApiUrl(`/api/admin/tills/${till.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success("Till code updated successfully")
      const updatedTill = json.data
      setTills(prev => prev.map(item => item.id === till.id ? updatedTill : item))
      setTillDrafts(prev => ({
        ...prev,
        [till.id]: {
          code: updatedTill.code_hint || "",
          label: updatedTill.label || "",
          shop: updatedTill.shop || "Meegoda",
          status: updatedTill.status || "active",
        },
      }))
      setEditingTillId(null)
    } catch (err: any) {
      toast.error(err.message || "Failed to update till code")
    } finally {
      setSavingTillId(null)
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Cashier Management</h1>
          <p className="text-muted-foreground mt-1">Manage cashier terminal accounts and POS till codes.</p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
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
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-sm font-semibold mb-1 block">Assigned Shop</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <select
                    className={`${SELECT_CLASS} pl-9`}
                    value={shop}
                    onChange={e => setShop(e.target.value)}
                  >
                    {SHOPS.map(shopName => (
                      <option key={shopName} value={shopName}>{shopName}</option>
                    ))}
                  </select>
                </div>
              </div>
              <Button type="submit" className="w-full mt-2" disabled={isAdding}>
                {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {isAdding ? "Creating..." : "Create Account"}
              </Button>
            </form>
          </div>

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
                        <h3 className="font-bold text-foreground">{c.name || "Unnamed"}</h3>
                        <p className="text-sm text-muted-foreground">{c.email}</p>
                        <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground mt-1 font-mono uppercase">
                          <span className="flex items-center gap-1"><Shield className="w-3 h-3 text-green-500" /> Role: {c.role}</span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-blue-500" /> Shop:
                            {updatingShopId === c.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <select
                                className="bg-transparent border-b border-dashed border-muted-foreground/50 focus:outline-none cursor-pointer hover:text-foreground text-[10px] ml-1"
                                value={c.shop || "Meegoda"}
                                onChange={e => handleUpdateShop(c.id, e.target.value)}
                              >
                                {SHOPS.map(shopName => (
                                  <option key={shopName} value={shopName}>{shopName}</option>
                                ))}
                              </select>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 sm:mt-0 flex items-center gap-4">
                      <div className="text-xs text-right text-muted-foreground hidden sm:block">
                        <div className="flex items-center justify-end gap-1"><Calendar className="w-3 h-3" /> Joined</div>
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 bg-card border border-border rounded-xl p-6 shadow-sm">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" /> Add Till Code
            </h2>
            <form onSubmit={handleAddTill} className="space-y-4">
              <div>
                <label className="text-sm font-semibold mb-1 block">Till Code</label>
                <Input
                  placeholder="MEG-02"
                  value={tillCode}
                  onChange={e => setTillCode(e.target.value.toUpperCase())}
                  required
                />
              </div>
              <div>
                <label className="text-sm font-semibold mb-1 block">Till Label</label>
                <Input
                  placeholder="Meegoda Till 02"
                  value={tillLabel}
                  onChange={e => setTillLabel(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-semibold mb-1 block">Shop</label>
                <select className={SELECT_CLASS} value={tillShop} onChange={e => setTillShop(e.target.value)}>
                  {SHOPS.map(shopName => (
                    <option key={shopName} value={shopName}>{shopName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold mb-1 block">Status</label>
                <select className={SELECT_CLASS} value={tillStatus} onChange={e => setTillStatus(e.target.value as TillStatus)}>
                  {TILL_STATUSES.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
              <Button type="submit" className="w-full mt-2" disabled={isAddingTill}>
                {isAddingTill ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {isAddingTill ? "Adding..." : "Add Till Code"}
              </Button>
            </form>
          </div>

          <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6 shadow-sm">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" /> POS Till Codes
            </h2>
            {tillsLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading till codes...</div>
            ) : tills.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                <p>No till codes found</p>
                <p className="text-sm mt-1">Add one using the form on the left</p>
              </div>
            ) : (
              <div className="space-y-3">
                {tills.map(till => {
                  const isEditing = editingTillId === till.id
                  const isSaving = savingTillId === till.id
                  const draft = tillDrafts[till.id] || {
                    code: till.code_hint || "",
                    label: till.label || "",
                    shop: till.shop || "Meegoda",
                    status: till.status || "active",
                  }

                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={till.id}
                      className="p-4 border border-border rounded-lg bg-background hover:border-primary/50 transition-colors"
                    >
                      {isEditing ? (
                        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] xl:grid-cols-[1fr_1fr_150px_120px_auto] gap-3 items-end">
                          <div>
                            <label className="text-xs font-semibold mb-1 block text-muted-foreground">Till Code</label>
                            <Input
                              value={draft.code}
                              onChange={e => updateTillDraft(till.id, { code: e.target.value.toUpperCase() })}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold mb-1 block text-muted-foreground">Label</label>
                            <Input
                              value={draft.label}
                              onChange={e => updateTillDraft(till.id, { label: e.target.value })}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold mb-1 block text-muted-foreground">Shop</label>
                            <select className={SELECT_CLASS} value={draft.shop} onChange={e => updateTillDraft(till.id, { shop: e.target.value })}>
                              {SHOPS.map(shopName => (
                                <option key={shopName} value={shopName}>{shopName}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-semibold mb-1 block text-muted-foreground">Status</label>
                            <select className={SELECT_CLASS} value={draft.status} onChange={e => updateTillDraft(till.id, { status: e.target.value as TillStatus })}>
                              {TILL_STATUSES.map(status => (
                                <option key={status} value={status}>{status}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button size="icon" onClick={() => handleUpdateTill(till)} disabled={isSaving}>
                              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            </Button>
                            <Button type="button" variant="ghost" size="icon" onClick={() => handleCancelTillEdit(till)} disabled={isSaving}>
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                              <KeyRound className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="font-bold text-foreground">{till.label}</h3>
                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${till.status === "active" ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground"}`}>
                                  {till.status === "active" ? <Check className="w-3 h-3" /> : null}
                                  {till.status}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1">
                                <span className="font-mono text-foreground">{till.code_hint}</span>
                                <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-blue-500" /> {till.shop}</span>
                                <span>Updated {new Date(till.updated_at || till.created_at).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => setEditingTillId(till.id)}>
                            <Pencil className="w-4 h-4" />
                            Edit
                          </Button>
                        </div>
                      )}
                    </motion.div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
