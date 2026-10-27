export interface ReturnReceiptData {
  return_number: string
  invoice_number: string
  returned_at: string
  customer_name?: string | null
  customer_phone?: string | null
  cashier_name?: string | null
  shop?: string | null
  till_code?: string | null
  refund_amount: number | null
  items: { product_name: string; quantity: number; condition: 'good' | 'damaged' }[]
}

export const hasSaleReturns = (sale: any) =>
  Number(sale.return_good_quantity || 0) + Number(sale.return_bad_quantity || 0) > 0 || Boolean(sale.returns?.length)

export function returnHistoryTotals(sales: any[]) {
  const invoices = new Set<string>()
  let good = 0
  let bad = 0
  for (const sale of sales) {
    if (!hasSaleReturns(sale)) continue
    invoices.add(sale.id || sale.invoice_number)
    good += Number(sale.return_good_quantity || 0)
    bad += Number(sale.return_bad_quantity || 0)
  }
  return { invoices: invoices.size, good, bad, items: good + bad }
}

export function returnReceiptNumber(entry: any): string {
  return String(entry.notes || '').match(/Return receipt (RET-[0-9A-F-]+)/i)?.[1] || `RET-${entry.id}`
}

export function receiptFromReturn(sale: any, entry: any): ReturnReceiptData {
  const number = returnReceiptNumber(entry)
  const entries = (sale.returns || [entry]).filter((row: any) => returnReceiptNumber(row) === number)
  return {
    return_number: number,
    invoice_number: sale.invoice_number,
    returned_at: entry.created_at,
    customer_name: sale.customer_name,
    customer_phone: sale.customer_phone || sale.inv_customers?.phone,
    cashier_name: entry.created_by,
    shop: sale.shop,
    refund_amount: entries.every((row: any) => row.refund_amount != null)
      ? entries.reduce((sum: number, row: any) => sum + Number(row.refund_amount), 0) : null,
    items: entries.map((row: any) => ({ product_name: row.product_name || 'Product',
      quantity: Number(row.quantity), condition: row.condition })),
  }
}
