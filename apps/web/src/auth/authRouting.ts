export function isAuthenticationCallback(pathname: string): boolean {
  return pathname === '/auth/callback'
    || pathname.startsWith('/auth/callback/')
}

export function isPublicAuthenticationRoute(pathname: string): boolean {
  return pathname === '/login'
    || pathname === '/reset-password'
    || isAuthenticationCallback(pathname)
}

export function authenticationRedirect(input: {
  pathname: string
  pending: boolean
  authenticated: boolean
}): '/app' | '/login' | null {
  if (input.pending) return null
  if (isAuthenticationCallback(input.pathname)) {
    return input.authenticated ? '/app' : '/login'
  }
  if (!input.authenticated && !isPublicAuthenticationRoute(input.pathname)) {
    return '/login'
  }
  if (input.authenticated && (
    input.pathname === '/login'
    || input.pathname === '/reset-password'
  )) return '/app'
  return null
}
