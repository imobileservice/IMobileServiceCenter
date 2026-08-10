export interface ReceiptBranch {
  name: 'Meegoda' | 'Padukka'
  address: string
  phone: string
}

const SHOP_PHONE = '+94 77 034 4273'

const MEEGODA: ReceiptBranch = { name: 'Meegoda', address: 'Meegoda, Sri Lanka', phone: SHOP_PHONE }
const PADUKKA: ReceiptBranch = { name: 'Padukka', address: 'Padukka, Sri Lanka', phone: SHOP_PHONE }

/**
 * Resolves which shop a receipt was issued by, so the printed header shows the
 * real branch address.
 *
 * `shop` is the inv_sales / cashier shop name ('Meegoda' | 'Padukka' | 'Padukka new'
 * - the "new" stock pool still sells from the Padukka shop). `tillCode` is the
 * fallback when the shop is unknown: MEG-xx -> Meegoda, PAD-xx / PDN-xx -> Padukka.
 * Meegoda is the default so a receipt never prints without an address.
 */
export function resolveReceiptBranch(shop?: string | null, tillCode?: string | null): ReceiptBranch {
  const shopName = String(shop ?? '').trim().toLowerCase()
  if (shopName.startsWith('padukka')) return PADUKKA
  if (shopName.startsWith('meegoda')) return MEEGODA

  const till = String(tillCode ?? '').trim().toUpperCase()
  if (till.startsWith('PAD') || till.startsWith('PDN')) return PADUKKA

  return MEEGODA
}
