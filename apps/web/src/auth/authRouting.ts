export function isAuthenticationCallback(pathname: string): boolean {
  return pathname === '/auth/callback'
    || pathname.startsWith('/auth/callback/')
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
  if (!input.authenticated && input.pathname !== '/login') return '/login'
  if (input.authenticated && input.pathname === '/login') return '/app'
  return null
}
