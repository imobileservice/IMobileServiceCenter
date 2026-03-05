import { createClient } from '../client'

export const userService = {
    /**
     * Delete current user's account permanently
     */
    async deleteAccount() {
        try {
            const supabase = createClient()

            // Get current session for token
            const { data: { session }, error: sessionError } = await supabase.auth.getSession()

            if (sessionError || !session) {
                throw new Error('Not authenticated')
            }

            // Call our API endpoint
            const siteUrl = import.meta.env.VITE_SITE_URL || window.location.origin
            const response = await fetch(`${siteUrl}/api/user/delete-account`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
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
