import { Package } from 'lucide-react'

export default function BadProductCards({ items }: { items: any[] }) {
  if (!items.length) return <p className="p-12 text-center text-muted-foreground">No bad products match your search.</p>
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Bad products">
    {items.map(item => <article key={item.product_id} className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="aspect-square bg-muted flex items-center justify-center">
        {item.products?.image ? <img src={item.products.image} alt={item.products?.name || 'Product'} className="h-full w-full object-contain p-4" /> : <Package className="h-14 w-14 text-muted-foreground" />}
      </div>
      <div className="p-4 space-y-2">
        <h3 className="font-bold break-words">{item.products?.name || 'Unknown product'}</h3>
        <p className="text-xs font-mono text-muted-foreground">{item.products?.barcode || 'No barcode'}</p>
        <p className="text-red-500 font-bold">Bad quantity: {Number(item.damaged_quantity || 0)}</p>
        <p className="text-sm text-muted-foreground">Good stock: {Number(item.quantity || 0)}</p>
      </div>
    </article>)}
  </div>
}
