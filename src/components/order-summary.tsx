"use client"

import { formatCurrency } from "@/lib/utils/currency"

interface OrderSummaryProps {
  cartItems?: any[]
}

export default function OrderSummary({ cartItems = [] }: OrderSummaryProps) {
  const items = cartItems
  const loading = false

  const getPrice = (item: any) => {
    if (item.variant_selected && typeof item.variant_selected === 'object' && 'price' in item.variant_selected) {
      return Number(item.variant_selected.price) || Number(item.products.price)
    }
    return Number(item.products.price)
  }

  const subtotal = items.reduce((sum: number, item: any) => {
    return sum + (getPrice(item) * item.quantity)
  }, 0)
  const shipping = subtotal > 15000 ? 0 : 500
  const tax = 0 // Tax removed
  const total = subtotal + shipping + tax

  return (
    <div className="bg-muted border border-border rounded-lg p-6 h-fit sticky top-20">
      <h2 className="text-xl font-bold mb-6">Order Summary</h2>

      {/* Items */}
      <div className="space-y-4 mb-6 max-h-64 overflow-y-auto">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Cart is empty</p>
        ) : (
          items.map((item: any) => (
            <div key={item.id} className="flex gap-3">
              <div className="relative w-16 h-16 bg-background rounded-lg overflow-hidden flex-shrink-0">
                <img src={item.products.image || "/placeholder.svg"} alt={item.products.name} className="object-cover w-full h-full" />
              </div>
              <div className="flex-1 text-sm">
                <p className="font-semibold line-clamp-1">{item.products.name}</p>
                <p className="text-muted-foreground">Qty: {item.quantity}</p>
                {item.variant_selected && typeof item.variant_selected === 'object' && (
                  <p className="text-xs text-muted-foreground">
                    {[item.variant_selected.storage, item.variant_selected.ram, item.variant_selected.color].filter(Boolean).join(', ')}
                  </p>
                )}
                <p className="font-bold text-primary">{formatCurrency(getPrice(item) * item.quantity)}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Totals */}
      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Shipping</span>
          <span>{shipping === 0 ? "Free" : formatCurrency(shipping)}</span>
        </div>
        {/* Tax removed as requested */}

        <div className="border-t border-border pt-3 flex justify-between font-bold text-lg">
          <span>Total</span>
          <span className="text-primary">{formatCurrency(total)}</span>
        </div>
      </div>
    </div>
  )
}
