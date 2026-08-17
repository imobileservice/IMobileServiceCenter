"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { ClipboardList, Package, Phone, Store, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { shopOrdersService, type ShopOrder, type ShopOrderStatus } from "@/lib/services/inventory.service"
import { useAdminStore } from "@/lib/admin-store"
import { toast } from "sonner"

/**
 * One order a shop placed for itself, and the buttons to move it along.
 *
 * Changing the status here does not touch stock. The goods leave through the
 * POS like every other sale, and decrementing in both places would double-count
 * every order.
 */

export const STATUS_META: Record<ShopOrderStatus, { label: string; badge: string; dot: string }> = {
  pending: {
    label: "New",
    badge: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    dot: "bg-amber-500",
  },
  confirmed: {
    label: "Confirmed",
    badge: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    dot: "bg-blue-500",
  },
  ready: {
    label: "Ready",
    badge: "bg-violet-500/10 text-violet-600 border-violet-500/20",
    dot: "bg-violet-500",
  },
  completed: {
    label: "Completed",
    badge: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    dot: "bg-emerald-500",
  },
  cancelled: {
    label: "Cancelled",
    badge: "bg-red-500/10 text-red-600 border-red-500/20",
    dot: "bg-red-500",
  },
}

const NEXT_STATUSES: ShopOrderStatus[] = ["pending", "confirmed", "ready", "completed", "cancelled"]

export const formatOrderDate = (value: string) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

interface Props {
  order: ShopOrder
  onClose: () => void
  onChanged: (order: ShopOrder | null) => void
}

export default function ShopOrderModal({ order, onClose, onChanged }: Props) {
  const [current, setCurrent] = useState(order)
  const [adminNote, setAdminNote] = useState(order.admin_note || "")
  const [isSaving, setIsSaving] = useState(false)
  const adminUser = useAdminStore((state) => state.user)

  const save = async (updates: { status?: ShopOrderStatus; admin_note?: string | null }) => {
    setIsSaving(true)
    try {
      // Stamped only on a status change, so "handled by" answers who moved the
      // order along rather than whoever last touched a note.
      const res = await shopOrdersService.update(current.id, {
        ...updates,
        ...(updates.status && adminUser?.name ? { handled_by: adminUser.name } : {}),
      })
      setCurrent(res.data)
      onChanged(res.data)
      toast.success(updates.status ? `Marked as ${STATUS_META[updates.status].label}` : "Note saved")
    } catch (error: any) {
      toast.error(error.message || "Could not update the order")
    } finally {
      setIsSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm(`Delete order ${current.order_number}? This cannot be undone.`)) return
    setIsSaving(true)
    try {
      await shopOrdersService.delete(current.id)
      toast.success("Order deleted")
      onChanged(null)
      onClose()
    } catch (error: any) {
      toast.error(error.message || "Could not delete the order")
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4">
      {/* Backdrop clicks do not close this - an order is read off the screen
          while picking stock off the shelf, so it stays open until dismissed. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-border rounded-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <ClipboardList className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="font-black tracking-tight truncate">{current.order_number}</h2>
              <p className="text-xs text-muted-foreground truncate">
                {formatOrderDate(current.created_at)} · {current.item_count} product
                {current.item_count === 1 ? "" : "s"} · {current.total_qty} units
              </p>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="rounded-xl border border-border p-4 mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Store className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="font-bold truncate">{current.supplier_name}</span>
            </div>
            <span
              className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${STATUS_META[current.status].badge}`}
            >
              {STATUS_META[current.status].label}
            </span>
          </div>
          {current.contact_phone && (
            <a
              href={`tel:${current.contact_phone}`}
              className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
            >
              <Phone className="w-3 h-3" /> {current.contact_phone}
            </a>
          )}
          {current.handled_at && (
            <p className="text-[11px] text-muted-foreground mt-2">
              Last updated {formatOrderDate(current.handled_at)}
              {current.handled_by ? ` by ${current.handled_by}` : ""}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-border overflow-hidden mb-4">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="p-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Product</th>
                <th className="p-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground text-right">
                  Qty
                </th>
              </tr>
            </thead>
            <tbody>
              {current.items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="p-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{item.product_name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono truncate">
                          {item.barcode || "NO BARCODE"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-right font-black">{item.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {current.note && (
          <div className="rounded-xl border border-border bg-muted/30 p-4 mb-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
              Note from the shop
            </p>
            <p className="text-sm">{current.note}</p>
          </div>
        )}

        <div className="mb-4">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
            Your note back to the shop
          </label>
          <textarea
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            rows={2}
            placeholder="Ready Tuesday, two items substituted, ..."
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          />
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            disabled={isSaving || adminNote === (current.admin_note || "")}
            onClick={() => save({ admin_note: adminNote.trim() || null })}
          >
            Save note
          </Button>
        </div>

        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Move to</p>
          <div className="flex flex-wrap gap-2">
            {NEXT_STATUSES.filter((status) => status !== current.status).map((status) => (
              <Button
                key={status}
                size="sm"
                variant={status === "cancelled" ? "outline" : "default"}
                className={`font-bold ${status === "cancelled" ? "hover:bg-red-500/10 hover:text-red-500" : ""}`}
                disabled={isSaving}
                onClick={() => save({ status })}
              >
                {STATUS_META[status].label}
              </Button>
            ))}
            <Button
              size="sm"
              variant="outline"
              className="ml-auto hover:bg-red-500/10 hover:text-red-500"
              disabled={isSaving}
              onClick={remove}
              aria-label="Delete order"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
