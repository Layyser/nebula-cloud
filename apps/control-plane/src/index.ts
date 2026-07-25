import { createControlPlaneHandler } from './server'

const hostname = process.env.NEBULA_CLOUD_BIND?.trim() || '127.0.0.1'
const port = Number.parseInt(process.env.NEBULA_CLOUD_PORT || '7790', 10)

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('NEBULA_CLOUD_PORT must be an integer between 1 and 65535')
}

const server = Bun.serve({
  hostname,
  port,
  fetch: createControlPlaneHandler({
    version: process.env.NEBULA_CLOUD_VERSION || 'dev',
  }),
})

console.info(JSON.stringify({
  event: 'control_plane_started',
  address: server.url.origin,
}))
