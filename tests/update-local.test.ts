import { expect, test } from 'bun:test'
import { localPlan } from '../scripts/update-local'

test('deferred agent update publishes without restarting any service or operator', () => {
  expect(localPlan('agent', 'on-restart', '')).toEqual(['check-agent', 'check-cloud', 'image-agent'])
})
test('force is explicit, validates first, and reuses the built image', () => {
  expect(localPlan('agent', 'force', '--all')).toEqual(['check-agent', 'check-cloud', 'image-agent', 'rollout-force'])
  expect(localPlan('rollout', 'force', 'workspace-1')).toEqual(['rollout-force'])
  expect(() => localPlan('agent', 'force', '')).toThrow('explicit')
  expect(() => localPlan('cloud', 'force', '--all')).toThrow()
  expect(() => localPlan('agent', 'force', '--all workspace-1')).toThrow()
  expect(() => localPlan('agent', 'force', '../unsafe')).toThrow()
})
test('frontend is packaged before cloud checks and does not rebuild the agent', () => {
  expect(localPlan('frontend', 'on-restart', '')).toEqual(['check-frontend', 'package-frontend', 'check-cloud', 'restart-cloud'])
  expect(localPlan('cloud', 'on-restart', '')).toEqual(['check-cloud', 'restart-cloud'])
  expect(() => localPlan('unknown', 'on-restart', '')).toThrow()
  expect(() => localPlan('agent', 'automatic', '')).toThrow()
  expect(() => localPlan('agent', 'on-restart', 'workspace-1')).toThrow()
})
