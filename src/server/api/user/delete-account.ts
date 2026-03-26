import { Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'

/**
 * DELETE /api/user/delete-account
 * Permanently delete user account and all associated data
 */
export async function deleteAccountHandler(req: Request, res: Response) {
    try {
        // Get user from session
        const authHeader = req.headers.authorization
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Not authenticated' })
        }

        const token = authHeader.substring(7)

        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

        if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
            return res.status(503).json({ error: 'Supabase not configured' })
        }

        // Create client with user's token to verify authentication
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            global: {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        })

        // Get current user
        const { data: { user }, error: userError } = await supabase.auth.getUser(token)

        if (userError || !user) {
            return res.status(401).json({ error: 'Invalid authentication token' })
        }

        const userId = user.id

        // Create admin client for deletion
        const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
            auth: { persistSession: false, autoRefreshToken: false }
        })

        console.log(`[delete-account] Starting account deletion for user: ${userId}`)

        // Delete user data in order (to handle foreign key constraints)

        // 1. Delete addresses
        const { error: addressError } = await adminClient
            .from('addresses')
            .delete()
            .eq('user_id', userId)

        if (addressError) {
            console.error('[delete-account] Error deleting addresses:', addressError)
        } else {
            console.log('[delete-account] ✓ Addresses deleted')
        }

        // 2. Delete wishlist items
        const { error: wishlistError } = await adminClient
            .from('wishlist')
            .delete()
            .eq('user_id', userId)

        if (wishlistError) {
            console.error('[delete-account] Error deleting wishlist:', wishlistError)
        } else {
            console.log('[delete-account] ✓ Wishlist deleted')
        }

        // 3. Delete order items (must be before orders due to foreign key)
        const { data: orders } = await adminClient
            .from('orders')
            .select('id')
            .eq('user_id', userId)

        if (orders && orders.length > 0) {
            const orderIds = orders.map(o => o.id)
            const { error: orderItemsError } = await adminClient
                .from('order_items')
                .delete()
                .in('order_id', orderIds)

            if (orderItemsError) {
                console.error('[delete-account] Error deleting order items:', orderItemsError)
            } else {
                console.log('[delete-account] ✓ Order items deleted')
            }
        }

        // 4. Delete orders
        const { error: ordersError } = await adminClient
            .from('orders')
            .delete()
            .eq('user_id', userId)

        if (ordersError) {
            console.error('[delete-account] Error deleting orders:', ordersError)
        } else {
            console.log('[delete-account] ✓ Orders deleted')
        }

        // 5. Delete email verification OTPs (if table exists)
        const { error: otpError } = await adminClient
            .from('email_verification_otps')
            .delete()
            .eq('user_id', userId)

        if (otpError && !otpError.message?.includes('does not exist')) {
            console.error('[delete-account] Error deleting OTPs:', otpError)
        } else {
            console.log('[delete-account] ✓ Email OTPs deleted')
        }

        // 6. Delete profile
        const { error: profileError } = await adminClient
            .from('profiles')
            .delete()
            .eq('id', userId)

        if (profileError) {
            console.error('[delete-account] Error deleting profile:', profileError)
        } else {
            console.log('[delete-account] ✓ Profile deleted')
        }

        // 7. Delete user account from auth
        const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(userId)

        if (deleteUserError) {
            console.error('[delete-account] Error deleting user account:', deleteUserError)
            return res.status(500).json({
                error: 'Failed to delete user account',
                details: deleteUserError.message
            })
        }

        console.log('[delete-account] ✅ Account deleted successfully')

        return res.json({
            success: true,
            message: 'Account deleted successfully'
        })
    } catch (e: any) {
        console.error('[delete-account] Unexpected error:', e)
        return res.status(500).json({
            error: e?.message || 'Unexpected error during account deletion'
        })
    }
}
