// Quick script to check Supabase configuration
require('dotenv').config()

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

console.log('\n🔍 Supabase Configuration Check\n')
console.log('='.repeat(50))

// Check if variables exist
console.log('\n1. Environment Variables:')
console.log(`   VITE_SUPABASE_URL: ${supabaseUrl ? '✅ Found' : '❌ Missing'}`)
console.log(`   VITE_SUPABASE_ANON_KEY: ${supabaseKey ? '✅ Found' : '❌ Missing'}`)

if (!supabaseUrl || !supabaseKey) {
  console.log('\n❌ ERROR: Missing environment variables!')
  console.log('\nPlease create a .env file in the project root with:')
  console.log('VITE_SUPABASE_URL=https://your-project.supabase.co')
  console.log('VITE_SUPABASE_ANON_KEY=your-anon-key-here')
  process.exit(1)
}

// Validate URL format
console.log('\n2. URL Validation:')
if (!supabaseUrl.startsWith('http://') && !supabaseUrl.startsWith('https://')) {
  console.log('   ❌ URL must start with http:// or https://')
} else if (!supabaseUrl.includes('supabase.co')) {
  console.log('   ⚠️  URL does not contain "supabase.co" - might be incorrect')
} else {
  console.log('   ✅ URL format looks correct')
  console.log(`   URL: ${supabaseUrl.substring(0, 30)}...`)
}

// Validate key format
console.log('\n3. Key Validation:')
if (!supabaseKey.startsWith('eyJ')) {
  console.log('   ❌ Key should start with "eyJ" (JWT format)')
} else if (supabaseKey.length < 100) {
  console.log('   ⚠️  Key seems too short (should be ~200+ characters)')
} else {
  console.log('   ✅ Key format looks correct')
  console.log(`   Key starts with: ${supabaseKey.substring(0, 20)}...`)
}

// Test connection to Supabase Auth endpoint (the one we're actually using)
console.log('\n4. Testing Supabase Auth Connection:')
const authTestUrl = `${supabaseUrl}/auth/v1/health`
console.log(`   Testing: ${authTestUrl}`)

// Use node-fetch or built-in fetch (Node 18+)
const https = require('https')
const http = require('http')
const url = require('url')

const parsedUrl = new URL(authTestUrl)
const client = parsedUrl.protocol === 'https:' ? https : http

const options = {
  hostname: parsedUrl.hostname,
  port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
  path: parsedUrl.pathname,
  method: 'GET',
  headers: {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json'
  }
}

const req = client.request(options, (res) => {
  let data = ''
  const contentType = res.headers['content-type'] || ''
  
  res.on('data', (chunk) => {
    data += chunk
  })
  
  res.on('end', () => {
    console.log(`   Status Code: ${res.statusCode}`)
    console.log(`   Content-Type: ${contentType}`)
    
    if (res.statusCode === 200 || res.statusCode === 204) {
      console.log('   ✅ Connection successful!')
      if (data) {
        console.log(`   Response: ${data.substring(0, 200)}`)
      }
    } else {
      console.log(`   ❌ Connection failed: ${res.statusCode}`)
      if (contentType.includes('text/html')) {
        console.log('   ⚠️  Server returned HTML instead of JSON!')
        console.log(`   Response preview: ${data.substring(0, 150)}...`)
        console.log('\n   This usually means:')
        console.log('   - The Supabase project is PAUSED (free tier projects pause after inactivity)')
        console.log('   - The Supabase project was deleted')
        console.log('   - The API key is incorrect or expired')
        console.log('\n   💡 Solution: Go to Supabase Dashboard and check if project is active')
      } else {
        console.log(`   Response: ${data.substring(0, 300)}`)
      }
    }
  })
})

req.on('error', (err) => {
  console.log(`   ❌ Connection error: ${err.message}`)
  console.log('\n   This could mean:')
  console.log('   - The Supabase URL is incorrect')
  console.log('   - Network connectivity issues')
  console.log('   - The Supabase project does not exist')
})

req.end()

console.log('\n' + '='.repeat(50))
console.log('\n💡 Next Steps:')
console.log('1. Verify your Supabase project is active (not paused)')
console.log('2. Go to Supabase Dashboard → Settings → API')
console.log('3. Copy the Project URL and anon/public key')
console.log('4. Update your .env file with the correct values')
console.log('5. Restart your backend server: npm run dev:server\n')

