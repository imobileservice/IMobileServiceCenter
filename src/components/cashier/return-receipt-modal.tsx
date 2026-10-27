import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import ReturnReceipt from './return-receipt'
import type { ReturnReceiptData } from '@/lib/utils/return-receipt'

export default function ReturnReceiptModal({ receipt, onClose }: { receipt: ReturnReceiptData; onClose: () => void }) {
  return <div role="dialog" aria-modal="true" aria-label="Return receipt" className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 p-4 print:bg-white print:p-0">
    <div className="bg-background border border-border rounded-xl shadow-xl w-full max-w-[400px] overflow-hidden print:border-0">
      <div className="p-4 overflow-y-auto max-h-[80vh] print:max-h-none print:p-0"><ReturnReceipt receipt={receipt} /></div>
      <div className="p-4 border-t border-border grid grid-cols-2 gap-3 print:hidden">
        <Button className="gap-2" onClick={() => window.print()}><Printer className="w-4 h-4" />Print return</Button>
        <Button variant="outline" onClick={onClose}>Done</Button>
      </div>
    </div>
  </div>
}
