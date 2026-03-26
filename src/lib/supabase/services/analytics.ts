import { createClient } from '../client'
import { withRetry, handleSupabaseError } from '../utils/error-handler'

export const analyticsService = {
  // Get sales analytics for date range
  async getSalesAnalytics(startDate: string, endDate: string) {
    return withRetry(async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_sales_analytics', {
        p_start_date: startDate,
        p_end_date: endDate,
      })

      if (error) throw handleSupabaseError(error)
      return data[0]
    })
  },

  // Get customer statistics
  async getCustomerStats(userId: string) {
    return withRetry(async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_customer_stats', {
        p_user_id: userId,
      })

      if (error) throw handleSupabaseError(error)
      return data[0]
    })
  },

  // Get low stock products
  async getLowStockProducts(threshold = 10) {
    return withRetry(async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_low_stock_products', {
        p_threshold: threshold,
      })

      if (error) throw handleSupabaseError(error)
      return data
    })
  },

  // Get product recommendations
  async getProductRecommendations(productId: string, limit = 4) {
    return withRetry(async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_product_recommendations', {
        p_product_id: productId,
        p_limit: limit,
      })

      if (error) throw handleSupabaseError(error)
      return data
    })
  },
}
