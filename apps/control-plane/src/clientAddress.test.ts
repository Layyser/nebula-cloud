import { expect, test } from 'bun:test'
import { resolveClientAddress } from './clientAddress'

test('uses the socket address unless a local reverse proxy is explicitly trusted', () => {
  const request = new Request('http://control.test', {
    headers: { 'x-real-ip': '203.0.113.15' },
  })
  expect(resolveClientAddress(request, {
    directAddress: '198.51.100.4',
    trustLocalProxy: true,
  })).toBe('198.51.100.4')
  expect(resolveClientAddress(request, {
    directAddress: '127.0.0.1',
    trustLocalProxy: false,
  })).toBe('127.0.0.1')
  expect(resolveClientAddress(request, {
    directAddress: '127.0.0.1',
    trustLocalProxy: true,
  })).toBe('203.0.113.15')
})

test('rejects malformed forwarded addresses', () => {
  expect(resolveClientAddress(new Request('http://control.test', {
    headers: { 'x-real-ip': '203.0.113.15, 127.0.0.1' },
  }), {
    directAddress: '::1',
    trustLocalProxy: true,
  })).toBe('::1')
})
