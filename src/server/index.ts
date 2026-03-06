// SURGICAL FIX: Force correct Supabase URL if Railway dashboard has stale/broken ones
// This MUST be at the very top of the entry point to override variables before other modules load
const CORRECT_URL = 'https://jzdsgqdwpmfrrspxpehi.supabase.co';
const CORRECT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZHNncWR3cG1mcnJzcHhwZWhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwNzM5OTcsImV4cCI6MjA3NzY0OTk5N30.wPzTwdl7o9QY_EMNoJ6jwzUAiE3Rq136n98-yH1aBzc';

if (!process.env.VITE_SUPABASE_URL?.includes('jzdsgqdwpmfrrspxpehi')) {
  console.log('🔧 Surgical Override: Setting correct Supabase URL');
  process.env.VITE_SUPABASE_URL = CORRECT_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = CORRECT_URL;
  process.env.SUPABASE_URL = CORRECT_URL;
}

if (!process.env.VITE_SUPABASE_ANON_KEY?.includes('jzdsgqdwpmfrrspxpehi') || !process.env.VITE_SUPABASE_ANON_KEY?.includes('wPzTwdl7o9QY_EMNoJ6jwzUAiE3Rq136n98-yH1aBzc')) {
  console.log('🔧 Surgical Override: Setting correct Supabase Key');
  process.env.VITE_SUPABASE_ANON_KEY = CORRECT_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = CORRECT_KEY;
  process.env.SUPABASE_ANON_KEY = CORRECT_KEY;
}

import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import path from 'path'
import apiRouter from './api'

const app = express()
const PORT = process.env.PORT || 4000

// Log environment variable status (without exposing secrets)
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
console.log('🔧 Environment Status:')
console.log(`  - Supabase URL: ${supabaseUrl ? '✅ Loaded' : '❌ Missing'}`)
if (supabaseUrl) {
  // Show first 30 chars and last 10 chars for verification
  const urlPreview = supabaseUrl.length > 40
    ? `${supabaseUrl.substring(0, 30)}...${supabaseUrl.substring(supabaseUrl.length - 10)}`
    : supabaseUrl
  console.log(`    URL: ${urlPreview}`)
  // Validate URL format
  if (!supabaseUrl.startsWith('https://') || !supabaseUrl.includes('.supabase.co')) {
    console.warn(`    ⚠️  WARNING: URL format might be incorrect!`)
    console.warn(`    Expected format: https://xxxxx.supabase.co`)
  }
}
console.log(`  - Supabase Key: ${supabaseKey ? '✅ Loaded' : '❌ Missing'}`)
if (supabaseKey) {
  // Validate key format
  if (!supabaseKey.startsWith('eyJ')) {
    console.warn(`    ⚠️  WARNING: Key format might be incorrect!`)
    console.warn(`    Expected format: JWT token starting with 'eyJ'`)
  } else {
    console.log(`    Key format: ✅ Valid JWT (starts with eyJ)`)
  }
}
console.log(`  - Node Environment: ${process.env.NODE_ENV || 'development'}`)
console.log(`  - Server Port: ${PORT}`)
if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️  Warning: Supabase environment variables not found!')
  console.warn('   Make sure your .env file contains VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
}

// Middleware
// CORS configuration - allow multiple origins in development
// Add your Cloudflare Pages URL here when deploying
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [
    // Primary frontend URL (configure in Railway/production env vars if possible)
    process.env.VITE_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
    // Explicit custom domains currently in use
    'https://imobileservicecenter.lk',
    'https://www.imobileservicecenter.lk',
    // Cloudflare Pages/Workers URLs
    process.env.CLOUDFLARE_PAGES_URL,
    'https://imobile.kalhararashmitha.workers.dev',
    'https://*.workers.dev',
    'https://*.pages.dev',
  ].filter(Boolean)
  : [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:3002',
    'http://127.0.0.1:3003',
    'http://localhost:5175',
    'http://localhost:5176',
    process.env.VITE_DEV_URL,
    // Allow Cloudflare Pages/custom domains in development too for testing
    process.env.CLOUDFLARE_PAGES_URL,
    'https://imobileservicecenter.lk',
    'https://www.imobileservicecenter.lk',
    'https://imobile.kalhararashmitha.workers.dev',
    'https://*.workers.dev',
    'https://*.pages.dev',
  ].filter(Boolean)

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, Postman, or same-origin requests)
    if (!origin) {
      callback(null, true)
      return
    }

    // Check exact matches
    if (allowedOrigins.includes(origin)) {
      callback(null, true)
      return
    }

    // Check wildcard patterns for Cloudflare domains
    const isCloudflareDomain =
      origin.endsWith('.workers.dev') ||
      origin.endsWith('.pages.dev') ||
      origin.endsWith('.trycloudflare.com')

    if (isCloudflareDomain) {
      callback(null, true)
      return
    }

    // In development, allow all origins for easier debugging
    if (process.env.NODE_ENV !== 'production') {
      callback(null, true)
    } else {
      console.warn(`⚠️  CORS blocked origin: ${origin}`)
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
}))
app.use(express.json())
app.use(cookieParser())

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`)
  })
  next()
})

// Middleware to ensure API routes always return JSON
app.use('/api', (req, res, next) => {
  // Store original json method
  const originalJson = res.json.bind(res)

  // Override json to ensure Content-Type is set
  res.json = function (body: any) {
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json')
    }
    return originalJson(body)
  }

  // Override send to ensure JSON for API routes
  const originalSend = res.send.bind(res)
  res.send = function (body: any) {
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json')
      // If body is not already JSON, convert it
      if (typeof body === 'string' && !body.startsWith('{') && !body.startsWith('[')) {
        return originalSend(JSON.stringify({ error: body }))
      }
    }
    return originalSend(body)
  }

  next()
})

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: {
      supabaseConfigured: !!(supabaseUrl && supabaseKey),
      nodeEnv: process.env.NODE_ENV || 'development',
    }
  })
})

// API routes
app.use('/api', apiRouter)

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../../dist')
  app.use(express.static(distPath))

  // Serve index.html for all non-API routes (SPA fallback)
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'))
    }
  })
}

// Global error handler - MUST be after routes
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ Server Error:', err)
  console.error('❌ Error Stack:', err?.stack)

  // Ensure we always return JSON for API routes
  if (req.path.startsWith('/api')) {
    if (!res.headersSent) {
      res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
      })
    }
  } else {
    // For non-API routes, use default error handling
    if (!res.headersSent) {
      res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
      })
    }
  }
})

// Handle 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.path })
})

const server = app.listen(PORT, () => {
  console.log(`✅ API server listening on port ${PORT}`)
  console.log(`   Health check: http://localhost:${PORT}/health`)
  console.log(`   API routes:   http://localhost:${PORT}/api`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server')
  server.close(() => {
    console.log('HTTP server closed')
  })
})

process.on('SIGINT', () => {
  console.log('\nSIGINT signal received: closing HTTP server')
  server.close(() => {
    console.log('HTTP server closed')
    process.exit(0)
  })
})

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error)
  // Don't exit - keep server running
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason)
  // Don't exit - keep server running
})

