import { useDeliveryFee } from './use-delivery-fee'
import { useEffect, useState } from 'react'
import { parseDeliveryFee } from '@/lib/utils/order-totals'

// A saved customer/shop selection is a delivery sale; the separate walk-in form is not.
export function usePosDeliveryFee(recipientKey: string | null, hasItems: boolean) {
  const { fee, error, refresh } = useDeliveryFee()
  const [edit, setEdit] = useState<{ key: string; value: string } | null>(null)
  useEffect(() => setEdit(null), [recipientKey])
  const overridden = Boolean(recipientKey && edit?.key === recipientKey)
  const input = overridden ? edit!.value : fee?.toFixed(2) ?? ''
  let amount: number | null = null
  try { amount = parseDeliveryFee(input) } catch { /* Inline validation in the fee field. */ }
  const applicable = Boolean(recipientKey && hasItems)
  return {
    deliveryFee: applicable ? amount ?? 0 : 0,
    feeUnavailable: applicable && (amount === null || (!overridden && error)),
    feeInput: recipientKey ? input : '0.00',
    feeInvalid: Boolean(recipientKey && input !== '' && amount === null),
    feeLoading: !overridden && fee === null,
    feeOverridden: overridden,
    setFeeInput: (value: string) => { if (recipientKey) setEdit({ key: recipientKey, value }) },
    resetFee: () => setEdit(null),
    refreshDeliveryFee: refresh,
    confirmDeliveryFee: async () => {
      if (!recipientKey) return 0
      if (overridden) return parseDeliveryFee(input)
      const current = await refresh()
      if (current === null) throw new Error('Unable to load delivery fee. Please try again.')
      if (current !== fee) throw new Error('The delivery fee has changed. Review the updated total and complete payment again.')
      return current
    },
  }
}
