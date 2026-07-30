import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    // The shared UI is intentionally distributed as source and imports GLSL
    // through Vite's `?raw` transform. Rolldown's dependency optimizer cannot
    // pre-bundle those assets, so let the normal Vite pipeline transform it.
    exclude: ['@nebula/runtime-ui'],
  },
  server: {
    proxy: {
      '/api/auth': {
        target: 'http://127.0.0.1:7790',
        changeOrigin: false,
      },
      '/api/workspaces/personal': {
        target: 'http://127.0.0.1:7790',
        changeOrigin: false,
      },
      '/api/workspaces': {
        target: 'http://127.0.0.1:7790',
        changeOrigin: false,
      },
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
})
