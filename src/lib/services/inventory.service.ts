/**
 * Inventory & POS Frontend Service Layer
 * All API calls for the inventory management and POS system
 */
import { getApiUrl } from '@/lib/utils/api'

const BASE = '/api/inventory'

async function apiFetch<T = any>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = getApiUrl(`${BASE}${endpoint}`)
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })

  const json = await res.json()
  if (!res.ok) {
    throw new Error(json.error || `API error: ${res.status}`)
  }
  return json
}

async function rawApiFetch<T = any>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(getApiUrl(endpoint), {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })

  const json = await res.json()
  if (!res.ok) {
    throw new Error(json.error || `API error: ${res.status}`)
  }
  return json
}

// ─── PRODUCTS ────────────────────────────────────────

export const inventoryProductsService = {
  getAll: (params?: { search?: string; category?: string }) => {
    const qs = new URLSearchParams()
    if (params?.search) qs.set('search', params.search)
    if (params?.category) qs.set('category', params.category)
    const query = qs.toString() ? `?${qs.toString()}` : ''
    return apiFetch(`/products${query}`)
  },

  getById: (id: string) => apiFetch(`/products/${id}`),

  getByBarcode: (barcode: string) => apiFetch(`/products/barcode/${barcode}`),

  create: (product: any) => apiFetch('/products', {
    method: 'POST',
    body: JSON.stringify(product),
  }),

  update: (id: string, updates: any) => apiFetch(`/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  }),

  delete: (id: string) => apiFetch(`/products/${id}`, { method: 'DELETE' }),

  generateBarcode: (id: string) => apiFetch(`/products/${id}/generate-barcode`, {
    method: 'POST',
  }),
}

// ─── STOCK ───────────────────────────────────────────

export const inventoryStockService = {
  getAll: (lowOnly?: boolean) => {
    const query = lowOnly ? '?low_only=true' : ''
    return apiFetch(`/stock${query}`)
  },

  getLowStock: () => apiFetch('/stock/low'),

  adjust: (productId: string, data: {
    quantity: number;
    adjustment_type: 'add' | 'subtract' | 'set';
    notes?: string;
    created_by?: string;
  }) => apiFetch(`/stock/${productId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),

  getMovements: (productId: string) => apiFetch(`/stock/movements/${productId}`),
}

// ─── SALES ───────────────────────────────────────────

export interface SaleItem {
  product_id: string
  product_name?: string
  quantity: number
  price: number
}

export interface CreateSalePayload {
  customer_id?: string
  customer_name?: string
  customer_phone?: string
  payment_method: 'cash' | 'card' | 'bank_transfer' | 'online'
  source: 'pos' | 'website'
  discount?: number
  tax?: number
  notes?: string
  created_by?: string
  shop?: string
  pos_session_id?: string
  pos_session_token?: string
  items: SaleItem[]
}

export const inventorySalesService = {
  create: (sale: CreateSalePayload) => apiFetch('/sales', {
    method: 'POST',
    body: JSON.stringify(sale),
  }),

  getAll: (params?: {
    from_date?: string
    to_date?: string
    source?: string
    payment_method?: string
    shop?: string
    limit?: number
  }) => {
    const qs = new URLSearchParams()
    if (params?.from_date) qs.set('from_date', params.from_date)
    if (params?.to_date) qs.set('to_date', params.to_date)
    if (params?.source) qs.set('source', params.source)
    if (params?.payment_method) qs.set('payment_method', params.payment_method)
    if (params?.shop) qs.set('shop', params.shop)
    if (params?.limit) qs.set('limit', String(params.limit))
    const query = qs.toString() ? `?${qs.toString()}` : ''
    return apiFetch(`/sales${query}`)
  },

  getById: (id: string) => apiFetch(`/sales/${id}`),

  getByInvoiceNumber: (invoice: string) => apiFetch(`/sales/invoice/${invoice}`),

  delete: (id: string) => apiFetch(`/sales/${id}`, { method: 'DELETE' }),

  getTodaySummary: (shop?: string) => {
    const query = shop ? `?shop=${encodeURIComponent(shop)}` : ''
    return apiFetch(`/sales/today/summary${query}`)
  },

  returnItem: (payload: {
    invoice_number: string
    product_id: string
    quantity: number
    condition: 'good' | 'damaged'
    notes?: string
    created_by?: string
    pos_session_id?: string
    pos_session_token?: string
  }) => apiFetch('/sales/return', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
}

// ─── PURCHASES ───────────────────────────────────────

export interface PurchaseItem {
  product_id: string
  quantity: number
  cost_price: number
}

export interface CreatePurchasePayload {
  supplier_id?: string
  supplier_name?: string
  notes?: string
  created_by?: string
  /** Shop the goods are received into. Defaults to Meegoda. */
  shop?: string
  items: PurchaseItem[]
}

export const inventoryPurchasesService = {
  create: (purchase: CreatePurchasePayload) => apiFetch('/purchases', {
    method: 'POST',
    body: JSON.stringify(purchase),
  }),

  getAll: () => apiFetch('/purchases'),

  getById: (id: string) => apiFetch(`/purchases/${id}`),
}

// ─── SUPPLIERS ───────────────────────────────────────

export type RestockStatus = 'out' | 'low' | 'ok'

export interface Supplier {
  id: string
  name: string
  contact_person?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  notes?: string | null
  is_active?: boolean
  created_at?: string
  updated_at?: string
  // Supplier portal (/supplier/login). The password itself is never sent to the
  // client - only whether access is on and when it was last used.
  portal_enabled?: boolean
  portal_last_login_at?: string | null
}

export interface SupplierStats {
  products: number
  out_of_stock: number
  low_stock: number
  healthy: number
  needed_units: number
  estimated_cost: number
}

export interface SupplierWithStats extends Supplier {
  stats: SupplierStats
  last_purchase_at: string | null
  purchase_count: number
  total_spent: number
}

export type SupplierResponseStatus = 'pending' | 'can_supply' | 'unavailable'

/** What a supplier answered for one product in their own portal (/supplier). */
export interface SupplierResponse {
  status: SupplierResponseStatus
  available_qty: number | null
  expected_date: string | null
  note: string | null
  responded_at: string
}

export interface RestockItem {
  product_id: string
  name: string
  raw_name: string
  barcode: string | null
  brand: string | null
  category: string | null
  image: string | null
  quantity: number
  damaged_quantity: number
  low_stock_threshold: number
  target_stock_level: number
  is_target_auto: boolean
  qty_meegoda: number
  qty_padukka: number
  qty_padukka_new: number
  status: RestockStatus
  /** Units missing to reach the restock target. */
  needed_qty: number
  /** Units to actually order (needed qty, rounded up to the supplier pack size). */
  suggested_qty: number
  unit_cost: number
  estimated_cost: number
  link_id: string | null
  supplier_sku: string | null
  supplier_cost_price: number | null
  reorder_qty: number
  lead_time_days: number | null
  is_preferred: boolean
  link_notes: string | null
  suppliers?: Array<{
    id: string
    name: string
    phone?: string | null
    email?: string | null
    is_preferred?: boolean
    /** Their portal reply for this product. Null until they answer. */
    response?: SupplierResponse | null
  }>
}

/** A product that can still be assigned to a supplier. */
export interface AvailableProduct {
  id: string
  name: string
  barcode: string | null
  brand: string | null
  image: string | null
  unit_cost: number
  stock: number
}

export interface SupplierProductInput {
  product_id: string
  supplier_sku?: string
  cost_price?: number | null
  reorder_qty?: number
  lead_time_days?: number | null
  is_preferred?: boolean
  notes?: string
}

export const inventorySuppliersService = {
  getAll: (params?: { withStats?: boolean; search?: string }) => {
    const qs = new URLSearchParams()
    if (params?.withStats) qs.set('with_stats', 'true')
    if (params?.search) qs.set('search', params.search)
    const query = qs.toString() ? `?${qs.toString()}` : ''
    return apiFetch<{ data: SupplierWithStats[]; migration_required?: boolean }>(`/suppliers${query}`)
  },

  getById: (id: string) => apiFetch<{ data: Supplier }>(`/suppliers/${id}`),

  create: (supplier: { name: string; contact_person?: string; phone?: string; email?: string; address?: string; notes?: string; is_active?: boolean }) =>
    apiFetch('/suppliers', { method: 'POST', body: JSON.stringify(supplier) }),

  update: (id: string, updates: any) => apiFetch(`/suppliers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  }),

  delete: (id: string) => apiFetch(`/suppliers/${id}`, { method: 'DELETE' }),

  /** Everything that is low or out of stock, with the supplier(s) that can deliver it. */
  getRestockSummary: (params?: { status?: 'all' | 'low' | 'out' | 'needed'; supplier_id?: string; search?: string }) => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set('status', params.status)
    if (params?.supplier_id) qs.set('supplier_id', params.supplier_id)
    if (params?.search) qs.set('search', params.search)
    const query = qs.toString() ? `?${qs.toString()}` : ''
    return apiFetch<{
      data: RestockItem[]
      totals: SupplierStats & { unassigned: number; suppliers: number }
      migration_required?: boolean
    }>(`/suppliers/restock-summary${query}`)
  },

  getProducts: (id: string) =>
    apiFetch<{ data: RestockItem[]; totals: SupplierStats; migration_required?: boolean }>(`/suppliers/${id}/products`),

  /** Pass no id from the Add Supplier form — nothing is linked yet, so everything is available. */
  getAvailableProducts: (id: string | null, search?: string) => {
    const query = search ? `?search=${encodeURIComponent(search)}` : ''
    const path = id ? `/suppliers/${id}/available-products` : '/suppliers/available-products'
    return apiFetch<{ data: AvailableProduct[] }>(`${path}${query}`)
  },

  addProducts: (id: string, payload: { product_ids?: string[]; items?: SupplierProductInput[] }) =>
    apiFetch(`/suppliers/${id}/products`, { method: 'POST', body: JSON.stringify(payload) }),

  updateProduct: (
    id: string,
    productId: string,
    updates: Partial<SupplierProductInput> & { target_stock_level?: number; low_stock_threshold?: number }
  ) => apiFetch(`/suppliers/${id}/products/${productId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  }),

  removeProduct: (id: string, productId: string) =>
    apiFetch(`/suppliers/${id}/products/${productId}`, { method: 'DELETE' }),

  getPurchases: (id: string) => apiFetch(`/suppliers/${id}/purchases`),

  /**
   * Controls the supplier's own sign-in at /supplier/login.
   *
   * Deliberately its own endpoint rather than a field on update(): the password
   * has to be hashed server-side, and the generic supplier update writes the
   * body straight through.
   */
  setPortalAccess: (id: string, payload: { enabled?: boolean; password?: string }) =>
    apiFetch<{ data: { id: string; name: string; email: string | null; portal_enabled: boolean; portal_last_login_at: string | null } }>(
      `/suppliers/${id}/portal`,
      { method: 'PUT', body: JSON.stringify(payload) }
    ),
}

// ─── CUSTOMERS ───────────────────────────────────────

export const inventoryCustomersService = {
  getAll: (search?: string) => {
    const query = search ? `?search=${encodeURIComponent(search)}` : ''
    return apiFetch(`/customers${query}`)
  },

  create: (customer: { name: string; phone?: string; email?: string; address?: string }) =>
    apiFetch('/customers', { method: 'POST', body: JSON.stringify(customer) }),

  update: (id: string, updates: any) => apiFetch(`/customers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  }),

  delete: (id: string) => apiFetch(`/customers/${id}`, { method: 'DELETE' }),
}

export const websiteOrdersService = {
  getAll: () => rawApiFetch('/api/admin/data/orders'),

  updateStatus: (id: string, status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled') =>
    rawApiFetch(`/api/admin/orders/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }),
}

// ─── REPORTS ─────────────────────────────────────────

export const inventoryReportsService = {
  salesSummary: (period: 'today' | 'week' | 'month' | 'year' = 'month') =>
    apiFetch(`/reports/sales-summary?period=${period}`),

  topProducts: (limit?: number) =>
    apiFetch(`/reports/top-products${limit ? `?limit=${limit}` : ''}`),

  profitMargins: () => apiFetch('/reports/profit-margins'),

  stockValue: () => apiFetch('/reports/stock-value'),
}
