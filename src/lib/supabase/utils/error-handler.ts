export class SupabaseError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number,
    public details?: any
  ) {
    super(message)
    this.name = 'SupabaseError'
  }
}

export function handleSupabaseError(error: any): never {
  // Parse Supabase error
  if (error?.code && error?.message) {
    throw new SupabaseError(
      error.message,
      error.code,
      error.statusCode,
      error.details
    )
  }

  // Parse PostgREST error
  if (error?.code && error?.details) {
    const message = error.message || error.details
    throw new SupabaseError(message, error.code, error.statusCode, error.details)
  }

  // Generic error
  throw new SupabaseError(
    error?.message || 'An unexpected error occurred',
    error?.code,
    error?.statusCode
  )
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 500,
  timeoutPerAttempt = 8000 // Reduced from 15s to 8s for faster failure
): Promise<T> {
  let lastError: Error | undefined

  for (let i = 0; i < maxRetries; i++) {
    try {
      const attemptPromise = fn()
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Operation timeout')), timeoutPerAttempt)
      )

      return await Promise.race([attemptPromise, timeoutPromise])
    } catch (error: any) {
      lastError = error

      // Don't retry on auth errors, client errors, or explicit timeouts
      if (error instanceof SupabaseError) {
        if (error.statusCode && error.statusCode < 500) {
          throw error
        }
      }
      if (error.message === 'Operation timeout') {
        console.warn(`[withRetry] Timeout detected - not retrying`)
        throw error // Re-throw timeout error immediately
      }

      // Wait before retrying (exponential backoff)
      if (i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i)
        console.warn(`[withRetry] Attempt ${i + 1}/${maxRetries} failed: ${error.message}. Retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError!
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof SupabaseError) {
    return error.message
  }
  
  if (error instanceof Error) {
    return error.message
  }

  return 'An unexpected error occurred'
}

export function isNetworkError(error: unknown): boolean {
  if (error instanceof SupabaseError) {
    return error.statusCode === undefined || error.statusCode >= 500
  }
  
  return false
}
