import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

/*
 * Every deploy gets its own asset filenames.
 *
 * Vite names files purely by content hash, so a deploy that does not change the
 * CSS re-uses the exact same /assets/ URL. When a CDN is holding a poisoned copy
 * of that URL (the SPA fallback page cached as the stylesheet), redeploying
 * therefore fixes nothing - the site stays broken until the entry expires, which
 * is how a working build kept serving a black screen.
 *
 * A per-build id in the name means a new deploy always lands on URLs no cache has
 * ever seen, so shipping a fix is enough on its own. The server-side 404 for
 * missing /assets/* (see src/server/index.ts) stops the poisoning at the source;
 * this is the belt to that pair of braces.
 */
const BUILD_ID = Date.now().toString(36)

// https://vitejs.dev/config/
export default defineConfig({
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
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-${BUILD_ID}-[hash].js`,
        chunkFileNames: `assets/[name]-${BUILD_ID}-[hash].js`,
        assetFileNames: `assets/[name]-${BUILD_ID}-[hash][extname]`,
      },
    },
  }
})
