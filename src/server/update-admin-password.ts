import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase Config')
    process.exit(1)
}

const adminClient = createClient(supabaseUrl, supabaseServiceKey)

async function updateAdminPassword() {
    const email = 'dexlanka@gmail.com'
    const newPassword = '123456'

    console.log(`Updating password for ${email} in Supabase Auth...`)

    // First, get the user by email
    const { data: users } = await adminClient.auth.admin.listUsers()
    const user = users.users.find(u => u.email?.toLowerCase() === email.toLowerCase())

    if (!user) {
        console.error(`❌ User ${email} not found in Supabase Auth`)
        return
    }

    console.log(`Found user ID: ${user.id}`)

    // Update password using admin API
    const { data, error } = await adminClient.auth.admin.updateUserById(
        user.id,
        { password: newPassword }
    )

    if (error) {
        console.error('❌ Error updating password:', error.message)
        return
    }

    console.log('✅ Password updated successfully!')
    console.log(`\nYou can now login with:`)
    console.log(`  Email: ${email}`)
    console.log(`  Password: ${newPassword}`)
}

updateAdminPassword()
