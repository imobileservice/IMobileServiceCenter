// Account and category IDs verified against this shop's database.
export const RESTRICTED_MEEGODA_CASHIER_ID = '42b6d07b-9846-46e9-a980-7d2af29fca94'
export const CASHIER_ALLOWED_CATEGORIES = [
  { id: '3ab1fd08-7201-4629-89eb-f92efb3465d0', name: 'Display' },
  { id: '560cac39-50ad-411d-9575-59292eb052c4', name: 'On Off Ribbon' },
] as const

export function isRestrictedCashier(account?: { id?: string; role?: string; shop?: string } | null) {
  return account?.id === RESTRICTED_MEEGODA_CASHIER_ID &&
    account.role?.trim().toLowerCase() === 'cashier' && account.shop?.trim().toLowerCase() === 'meegoda'
}

export const RESTRICTED_CASHIER_PAGES = new Set([
  '/cashier/pos', '/cashier/orders', '/cashier/supplier-orders', '/cashier/dashboard', '/cashier/inventory',
])
