import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const configDir = fileURLToPath(new URL('.', import.meta.url))
const runtimeSource = path.resolve(configDir, '../../../nebula-frontend/src')
const runtimeOrigin = process.env.NEBULA_RUNTIME_ORIGIN?.replace(/\/$/, '')
  || 'http://127.0.0.1:7777'

function readNebulaToken() {
  const configuredToken = process.env.NEBULA_HTTP_TOKEN?.trim()
  if (configuredToken) return configuredToken

  try {
    return readFileSync(path.join(homedir(), '.nebula', 'http-token'), 'utf8').trim()
  } catch {
    return ''
  }
}

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
      // Development-only stand-in for the authenticated cloud gateway. It
      // preserves the browser-facing workspace route while connecting the
      // preview to the developer's local Nebula operator.
      '/api/workspaces': {
        target: runtimeOrigin,
        changeOrigin: false,
        rewrite: requestPath => requestPath.replace(
          /^\/api\/workspaces\/[^/]+\/runtime/,
          '',
        ),
        configure: proxy => {
          proxy.on('proxyReq', proxyRequest => {
            const token = readNebulaToken()
            if (token) proxyRequest.setHeader('Authorization', `Bearer ${token}`)
          })
          proxy.on('proxyRes', (proxyResponse, _request, response) => {
            response.once('close', () => {
              if (!proxyResponse.complete) proxyResponse.destroy()
            })
          })
        },
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
