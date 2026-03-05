import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase Config')
    process.exit(1)
}

const client = createClient(supabaseUrl, supabaseKey)

async function testLogin() {
    const email = 'dexlanka@gmail.com'
    const password = '123456'

    console.log(`Testing Supabase Auth login...`)
    console.log(`Email: ${email}`)
    console.log(`Password: ${password}`)
    console.log()

    const { data, error } = await client.auth.signInWithPassword({
        email,
        password
    })

    if (error) {
        console.error('❌ Login failed!')
        console.error('Error:', error.message)
        console.error('Status:', error.status)
        console.error('\nThis means the password in Supabase Auth does NOT match "123456"')
        return
    }

    console.log('✅ Login successful!')
    console.log('User ID:', data.user.id)
    console.log('Email:', data.user.email)
    console.log('Session:', data.session ? 'Created' : 'None')
}

testLogin()
