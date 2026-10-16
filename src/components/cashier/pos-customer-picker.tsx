import { useEffect, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Command } from 'cmdk'
import { Check, ChevronsUpDown, Loader2, Search, Store, User } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { inventoryCustomersService, inventorySuppliersService } from '@/lib/services/inventory.service'

export interface PosCustomer {
  id: string
  name: string
  phone?: string | null
  source: 'customer' | 'supplier'
  town?: string | null
}

interface PosCustomerPickerProps {
  value: PosCustomer | null
  onSelect: (customer: PosCustomer) => void
}

export default function PosCustomerPicker({ value, onSelect }: PosCustomerPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<PosCustomer[]>([])
  const [loading, setLoading] = useState(false)
  const [failedSources, setFailedSources] = useState<string[]>([])
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    setOptions([])
    setFailedSources([])

    // Keep either list usable if the other lookup fails.
    Promise.allSettled([
      inventoryCustomersService.getAll(),
      inventorySuppliersService.getAll(),
    ]).then(([customers, suppliers]) => {
      if (!active) return
      const next: PosCustomer[] = []
      const failures: string[] = []
      if (customers.status === 'fulfilled' && Array.isArray(customers.value.data)) {
        next.push(...customers.value.data.map((customer: { id: string; name: string; phone?: string | null }) => ({
          id: customer.id, name: customer.name, phone: customer.phone, source: 'customer' as const,
        })))
      } else failures.push('saved customers')
      if (suppliers.status === 'fulfilled' && Array.isArray(suppliers.value.data)) {
        next.push(...suppliers.value.data.filter(shop => shop.is_active !== false).map(shop => ({
          id: shop.id, name: shop.name, phone: shop.phone, town: shop.town, source: 'supplier' as const,
        })))
      } else failures.push('shop suppliers')
      setOptions(next)
      setFailedSources(failures)
      setLoading(false)
    })

    return () => { active = false }
  }, [open, retry])

  return (
    <Popover.Root open={open} onOpenChange={next => { setOpen(next); setQuery('') }}>
      <Popover.Trigger
        type="button"
        className={`${buttonVariants({ variant: 'outline' })} w-full justify-between h-auto min-h-10 py-2 text-left`}
        aria-label="Select customer or shop supplier"
      >
        <span className="flex items-center gap-2 min-w-0">
          {value?.source === 'supplier' ? <Store className="h-4 w-4 shrink-0" /> : <User className="h-4 w-4 shrink-0" />}
          <span className="truncate">{value?.name || 'Select customer or shop supplier...'}</span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-[70] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card text-card-foreground shadow-xl overflow-hidden"
        >
          <Command label="Customers and shop suppliers">
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Command.Input
                aria-label="Search customers and shop suppliers"
                placeholder="Search by name or phone..."
                value={query}
                onValueChange={setQuery}
                className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            {failedSources.length > 0 && (
              <div role="status" className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
                <span>Could not load {failedSources.join(' or ')}.</span>
                <Button variant="ghost" size="sm" onClick={() => setRetry(count => count + 1)}>Retry</Button>
              </div>
            )}
            <Command.List className="max-h-64 overflow-y-auto p-1">
              {loading ? (
                <div role="status" className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading customers and shops...
                </div>
              ) : (
                <>
                  <Command.Empty className="p-4 text-center text-sm text-muted-foreground">No matching customers or shops.</Command.Empty>
                  {(['supplier', 'customer'] as const).map(source => (
                    <Command.Group
                      key={source}
                      heading={source === 'supplier' ? 'Shop suppliers' : 'Saved customers'}
                      className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground"
                    >
                      {options.filter(option => option.source === source).map(option => (
                        <Command.Item
                          key={`${option.source}:${option.id}`}
                          value={`${option.source}:${option.id}`}
                          keywords={[option.name, option.phone || '', option.town || '']}
                          onSelect={() => { onSelect(option); setOpen(false); setQuery('') }}
                          className="flex cursor-pointer items-center gap-3 rounded-lg p-2.5 data-[selected=true]:bg-muted"
                        >
                          {source === 'supplier' ? <Store className="h-4 w-4 shrink-0 text-muted-foreground" /> : <User className="h-4 w-4 shrink-0 text-muted-foreground" />}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold">{option.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">{option.phone || 'No phone number'}{option.town ? ` · ${option.town}` : ''}</span>
                          </span>
                          {value?.id === option.id && value.source === source && <Check className="h-4 w-4 shrink-0" />}
                        </Command.Item>
                      ))}
                    </Command.Group>
                  ))}
                </>
              )}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
