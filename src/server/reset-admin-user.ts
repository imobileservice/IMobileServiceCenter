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

async function resetAdminUser() {
    const email = 'dexlanka@gmail.com'
    const password = '123456'

    console.log(`Step 1: Finding user ${email}...`)

    // Get the user
    const { data: users } = await adminClient.auth.admin.listUsers()
    const user = users.users.find(u => u.email?.toLowerCase() === email.toLowerCase())

    if (!user) {
        console.log('User not found, creating new one...')
    } else {
        console.log(`Found user ID: ${user.id}`)
        console.log(`Step 2: Deleting user...`)

        // Delete the user
        const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id)

        if (deleteError) {
            console.error('❌ Error deleting user:', deleteError.message)
            return
        }

        console.log('✅ User deleted')
    }

    console.log(`Step 3: Creating user with password "${password}"...`)

    // Create new user
    const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
            role: 'admin'
        }
    })

    if (error) {
        console.error('❌ Error creating user:', error.message)
        return
    }

    console.log('✅ Admin user created successfully!')
    console.log('User ID:', data.user.id)
    console.log('Email:', data.user.email)
    console.log(`\nCredentials:`)
    console.log(`  Email: ${email}`)
    console.log(`  Password: ${password}`)
}

resetAdminUser()
