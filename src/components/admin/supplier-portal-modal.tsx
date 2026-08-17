"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Eye, EyeOff, KeyRound, Shuffle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { inventorySuppliersService, type Supplier } from "@/lib/services/inventory.service"
import { toast } from "sonner"

interface Props {
  supplier: Supplier
  onClose: () => void
  /**
   * Carries the plaintext password back when one was just set, and null
   * otherwise. This is the only moment it exists in readable form, so it is the
   * only chance to put it on a card the shop can be sent.
   */
  onSaved: (password: string | null) => void
}

/** No 0/O or 1/l/I: this gets read off a screen and typed on a phone. */
const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"

const generatePassword = () => {
  const bytes = new Uint32Array(10)
  crypto.getRandomValues(bytes)
  const chars = Array.from(bytes, (value) => PASSWORD_ALPHABET[value % PASSWORD_ALPHABET.length])
  // Grouped, because a ten-character run is where people lose their place.
  return `${chars.slice(0, 5).join("")}-${chars.slice(5).join("")}`
}

/**
 * Controls one shop's sign-in at /supplier/login.
 *
 * The password is only ever sent upwards - it is hashed on the server and never
 * comes back, so there is nothing to pre-fill and no way to display an existing
 * one. Changing it here replaces it; leaving it blank keeps it.
 */
export default function SupplierPortalModal({ supplier, onClose, onSaved }: Props) {
  const [password, setPassword] = useState("")
  const [isVisible, setIsVisible] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const portalUrl =
    typeof window !== "undefined" ? `${window.location.origin}/supplier/login` : "/supplier/login"

  const save = async (enabled: boolean) => {
    if (enabled && !supplier.email) {
      toast.error("Add an email to this shop first - it is their username")
      return
    }
    if (enabled && !supplier.portal_enabled && !password.trim()) {
      toast.error("Set a password to give this shop access")
      return
    }
    if (password.trim() && password.trim().length < 6) {
      toast.error("Password must be at least 6 characters")
      return
    }

    setIsSaving(true)
    try {
      await inventorySuppliersService.setPortalAccess(supplier.id, {
        enabled,
        ...(password.trim() ? { password: password.trim() } : {}),
      })
      toast.success(enabled ? "Portal access saved" : "Portal access turned off")
      const shared = enabled && password.trim() ? password.trim() : null
      setPassword("")
      onSaved(shared)
      onClose()
    } catch (err: any) {
      toast.error(err.message || "Could not save portal access")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-border rounded-lg w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h2 className="font-black tracking-tight">Shop Portal Access</h2>
              <p className="text-xs text-muted-foreground">{supplier.name}</p>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
              Username (their email)
            </label>
            <p className="text-sm font-semibold">{supplier.email || <span className="text-red-500">No email set</span>}</p>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
              Portal address
            </label>
            <p className="text-sm font-mono break-all">{portalUrl}</p>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2">
              {supplier.portal_enabled ? "New password (leave blank to keep current)" : "Password"}
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={isVisible ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="h-11 pr-10 font-mono"
                  disabled={isSaving}
                />
                <button
                  type="button"
                  onClick={() => setIsVisible((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={isVisible ? "Hide password" : "Show password"}
                >
                  {isVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-11 gap-2 shrink-0"
                disabled={isSaving}
                onClick={() => {
                  setPassword(generatePassword())
                  setIsVisible(true)
                }}
              >
                <Shuffle className="w-4 h-4" />
                Generate
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Save with a password set and the share card opens next, with the QR code and these details ready to
              send. It is stored hashed after that and cannot be read back.
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <Button className="flex-1 font-bold" disabled={isSaving} onClick={() => save(true)}>
              {supplier.portal_enabled ? "Save changes" : "Give access"}
            </Button>
            {supplier.portal_enabled && (
              <Button
                variant="outline"
                className="hover:bg-red-500/10 hover:text-red-500"
                disabled={isSaving}
                onClick={() => save(false)}
              >
                Turn off
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
