import { returnHistoryTotals } from '@/lib/utils/return-receipt'

export default function ReturnHistoryStats({ sales, active, onToggle }: { sales: any[]; active: boolean; onToggle: () => void }) {
  const totals = returnHistoryTotals(sales)
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <button type="button" onClick={onToggle} aria-pressed={active}
      className={`text-left border rounded-xl p-4 ${active ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-muted/50'}`}>
      <p className="text-sm text-muted-foreground">Returned invoices</p>
      <p className="text-2xl font-black">{totals.invoices}</p>
      <p className="text-xs text-muted-foreground">{active ? 'Showing returns · click for all sales' : 'In current results · click to show returned invoices'}</p>
    </button>
    <div className="border border-border bg-card rounded-xl p-4">
      <p className="text-sm text-muted-foreground">Returned items</p><p className="text-2xl font-black">{totals.items}</p>
      <p className="text-xs"><span className="text-green-600">Good: {totals.good}</span>{' · '}<span className="text-red-500">Bad: {totals.bad}</span></p>
    </div>
  </div>
}
