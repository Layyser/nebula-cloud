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
    '../../../vendor/nebula-runtime-ui-0.1.41.tgz',
    import.meta.url,
  ))
  const checksum = createHash('sha256').update(archive).digest('hex')
  expect(checksum).toBe(
    '53697eb16ae818052adedab8848a57968779b48b763ff9ca6e524ac645b4064b',
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
