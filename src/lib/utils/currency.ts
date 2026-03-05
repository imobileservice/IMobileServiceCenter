/**
 * Currency formatting utilities for Sri Lankan Rupees (LKR)
 */

/**
 * Format a number as Sri Lankan Rupees
 * @param amount - The amount to format
 * @param options - Formatting options
 * @returns Formatted currency string (e.g., "Rs. 1,234.56")
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  options: {
    showDecimals?: boolean
    minimumFractionDigits?: number
    maximumFractionDigits?: number
  } = {}
): string {
  if (amount === null || amount === undefined || amount === '') {
    return 'Rs. 0.00'
  }

  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount

  if (isNaN(numAmount)) {
    return 'Rs. 0.00'
  }

  const {
    showDecimals = true,
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
  } = options

  const formatted = new Intl.NumberFormat('en-LK', {
    style: 'decimal',
    minimumFractionDigits: showDecimals ? minimumFractionDigits : 0,
    maximumFractionDigits: showDecimals ? maximumFractionDigits : 0,
  }).format(numAmount)

  return `Rs. ${formatted}`
}

/**
 * Format currency without decimals (for whole numbers)
 */
export function formatCurrencyWhole(amount: number | string | null | undefined): string {
  return formatCurrency(amount, { showDecimals: false })
}

/**
 * Format currency with custom decimal places
 */
export function formatCurrencyWithDecimals(
  amount: number | string | null | undefined,
  decimals: number = 2
): string {
  return formatCurrency(amount, {
    showDecimals: true,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

