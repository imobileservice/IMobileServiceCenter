"use client"

import Barcode from "react-barcode"
import { resolveReceiptBranch } from "@/lib/utils/receipt-branch"
import type { ShopOrder } from "@/lib/services/inventory.service"

const formatSlipDate = (value?: string) =>
  new Date(value || Date.now())
    .toLocaleString("en-GB", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
    .replace(",", "")

/**
 * The 80mm slip that goes out with a shop's order.
 *
 * It shares `id="pos-receipt"` with the sales receipt on purpose, not by
 * accident: the print rules in index.css key off that id to strip the rest of
 * the page and set the paper to 80mm. Giving this its own id would mean a
 * second copy of those rules. Only one may be mounted at a time.
 *
 * Supplier name and town come off the order itself, where they were copied when
 * it was placed - so reprinting an old slip shows where it went then, even if
 * the shop has since been renamed or moved.
 */
export default function SupplierOrderSlip({
  order,
  shop,
  tillCode,
  variant = "original",
}: {
  order: ShopOrder | null
  /** Which of our branches is sending it, for the header address. */
  shop?: string | null
  tillCode?: string | null
  variant?: "original" | "reprint"
}) {
  if (!order) return null

  const branch = resolveReceiptBranch(shop, tillCode)
  const items = order.items || []
  const totalUnits = items.reduce((sum, line) => sum + Number(line.quantity || 0), 0)

  return (
    <div id="pos-receipt" className="bg-white text-black p-4 font-mono text-[11px] leading-tight w-full max-w-[80mm] mx-auto">
      <div className="text-center mb-3">
        <h2 className="text-sm font-black tracking-tight mb-1">IMobile Service &amp; Repair Center</h2>
        <p>{branch.address}</p>
        <p>Tel: {branch.phone}</p>
      </div>

      <div className="text-center font-bold border-y border-dashed border-black py-1 mb-2">
        {variant === "reprint" ? "SUPPLIER ORDER - REPRINT" : "SUPPLIER ORDER"}
      </div>

      <div className="text-center mb-3">
        <p># {order.order_number}</p>
        <p>Date: {formatSlipDate(order.created_at)}</p>
        <p>Placed by : {order.placed_by || "Shop portal"}</p>
        {tillCode && <p>Till : {tillCode}</p>}
      </div>

      {/* The two lines this slip exists for. */}
      <div className="border-y border-dashed border-black py-2 mb-2 text-center">
        <p className="font-black text-[13px] leading-tight">{order.supplier_name}</p>
        <p className="font-bold">{order.supplier_town || "Town not recorded"}</p>
        {order.contact_phone && <p>Tel: {order.contact_phone}</p>}
      </div>

      <div className="flex justify-between border-b border-dashed border-black pb-1 mb-2 font-bold text-[11px]">
        <div className="flex-1">#Item</div>
        <div className="w-[40px] text-right">Qty</div>
      </div>

      <div className="space-y-1.5 mb-2 border-b border-dashed border-black pb-3">
        {items.map((line, idx) => (
          <div key={line.id || idx}>
            <div className="flex justify-between gap-2">
              <div className="flex-1 font-bold text-[11px]">
                {idx + 1}) {String(line.product_name || "PRODUCT").toUpperCase()}
              </div>
              <div className="w-[40px] text-right font-black">{line.quantity}</div>
            </div>
            {/* A line we could not fill from the shelf has to be visible to whoever packs it. */}
            {line.was_in_stock === false && <div className="text-[10px] pl-3">** was out of stock **</div>}
            {line.barcode && <div className="text-[10px] pl-3">{line.barcode}</div>}
          </div>
        ))}
      </div>

      <div className="space-y-1 mb-3 border-b border-dashed border-black pb-3">
        <div className="flex justify-between font-bold">
          <span>Products</span>
          <span>{items.length}</span>
        </div>
        <div className="flex justify-between text-sm font-black">
          <span>Total units</span>
          <span>{totalUnits}</span>
        </div>
      </div>

      {order.note && (
        <div className="mb-3 text-[10px] border-b border-dashed border-black pb-2">
          <p className="font-bold">Note:</p>
          <p>{order.note}</p>
        </div>
      )}

      <div className="flex justify-center my-3 relative -left-2 overflow-hidden w-full">
        {order.order_number && (
          <div className="origin-top scale-75 transform text-center">
            <Barcode
              value={order.order_number}
              displayValue={false}
              height={40}
              width={1.5}
              margin={10}
              background="#ffffff"
              lineColor="#000000"
            />
          </div>
        )}
      </div>

      <div className="text-[10px] text-center leading-normal">
        <p className="font-bold">Not a receipt — no payment has been taken.</p>
        <p>Please check the goods against this slip on collection.</p>
      </div>
    </div>
  )
}
