import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function PosDeliveryFee({ value, onChange, onReset, disabled, invalid, overridden }: {
  value: string; onChange: (value: string) => void; onReset: () => void
  disabled: boolean; invalid: boolean; overridden: boolean
}) {
  return <div className="space-y-2 border-t border-border pt-3">
    <div className="flex items-center justify-between gap-2">
      <label htmlFor="pos-delivery-fee" className="text-sm font-semibold">Delivery fee (Rs.)</label>
      {overridden && <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={onReset}>Use admin default</Button>}
    </div>
    <Input id="pos-delivery-fee" type="number" min="0" max="99999999.99" step="0.01"
      value={value} onChange={event => onChange(event.target.value)} disabled={disabled} aria-invalid={invalid} />
    <p className={`text-xs ${invalid ? 'text-destructive' : 'text-muted-foreground'}`}>
      {invalid ? 'Enter a non-negative amount with up to two decimal places.' : 'Starts with the admin default. Edit for this sale; walk-in customers pay 0.00.'}
    </p>
  </div>
}
