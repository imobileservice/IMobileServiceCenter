export interface PaginationOptions {
  page?: number
  pageSize?: number
  orderBy?: string
  orderDirection?: 'asc' | 'desc'
}

export interface PaginatedResponse<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  hasMore: boolean
}

export function createPaginationQuery(
  query: any,
  options: PaginationOptions = {}
) {
  const { page = 1, pageSize = 20, orderBy = 'created_at', orderDirection = 'desc' } = options
  
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  return query
    .order(orderBy, { ascending: orderDirection === 'asc' })
    .range(from, to)
}

export async function paginateQuery<T>(
  query: any,
  options: PaginationOptions = {}
): Promise<PaginatedResponse<T>> {
  const { page = 1, pageSize = 20 } = options

  // Get total count
  const { count } = await query.select('*', { count: 'exact', head: true })
  const total = count || 0

  // Get paginated data
  const paginatedQuery = createPaginationQuery(query, options)
  const { data, error } = await paginatedQuery

  if (error) throw error

  const totalPages = Math.ceil(total / pageSize)
  const hasMore = page < totalPages

  return {
    data: data as T[],
    page,
    pageSize,
    total,
    totalPages,
    hasMore,
  }
}
