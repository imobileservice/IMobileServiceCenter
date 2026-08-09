import { getApiUrl } from "@/lib/utils/api"
import { useSupplierStore } from "@/lib/supplier-store"

/**
 * What a shop is shown about one product. Deliberately no quantity: the portal
 * answers "can we get this?", not "how many are left?".
 */
export interface CatalogItem {
  product_id: string
  name: string
  brand: string | null
  barcode: string | null
  category_id: string | null
  image: string | null
  in_stock: boolean
}

export interface CatalogCategory {
  id: string
  name: string
  slug: string
}

export interface CatalogTotals {
  products: number
  in_stock: number
  out_of_stock: number
}

export type ShopOrderStatus = "pending" | "confirmed" | "ready" | "completed" | "cancelled"

export interface MyOrderItem {
  id: string
  product_name: string
  barcode: string | null
  quantity: number
}

export interface MyOrder {
  id: string
  order_number: string
  status: ShopOrderStatus
  item_count: number
  total_qty: number
  note: string | null
  admin_note: string | null
  created_at: string
  updated_at: string
  items: MyOrderItem[]
}

export interface SupplierContact {
  phone: string
  whatsapp: string
}

/**
 * The session token travels in a header, not a cookie: the portal is served
 * from imobileservicecenter.lk while the API answers on a Railway domain, and a
 * cross-site cookie is dropped by default browser settings.
 */
const authHeaders = (): Record<string, string> => {
  const token = useSupplierStore.getState().token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const request = async (path: string, init: RequestInit = {}) => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...authHeaders(),
    ...((init.headers as Record<string, string>) || {}),
  }

  const response = await fetch(getApiUrl(`/api/supplier${path}`), { ...init, headers })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    // The server drops the session when the account is disabled or the token
    // expires. Clearing here sends the portal back to the login screen instead
    // of leaving it retrying with a token that will never work again.
    if (response.status === 401 || response.status === 403) {
      useSupplierStore.getState().logout()
    }
    const error: any = new Error(payload.error || `Request failed (${response.status})`)
    error.status = response.status
    throw error
  }

  return payload
}

export const supplierPortalService = {
  async login(email: string, password: string) {
    const response = await fetch(getApiUrl("/api/supplier/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error || "Could not sign in")
    return payload as { token: string; expiresAt: string; supplier: { id: string; name: string; email: string } }
  },

  async logout() {
    try {
      await request("/logout", { method: "POST" })
    } catch {
      // A failed call must not trap the shop in the portal; the local store is
      // cleared by the caller either way.
    }
  },

  /** Restores a refreshed session, and carries the numbers the Call / WhatsApp buttons dial. */
  async getSession(): Promise<{
    supplier: { id: string; name: string; email: string }
    contact: SupplierContact
  }> {
    return request("/session")
  },

  async getCatalog(params?: { search?: string; category_id?: string; in_stock_only?: boolean }): Promise<{
    data: CatalogItem[]
    categories: CatalogCategory[]
    totals: CatalogTotals
    migration_required: boolean
  }> {
    const qs = new URLSearchParams()
    if (params?.search) qs.set("search", params.search)
    if (params?.category_id) qs.set("category_id", params.category_id)
    if (params?.in_stock_only) qs.set("in_stock_only", "true")
    const query = qs.toString() ? `?${qs.toString()}` : ""
    return request(`/catalog${query}`)
  },

  async getOrders(): Promise<{ data: MyOrder[]; migration_required: boolean }> {
    return request("/orders")
  },

  async placeOrder(input: {
    items: Array<{ product_id: string; quantity: number }>
    note?: string | null
    contact_phone?: string | null
  }): Promise<{ data: MyOrder }> {
    return request("/orders", { method: "POST", body: JSON.stringify(input) })
  },

  async cancelOrder(orderId: string) {
    return request(`/orders/${orderId}/cancel`, { method: "POST" })
  },
}
