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
    '../../../vendor/nebula-runtime-ui-0.1.40.tgz',
    import.meta.url,
  ))
  const checksum = createHash('sha256').update(archive).digest('hex')
  expect(checksum).toBe(
    '77bb7e61875042c6226be6c74f167e31c8362a54d397728f73d6d623cdafc8d0',
  )
})

test('Vite leaves the source Runtime UI to its GLSL-aware transform pipeline', () => {
  expect(viteConfig).toMatchObject({
    optimizeDeps: {
      exclude: ['@nebula/runtime-ui'],
      include: [
        '@nebula/runtime-ui > react-markdown',
        '@nebula/runtime-ui > react-syntax-highlighter',
      ],
    },
  })
})

test('Vite only proxies published-service paths under /p/', () => {
  const proxyRoutes = Object.keys(viteConfig.server?.proxy ?? {})

  expect(proxyRoutes).toContain('/p/')
  expect(proxyRoutes).not.toContain('/p')
})
