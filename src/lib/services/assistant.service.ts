/**
 * Every call the assistant panel makes.
 *
 * One module so there is one place to see the whole surface an assistant can
 * reach - and so it stays obvious that nothing here touches orders, customers,
 * sales or suppliers. The session token is attached by the fetch wrapper in
 * lib/session-fetch.ts; nothing in this file handles it.
 */
import { getApiUrl } from "@/lib/utils/api"

const BASE = "/api/assistant"

async function call<T = any>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(getApiUrl(`${BASE}${endpoint}`), {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  })

  const body = await response.json().catch(() => ({}))

  if (!response.ok) {
    const error: any = new Error(body.error || `Request failed (${response.status})`)
    error.status = response.status
    // Callers distinguish "you may not" from "sign in again" - see
    // AssistantLayout, which sends a lapsed session back to the login screen.
    error.code = body.code
    throw error
  }

  return body
}

export interface AssistantOverview {
  totals: {
    products: number
    categories: number
    activeCategories: number
    quantity: number
    retailStockValue: number
    costStockValue: number
    lowStock: number
    outOfStock: number
    healthy: number
    uncategorised: number
    missingStockRow: number
    pendingRequests: number
  }
  shopSplit: { meegoda: number; padukka: number; padukka_new: number }
  categoryBreakdown: Array<{
    id: string
    name: string
    slug: string
    is_active: boolean
    product_count: number
    quantity: number
  }>
  lowStockItems: Array<{
    id: string
    name: string
    brand: string | null
    quantity: number
    threshold: number
  }>
  recentProducts: Array<{
    id: string
    name: string
    brand: string | null
    created_at: string
    quantity: number
  }>
}

export interface AssistantRequest {
  id: string
  assistant_id: string
  assistant_email: string
  action: "update" | "delete"
  resource: "product" | "category"
  resource_id: string
  resource_label: string | null
  payload: Record<string, any> | null
  before_snapshot: Record<string, any> | null
  note: string | null
  status: "pending" | "approved" | "rejected" | "failed" | "cancelled"
  review_note: string | null
  reviewed_by_email: string | null
  reviewed_at: string | null
  apply_error: string | null
  created_at: string
}

export const assistantService = {
  /* --- session --- */
  session: () => call("/session"),

  changePassword: (currentPassword: string, newPassword: string) =>
    call<{ token?: string }>("/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  verifyEmail: (token: string) =>
    call<{ message: string }>("/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  /* --- dashboard --- */
  overview: () => call<{ data: AssistantOverview }>("/overview").then((r) => r.data),

  /* --- products --- */
  products: (params?: { search?: string; category_id?: string; limit?: number }) => {
    const query = new URLSearchParams()
    if (params?.search) query.set("search", params.search)
    if (params?.category_id) query.set("category_id", params.category_id)
    if (params?.limit) query.set("limit", String(params.limit))
    const suffix = query.toString() ? `?${query}` : ""
    return call<{ data: any[] }>(`/products${suffix}`).then((r) => r.data)
  },

  createProduct: (payload: Record<string, any>) =>
    call<{ data: any }>("/products", { method: "POST", body: JSON.stringify(payload) }).then(
      (r) => r.data
    ),

  requestProductEdit: (id: string, payload: Record<string, any>, note?: string) =>
    call<{ data: AssistantRequest; message: string }>(`/products/${id}/edit-request`, {
      method: "POST",
      body: JSON.stringify({ payload, note }),
    }),

  requestProductDelete: (id: string, note?: string) =>
    call<{ data: AssistantRequest; message: string }>(`/products/${id}/delete-request`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),

  /* --- categories --- */
  categories: () => call<{ data: any[] }>("/categories").then((r) => r.data),

  createCategory: (payload: Record<string, any>) =>
    call<{ data: any }>("/categories", { method: "POST", body: JSON.stringify(payload) }).then(
      (r) => r.data
    ),

  requestCategoryEdit: (id: string, payload: Record<string, any>, note?: string) =>
    call<{ data: AssistantRequest; message: string }>(`/categories/${id}/edit-request`, {
      method: "POST",
      body: JSON.stringify({ payload, note }),
    }),

  requestCategoryDelete: (id: string, note?: string) =>
    call<{ data: AssistantRequest; message: string }>(`/categories/${id}/delete-request`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),

  /* --- inventory --- */
  stock: (lowOnly = false) =>
    call<{ data: any[] }>(`/inventory/stock${lowOnly ? "?low_only=true" : ""}`).then((r) => r.data),

  adjustStock: (
    productId: string,
    payload: {
      qty_meegoda?: number
      qty_padukka?: number
      qty_padukka_new?: number
      low_stock_threshold?: number
      note?: string
    }
  ) =>
    call<{ data: any }>(`/inventory/stock/${productId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }).then((r) => r.data),

  /* --- own approval queue --- */
  requests: (status?: string) =>
    call<{ data: AssistantRequest[] }>(`/requests${status ? `?status=${status}` : ""}`).then(
      (r) => r.data
    ),

  cancelRequest: (id: string) => call(`/requests/${id}/cancel`, { method: "POST" }),
}

/* ------------------------------------------------------------------ */
/* The administrator's side of the same feature                        */
/* ------------------------------------------------------------------ */

async function adminCall<T = any>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(getApiUrl(`/api/admin${endpoint}`), {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error: any = new Error(body.error || `Request failed (${response.status})`)
    error.status = response.status
    error.code = body.code
    throw error
  }
  return body
}

export interface AssistantAccount {
  id: string
  email: string
  name: string | null
  whatsapp: string | null
  status: "pending" | "active" | "suspended"
  email_verified: boolean
  email_verified_at: string | null
  permissions: Record<string, boolean>
  must_change_password: boolean
  locked_until: string | null
  last_login_at: string | null
  created_at: string
  pending_requests: number
  is_online: boolean
  active_session_last_seen: string | null
}

export const assistantAdminService = {
  list: () =>
    adminCall<{ data: AssistantAccount[]; permissionLabels: Record<string, string> }>("/assistants"),

  get: (id: string) =>
    adminCall<{
      data: {
        assistant: AssistantAccount
        audit: any[]
        requests: AssistantRequest[]
        sessions: any[]
      }
      permissionLabels: Record<string, string>
    }>(`/assistants/${id}`),

  create: (payload: {
    email: string
    password: string
    name?: string
    whatsapp?: string
    permissions?: Record<string, boolean>
  }) => adminCall<{ data: AssistantAccount; message: string; emailDelivered: boolean }>("/assistants", {
    method: "POST",
    body: JSON.stringify(payload),
  }),

  update: (id: string, payload: Record<string, any>) =>
    adminCall<{ data: AssistantAccount }>(`/assistants/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  setStatus: (id: string, status: "active" | "suspended") =>
    adminCall<{ data: AssistantAccount }>(`/assistants/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),

  resetPassword: (id: string, password: string) =>
    adminCall<{ message: string }>(`/assistants/${id}/password`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),

  resendVerification: (id: string) =>
    adminCall<{ message: string }>(`/assistants/${id}/resend-verification`, { method: "POST" }),

  revokeSessions: (id: string) =>
    adminCall<{ message: string }>(`/assistants/${id}/revoke-sessions`, { method: "POST" }),

  remove: (id: string) => adminCall(`/assistants/${id}`, { method: "DELETE" }),

  requests: (status?: string) =>
    adminCall<{ data: AssistantRequest[] }>(
      `/assistant-requests${status ? `?status=${status}` : ""}`
    ).then((r) => r.data),

  approve: (id: string, note?: string) =>
    adminCall<{ message: string }>(`/assistant-requests/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),

  reject: (id: string, note?: string) =>
    adminCall<{ message: string }>(`/assistant-requests/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),

  activity: (limit = 200) =>
    adminCall<{ data: any[] }>(`/assistant-activity?limit=${limit}`).then((r) => r.data),
}
