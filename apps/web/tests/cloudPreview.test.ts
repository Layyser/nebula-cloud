import { expect, test } from 'bun:test'
import {
  cloudPreviewModes,
  cloudPreviewOrganization,
  cloudPreviewUser,
  createCloudPreviewTransport,
  isCloudPreviewMode,
} from '../src/preview/cloudPreviewFixtures'

test('Cloud preview manifest covers every required baseline state', () => {
  expect(cloudPreviewModes).toEqual([
    'runtime',
    'login',
    'organization',
    'startup',
    'dashboard',
    'terminal',
    'settings',
  ])
  expect(isCloudPreviewMode('dashboard')).toBe(true)
  expect(isCloudPreviewMode('unknown')).toBe(false)
  expect(cloudPreviewUser).toMatchObject({ name: 'Jorge' })
  expect(cloudPreviewOrganization).toMatchObject({ name: 'Nebula Labs' })
})

test('Cloud preview transport is deterministic and backend-free', async () => {
  const transport = createCloudPreviewTransport()

  expect(await transport.request('/health').then(response => response.json())).toEqual({ ok: true })
  expect(await transport.request('/chats').then(response => response.json())).toMatchObject({
    chats: [
      { name: 'release-monitoring' },
      { name: 'frontend-review' },
    ],
  })
  expect(await transport.request('/models').then(response => response.json())).toMatchObject({
    default_model: 'gpt-5.2-codex',
  })
  expect(await transport.request('/auth/codex').then(response => response.json())).toEqual({
    authenticated: false,
  })
})
