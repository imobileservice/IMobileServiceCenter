import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

try {
    const envPath = path.resolve(process.cwd(), '.env')
    console.log(`🔍 Checking for .env at: ${envPath}`)

    if (fs.existsSync(envPath)) {
        const result = dotenv.config({
            path: envPath,
            override: true
        })

        if (result.error) {
            console.error('❌ Error loading .env file:', result.error)
        } else {
            console.log('✨ Environment variables successfully overridden from .env')
        }
    } else {
        console.warn('⚠️ No .env file found at root, using existing environment variables')
    }
} catch (err) {
    console.error('❌ Critical error in load-env:', err)
}
