"use client"

import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Copy, Download, QrCode, ShieldAlert, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { makeQr, qrToPath, qrViewBox } from "@/lib/utils/qr-code"
import { buildLoginCardBlob, downloadBlob } from "@/lib/utils/login-card"
import { formatPhoneForWhatsApp, getSiteUrl } from "@/lib/utils/whatsapp"
import type { Supplier } from "@/lib/services/inventory.service"
import { toast } from "sonner"

interface Props {
  supplier: Supplier
  /**
   * The plaintext password, if it was just typed. Stored passwords are hashed
   * and cannot be read back, so this is null whenever the card is opened
   * outside the moment one was set.
   */
  password?: string | null
  onClose: () => void
}

/**
 * Gives one shop its portal login on a card they can scan, read or be sent.
 *
 * The QR is only the login address - the same for every shop - so a code that
 * ends up on the wrong phone is not a way in. The email and password are text
 * below it, which is what the shopkeeper types once and what an admin reads out
 * over the phone when they lose it.
 */
export default function SupplierLoginShare({ supplier, password, onClose }: Props) {
  const [isSaving, setIsSaving] = useState(false)

  const portalUrl = `${getSiteUrl()}/supplier/login`
  const qr = useMemo(() => makeQr(portalUrl, "M"), [portalUrl])

  const message = [
    `${supplier.name} — IMobile Service Center shop portal`,
    "",
    `Link: ${portalUrl}`,
    `Email: ${supplier.email || "—"}`,
    `Password: ${password || "(ask us)"}`,
    "",
    "Open the link, sign in with the email and password above, and you can order straight from us.",
  ].join("\n")

  const whatsappHref = supplier.phone
    ? `https://wa.me/${formatPhoneForWhatsApp(supplier.phone).replace("+", "")}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`

  const copyDetails = async () => {
    try {
      await navigator.clipboard.writeText(message)
      toast.success("Login details copied")
    } catch {
      toast.error("Could not copy — select the text and copy it by hand")
    }
  }

  const downloadCard = async () => {
    setIsSaving(true)
    try {
      const blob = await buildLoginCardBlob({
        shopName: supplier.name,
        portalUrl,
        email: supplier.email || "",
        password: password || null,
      })
      const slug = supplier.name
        .replace(/[^\w]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase()
      downloadBlob(blob, `${slug || "shop"}-portal-login.png`)
    } catch (error: any) {
      toast.error(error.message || "Could not save the card")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-border rounded-lg w-full max-w-md max-h-[92vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
              <QrCode className="w-5 h-5 text-blue-500" />
            </div>
            <div className="min-w-0">
              <h2 className="font-black tracking-tight">Share login</h2>
              <p className="text-xs text-muted-foreground truncate">{supplier.name}</p>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Always light: this is the thing being handed to somebody else. */}
        <div className="rounded-xl border border-border bg-white p-5 text-slate-900">
          <div className="flex justify-center">
            <svg
              viewBox={qrViewBox(qr)}
              className="w-52 h-52"
              shapeRendering="crispEdges"
              role="img"
              aria-label={`QR code for ${portalUrl}`}
            >
              <rect width="100%" height="100%" fill="#ffffff" />
              <path d={qrToPath(qr)} fill="#0f172a" />
            </svg>
          </div>

          <p className="text-center text-[11px] font-semibold text-slate-500 mt-2">Scan to open the portal</p>
          <p className="text-center text-xs font-mono break-all mt-1">{portalUrl}</p>

          <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Email</p>
              <p className="font-mono font-bold text-sm break-all">
                {supplier.email || <span className="text-red-600">No email set</span>}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Password</p>
              {password ? (
                <p className="font-mono font-bold text-sm break-all">{password}</p>
              ) : (
                <p className="text-sm text-slate-500">Not shown — set a new one to include it</p>
              )}
            </div>
          </div>
        </div>

        {!password && (
          <div className="flex items-start gap-2 mt-3 text-[11px] text-muted-foreground">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              Passwords are stored hashed and cannot be read back. Open <b>Manage</b> on this shop and set a new
              password to put one on the card.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 mt-4">
          <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="col-span-2">
            <Button className="w-full gap-2 font-bold bg-green-600 hover:bg-green-700 text-white">
              <WhatsAppIcon className="w-4 h-4" />
              Send on WhatsApp
            </Button>
          </a>
          <Button variant="outline" className="gap-2 font-bold" disabled={isSaving} onClick={downloadCard}>
            <Download className="w-4 h-4" />
            {isSaving ? "Saving..." : "Download"}
          </Button>
          <Button variant="outline" className="gap-2 font-bold" onClick={copyDetails}>
            <Copy className="w-4 h-4" />
            Copy details
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground mt-3">
          WhatsApp opens with the message ready — you still press send.
          {supplier.phone ? ` It is addressed to ${supplier.phone}.` : " Pick the chat yourself; this shop has no phone number saved."}
        </p>
      </motion.div>
    </div>
  )
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.174.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.174-.297-.019-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 016.988 2.896 9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.886-9.885 9.886m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  )
}
