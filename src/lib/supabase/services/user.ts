import { createClient } from '../client'
import { getAuthTokenFast } from '../utils/auth-helpers'

export const userService = {
    /**
     * Delete current user's account permanently
     */
    async deleteAccount() {
        try {
            const supabase = createClient()

            // Get current session for token (real-time check)
            const accessToken = await getAuthTokenFast(false)

            if (!accessToken) {
                throw new Error('Not authenticated')
            }

            // Call our API endpoint
            const siteUrl = import.meta.env.VITE_SITE_URL || window.location.origin
            const response = await fetch(`${siteUrl}/api/user/delete-account`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                throw new Error(errorData.error || `Failed to delete account: ${response.statusText}`)
            }

            return await response.json()
        } catch (error: any) {
            console.error('Error deleting account:', error)
            throw error
        }
    }
}
