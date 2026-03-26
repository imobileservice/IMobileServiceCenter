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

async function createAdminUser() {
    const email = 'dexlanka@gmail.com'
    const password = '123456'

    console.log(`Creating admin user in Supabase Auth...`)
    console.log(`Email: ${email}`)

    // Create user using admin API
    const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto-confirm email
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
    console.log('\nYou can now login with:')
    console.log(`  Email: ${email}`)
    console.log(`  Password: ${password}`)
}

createAdminUser()
