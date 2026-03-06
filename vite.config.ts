import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3000,
      proxy: {
        // Proxy API requests to Express server
        '/api': {
          target: 'http://localhost:4000',
          changeOrigin: true,
          secure: false,
          // Handle errors when backend server is not available
          configure: (proxy, _options) => {
            proxy.on('error', (err, req, res) => {
              console.warn('API server not available, requests will fail gracefully')
              if (res && !res.headersSent) {
                res.writeHead(503, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({
                  error: 'Backend server is not running',
                  message: 'Please start the backend server with: npm run dev:server'
                }))
              }
            })
            proxy.on('proxyRes', (proxyRes, req, res) => {
              // Ensure API responses are JSON
              if (req.url?.startsWith('/api') && proxyRes.headers['content-type'] && !proxyRes.headers['content-type'].includes('application/json')) {
                console.warn(`Non-JSON response from API: ${req.url} - Content-Type: ${proxyRes.headers['content-type']}`)
              }
            })
          },
        },
        // Proxy health check endpoint
        '/health': {
          target: 'http://localhost:4000',
          changeOrigin: true,
          secure: false,
        },
        '/auth': {
          target: 'http://localhost:4000',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
    // Map process.env.* → actual env values at build time so that client.ts
    // (which uses process.env for Node/Vite compatibility) works with Vite.
    define: {
      'process.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || ''),
      'process.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || ''),
      'process.env.VITE_SITE_URL': JSON.stringify(env.VITE_SITE_URL || ''),
      'process.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL || ''),
      'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(env.NEXT_PUBLIC_SUPABASE_URL || ''),
      'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''),
      'process.env.SUPABASE_URL': JSON.stringify(env.SUPABASE_URL || ''),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(env.SUPABASE_ANON_KEY || ''),
    },
  }
})
