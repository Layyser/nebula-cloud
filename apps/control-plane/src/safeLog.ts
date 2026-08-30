const sensitiveKey = /(?:authorization|cookie|token|secret|password|prompt|console|credential|body|email|address|url|path)/i
const bearerPattern = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi
const urlCredentialsPattern = /([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi
const unixWorkspacePathPattern = /\/(?:home|var\/lib)\/(?:nebula-workspaces|nebula)(?:\/[^\s"']*)?/gi
const authorizationHeaderPattern = /(authorization\s*[:=]\s*)[^\s,;}]+/gi

export type SafeLogPrimitive = string | number | boolean | null
export type SafeLogValue = SafeLogPrimitive | SafeLogValue[] | { [key: string]: SafeLogValue }

function redactString(value: string): string {
  return value
    .replace(bearerPattern, 'Bearer [REDACTED]')
    .replace(urlCredentialsPattern, '$1[REDACTED]@')
    .replace(authorizationHeaderPattern, '$1[REDACTED]')
    .replace(unixWorkspacePathPattern, '[WORKSPACE_PATH]')
    .slice(0, 1024)
}

export function redactLogValue(value: unknown, key = ''): SafeLogValue {
  if (sensitiveKey.test(key)) return '[REDACTED]'
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return redactString(value)
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.slice(0, 50).map(item => redactLogValue(item))
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .slice(0, 50)
      .map(([childKey, childValue]) => [childKey, redactLogValue(childValue, childKey)]))
  }
  return redactString(String(value))
}

export function safeLogJSON(value: object): string {
  return JSON.stringify(redactLogValue(value))
}
