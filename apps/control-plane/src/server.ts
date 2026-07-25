import {
  CONTROL_PLANE_API_VERSION,
  type CloudErrorResponse,
  type ControlPlaneStatus,
  type HealthResponse,
} from '@nebula-cloud/contracts'

const service = 'nebula-cloud-control-plane' as const

export interface ControlPlaneHandlerOptions {
  version?: string
  isReady?: () => boolean
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {
      'cache-control': 'no-store',
    },
  })
}

export function createControlPlaneHandler({
  version = 'dev',
  isReady = () => true,
}: ControlPlaneHandlerOptions = {}): (request: Request) => Response {
  return request => {
    const url = new URL(request.url)

    if (request.method === 'GET' && url.pathname === '/health/live') {
      return json({
        service,
        status: 'live',
        version,
      } satisfies HealthResponse)
    }

    if (request.method === 'GET' && url.pathname === '/health/ready') {
      const ready = isReady()
      return json({
        service,
        status: ready ? 'ready' : 'not_ready',
        version,
      } satisfies HealthResponse, ready ? 200 : 503)
    }

    if (request.method === 'GET' && url.pathname === '/internal/v1/status') {
      const ready = isReady()
      return json({
        service,
        apiVersion: CONTROL_PLANE_API_VERSION,
        version,
        ready,
        capabilities: [],
      } satisfies ControlPlaneStatus)
    }

    return json({
      error: 'route not found',
      code: 'not_found',
    } satisfies CloudErrorResponse, 404)
  }
}
