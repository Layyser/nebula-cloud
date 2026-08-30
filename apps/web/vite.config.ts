import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const controlPlaneTarget = process.env.NEBULA_DEV_CONTROL_PLANE_URL?.trim()
  || 'http://127.0.0.1:7790'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    // The shared UI is intentionally distributed as source and imports GLSL
    // through Vite's `?raw` transform. Rolldown's dependency optimizer cannot
    // pre-bundle those assets, so let the normal Vite pipeline transform it.
    // Its markdown renderer reaches CommonJS helpers from the excluded source
    // graph, so opt that dependency subtree back into interop pre-bundling.
    exclude: ['@nebula/runtime-ui'],
    include: [
      '@nebula/runtime-ui > react-markdown',
      '@nebula/runtime-ui > react-syntax-highlighter',
    ],
  },
  server: {
    proxy: {
      '/api/auth': {
        target: controlPlaneTarget,
        changeOrigin: false,
      },
      '/api/workspaces/personal': {
        target: controlPlaneTarget,
        changeOrigin: false,
      },
      '/api/workspaces': {
        target: controlPlaneTarget,
        changeOrigin: false,
      },
      '/api/usage': {
        target: controlPlaneTarget,
        changeOrigin: false,
      },
      '/api/plan-accounts': {
        target: controlPlaneTarget,
        changeOrigin: false,
      },
      '/api/organizations': {
        target: controlPlaneTarget,
        changeOrigin: false,
      },
      '/api/invitations': {
        target: controlPlaneTarget,
        changeOrigin: false,
      },
      '/api/contact': {
        target: controlPlaneTarget,
        changeOrigin: false,
      },
      '/p/': {
        target: controlPlaneTarget,
        changeOrigin: false,
      },
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
})
