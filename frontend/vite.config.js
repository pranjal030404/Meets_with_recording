import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Ports/URLs come from frontend/.env (FRONTEND_PORT, BACKEND_URL) - no code edits needed.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const frontendPort = parseInt(env.FRONTEND_PORT) || 5173
  const backendUrl = env.BACKEND_URL || 'http://localhost:5000'

  return {
    plugins: [
      react(),
    ],
    define: { global: 'globalThis' },
    build: {
      target: 'es2020',
      rollupOptions: {
        output: {
          // Long-lived vendor chunks cache across deploys; the heavy media library loads only in meetings
          manualChunks(id) {
            if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return 'react'
            if (/node_modules\/(socket\.io-client|socket\.io-parser|engine\.io-client|engine\.io-parser)\//.test(id)) return 'realtime'
            if (/node_modules\/lucide-react\//.test(id)) return 'icons'
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
