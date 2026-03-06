import { Request, Response } from 'express'
import { createServerClient } from '@supabase/ssr'

/**
 * GET /api/test-env
 * MIGRATION: Converted from Next.js API route to Express handler
 */
export async function testEnvHandler(req: Request, res: Response) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''

  const response: any = {
    environment: {
      url: url || '❌ Not loaded',
      key: key ? '✅ Loaded (hidden for safety)' : '❌ Not loaded',
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL || process.env.VITE_SITE_URL || '❌ Not loaded',
      nodeEnv: process.env.NODE_ENV || '❌ Not loaded',
      cwd: process.cwd(),
      envPath: require('path').resolve(process.cwd(), '.env'),
      envExists: require('fs').existsSync(require('path').resolve(process.cwd(), '.env')),
      hasUrl: !!url,
      hasKey: !!key,
    },
    connection: {
      status: 'not_tested',
      message: '',
    },
  }

  // Test actual connection if env vars are present
  if (url && key && url !== '' && key !== '') {
    try {
      const supabase = createServerClient(url, key, {
        cookies: {
          getAll() {
            return []
          },
          setAll() {
            // No-op for test
          },
        } as any, // Type assertion for test endpoint
      })

      // Test database connection
      const { error } = await supabase.from('profiles').select('id').limit(1)

      if (error) {
        response.connection = {
          status: 'error',
          message: `Database connection failed: ${error.message}`,
          error: error.message,
        }
      } else {
        response.connection = {
          status: 'success',
          message: '✅ Database connection successful!',
        }
      }
    } catch (error: any) {
      response.connection = {
        status: 'error',
        message: `Connection test failed: ${error.message}`,
        error: error.message,
      }
    }
  } else {
    response.connection = {
      status: 'skipped',
      message: 'Cannot test connection: Environment variables are missing',
    }
  }

  const statusCode = response.environment.hasUrl && response.environment.hasKey ? 200 : 500
  return res.status(statusCode).json(response)
}

