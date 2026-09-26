"use client"

import type React from "react"
import { useEffect, useState } from "react"
import {
  UserPlus,
  ShieldCheck,
  ShieldOff,
  MailCheck,
  MailWarning,
  KeyRound,
  Trash2,
  LogOut,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Ban,
  Activity,
  Users,
  ClipboardList,
  Copy,
  RefreshCcw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import AdminLayout from "@/components/admin-layout"
import {
  assistantAdminService,
  type AssistantAccount,
  type AssistantRequest,
} from "@/lib/services/assistant.service"
import { Modal, Field } from "@/pages/assistant/AssistantProducts"
import { ChangeTable } from "@/pages/assistant/AssistantRequests"

type Tab = "accounts" | "approvals" | "activity"

/**
 * Assistant Admins - the administrator's control panel for the limited role.
 *
 * Three things live here, because they are the three questions an owner
 * actually asks about a member of staff with a login:
 *
 *   Accounts   who exists, what may they do, and can I switch them off now
 *   Approvals  what are they waiting on me to allow
 *   Activity   what have they been doing, including capture attempts
 */
export default function AdminAssistantsPage() {
  const [tab, setTab] = useState<Tab>("accounts")
  const [pendingCount, setPendingCount] = useState(0)

  return (
    <AdminLayout>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Assistant Admins</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Limited accounts that can add products, categories and stock. Everything they edit or delete
          waits for your approval.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap gap-2 border-b border-border">
        <TabButton active={tab === "accounts"} onClick={() => setTab("accounts")} icon={Users}>
          Accounts
        </TabButton>
        <TabButton active={tab === "approvals"} onClick={() => setTab("approvals")} icon={ClipboardList}>
          Approvals
          {pendingCount > 0 && (
            <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {pendingCount}
            </span>
          )}
        </TabButton>
        <TabButton active={tab === "activity"} onClick={() => setTab("activity")} icon={Activity}>
          Activity
        </TabButton>
      </div>

      {tab === "accounts" && <AccountsTab />}
      {tab === "approvals" && <ApprovalsTab onPendingCount={setPendingCount} />}
      {tab === "activity" && <ActivityTab />}
    </AdminLayout>
  )
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: any
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  )
}

/* ================================================================== */
/* Accounts                                                            */
/* ================================================================== */

function AccountsTab() {
  const [accounts, setAccounts] = useState<AssistantAccount[]>([])
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const response = await assistantAdminService.list()
      setAccounts(response.data)
      setLabels(response.permissionLabels)
    } catch (error: any) {
      toast.error(error?.message || "Could not load assistant accounts")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <>
      <div className="mb-5 flex justify-end">
        <Button onClick={() => setCreating(true)} className="gap-2">
          <UserPlus className="h-4 w-4" />
          Create assistant admin
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-2xl border border-border bg-card" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <Users className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No assistant admins yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Create one to let someone add products and manage stock without giving them access to
            orders, customers, revenue or settings.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              labels={labels}
              onChanged={load}
              onOpen={() => setDetailId(account.id)}
            />
          ))}
        </div>
      )}

      {creating && (
        <CreateAssistantDialog
          labels={labels}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false)
            load()
          }}
        />
      )}

      {detailId && (
        <AssistantDetailDialog
          id={detailId}
          onClose={() => setDetailId(null)}
          onChanged={load}
        />
      )}
    </>
  )
}

function AccountCard({
  account,
  labels,
  onChanged,
  onOpen,
}: {
  account: AssistantAccount
  labels: Record<string, string>
  onChanged: () => void
  onOpen: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const run = async (action: () => Promise<any>, success: string) => {
    setBusy(true)
    try {
      const result = await action()
      toast.success(result?.message || success)
      onChanged()
    } catch (error: any) {
      toast.error(error?.message || "That did not work")
    } finally {
      setBusy(false)
    }
  }

  const grantedCount = Object.values(account.permissions || {}).filter(Boolean).length

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={onOpen} className="truncate font-semibold hover:underline">
              {account.name || account.email}
            </button>
            <StatusPill account={account} />
            {account.is_online && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Signed in
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{account.email}</p>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span>{grantedCount} permission{grantedCount === 1 ? "" : "s"}</span>
            <span>
              Last signed in{" "}
              {account.last_login_at ? new Date(account.last_login_at).toLocaleString() : "never"}
            </span>
            {account.pending_requests > 0 && (
              <span className="font-medium text-amber-600 dark:text-amber-400">
                {account.pending_requests} awaiting approval
              </span>
            )}
            {account.must_change_password && (
              <span className="font-medium text-amber-600 dark:text-amber-400">
                Must set a new password
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={onOpen}>
            Manage
          </Button>

          {!account.email_verified && (
            <IconAction
              icon={MailWarning}
              title="Resend the confirmation email"
              disabled={busy}
              onClick={() =>
                run(() => assistantAdminService.resendVerification(account.id), "Confirmation resent")
              }
            />
          )}

          <IconAction
            icon={KeyRound}
            title="Set a new password"
            disabled={busy}
            onClick={() => setResetting(true)}
          />

          <IconAction
            icon={LogOut}
            title="Sign out of every device"
            disabled={busy}
            onClick={() =>
              run(() => assistantAdminService.revokeSessions(account.id), "Signed out everywhere")
            }
          />

          {account.status === "suspended" ? (
            <IconAction
              icon={ShieldCheck}
              title="Re-activate this account"
              tone="ok"
              disabled={busy}
              onClick={() =>
                run(() => assistantAdminService.setStatus(account.id, "active"), "Account re-activated")
              }
            />
          ) : (
            <IconAction
              icon={ShieldOff}
              title="Suspend this account"
              tone="warn"
              disabled={busy || account.status === "pending"}
              onClick={() =>
                run(
                  () => assistantAdminService.setStatus(account.id, "suspended"),
                  "Account suspended and signed out"
                )
              }
            />
          )}

          <IconAction
            icon={Trash2}
            title="Delete this account"
            tone="bad"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
          />
        </div>
      </div>

      {resetting && (
        <PasswordDialog
          title={`Set a new password for ${account.email}`}
          onClose={() => setResetting(false)}
          onSubmit={async (password) => {
            await run(
              () => assistantAdminService.resetPassword(account.id, password),
              "Password set and sessions ended"
            )
            setResetting(false)
          }}
        />
      )}

      {confirmDelete && (
        <Modal title="Delete this assistant admin?" onClose={() => setConfirmDelete(false)}>
          <p className="text-sm">
            <span className="font-semibold">{account.email}</span> will lose access immediately. Their
            pending requests are discarded; products and stock they created are untouched.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">This cannot be undone.</p>
          <div className="mt-5 flex gap-3">
            <Button variant="outline" onClick={() => setConfirmDelete(false)} className="flex-1">
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={busy}
              onClick={async () => {
                await run(() => assistantAdminService.remove(account.id), "Account deleted")
                setConfirmDelete(false)
              }}
            >
              Delete account
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function StatusPill({ account }: { account: AssistantAccount }) {
  if (account.status === "suspended") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400">
        <ShieldOff className="h-3 w-3" />
        Suspended
      </span>
    )
  }

  if (!account.email_verified) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
        <MailWarning className="h-3 w-3" />
        Email not confirmed
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
      <MailCheck className="h-3 w-3" />
      Active
    </span>
  )
}

function IconAction({
  icon: Icon,
  title,
  onClick,
  disabled,
  tone = "default",
}: {
  icon: any
  title: string
  onClick: () => void
  disabled?: boolean
  tone?: "default" | "ok" | "warn" | "bad"
}) {
  const colour =
    tone === "ok"
      ? "text-emerald-500 hover:bg-emerald-500/10"
      : tone === "warn"
        ? "text-amber-500 hover:bg-amber-500/10"
        : tone === "bad"
          ? "text-red-500 hover:bg-red-500/10"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"

  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:opacity-40 ${colour}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}

/* ------------------------------------------------------------------ */

/**
 * Generates a password that satisfies the server's policy without the
 * administrator having to invent one - the alternative in practice is
 * "Shop@1234" on every account.
 */
function suggestPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?"
  const bytes = new Uint32Array(18)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("")
}

function CreateAssistantDialog({
  labels,
  onClose,
  onCreated,
}: {
  labels: Record<string, string>
  onClose: () => void
  onCreated: () => void
}) {
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [whatsapp, setWhatsapp] = useState("")
  const [password, setPassword] = useState(() => suggestPassword())
  const [permissions, setPermissions] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(Object.keys(labels).map((key) => [key, true]))
  )
  const [saving, setSaving] = useState(false)

  // The label map arrives with the account list; if this dialog opened first,
  // fill the permission set in as soon as it lands.
  useEffect(() => {
    if (Object.keys(labels).length && Object.keys(permissions).length === 0) {
      setPermissions(Object.fromEntries(Object.keys(labels).map((key) => [key, true])))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labels])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const response = await assistantAdminService.create({
        email: email.trim(),
        password,
        name: name.trim() || undefined,
        whatsapp: whatsapp.trim() || undefined,
        permissions,
      })
      toast.success(response.message, { duration: 8000 })
      if (!response.emailDelivered) {
        toast.warning("The confirmation email did not send. Use “Resend confirmation” on the account.", {
          duration: 10000,
        })
      }
      onCreated()
    } catch (error: any) {
      toast.error(error?.message || "Could not create the account")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Create an assistant admin" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          A confirmation link is emailed to this address. The account cannot sign in until that link is
          opened, so a mistyped address produces an account nobody can use rather than one someone else
          can.
        </div>

        <Field label="Email address" required>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="assistant@example.com"
            required
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name" />
          </Field>
          <Field label="WhatsApp (optional)">
            <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+94…" />
          </Field>
        </div>

        <Field label="Password" required>
          <div className="flex gap-2">
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="font-mono"
              required
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              title="Generate another"
              onClick={() => setPassword(suggestPassword())}
            >
              <RefreshCcw className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              title="Copy"
              onClick={() => {
                navigator.clipboard?.writeText(password)
                toast.success("Password copied")
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            At least 12 characters using three of: lower case, upper case, numbers, symbols. Give it to
            them in person — it is never emailed.
          </p>
        </Field>

        <Field label="What may they do?">
          <div className="space-y-1.5 rounded-lg border border-border p-3">
            {Object.entries(labels).map(([key, label]) => (
              <label key={key} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={permissions[key] === true}
                  onChange={(e) =>
                    setPermissions((prev) => ({ ...prev, [key]: e.target.checked }))
                  }
                  className="mt-0.5 h-4 w-4 rounded border-input"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </Field>

        <div className="flex gap-3 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" disabled={saving} className="flex-1">
            {saving ? "Creating..." : "Create account"}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function PasswordDialog({
  title,
  onClose,
  onSubmit,
}: {
  title: string
  onClose: () => void
  onSubmit: (password: string) => Promise<void>
}) {
  const [password, setPassword] = useState(() => suggestPassword())
  const [saving, setSaving] = useState(false)

  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm text-muted-foreground">
        Every session on this account ends immediately, and they will have to choose their own password
        the next time they sign in.
      </p>

      <div className="mt-4 flex gap-2">
        <Input value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" />
        <Button variant="outline" size="icon" onClick={() => setPassword(suggestPassword())}>
          <RefreshCcw className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            navigator.clipboard?.writeText(password)
            toast.success("Password copied")
          }}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-5 flex gap-3">
        <Button variant="outline" onClick={onClose} className="flex-1">
          Cancel
        </Button>
        <Button
          className="flex-1"
          disabled={saving}
          onClick={async () => {
            setSaving(true)
            try {
              await onSubmit(password)
            } finally {
              setSaving(false)
            }
          }}
        >
          {saving ? "Saving..." : "Set password"}
        </Button>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */

function AssistantDetailDialog({
  id,
  onClose,
  onChanged,
}: {
  id: string
  onClose: () => void
  onChanged: () => void
}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof assistantAdminService.get>> | null>(null)
  const [permissions, setPermissions] = useState<Record<string, boolean>>({})
  const [name, setName] = useState("")
  const [whatsapp, setWhatsapp] = useState("")
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try {
      const response = await assistantAdminService.get(id)
      setData(response)
      setPermissions(response.data.assistant.permissions || {})
      setName(response.data.assistant.name || "")
      setWhatsapp(response.data.assistant.whatsapp || "")
    } catch (error: any) {
      toast.error(error?.message || "Could not load this account")
      onClose()
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const save = async () => {
    setSaving(true)
    try {
      await assistantAdminService.update(id, { name, whatsapp, permissions })
      toast.success("Saved. Changes apply on their next page view.")
      onChanged()
      load()
    } catch (error: any) {
      toast.error(error?.message || "Could not save")
    } finally {
      setSaving(false)
    }
  }

  if (!data) {
    return (
      <Modal title="Assistant admin" onClose={onClose}>
        <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
      </Modal>
    )
  }

  const { assistant, audit, requests, sessions } = data.data

  return (
    <Modal title={assistant.name || assistant.email} onClose={onClose}>
      <div className="space-y-6">
        <section>
          <h3 className="text-sm font-semibold">Account</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="WhatsApp">
              <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
            </Field>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {assistant.email} · created {new Date(assistant.created_at).toLocaleDateString()}
            {assistant.email_verified_at
              ? ` · confirmed ${new Date(assistant.email_verified_at).toLocaleDateString()}`
              : " · email not confirmed"}
          </p>
        </section>

        <section>
          <h3 className="text-sm font-semibold">Permissions</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Unticking one takes effect on their next page view, and the matching API route refuses them
            straight away.
          </p>
          <div className="mt-3 space-y-1.5 rounded-lg border border-border p-3">
            {Object.entries(data.permissionLabels).map(([key, label]) => (
              <label key={key} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={permissions[key] === true}
                  onChange={(e) => setPermissions((prev) => ({ ...prev, [key]: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 rounded border-input"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <Button onClick={save} disabled={saving} className="mt-3 w-full sm:w-auto">
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </section>

        <section>
          <h3 className="text-sm font-semibold">Signed in on</h3>
          {sessions.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">No open sessions.</p>
          ) : (
            <div className="mt-2 space-y-1.5">
              {sessions.map((session: any) => (
                <div key={session.id} className="rounded-lg bg-muted/40 p-2.5 text-xs">
                  <p className="font-medium">{session.ip_address || "Unknown address"}</p>
                  <p className="truncate text-muted-foreground">{session.user_agent || "Unknown device"}</p>
                  <p className="text-muted-foreground">
                    Last seen {new Date(session.last_seen_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="text-sm font-semibold">Their requests</h3>
          {requests.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">None yet.</p>
          ) : (
            <div className="mt-2 space-y-1.5">
              {requests.slice(0, 20).map((request) => (
                <div key={request.id} className="rounded-lg bg-muted/40 p-2.5 text-xs">
                  <span className="font-medium">
                    {request.action === "delete" ? "Delete" : "Edit"} {request.resource}{" "}
                    {request.resource_label}
                  </span>
                  <span className="ml-2 text-muted-foreground">
                    {request.status} · {new Date(request.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="text-sm font-semibold">Activity</h3>
          <AuditList entries={audit} />
        </section>
      </div>
    </Modal>
  )
}

/* ================================================================== */
/* Approvals                                                           */
/* ================================================================== */

const REQUEST_STATUS: Record<
  AssistantRequest["status"],
  { label: string; icon: any; className: string }
> = {
  pending: { label: "Waiting", icon: Clock, className: "text-amber-600 dark:text-amber-400" },
  approved: { label: "Approved", icon: CheckCircle2, className: "text-emerald-600 dark:text-emerald-400" },
  rejected: { label: "Declined", icon: XCircle, className: "text-red-600 dark:text-red-400" },
  failed: { label: "Failed to apply", icon: AlertTriangle, className: "text-orange-600 dark:text-orange-400" },
  cancelled: { label: "Withdrawn", icon: Ban, className: "text-muted-foreground" },
}

function ApprovalsTab({ onPendingCount }: { onPendingCount: (count: number) => void }) {
  const [requests, setRequests] = useState<AssistantRequest[]>([])
  const [filter, setFilter] = useState("pending")
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})

  const load = async (status: string) => {
    setLoading(true)
    try {
      const data = await assistantAdminService.requests(status || undefined)
      setRequests(data)
      if (status === "pending") onPendingCount(data.length)
    } catch (error: any) {
      toast.error(error?.message || "Could not load the queue")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(filter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  // Keep the tab badge honest even while another filter is showing.
  useEffect(() => {
    if (filter !== "pending") {
      assistantAdminService
        .requests("pending")
        .then((data) => onPendingCount(data.length))
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  const decide = async (request: AssistantRequest, approve: boolean) => {
    setBusyId(request.id)
    try {
      const note = notes[request.id]
      const response = approve
        ? await assistantAdminService.approve(request.id, note)
        : await assistantAdminService.reject(request.id, note)
      toast.success(response.message || (approve ? "Approved" : "Declined"))
      load(filter)
    } catch (error: any) {
      toast.error(error?.message || "That did not work")
      load(filter)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap gap-2">
        {[
          { value: "pending", label: "Waiting" },
          { value: "approved", label: "Approved" },
          { value: "rejected", label: "Declined" },
          { value: "", label: "All" },
        ].map((option) => (
          <button
            key={option.value}
            onClick={() => setFilter(option.value)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === option.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-40 animate-pulse rounded-2xl border border-border bg-card" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
          <p className="mt-3 text-sm font-medium">Nothing waiting</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Assistant edits and deletions will appear here for you to approve.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => {
            const meta = REQUEST_STATUS[request.status]
            const Icon = meta.icon

            return (
              <div key={request.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {request.action === "delete" ? "Delete" : "Edit"}{" "}
                      <span className="text-muted-foreground">{request.resource}</span>{" "}
                      {request.resource_label}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Asked by {request.assistant_email} ·{" "}
                      {new Date(request.created_at).toLocaleString()}
                    </p>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${meta.className}`}>
                    <Icon className="h-3.5 w-3.5" />
                    {meta.label}
                  </span>
                </div>

                {request.note && (
                  <p className="mt-3 rounded-lg bg-muted/40 p-3 text-xs">
                    <span className="font-medium">Their reason: </span>
                    {request.note}
                  </p>
                )}

                {request.action === "update" && request.payload ? (
                  <ChangeTable payload={request.payload} before={request.before_snapshot} />
                ) : request.action === "delete" ? (
                  <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
                    Approving this deletes the {request.resource} permanently.
                  </p>
                ) : null}

                {request.apply_error && (
                  <p className="mt-3 rounded-lg border border-orange-500/30 bg-orange-500/10 p-3 text-xs text-orange-600 dark:text-orange-400">
                    {request.apply_error}
                  </p>
                )}

                {request.review_note && request.status !== "pending" && (
                  <p className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-xs">
                    <span className="font-medium">Your note: </span>
                    {request.review_note}
                  </p>
                )}

                {request.status === "pending" && (
                  <div className="mt-4 space-y-3 border-t border-border pt-4">
                    <Input
                      value={notes[request.id] || ""}
                      onChange={(e) =>
                        setNotes((prev) => ({ ...prev, [request.id]: e.target.value }))
                      }
                      placeholder="Note for them (optional) — sent with the decision"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={busyId === request.id}
                        onClick={() => decide(request, true)}
                        className="gap-1.5"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Approve and apply
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === request.id}
                        onClick={() => decide(request, false)}
                        className="gap-1.5"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Decline
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

/* ================================================================== */
/* Activity                                                            */
/* ================================================================== */

function ActivityTab() {
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      setEntries(await assistantAdminService.activity(400))
    } catch (error: any) {
      toast.error(error?.message || "Could not load the activity log")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const captureAttempts = entries.filter((entry) => String(entry.action).startsWith("screenshot."))

  return (
    <>
      <div className="mb-5 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Everything assistant accounts have done, newest first.
        </p>
        <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
          <RefreshCcw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {captureAttempts.length > 0 && (
        <div className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/5 p-4">
          <p className="text-sm font-semibold text-red-600 dark:text-red-400">
            {captureAttempts.length} screen-capture attempt
            {captureAttempts.length === 1 ? "" : "s"} recorded
          </p>
          <p className="mt-1 text-xs text-red-600/80 dark:text-red-400/80">
            A browser cannot stop a screenshot — it can only notice and record one. The most recent was
            by {captureAttempts[0].actor_email} on{" "}
            {new Date(captureAttempts[0].created_at).toLocaleString()}.
          </p>
        </div>
      )}

      {loading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 10 }).map((_, index) => (
            <div key={index} className="h-12 animate-pulse rounded-lg border border-border bg-card" />
          ))}
        </div>
      ) : (
        <AuditList entries={entries} />
      )}
    </>
  )
}

function AuditList({ entries }: { entries: any[] }) {
  if (!entries || entries.length === 0) {
    return <p className="mt-2 text-xs text-muted-foreground">Nothing recorded yet.</p>
  }

  return (
    <div className="mt-2 space-y-1.5">
      {entries.map((entry) => {
        const isCapture = String(entry.action).startsWith("screenshot.")
        const failed = entry.success === false

        return (
          <div
            key={entry.id}
            className={`rounded-lg border p-2.5 text-xs ${
              isCapture
                ? "border-red-500/30 bg-red-500/5"
                : failed
                  ? "border-amber-500/30 bg-amber-500/5"
                  : "border-border bg-muted/30"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{humanAction(entry.action)}</span>
              <span className="text-muted-foreground">
                {new Date(entry.created_at).toLocaleString()}
              </span>
            </div>
            <p className="mt-0.5 truncate text-muted-foreground">
              {entry.actor_email || "unknown"}
              {entry.resource ? ` · ${entry.resource}` : ""}
              {entry.detail?.name ? ` · ${entry.detail.name}` : ""}
              {entry.detail?.product ? ` · ${entry.detail.product}` : ""}
              {entry.detail?.from !== undefined && entry.detail?.to !== undefined
                ? ` · ${entry.detail.from} → ${entry.detail.to}`
                : ""}
              {entry.ip_address ? ` · ${entry.ip_address}` : ""}
            </p>
          </div>
        )
      })}
    </div>
  )
}

function humanAction(action: string) {
  const map: Record<string, string> = {
    "login.success": "Signed in",
    "login.failed": "Failed sign-in",
    "login.bad_code": "Wrong verification code",
    "login.code_sent": "Verification code sent",
    logout: "Signed out",
    "email.verified": "Confirmed their email",
    "password.changed": "Changed their password",
    "password.change_failed": "Failed password change",
    "product.create": "Added a product",
    "category.create": "Added a category",
    "stock.adjust": "Adjusted stock",
    "product.update_requested": "Requested a product edit",
    "product.delete_requested": "Requested a product deletion",
    "category.update_requested": "Requested a category edit",
    "category.delete_requested": "Requested a category deletion",
    "request.cancelled": "Withdrew a request",
    "permission.denied": "Blocked: no permission",
    "access.denied": "Blocked: administrator-only page",
    "screenshot.keypress": "Screenshot key pressed",
    "screenshot.print": "Tried to print",
    "screenshot.capture_api": "Tried to share the screen",
    "screenshot.clipboard": "Screenshot copied to clipboard",
    "copy.blocked": "Copy blocked",
    "contextmenu.blocked": "Right-click blocked",
    "screen.hidden": "Left the page",
    "assistant.created": "Account created",
    "assistant.updated": "Account updated",
    "assistant.suspended": "Account suspended",
    "assistant.reactivated": "Account re-activated",
    "assistant.deleted": "Account deleted",
    "assistant.password_reset": "Password reset by an administrator",
    "assistant.sessions_revoked": "Signed out of every device",
    "assistant.verification_resent": "Confirmation email resent",
  }

  return map[action] || action.replace(/[._]/g, " ")
}
