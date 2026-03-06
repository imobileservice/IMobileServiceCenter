import dotenv from 'dotenv'
import path from 'path'

// Load environment variables from .env file and override existing process.env values
// This is critical on Railway to bypass stale dashboard variables
dotenv.config({
    path: path.resolve(process.cwd(), '.env'),
    override: true
})

console.log('✨ Environment variables loaded and overridden from .env')
