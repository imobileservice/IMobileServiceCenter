import { useDeliveryFee } from './use-delivery-fee'

// A saved customer/shop selection is a delivery sale; the separate walk-in form is not.
export function usePosDeliveryFee(hasRecipient: boolean, hasItems: boolean) {
  const { fee, error, refresh } = useDeliveryFee()
  const applicable = hasRecipient && hasItems
  return {
    deliveryFee: applicable ? fee ?? 0 : 0,
    feeUnavailable: applicable && (fee === null || error),
    refreshDeliveryFee: refresh,
    confirmDeliveryFee: async () => {
      if (!hasRecipient) return 0
      const current = await refresh()
      if (current === null) throw new Error('Unable to load delivery fee. Please try again.')
      if (current !== fee) throw new Error('The delivery fee has changed. Review the updated total and complete payment again.')
      return current
    },
  }
}
