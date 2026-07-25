import { expect, test } from 'bun:test'
import { CONTROL_PLANE_API_VERSION } from '../src'

test('publishes a versioned control-plane contract', () => {
  expect(CONTROL_PLANE_API_VERSION).toBe('v1')
})
