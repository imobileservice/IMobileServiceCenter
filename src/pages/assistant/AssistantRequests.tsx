"use client"

import { useEffect, useState } from "react"
import { Clock, CheckCircle2, XCircle, AlertTriangle, Ban, ClipboardList } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import AssistantLayout from "@/components/assistant/assistant-layout"
import { assistantService, type AssistantRequest } from "@/lib/services/assistant.service"

const STATUS_META: Record<
  AssistantRequest["status"],
  { label: string; icon: any; className: string }
> = {
  pending: {
    label: "Waiting for approval",
    icon: Clock,
    className: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  approved: {
    label: "Approved and applied",
    icon: CheckCircle2,
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  rejected: {
    label: "Declined",
    icon: XCircle,
    className: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  },
  failed: {
    label: "Approved but could not be applied",
    icon: AlertTriangle,
    className: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  },
  cancelled: {
    label: "Withdrawn",
    icon: Ban,
    className: "border-border bg-muted text-muted-foreground",
  },
}

/**
 * The assistant's own queue: what they have asked for and what came of it.
 *
 * Each pending row shows the proposed values against the current ones, so an
 * assistant can see exactly what is waiting - and withdraw it if they changed
 * their mind before an administrator looked.
 */
export default function AssistantRequestsPage() {
  const [requests, setRequests] = useState<AssistantRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>("")

  const load = async (status?: string) => {
    setLoading(true)
    try {
      setRequests(await assistantService.requests(status || undefined))
    } catch (error: any) {
      toast.error(error?.message || "Could not load your requests")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(filter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  const cancel = async (request: AssistantRequest) => {
    try {
      await assistantService.cancelRequest(request.id)
      toast.success("Request withdrawn")
      load(filter)
    } catch (error: any) {
      toast.error(error?.message || "Could not withdraw the request")
    }
  }

  return (
    <AssistantLayout
      title="My requests"
      description="Edits and deletions you have sent to the administrator."
    >
      <div className="mb-5 flex flex-wrap gap-2">
        {[
          { value: "", label: "All" },
          { value: "pending", label: "Waiting" },
          { value: "approved", label: "Approved" },
          { value: "rejected", label: "Declined" },
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
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-2xl border border-border bg-card" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <ClipboardList className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Nothing here</p>
          <p className="mt-1 text-xs text-muted-foreground">
            When you request an edit or a deletion, it will appear here until the administrator reviews it.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <RequestCard key={request.id} request={request} onCancel={() => cancel(request)} />
          ))}
        </div>
      )}
    </AssistantLayout>
  )
}

function RequestCard({
  request,
  onCancel,
}: {
  request: AssistantRequest
  onCancel: () => void
}) {
  const meta = STATUS_META[request.status]
  const Icon = meta.icon

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            {request.action === "delete" ? "Delete" : "Edit"}{" "}
            <span className="text-muted-foreground">{request.resource}</span>{" "}
            {request.resource_label}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Sent {new Date(request.created_at).toLocaleString()}
          </p>
        </div>

        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${meta.className}`}
        >
          <Icon className="h-3.5 w-3.5" />
          {meta.label}
        </span>
      </div>

      {request.note && (
        <p className="mt-3 rounded-lg bg-muted/40 p-3 text-xs">
          <span className="font-medium">Your note: </span>
          {request.note}
        </p>
      )}

      {request.action === "update" && request.payload && (
        <ChangeTable payload={request.payload} before={request.before_snapshot} />
      )}

      {request.review_note && (
        <p className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-xs">
          <span className="font-medium">
            {request.reviewed_by_email ? `${request.reviewed_by_email}: ` : "Administrator: "}
          </span>
          {request.review_note}
        </p>
      )}

      {request.apply_error && (
        <p className="mt-3 rounded-lg border border-orange-500/30 bg-orange-500/10 p-3 text-xs text-orange-600 dark:text-orange-400">
          {request.apply_error}
        </p>
      )}

      {request.status === "pending" && (
        <div className="mt-4 flex justify-end border-t border-border pt-4">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Withdraw request
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * Only the fields that would actually change, old value against new. Showing
 * the whole payload buries the one line that matters under twenty that do not.
 */
export function ChangeTable({
  payload,
  before,
}: {
  payload: Record<string, any>
  before: Record<string, any> | null
}) {
  const changed = Object.entries(payload).filter(([key, value]) => {
    if (value === undefined) return false
    const previous = before?.[key]
    return JSON.stringify(previous ?? null) !== JSON.stringify(value ?? null)
  })

  if (changed.length === 0) {
    return (
      <p className="mt-3 text-xs text-muted-foreground">
        No field differs from the current values.
      </p>
    )
  }

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[420px] text-xs">
        <thead>
          <tr className="border-b border-border text-left uppercase tracking-wide text-muted-foreground">
            <th className="pb-1.5 font-medium">Field</th>
            <th className="pb-1.5 font-medium">Currently</th>
            <th className="pb-1.5 font-medium">Proposed</th>
          </tr>
        </thead>
        <tbody>
          {changed.map(([key, value]) => (
            <tr key={key} className="border-b border-border/50 last:border-0">
              <td className="py-1.5 pr-3 font-medium">{key.replace(/_/g, " ")}</td>
              <td className="py-1.5 pr-3 text-muted-foreground">{display(before?.[key])}</td>
              <td className="py-1.5 font-medium">{display(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function display(value: any) {
  if (value === null || value === undefined || value === "") return "—"
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}
