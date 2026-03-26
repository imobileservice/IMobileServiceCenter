/**
 * Optimistic update utilities for better UX
 */

export interface OptimisticUpdate<T> {
  data: T
  rollback: () => void
  commit: () => void
}

/**
 * Create optimistic update for cart
 */
export function createOptimisticCartUpdate<T>(
  currentItems: T[],
  updateFn: (items: T[]) => T[],
  onRollback?: (items: T[]) => void
): OptimisticUpdate<T[]> {
  const previousItems = [...currentItems]
  const optimisticItems = updateFn(currentItems)

  return {
    data: optimisticItems,
    rollback: () => {
      onRollback?.(previousItems)
    },
    commit: () => {
      // Commit successful, no rollback needed
    },
  }
}

/**
 * Execute operation with optimistic update
 */
export async function withOptimisticUpdate<T, R>(
  optimisticData: T,
  operation: () => Promise<R>,
  onSuccess?: (result: R) => void,
  onError?: (error: Error, rollback: () => void) => void
): Promise<R> {
  try {
    const result = await operation()
    onSuccess?.(result)
    return result
  } catch (error) {
    // Rollback on error
    if (onError) {
      onError(error as Error, () => {
        // Rollback logic would be called here
      })
    }
    throw error
  }
}

/**
 * Batch optimistic updates
 */
export class OptimisticUpdateQueue<T> {
  private updates: Array<{
    id: string
    update: T
    rollback: () => void
  }> = []

  add(id: string, update: T, rollback: () => void) {
    this.updates.push({ id, update, rollback })
  }

  commit(id: string) {
    const index = this.updates.findIndex(u => u.id === id)
    if (index !== -1) {
      this.updates.splice(index, 1)
    }
  }

  rollback(id: string) {
    const update = this.updates.find(u => u.id === id)
    if (update) {
      update.rollback()
      this.updates = this.updates.filter(u => u.id !== id)
    }
  }

  rollbackAll() {
    this.updates.forEach(update => update.rollback())
    this.updates = []
  }

  clear() {
    this.updates = []
  }
}
