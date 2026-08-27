import type {
  RuntimeReconnectOptions,
  RuntimeStreamOptions,
  RuntimeSubscription,
  RuntimeTransport,
} from '@nebula/runtime-ui/transport'
import type { OrganizationDashboardResponse } from '@nebula-cloud/contracts'

export const cloudPreviewModes = [
  'runtime',
  'login',
  'organization',
  'startup',
  'dashboard',
  'terminal',
  'settings',
] as const

export type CloudPreviewMode = typeof cloudPreviewModes[number]

export const cloudPreviewUser = {
  name: 'Jorge',
  email: 'jorge@nebula.example',
}

export const cloudPreviewOrganization = {
  id: 'org-preview',
  name: 'Nebula Labs',
  slug: 'nebula-labs',
}

export const cloudPreviewDashboard: OrganizationDashboardResponse = {
  organizationId: cloudPreviewOrganization.id,
  scope: 'organization',
  rangeDays: 30,
  enabledMembers: 4,
  operators: { ready: 3, total: 4 },
  usage: {
    sessions: 18,
    modelTurns: 146,
    totalTokens: 3_094_000,
    estimatedCostMicrousd: 18_420_000,
  },
  provisioningFailures: 1,
  workers: { healthy: 2, total: 2 },
}

const previewChats = [
  {
    name: 'release-monitoring',
    display_name: 'Review the failed deployment',
    cwd: '/workspace/nebula-cloud',
    workspace_root: '/workspace/nebula-cloud',
  },
  {
    name: 'frontend-review',
    display_name: 'Refine the landing experience',
    cwd: '/workspace/nebula-frontend',
    workspace_root: '/workspace/nebula-frontend',
  },
]

const previewMessages: Record<string, Array<Record<string, unknown>>> = {
  'release-monitoring': [
    {
      role: 'user',
      content: 'Review the failed deployment and verify the rollout.',
      created_at_ms: Date.now() - 92_000,
    },
    {
      role: 'assistant',
      content: 'I traced the failure to a stale workspace secret, refreshed it, and verified that every replica is healthy.',
      created_at_ms: Date.now() - 78_000,
      completed_at_ms: Date.now() - 63_000,
    },
  ],
  'frontend-review': [
    {
      role: 'user',
      content: 'Audit the landing preview against the current product UI.',
      created_at_ms: Date.now() - 48_000,
    },
    {
      role: 'assistant',
      content: 'The preview now renders the same runtime workspace used by the product, so navigation and interface updates stay synchronized.',
      created_at_ms: Date.now() - 32_000,
      completed_at_ms: Date.now() - 21_000,
    },
  ],
}

function previewSession(chat: string) {
  const fixture = previewChats.find(candidate => candidate.name === chat)
  return {
    chat,
    agent: null,
    model: 'gpt-5.2-codex',
    reasoning_effort: 'medium',
    reasoning_effort_override: null,
    security_mode: 'default',
    cwd: fixture?.cwd ?? '.',
    workspace_root: fixture?.workspace_root ?? '.',
  }
}

export function isCloudPreviewMode(value: string | null): value is CloudPreviewMode {
  return value !== null && cloudPreviewModes.includes(value as CloudPreviewMode)
}

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init)
}

function normalizedPath(path: string): string {
  return new URL(path, 'https://preview.nebula.local').pathname
}

function subscription(run: () => void): RuntimeSubscription {
  let cancelled = false
  queueMicrotask(() => {
    if (!cancelled) run()
  })
  return { cancel: () => { cancelled = true } }
}

export function createCloudPreviewTransport(): RuntimeTransport {
  const request = async (path: string, init?: RequestInit): Promise<Response> => {
    const route = normalizedPath(path)
    const method = init?.method?.toUpperCase() ?? 'GET'

    if (route === '/health' || route === '/health/ready') return json({ ok: true })
    if (route === '/chats') return json({ chats: previewChats })
    const sessionMatch = route.match(/^\/chat\/([^/]+)\/session$/)
    if (sessionMatch) return json(previewSession(decodeURIComponent(sessionMatch[1])))
    const chatMatch = route.match(/^\/chat\/([^/]+)$/)
    if (chatMatch && method === 'GET') {
      const chat = decodeURIComponent(chatMatch[1])
      return json({ messages: previewMessages[chat] ?? [] })
    }
    if (route === '/agents') return json({
      default: {
        name: 'Default',
        description: 'General-purpose managed operator.',
        model: 'gpt-5.2-codex',
        reasoning_effort: 'medium',
        is_default: true,
      },
      agents: [],
    })
    if (route === '/mcps') return json({ mcps: [] })
    if (route === '/models') return json({
      default_model: 'gpt-5.2-codex',
      models: [{ slug: 'gpt-5.2-codex', display_name: 'GPT-5.2 Codex' }],
    })
    if (route === '/capabilities') return json({
      mcps: [],
      skills: [],
      commands: [],
      hooks: [],
      rules: [],
      tools: [{ name: 'shell', description: 'Run commands in the operator workspace.' }],
    })
    if (route === '/auth/codex') return json({ authenticated: false })
    if (method === 'DELETE' || method === 'POST' || method === 'PUT') return json({ ok: true })

    return json({ error: `No Cloud preview fixture for ${method} ${route}` }, { status: 404 })
  }

  const stream = <T>(_path: string, options: RuntimeStreamOptions<T>): RuntimeSubscription => (
    subscription(() => {
      options.onCompleteStatus?.(204)
      options.onDone?.()
    })
  )

  const reconnectingStream = <T>(
    path: string,
    options: RuntimeReconnectOptions<T>,
  ): RuntimeSubscription => subscription(() => {
    if (normalizedPath(path) === '/runs/events') {
      options.onEvent({ type: 'run_snapshot', runs: [] } as T)
    }
  })

  return { request, stream, reconnectingStream }
}
