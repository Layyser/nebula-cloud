import {
  type ConsoleBridgeData,
  type PrepareConsoleInput,
} from './consoleGateway'

interface ConsolePreparer {
  prepare(input: PrepareConsoleInput): Promise<ConsoleBridgeData | Response>
}

export interface ConsoleUpgradeOptions {
  request: Request
  encodedWorkspaceId: string
  encodedTerminalId?: string
  trustedOrigins: readonly string[]
  resolveSession: (
    request: Request,
  ) => Promise<{
    userId: string
    activeOrganizationId?: string | null
  } | null>
  consoleGateway: ConsolePreparer | null
}

function consoleUpgradeError(
  status: number,
  code: string,
  error: string,
  retryable = false,
): Response {
  return Response.json({
    error,
    code,
    ...(retryable ? { retryable: true } : {}),
  }, {
    status,
    headers: { 'cache-control': 'no-store' },
  })
}

export async function prepareConsoleUpgrade({
  request,
  encodedWorkspaceId,
  encodedTerminalId,
  trustedOrigins,
  resolveSession,
  consoleGateway,
}: ConsoleUpgradeOptions): Promise<ConsoleBridgeData | Response> {
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
    return consoleUpgradeError(
      426,
      'websocket_upgrade_required',
      'WebSocket upgrade required',
    )
  }
  const origin = request.headers.get('origin')
  if (!origin || !trustedOrigins.includes(origin)) {
    return consoleUpgradeError(
      403,
      'origin_not_allowed',
      'Console origin is not allowed',
    )
  }

  const session = await resolveSession(request)
  if (!session) {
    return consoleUpgradeError(
      401,
      'authentication_required',
      'authentication required',
    )
  }
  if (!session.activeOrganizationId) {
    return consoleUpgradeError(
      403,
      'active_organization_required',
      'an active organization is required',
    )
  }
  if (!consoleGateway) {
    return consoleUpgradeError(
      503,
      'console_gateway_unavailable',
      'Console gateway is unavailable',
      true,
    )
  }

  let workspaceId: string
  try {
    workspaceId = decodeURIComponent(encodedWorkspaceId)
  } catch {
    return consoleUpgradeError(
      400,
      'invalid_request',
      'workspaceId is invalid',
    )
  }
  if (!workspaceId.trim()) {
    return consoleUpgradeError(
      400,
      'invalid_request',
      'workspaceId is required',
    )
  }

  let terminalId: string | null = null
  if (encodedTerminalId) {
    try {
      terminalId = decodeURIComponent(encodedTerminalId)
    } catch {
      return consoleUpgradeError(400, 'invalid_request', 'terminalId is invalid')
    }
  }

  return await consoleGateway.prepare({
    workspaceId,
    userId: session.userId,
    organizationId: session.activeOrganizationId,
    actorId: session.userId,
    rows: new URL(request.url).searchParams.get('rows'),
    columns: new URL(request.url).searchParams.get('columns'),
    terminalId: terminalId ?? new URL(request.url).searchParams.get('terminal_id'),
  })
}
