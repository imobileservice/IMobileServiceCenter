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
  payment_method: 'cash' | 'card' | 'bank_transfer' | 'online'
  source: 'pos' | 'website'
  discount?: number
  tax?: number
  notes?: string
  created_by?: string
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
    limit?: number
  }) => {
    const qs = new URLSearchParams()
    if (params?.from_date) qs.set('from_date', params.from_date)
    if (params?.to_date) qs.set('to_date', params.to_date)
    if (params?.source) qs.set('source', params.source)
    if (params?.payment_method) qs.set('payment_method', params.payment_method)
    if (params?.limit) qs.set('limit', String(params.limit))
    const query = qs.toString() ? `?${qs.toString()}` : ''
    return apiFetch(`/sales${query}`)
  },

  getById: (id: string) => apiFetch(`/sales/${id}`),

  getByInvoiceNumber: (invoice: string) => apiFetch(`/sales/invoice/${invoice}`),

  getTodaySummary: () => apiFetch('/sales/today/summary'),
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

export const inventorySuppliersService = {
  getAll: () => apiFetch('/suppliers'),

  create: (supplier: { name: string; contact_person?: string; phone?: string; email?: string; address?: string }) =>
    apiFetch('/suppliers', { method: 'POST', body: JSON.stringify(supplier) }),

  update: (id: string, updates: any) => apiFetch(`/suppliers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  }),

  delete: (id: string) => apiFetch(`/suppliers/${id}`, { method: 'DELETE' }),
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

// ─── REPORTS ─────────────────────────────────────────

export const inventoryReportsService = {
  salesSummary: (period: 'today' | 'week' | 'month' | 'year' = 'month') =>
    apiFetch(`/reports/sales-summary?period=${period}`),

  topProducts: (limit?: number) =>
    apiFetch(`/reports/top-products${limit ? `?limit=${limit}` : ''}`),

  profitMargins: () => apiFetch('/reports/profit-margins'),

  stockValue: () => apiFetch('/reports/stock-value'),
}
