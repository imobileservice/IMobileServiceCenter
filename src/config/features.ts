// Registered shops can sign in to the supplier portal; cashiers can handle orders.
export const SUPPLIER_SHOP_ENABLED = true

export const SUPPLIER_SHOP_OWNER_EMAILS = ['dexlanka@gmail.com', 'imobile9498@gmail.com']

export const isSupplierShopOwner = (user?: { email?: string; role?: string } | null) =>
  user?.role === 'admin' && SUPPLIER_SHOP_OWNER_EMAILS.includes(user.email?.trim().toLowerCase() ?? '')
