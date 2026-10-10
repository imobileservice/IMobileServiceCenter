export type ProductBranch = 'all' | 'meegoda' | 'padukka' | 'padukka_new'
export type ProductStockFilter = 'all' | 'very_low' | 'low'

export const PRODUCT_BRANCHES: { id: ProductBranch; label: string }[] = [
  { id: 'all', label: 'All branches' },
  { id: 'meegoda', label: 'Meegoda' },
  { id: 'padukka', label: 'Padukka' },
  { id: 'padukka_new', label: 'Padukka New' },
]

export const ADMIN_PRODUCT_VIEWS: {
  href: string
  label: string
  branch: ProductBranch
  stockFilter: ProductStockFilter
}[] = [
  { href: '/admin/products', label: 'Products', branch: 'all', stockFilter: 'all' },
  { href: '/admin/products/meegoda', label: 'Meegoda', branch: 'meegoda', stockFilter: 'all' },
  { href: '/admin/products/padukka', label: 'Padukka', branch: 'padukka', stockFilter: 'all' },
  { href: '/admin/products/padukka-new', label: 'Padukka New', branch: 'padukka_new', stockFilter: 'all' },
  { href: '/admin/products/very-low-stock', label: 'Very Low Stock', branch: 'all', stockFilter: 'very_low' },
  { href: '/admin/products/low-stock', label: 'Low Stock', branch: 'all', stockFilter: 'low' },
]
