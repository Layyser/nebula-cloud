import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const configDir = fileURLToPath(new URL('.', import.meta.url))
const runtimeSource = path.resolve(configDir, '../../../nebula-frontend/src')

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api/auth': {
        target: 'http://127.0.0.1:7790',
        changeOrigin: false,
      },
    },
  },
  resolve: {
    alias: [
      { find: '@nebula/runtime-ui/styles.css', replacement: path.resolve(runtimeSource, 'index.css') },
      { find: '@nebula/runtime-ui/transport', replacement: path.resolve(runtimeSource, 'runtime/transport.ts') },
      { find: '@nebula/runtime-ui', replacement: path.resolve(runtimeSource, 'runtime/index.ts') },
      { find: '@', replacement: runtimeSource },
    ],
    dedupe: ['react', 'react-dom'],
  },
})
