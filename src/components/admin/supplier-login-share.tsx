"use client"

import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Copy, Download, Eye, QrCode, ShieldAlert, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { makeQr, qrToPath, qrViewBox } from "@/lib/utils/qr-code"
import { buildLoginCardBlob, buildLoginQrPayload, downloadBlob } from "@/lib/utils/login-card"
import { formatPhoneForWhatsApp, getSiteUrl } from "@/lib/utils/whatsapp"
import { useAdminStore } from "@/lib/admin-store"
import { useAdminUnlock } from "@/lib/admin-unlock"
import { inventorySuppliersService, type Supplier } from "@/lib/services/inventory.service"
import { toast } from "sonner"

interface Props {
  supplier: Supplier
  /** The password, when it was just typed. Otherwise the card fetches it. */
  password?: string | null
  onClose: () => void
}

/**
 * Gives one shop its portal login on a card they can scan, read or be sent.
 *
 * The password is shown, not hidden: the whole job of this card is handing
 * credentials to a shopkeeper, and one they cannot read is no use. It is read
 * back from the server, which asks the admin to confirm their own password once
 * per tab - after that every card opens with everything already on it.
 *
 * The QR is the login address and nothing else, so scanning it lands the shop on
 * the sign-in page. That also means a code on the wrong phone is not a way in -
 * the credentials are read off the card below it, not out of the code.
 */
export default function SupplierLoginShare({ supplier, password, onClose }: Props) {
  const [isSaving, setIsSaving] = useState(false)
  const [revealed, setRevealed] = useState<string | null>(null)

  // Either the one just set, or the one read back from the database.
  const shownPassword = password || revealed

  const portalUrl = `${getSiteUrl()}/supplier/login`
  // The address only - see buildLoginQrPayload for why nothing else belongs here.
  const qr = useMemo(() => makeQr(buildLoginQrPayload({ portalUrl }), "M"), [portalUrl])

  const adminEmail = useAdminStore((state) => state.user?.email)
  const unlockedPassword = useAdminUnlock((state) => state.password)
  const [isReading, setIsReading] = useState(false)

  /*
   * Opening the card reads the password straight away, using the admin password
   * already confirmed in this tab. That is what makes it "always shown": the
   * confirmation happens once per sign-in, not once per shop.
   */
  useEffect(() => {
    if (password || revealed) return
    if (!adminEmail || !unlockedPassword) return
    if (supplier.portal_password_recoverable === false) return

    let cancelled = false
    setIsReading(true)

    inventorySuppliersService
      .revealPortalPassword(supplier.id, { admin_email: adminEmail, admin_password: unlockedPassword })
      .then((result) => {
        if (!cancelled) setRevealed(result.data.password)
      })
      .catch((error: any) => {
        if (cancelled) return
        // The stored password stopped working - the admin changed theirs, or the
        // account was locked out. Drop it so the prompt comes back.
        if (error?.status === 401 || error?.status === 429) useAdminUnlock.getState().clear()
      })
      .finally(() => {
        if (!cancelled) setIsReading(false)
      })

    return () => {
      cancelled = true
    }
  }, [password, revealed, adminEmail, unlockedPassword, supplier.id, supplier.portal_password_recoverable])

  const message = [
    `${supplier.name} — IMobile Service Center shop portal`,
    "",
    `Link: ${portalUrl}`,
    `Email: ${supplier.email || "—"}`,
    `Password: ${shownPassword || "(ask us)"}`,
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
        password: shownPassword || null,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      {/* Backdrop clicks do not close this - the card is read off the screen
          while typing into WhatsApp, so it has to stay put. Use the X. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-border rounded-lg w-full max-w-md max-h-[92vh] overflow-y-auto p-6"
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
              {shownPassword ? (
                <p className="font-mono font-bold text-sm break-all">{shownPassword}</p>
              ) : (
                <p className="text-sm text-slate-500">{isReading ? "Reading..." : "Hidden"}</p>
              )}
            </div>
          </div>
        </div>

        {!shownPassword && !isReading && <RevealPassword supplier={supplier} onRevealed={setRevealed} />}

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

/**
 * Reads a shop's password back, once the administrator has proved they are the
 * administrator.
 *
 * The prompt is not decoration. Nothing on /api/inventory carries a session, so
 * the password behind this button is guarded by exactly one thing: the admin
 * password typed here, checked on the server against the admins table.
 */
function RevealPassword({
  supplier,
  onRevealed,
}: {
  supplier: Supplier
  onRevealed: (password: string) => void
}) {
  const adminEmail = useAdminStore((state) => state.user?.email)
  const unlock = useAdminUnlock((state) => state.unlock)
  const [isOpen, setIsOpen] = useState(false)
  const [adminPassword, setAdminPassword] = useState("")
  const [isChecking, setIsChecking] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const reveal = async () => {
    if (!adminEmail) {
      setProblem("Sign in to the admin panel again first.")
      return
    }
    if (!adminPassword.trim()) return

    setIsChecking(true)
    setProblem(null)
    try {
      const result = await inventorySuppliersService.revealPortalPassword(supplier.id, {
        admin_email: adminEmail,
        admin_password: adminPassword,
      })
      // Held for this tab only, so every other card opens with the password
      // already on it. Cleared on sign-out and on refresh - see admin-unlock.
      unlock(adminPassword)
      setAdminPassword("")
      setIsOpen(false)
      onRevealed(result.data.password)
    } catch (error: any) {
      setProblem(error.message || "Could not read that password back")
    } finally {
      setIsChecking(false)
    }
  }

  // The server already knows whether there is anything to read, so a shop whose
  // password was stored one-way is told that instead of being offered a button
  // that could only ever fail.
  if (supplier.portal_password_recoverable === false) {
    return (
      <p className="text-[11px] text-muted-foreground mt-3 flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          This shop's password was stored one-way, so it cannot be read back. Set a new one under <b>Manage</b> and
          this card will carry it.
        </span>
      </p>
    )
  }

  if (!isOpen) {
    return (
      <div className="mt-3">
        <Button variant="outline" size="sm" className="w-full gap-2 font-bold" onClick={() => setIsOpen(true)}>
          <Eye className="w-4 h-4" />
          Show password
        </Button>
        <p className="text-[11px] text-muted-foreground mt-2 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <span>You will be asked to confirm your own admin password.</span>
        </p>
      </div>
    )
  }

  return (
    <div className="mt-3 rounded-lg border border-border p-3">
      <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
        Your admin password
      </label>
      <div className="flex gap-2">
        <Input
          type="password"
          autoFocus
          value={adminPassword}
          onChange={(e) => setAdminPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && reveal()}
          placeholder={adminEmail || "Signed out"}
          className="flex-1"
          disabled={isChecking}
        />
        <Button className="font-bold shrink-0" disabled={isChecking || !adminPassword.trim()} onClick={reveal}>
          {isChecking ? "Checking..." : "Show"}
        </Button>
      </div>
      {problem && <p className="text-[11px] text-red-500 mt-2">{problem}</p>}
      <p className="text-[11px] text-muted-foreground mt-2">
        Asked once per sign-in — after this, every shop's card opens with the password already on it.
      </p>
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
