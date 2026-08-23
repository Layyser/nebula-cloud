import { expect, test } from 'bun:test'
import {
  authenticationRedirect,
  isAuthenticationCallback,
  isPublicAuthenticationRoute,
} from '../src/auth/authRouting'

test('routes completed authentication callbacks according to session state', () => {
  expect(isAuthenticationCallback('/auth/callback')).toBe(true)
  expect(isAuthenticationCallback('/auth/callback/github')).toBe(true)
  expect(authenticationRedirect({
    pathname: '/auth/callback',
    pending: true,
    authenticated: false,
  })).toBeNull()
  expect(authenticationRedirect({
    pathname: '/auth/callback',
    pending: false,
    authenticated: true,
  })).toBe('/app')
  expect(authenticationRedirect({
    pathname: '/auth/callback',
    pending: false,
    authenticated: false,
  })).toBe('/login')
})

test('protects app routes and keeps authenticated users out of login', () => {
  expect(isPublicAuthenticationRoute('/login')).toBe(true)
  expect(isPublicAuthenticationRoute('/reset-password')).toBe(true)
  expect(authenticationRedirect({
    pathname: '/reset-password',
    pending: false,
    authenticated: false,
  })).toBeNull()
  expect(authenticationRedirect({
    pathname: '/app',
    pending: false,
    authenticated: false,
  })).toBe('/login')
  expect(authenticationRedirect({
    pathname: '/login',
    pending: false,
    authenticated: true,
  })).toBe('/app')
  expect(authenticationRedirect({
    pathname: '/reset-password',
    pending: false,
    authenticated: true,
  })).toBe('/app')
  expect(authenticationRedirect({
    pathname: '/app',
    pending: false,
    authenticated: true,
  })).toBeNull()
})
