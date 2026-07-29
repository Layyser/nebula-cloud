import { expect, test } from 'bun:test'
import {
  ensurePersonalWorkspace,
  migrateCloudSchema,
  openCloudDatabase,
  resolveWorkspaceAccess,
} from '@nebula-cloud/database'
import { ConsoleGateway } from '../src/consoleGateway'
import { RuntimeGateway } from '../src/runtimeGateway'

test('Runtime and Console isolate members, organizations, removed members, and guessed IDs', async () => {
  const database = openCloudDatabase({ path: ':memory:' })
  try {
    database.exec(`
      CREATE TABLE user (id TEXT PRIMARY KEY);
      CREATE TABLE organization (id TEXT PRIMARY KEY);
      CREATE TABLE member (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL REFERENCES user(id),
        organizationId TEXT NOT NULL REFERENCES organization(id),
        role TEXT NOT NULL DEFAULT 'member'
      );
      INSERT INTO user (id)
        VALUES ('user-a'), ('user-b'), ('user-cross-org');
      INSERT INTO organization (id) VALUES ('org-a'), ('org-b');
      INSERT INTO member (id, userId, organizationId, role) VALUES
        ('member-a', 'user-a', 'org-a', 'member'),
        ('member-b', 'user-b', 'org-a', 'member'),
        ('member-cross-org', 'user-cross-org', 'org-b', 'member');
    `)
    migrateCloudSchema(database)
    const target = ensurePersonalWorkspace(database, {
      userId: 'user-b',
      organizationId: 'org-a',
      createId: () => 'workspace-b',
      now: () => 1,
    })
    database.prepare(`
      UPDATE workspace
      SET state = 'ready',
          worker_workspace_id = 'worker-workspace-b',
          updated_at = 2
      WHERE id = ?
    `).run(target.id)

    let runtimeAccessCalls = 0
    let runtimeFetchCalls = 0
    let consoleConnections = 0
    const resolveWorkspace = (input: {
      workspaceId: string
      userId: string
      organizationId: string
    }) => resolveWorkspaceAccess(database, input)
    const runtime = new RuntimeGateway({
      resolveWorkspace,
      worker: {
        async getRuntimeAccess() {
          runtimeAccessCalls += 1
          throw new Error('denied requests must not reach the worker')
        },
      },
      fetch: async () => {
        runtimeFetchCalls += 1
        throw new Error('denied requests must not reach the runtime')
      },
    })
    const console = new ConsoleGateway({
      workerURL: 'http://worker.test:7780',
      workerToken: 'worker-service-token-0123456789abcdef',
      resolveWorkspace,
      connect: () => {
        consoleConnections += 1
        throw new Error('denied requests must not open a worker Console')
      },
    })

    async function expectDenied(input: {
      label: string
      workspaceId: string
      userId: string
      organizationId: string
    }) {
      const runtimeResponse = await runtime.proxy({
        request: new Request(
          `http://cloud.test/api/workspaces/${input.workspaceId}/runtime/health`,
        ),
        workspaceId: input.workspaceId,
        runtimePath: '/health',
        userId: input.userId,
        organizationId: input.organizationId,
      })
      expect(runtimeResponse.status, `${input.label} Runtime status`).toBe(404)
      expect((await runtimeResponse.json()).code).toBe('workspace_not_found')

      const consoleResponse = await console.prepare({
        workspaceId: input.workspaceId,
        userId: input.userId,
        organizationId: input.organizationId,
        actorId: input.userId,
      })
      expect(consoleResponse).toBeInstanceOf(Response)
      expect(
        (consoleResponse as Response).status,
        `${input.label} Console status`,
      ).toBe(404)
      expect((await (consoleResponse as Response).json()).code).toBe(
        'workspace_not_found',
      )
    }

    await expectDenied({
      label: 'member A accessing member B',
      workspaceId: target.id,
      userId: 'user-a',
      organizationId: 'org-a',
    })
    await expectDenied({
      label: 'organization B accessing organization A',
      workspaceId: target.id,
      userId: 'user-cross-org',
      organizationId: 'org-b',
    })
    await expectDenied({
      label: 'owner guessing a workspace identifier',
      workspaceId: 'workspace-guessed',
      userId: 'user-b',
      organizationId: 'org-a',
    })

    database.prepare('DELETE FROM member WHERE id = ?').run('member-b')
    await expectDenied({
      label: 'removed member retaining an otherwise valid session',
      workspaceId: target.id,
      userId: 'user-b',
      organizationId: 'org-a',
    })

    expect(runtimeAccessCalls).toBe(0)
    expect(runtimeFetchCalls).toBe(0)
    expect(consoleConnections).toBe(0)
  } finally {
    database.close()
  }
})
