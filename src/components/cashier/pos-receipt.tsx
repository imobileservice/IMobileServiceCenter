"use client"

import Barcode from "react-barcode"
import { formatCurrency } from "@/lib/utils/currency"
import { resolveReceiptBranch } from "@/lib/utils/receipt-branch"

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank",
  online: "Online",
}

export const formatPaymentMethod = (method?: string | null) => {
  const value = method || "cash"
  return PAYMENT_METHOD_LABELS[value] || value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
}

/** A sale as either the checkout or the sales table hands it over. */
export interface ReceiptSale {
  invoice_number?: string
  created_at?: string
  customer_name?: string | null
  payment_method?: string | null
  total_amount?: number
  discount_amount?: number
  net_amount?: number
  shop?: string | null
  till_code?: string | null
  /** Checkout builds `items`; the sales API returns `inv_sale_items`. */
  items?: any[]
  inv_sale_items?: any[]
}

interface PosReceiptProps {
  sale: ReceiptSale | null
  cashierName?: string
  tillCode?: string
  /** Printed on the header line. Defaults to the sale's own timestamp. */
  date?: Date
  /** A reprint is stamped as one so a customer cannot pass it off as a second sale. */
  variant?: "original" | "reprint"
}

/**
 * The 80mm thermal receipt.
 *
 * The `id="pos-receipt"` is load-bearing: the print rules in index.css key off
 * it to strip the rest of the page and set the paper width, so any screen that
 * renders this component can call window.print() and get a clean receipt.
 * Only one may be mounted at a time.
 */
export default function PosReceipt({
  sale,
  cashierName,
  tillCode,
  date,
  variant = "original",
}: PosReceiptProps) {
  const branch = resolveReceiptBranch(sale?.shop, tillCode || sale?.till_code)
  const lines = sale?.items || sale?.inv_sale_items || []
  const printedAt = date || (sale?.created_at ? new Date(sale.created_at) : new Date())

  const amount = (value: any) =>
    Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div id="pos-receipt" className="bg-white text-black p-4 font-mono text-[11px] leading-tight w-full max-w-[80mm] mx-auto">
      {/* Header */}
      <div className="text-center mb-3">
        <h2 className="text-sm font-black tracking-tight mb-1">IMobile Service &amp; Repair Center</h2>
        <p>{branch.address}</p>
        <p>Tel: {branch.phone}</p>
        <p className="mt-1">
          Date:{" "}
          {printedAt
            .toLocaleString("en-GB", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })
            .replace(",", "")}
        </p>
        <p># {sale?.invoice_number}</p>
        <p>Cashier : {cashierName || "Admin"}</p>
        <p>Till : {tillCode || sale?.till_code || "N/A"}</p>
        <p>Customer : {sale?.customer_name || "Walk-in Customer"}</p>
        <p>Payment : {formatPaymentMethod(sale?.payment_method)}</p>
      </div>

      <div className="text-center font-bold border-y border-dashed border-black py-1 mb-2">
        {variant === "reprint" ? "Receipt - Reprint" : "Receipt - Original"}
      </div>

      {/* Table Headers */}
      <div className="flex justify-between border-b border-dashed border-black pb-1 mb-2 font-bold text-[11px]">
        <div className="flex-1">#Item</div>
        <div className="w-[60px] text-right">Net</div>
        <div className="w-[30px] text-center">Qty</div>
        <div className="w-[65px] text-right">Total</div>
      </div>

      {/* Items List */}
      <div className="space-y-2 mb-2 border-b border-dashed border-black pb-3">
        {lines.map((item: any, idx: number) => {
          // Checkout carries `price`; a stored sale line calls it `unit_price`.
          const unit = Number(item.price ?? item.unit_price ?? 0)
          return (
            <div key={item.id || idx}>
              <div className="font-bold text-[11px] mb-0.5">
                {idx + 1}) {item.product_name?.toUpperCase() || "PRODUCT"}
              </div>
              <div className="flex justify-between text-[10px]">
                <div className="flex-1"></div>
                <div className="w-[60px] text-right text-gray-700">{amount(unit)}</div>
                <div className="w-[30px] text-center font-bold">{item.quantity}</div>
                <div className="w-[65px] text-right font-bold">
                  {amount(item.total_price ?? unit * Number(item.quantity || 0))}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Totals Section */}
      <div className="space-y-1 mb-2 border-b border-dashed border-black pb-2 text-right">
        <div className="flex justify-between">
          <span>Sub Total</span>
          <span className="font-bold">{formatCurrency(sale?.total_amount || 0).replace("Rs. ", "")}</span>
        </div>
        <div className="flex justify-between">
          <span>Total Discount</span>
          <span className="font-bold">{formatCurrency(sale?.discount_amount || 0).replace("Rs. ", "")}</span>
        </div>
      </div>

      <div className="space-y-1 mb-3 border-b border-dashed border-black pb-3 text-right">
        <div className="flex justify-between text-sm font-black">
          <span>Total</span>
          <span>{formatCurrency(sale?.net_amount || sale?.total_amount || 0).replace("Rs. ", "")}</span>
        </div>
        <div className="flex justify-between">
          <span>Paid {formatPaymentMethod(sale?.payment_method).toUpperCase()}</span>
          <span className="font-bold">{formatCurrency(sale?.net_amount || sale?.total_amount || 0).replace("Rs. ", "")}</span>
        </div>
        <div className="flex justify-between">
          <span>Balance</span>
          <span className="font-bold">0.00</span>
        </div>
        <div className="flex justify-between">
          <span>Outstanding</span>
          <span className="font-bold">0.00</span>
        </div>
      </div>

      {/* Invoice Barcode - what the Order History scanner reads back. */}
      <div className="flex justify-center my-3 relative -left-2 overflow-hidden w-full">
        {sale?.invoice_number && (
          <div className="origin-top scale-75 transform text-center">
            <Barcode
              value={sale.invoice_number}
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

      {/* Terms & Conditions */}
      <div className="text-[9px] mt-4 leading-normal">
        <p className="font-bold text-[10px] mb-1">*** හුවමාරු කිරීම සඳහා මෙම බිල්පත ඉදිරිපත් කල යුතුයි.</p>
        <ul className="list-disc pl-3 space-y-0.5 opacity-90">
          <li>මිලදී ගැනීමෙන් පසු දින 3ක් ඇතුලත ආපසු භාර දිය හැක.</li>
          <li>භාණ්ඩය නැවත විකිණිය හැකි තත්වයේ තිබිය යුතුයි.</li>
          <li>වගකීම් රහිතව යලි භාරගනු නොලැබේ.</li>
          <li>අවශ්‍ය ද්‍රව්‍ය නැවත ලබාගැනීමට හෝ වෙනස් කරගැනීමට බැරිය.</li>
        </ul>
      </div>
    </div>
  )
}
