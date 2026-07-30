import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { isValidElement } from 'react'
import { RuntimeWorkspace } from '@nebula/runtime-ui'
import { createCloudRuntimeTransport } from '../src/runtime/cloudRuntimeTransport'
import viteConfig from '../vite.config'

test('composes the packaged RuntimeWorkspace with the Cloud transport', () => {
  const transport = createCloudRuntimeTransport({
    workspaceId: 'workspace-1',
    fetch: async () => Response.json({ ok: true }),
  })
  const workspace = (
    <RuntimeWorkspace
      transport={transport}
      brandLabel="Nebula"
      identityLabel="George · Nebula"
      identityInitial="G"
    />
  )

  expect(isValidElement(workspace)).toBe(true)
  expect(workspace.type).toBe(RuntimeWorkspace)
  expect(workspace.props.transport).toBe(transport)
})

test('the vendored Runtime UI archive matches its recorded checksum', () => {
  const archive = readFileSync(new URL(
    '../../../vendor/nebula-runtime-ui-0.1.4.tgz',
    import.meta.url,
  ))
  const checksum = createHash('sha256').update(archive).digest('hex')
  expect(checksum).toBe(
    '5fc6619f2600b5206b802780619df999d2e14a725f8659f6acb03d616fde088e',
  )
})

test('Vite leaves the source Runtime UI to its GLSL-aware transform pipeline', () => {
  expect(viteConfig).toMatchObject({
    optimizeDeps: {
      exclude: ['@nebula/runtime-ui'],
    },
  })
})
