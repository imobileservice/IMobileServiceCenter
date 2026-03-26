// Test Supabase Auth endpoint directly
require('dotenv').config()

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const https = require('https')
const url = require('url')

console.log('\n🧪 Testing Supabase Auth Endpoint\n')
console.log('='.repeat(50))

// Test 1: Health check (we know this works)
console.log('\n1. Testing /auth/v1/health:')
testEndpoint('/auth/v1/health', 'GET', null)

// Test 2: Try to sign in with a test email (will fail but should return JSON error, not HTML)
console.log('\n2. Testing /auth/v1/token?grant_type=password:')
const testBody = JSON.stringify({
  email: 'test@example.com',
  password: 'wrongpassword'
})

testEndpoint('/auth/v1/token?grant_type=password', 'POST', testBody)

function testEndpoint(path, method, body) {
  const parsedUrl = new URL(supabaseUrl)
  const options = {
    hostname: parsedUrl.hostname,
    port: 443,
    path: path,
    method: method,
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json'
    }
  }

  const req = https.request(options, (res) => {
    let data = ''
    const contentType = res.headers['content-type'] || ''
    
    res.on('data', (chunk) => {
      data += chunk
    })
    
    res.on('end', () => {
      console.log(`   Status: ${res.statusCode}`)
      console.log(`   Content-Type: ${contentType}`)
      
      if (contentType.includes('text/html')) {
        console.log('   ❌ PROBLEM: Server returned HTML instead of JSON!')
        console.log(`   Response preview: ${data.substring(0, 200)}...`)
        console.log('\n   This means:')
        console.log('   - The endpoint is returning an error page')
        console.log('   - Check if your Supabase project has any restrictions')
        console.log('   - Verify the endpoint path is correct')
      } else if (contentType.includes('application/json')) {
        console.log('   ✅ Good: Server returned JSON')
        try {
          const json = JSON.parse(data)
          console.log(`   Response: ${JSON.stringify(json).substring(0, 200)}...`)
        } catch (e) {
          console.log(`   ⚠️  Response is not valid JSON: ${data.substring(0, 200)}`)
        }
      } else {
        console.log(`   Response: ${data.substring(0, 200)}`)
      }
    })
  })

  req.on('error', (err) => {
    console.log(`   ❌ Error: ${err.message}`)
  })

  if (body) {
    req.write(body)
  }
  req.end()
}

console.log('\n' + '='.repeat(50))
console.log('\n💡 If you see HTML responses, check:')
console.log('1. Supabase Dashboard → Settings → API → Is Data API enabled?')
console.log('2. Supabase Dashboard → Is the project active (not paused)?')
console.log('3. Try creating a new test user in Supabase Dashboard\n')

