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

async function checkAuthUsers() {
    console.log('Checking Supabase Auth users...')

    // List all users using admin API
    const { data, error } = await adminClient.auth.admin.listUsers()

    if (error) {
        console.error('Error listing users:', error)
        return
    }

    console.log(`\nTotal users in Supabase Auth: ${data.users.length}`)
    console.log('\nUsers:')
    data.users.forEach((user, i) => {
        console.log(`\n${i + 1}. Email: ${user.email}`)
        console.log(`   ID: ${user.id}`)
        console.log(`   Created: ${user.created_at}`)
    })

    // Check specifically for dexlanka@gmail.com
    const targetEmail = 'dexlanka@gmail.com'
    const adminUser = data.users.find(u => u.email?.toLowerCase() === targetEmail.toLowerCase())

    if (adminUser) {
        console.log(`\n✅ Admin user ${targetEmail} EXISTS in Supabase Auth`)
    } else {
        console.log(`\n❌ Admin user ${targetEmail} NOT FOUND in Supabase Auth`)
        console.log('   This user needs to be created in Supabase Auth for login to work.')
    }
}

checkAuthUsers()
