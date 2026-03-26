
import dotenv from 'dotenv'


dotenv.config({ path: '.env' })

const BASE_URL = process.env.API_URL || 'http://localhost:4000'
// Ensure no trailing slash
const API_URL = BASE_URL.replace(/\/$/, '')

async function testLoginFlow() {
    const email = 'imobile.admin@gmail.com'
    const password = 'password123'

    console.log('--- TEST: Admin Login Flow ---')
    console.log(`Target: ${API_URL}`)

    // Step 1: Init Login
    console.log('\n1. Calling /api/admin/login/init...')
    try {
        const initRes = await fetch(`${API_URL}/api/admin/login/init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        })

        if (!initRes.ok) {
            const errText = await initRes.text()
            console.error(`Step 1 Failed: ${initRes.status} ${initRes.statusText}`)
            try {
                const errJson = JSON.parse(errText)
                if (errJson.debug) {
                    console.log('DEBUG INFO:')
                    console.log('User ID from Auth:', errJson.debug.userId)
                    console.log('Supabase URL:', errJson.debug.supabaseUrl)
                    console.log('Profile Error:', JSON.stringify(errJson.debug.profileError, null, 2))
                }
            } catch (e) {
                console.error('Response text:', errText)
            }
            return
        }

        const initData = await initRes.json()
        console.log('Step 1 Success:', JSON.stringify(initData, null, 2))

        if (!initData.success) {
            console.error('Step 1 returned success: false')
            return
        }

        const otp = initData.otp
        if (!otp) {
            console.error('OTP not returned in response (expected in DEV mode)')
            return
        }

        console.log(`Got OTP: ${otp}`)

        // Step 2: Verify OTP
        console.log('\n2. Calling /api/admin/login/verify...')
        const verifyRes = await fetch(`${API_URL}/api/admin/login/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, otp })
        })

        if (!verifyRes.ok) {
            const errText = await verifyRes.text()
            console.error(`Step 2 Failed: ${verifyRes.status} ${verifyRes.statusText}`)
            console.error('Response:', errText)
            return
        }

        const verifyData = await verifyRes.json()
        console.log('Step 2 Success:', JSON.stringify(verifyData, null, 2))

        if (verifyData.user && verifyData.session) {
            console.log('\n✅ LOGIN FLOW VERIFIED SUCCESSFULLY!')
        } else {
            console.error('\n❌ Verified but missing user/session data')
        }

    } catch (err) {
        console.error('Test Failed Exception:', err)
    }
}

testLoginFlow()
