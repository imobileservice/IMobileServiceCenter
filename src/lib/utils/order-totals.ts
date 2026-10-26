// Website orders store the delivery fee in the existing `shipping` column.
export const isWalkInOrder = (paymentMethod?: string | null) => paymentMethod === 'visit_shop'

export function parseDeliveryFee(value: unknown): number {
  if ((typeof value !== 'number' && typeof value !== 'string') ||
      !/^\d+(\.\d{1,2})?$/.test(String(value).trim())) {
    throw new Error('Enter a valid delivery fee with up to two decimal places')
  }
  const fee = Number(value)
  if (!Number.isFinite(fee) || fee < 0 || fee > 99999999.99) {
    throw new Error('Delivery fee must be between 0.00 and 99,999,999.99')
  }
  return fee
}

export const INITIAL_DELIVERY_FEE = 500

export function defaultDeliveryFee(configuredFee: number, paymentMethod?: string | null): number {
  return isWalkInOrder(paymentMethod) ? 0 : configuredFee
}

export function orderTotals(order: {
  subtotal?: number | string | null
  tax?: number | string | null
  shipping?: number | string | null
  payment_method?: string | null
}, deliveryFee: number = Number(order.shipping || 0)) {
  const shipping = isWalkInOrder(order.payment_method) ? 0 : parseDeliveryFee(deliveryFee)
  const total = Math.round((Number(order.subtotal || 0) + Number(order.tax || 0) + shipping) * 100) / 100
  return { shipping, total }
}
