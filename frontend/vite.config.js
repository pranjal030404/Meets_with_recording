import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// Ports/URLs come from frontend/.env (FRONTEND_PORT, BACKEND_URL) - no code edits needed.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const frontendPort = parseInt(env.FRONTEND_PORT) || 5173
  const backendUrl = env.BACKEND_URL || 'http://localhost:5000'

  return {
    plugins: [
      react(),
      nodePolyfills({
        include: ['events', 'util', 'stream', 'buffer'],
        globals: { Buffer: true, global: true, process: true },
      }),
    ],
    define: { global: 'globalThis' },
    build: {
      target: 'es2020',
      rollupOptions: {
        output: {
          // Long-lived vendor chunks cache across deploys; the heavy media library loads only in meetings
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            realtime: ['socket.io-client'],
            icons: ['lucide-react'],
          },
        },
      },
    },
    server: {
      port: frontendPort,
      host: env.FRONTEND_HOST || undefined,
      proxy: {
        '/api': { target: backendUrl, changeOrigin: true },
        '/uploads': { target: backendUrl, changeOrigin: true },
        '/socket.io': { target: backendUrl, ws: true },
      },
    },
  }
})
