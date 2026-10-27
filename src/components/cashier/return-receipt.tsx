import Barcode from 'react-barcode'
import { formatCurrency } from '@/lib/utils/currency'
import { resolveReceiptBranch } from '@/lib/utils/receipt-branch'
import type { ReturnReceiptData } from '@/lib/utils/return-receipt'

export default function ReturnReceipt({ receipt }: { receipt: ReturnReceiptData }) {
  const branch = resolveReceiptBranch(receipt.shop, receipt.till_code)
  return <div id="pos-receipt" className="bg-white text-black p-4 font-mono text-[11px] leading-tight w-full max-w-[80mm] mx-auto">
    <div className="text-center space-y-1 mb-3">
      <h2 className="text-sm font-black">IMobile Service &amp; Repair Center</h2>
      <p>{branch.address}</p><p>Tel: {branch.phone}</p>
      <h3 className="font-bold border-y border-dashed border-black py-2 mt-3">RETURN RECEIPT</h3>
      <p>Date: {receipt.returned_at ? new Date(receipt.returned_at).toLocaleString('en-GB') : '—'}</p>
      <p className="break-all">Return: {receipt.return_number}</p>
      <p>Original invoice: {receipt.invoice_number}</p>
      <p>Customer: {receipt.customer_name || 'Walk-in Customer'}</p>
      {receipt.customer_phone && <p>Customer Tel: {receipt.customer_phone}</p>}
      <p>Cashier: {receipt.cashier_name || 'Cashier'}</p>
      <p>Till: {receipt.till_code || 'N/A'}</p>
    </div>
    <div className="border-y border-dashed border-black py-3 space-y-3">
      {receipt.items.map((item, index) => <div key={index}>
        <p className="font-bold">{index + 1}) {item.product_name}</p>
        <div className="flex justify-between gap-2 mt-1"><span>Qty: {item.quantity}</span>
          <span>{item.condition === 'good' ? 'Good — restocked' : 'Bad — damaged stock'}</span></div>
      </div>)}
    </div>
    <div className="flex justify-between font-black text-sm py-3 border-b border-dashed border-black">
      <span>Refund amount</span><span>{receipt.refund_amount == null ? 'Not recorded' : formatCurrency(receipt.refund_amount)}</span>
    </div>
    <p className="text-center text-[10px] mt-3">Keep this receipt with your original invoice.</p>
    <div className="flex justify-center my-3 overflow-hidden">{receipt.invoice_number && <Barcode value={receipt.invoice_number} displayValue={false} height={35} width={1.3} margin={4} />}</div>
  </div>
}
