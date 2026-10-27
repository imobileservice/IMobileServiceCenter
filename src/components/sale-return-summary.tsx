import { formatCurrency } from '@/lib/utils/currency'

export function ReturnCounts({ sale }: { sale: any }) {
  if (!sale.return_good_quantity && !sale.return_bad_quantity) return null
  return <p className="text-xs font-semibold mt-1"><span className="text-green-600">Good returns: {sale.return_good_quantity || 0}</span>{' · '}<span className="text-red-500">Bad returns: {sale.return_bad_quantity || 0}</span></p>
}

export default function SaleReturnSummary({ sale, onPrintReturn }: { sale: any; onPrintReturn?: (entry: any) => void }) {
  if (!sale.returns?.length) return null
  return <section className="mt-5 border border-border rounded-lg p-4 space-y-3">
    <h4 className="font-bold">Returns</h4>
    <ReturnCounts sale={sale} />
    <div className="space-y-2">{sale.returns.map((entry: any) => <div key={entry.id} className="flex justify-between gap-3 text-sm border-t border-border pt-2">
      <div><p className="font-medium">{entry.product_name}</p><p className="text-xs text-muted-foreground">{entry.created_at ? new Date(entry.created_at).toLocaleString() : ''}</p></div>
      <div className="text-right"><p className={entry.condition === 'good' ? 'text-green-600' : 'text-red-500'}>{entry.quantity} × {entry.condition === 'good' ? 'Good — restocked' : 'Bad — damaged stock'}</p>
        {entry.refund_amount != null && <p className="text-xs">Refund: {formatCurrency(entry.refund_amount)}</p>}
        {onPrintReturn && <button type="button" className="text-xs underline underline-offset-2 mt-1" onClick={() => onPrintReturn(entry)}>Print return receipt</button>}</div>
    </div>)}</div>
  </section>
}
