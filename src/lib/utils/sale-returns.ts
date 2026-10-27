export function summarizeSaleReturns(sale: any, movements: any[]) {
  const events = movements.filter(row => row.reference_id === sale.id)
  const counts = new Map<string, { good: number; bad: number }>()
  const add = (key: string, row: any, quantity: number) => {
    const count = counts.get(key) || { good: 0, bad: 0 }
    count[row.type === 'return_good' ? 'good' : 'bad'] += quantity
    counts.set(key, count)
  }
  const lines = [...(sale.inv_sale_items || [])].sort((a, b) => String(a.id).localeCompare(String(b.id)))
  for (const event of events.filter(row => row.sale_item_id)) add(event.sale_item_id, event, Number(event.quantity))
  for (const event of events.filter(row => !row.sale_item_id)) {
    let remaining = Number(event.quantity)
    for (const line of lines.filter(item => item.product_id === event.product_id)) {
      const count = counts.get(line.id) || { good: 0, bad: 0 }
      const allocated = Math.min(remaining, Math.max(0, Number(line.quantity) - count.good - count.bad))
      add(line.id, event, allocated)
      remaining -= allocated
    }
  }
  return {
    ...sale,
    inv_sale_items: (sale.inv_sale_items || []).map((item: any) => {
      const count = counts.get(item.id) || { good: 0, bad: 0 }
      return { ...item, returned_good_quantity: count.good, returned_bad_quantity: count.bad,
        remaining_returnable_quantity: Math.max(0, Number(item.quantity) - count.good - count.bad) }
    }),
    return_good_quantity: events.filter(row => row.type === 'return_good').reduce((sum, row) => sum + Number(row.quantity), 0),
    return_bad_quantity: events.filter(row => row.type === 'return_damaged').reduce((sum, row) => sum + Number(row.quantity), 0),
    returns: events.map(row => ({ ...row, condition: row.type === 'return_good' ? 'good' : 'damaged',
      product_name: lines.find(item => item.id === row.sale_item_id)?.product_name || lines.find(item => item.product_id === row.product_id)?.product_name || 'Product' })),
  }
}
