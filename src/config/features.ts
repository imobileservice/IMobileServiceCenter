// Public supplier and cashier access remains disabled.
export const SUPPLIER_SHOP_ENABLED = false

export const SUPPLIER_SHOP_OWNER_EMAIL = 'dexlanka@gmail.com'

export const isSupplierShopOwner = (user?: { email?: string; role?: string } | null) =>
  user?.role === 'admin' && user.email?.trim().toLowerCase() === SUPPLIER_SHOP_OWNER_EMAIL
