
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env' })

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials in .env')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function main() {
    const email = 'imobile.admin@gmail.com'
    const password = 'password123'

    console.log(`Checking user: ${email}`)

    // 1. Get User ID
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers()

    if (listError) {
        console.error('Failed to list users:', listError)
        return
    }

    let user = users.find(u => u.email === email)

    if (!user) {
        console.log('User not found. Creating user...')
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { name: 'Admin User' }
        })

        if (createError) {
            console.error('Failed to create user:', createError)
            return
        }

        user = newUser.user
        console.log(`User created: ${user.id}`)
    } else {
        console.log(`Found user ID: ${user.id}`)
        // Reset password just in case
        await supabase.auth.admin.updateUserById(user.id, { password })
        console.log('Password reset to:', password)
    }

    // 2. Check Profile
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

    if (profileError && profileError.code !== 'PGRST116') {
        console.error('Profile check error:', profileError)
        return
    }

    if (!profile) {
        console.log('Creating profile...')
        await supabase.from('profiles').insert({
            id: user.id,
            email: email,
            name: 'Admin User',
            whatsapp: '+1234567890', // Dummy number
            role: 'admin'
        })
        console.log('Profile created with WhatsApp number.')
    } else {
        if (!profile.whatsapp) {
            console.log('Updating WhatsApp number...')
            await supabase.from('profiles').update({ whatsapp: '+1234567890' }).eq('id', user.id)
            console.log('WhatsApp number updated.')
        } else {
            console.log(`WhatsApp number is set: ${profile.whatsapp}`)
        }
    }

    console.log('Done.')
}

main().catch(console.error)
