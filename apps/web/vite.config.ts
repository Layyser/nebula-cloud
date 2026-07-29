import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
