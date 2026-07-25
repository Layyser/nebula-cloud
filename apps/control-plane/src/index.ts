import { createControlPlaneHandler } from './server'
import { initializePersistence } from './persistence'

const hostname = process.env.NEBULA_CLOUD_BIND?.trim() || '127.0.0.1'
const port = Number.parseInt(process.env.NEBULA_CLOUD_PORT || '7790', 10)
const version = process.env.NEBULA_CLOUD_VERSION || 'dev'
const databasePath = process.env.NEBULA_CLOUD_DATABASE_PATH?.trim() || './data/nebula-cloud.sqlite'
const authBaseURL = process.env.BETTER_AUTH_URL?.trim() || `http://${hostname}:${port}`
const authSecret = process.env.BETTER_AUTH_SECRET?.trim() || ''

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('NEBULA_CLOUD_PORT must be an integer between 1 and 65535')
}
if (authSecret.length < 32) {
  throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters')
}

const { database } = await initializePersistence({
  databasePath,
  authSecret,
  authBaseURL,
})

const server = Bun.serve({
  hostname,
  port,
  fetch: createControlPlaneHandler({ version }),
})

let stopping = false
function stop() {
  if (stopping) return
  stopping = true
  server.stop(true)
  database.close()
}

process.once('SIGINT', stop)
process.once('SIGTERM', stop)

console.info(JSON.stringify({
  event: 'control_plane_started',
  address: server.url.origin,
  database: databasePath,
}))
