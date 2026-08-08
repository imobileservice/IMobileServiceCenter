import { getApiUrl } from "@/lib/utils/api"
import { useSupplierStore } from "@/lib/supplier-store"

export interface SupplierRestockItem {
  product_id: string
  name: string
  barcode: string | null
  brand: string | null
  image: string | null
  quantity: number
  low_stock_threshold: number
  target_stock_level: number
  status: "out" | "low" | "ok"
  needed_qty: number
  suggested_qty: number
  my_price: number | null
  supplier_sku: string | null
  reorder_qty: number
  response: {
    status: "pending" | "can_supply" | "unavailable"
    available_qty: number | null
    expected_date: string | null
    note: string | null
    responded_at: string
  } | null
}

export interface SupplierRestockTotals {
  products: number
  out_of_stock: number
  low_stock: number
  healthy: number
  needed_units: number
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
    throw new Error(payload.error || `Request failed (${response.status})`)
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
      // A failed call must not trap the supplier in the portal; the local
      // store is cleared by the caller either way.
    }
  },

  async getSession() {
    return request("/session")
  },

  async getRestock(): Promise<{
    data: SupplierRestockItem[]
    totals: SupplierRestockTotals
    migration_required: boolean
  }> {
    return request("/restock")
  },

  async respond(input: {
    product_id: string
    status: "pending" | "can_supply" | "unavailable"
    available_qty?: number | null
    expected_date?: string | null
    note?: string | null
  }) {
    return request("/respond", { method: "POST", body: JSON.stringify(input) })
  },
}
