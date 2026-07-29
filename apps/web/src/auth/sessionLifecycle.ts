export const sessionExpiredEvent = 'nebula:session-expired'
const sessionExpiredStorageKey = 'nebula.cloud.session-expired'

interface SessionStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function browserStorage(): SessionStorage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

export function rememberSessionExpired(
  storage: SessionStorage | null = browserStorage(),
): void {
  try {
    storage?.setItem(sessionExpiredStorageKey, 'true')
  } catch {
    // Storage can be unavailable in hardened browser contexts.
  }
}

export function consumeSessionExpired(
  storage: SessionStorage | null = browserStorage(),
): boolean {
  try {
    const expired = storage?.getItem(sessionExpiredStorageKey) === 'true'
    storage?.removeItem(sessionExpiredStorageKey)
    return expired
  } catch {
    return false
  }
}

export function clearSessionExpired(
  storage: SessionStorage | null = browserStorage(),
): void {
  try {
    storage?.removeItem(sessionExpiredStorageKey)
  } catch {
    // Storage can be unavailable in hardened browser contexts.
  }
}

export function notifySessionExpired(): void {
  rememberSessionExpired()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(sessionExpiredEvent))
  }
}

export function observeAuthenticationResponse(
  response: Response,
  onSessionExpired: () => void = notifySessionExpired,
): Response {
  if (response.status === 401) onSessionExpired()
  return response
}
