// Registered shops can sign in to the supplier portal; cashiers can handle orders.
export const SUPPLIER_SHOP_ENABLED = true

export const SUPPLIER_SHOP_OWNER_EMAIL = 'dexlanka@gmail.com'

export const isSupplierShopOwner = (user?: { email?: string; role?: string } | null) =>
  user?.role === 'admin' && user.email?.trim().toLowerCase() === SUPPLIER_SHOP_OWNER_EMAIL
