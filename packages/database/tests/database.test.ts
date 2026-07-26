import { expect, test } from 'bun:test'
import {
  claimProvisioningJob,
  ensurePersonalWorkspace,
  ensureWorkspaceRunning,
  finishProvisioningJob,
  migrateCloudSchema,
  openCloudDatabase,
  ProvisioningJobLeaseLostError,
  resolveWorkspaceAccess,
  WorkspaceMembershipNotFoundError,
} from '../src'

test('applies the minimal application schema idempotently', () => {
  const database = openCloudDatabase({ path: ':memory:' })
  try {
    database.exec(`
      CREATE TABLE user (id TEXT PRIMARY KEY);
      CREATE TABLE organization (id TEXT PRIMARY KEY);
      CREATE TABLE member (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL REFERENCES user(id),
        organizationId TEXT NOT NULL REFERENCES organization(id)
      );
    `)
    migrateCloudSchema(database)
    migrateCloudSchema(database)

    const tables = database.query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    ).all().map(table => table.name)

    expect(tables).toContain('nebula_migration')
    expect(tables).toContain('workspace')
    expect(database.query<{ count: number }, []>(
      'SELECT COUNT(*) AS count FROM nebula_migration',
    ).get()?.count).toBe(4)
  } finally {
    database.close()
  }
})

test('enforces one workspace per organization membership', () => {
  const database = openCloudDatabase({ path: ':memory:' })
  try {
    database.exec(`
      CREATE TABLE user (id TEXT PRIMARY KEY);
      CREATE TABLE organization (id TEXT PRIMARY KEY);
      CREATE TABLE member (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL REFERENCES user(id),
        organizationId TEXT NOT NULL REFERENCES organization(id)
      );
    `)
    migrateCloudSchema(database)
    database.exec(`
      INSERT INTO user (id) VALUES ('user-1');
      INSERT INTO organization (id) VALUES ('org-1');
      INSERT INTO member (id, userId, organizationId)
        VALUES ('member-1', 'user-1', 'org-1');
    `)

    const insert = database.prepare(`
      INSERT INTO workspace (
        id, member_id, organization_id, state, created_at, updated_at
      ) VALUES (?, ?, ?, 'pending', ?, ?)
    `)
    insert.run('workspace-1', 'member-1', 'org-1', 1, 1)

    expect(() => {
      insert.run('workspace-2', 'member-1', 'org-1', 1, 1)
    }).toThrow()
  } finally {
    database.close()
  }
})

test('resolves the same personal workspace idempotently', () => {
  const database = openCloudDatabase({ path: ':memory:' })
  try {
    database.exec(`
      CREATE TABLE user (id TEXT PRIMARY KEY);
      CREATE TABLE organization (id TEXT PRIMARY KEY);
      CREATE TABLE member (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL REFERENCES user(id),
        organizationId TEXT NOT NULL REFERENCES organization(id)
      );
      INSERT INTO user (id) VALUES ('user-1');
      INSERT INTO organization (id) VALUES ('org-1');
      INSERT INTO member (id, userId, organizationId)
        VALUES ('member-1', 'user-1', 'org-1');
    `)
    migrateCloudSchema(database)

    let idsCreated = 0
    const createId = () => `workspace-${++idsCreated}`
    const first = ensurePersonalWorkspace(database, {
      userId: 'user-1',
      organizationId: 'org-1',
      createId,
      now: () => 42,
    })
    const second = ensurePersonalWorkspace(database, {
      userId: 'user-1',
      organizationId: 'org-1',
      createId,
      now: () => 99,
    })

    expect(first).toEqual(second)
    expect(first).toMatchObject({
      id: 'workspace-1',
      memberId: 'member-1',
      organizationId: 'org-1',
      state: 'pending',
      createdAt: 42,
      updatedAt: 42,
    })
    expect(idsCreated).toBe(1)
  } finally {
    database.close()
  }
})

test('requires membership and rejects cross-organization workspace ownership', () => {
  const database = openCloudDatabase({ path: ':memory:' })
  try {
    database.exec(`
      CREATE TABLE user (id TEXT PRIMARY KEY);
      CREATE TABLE organization (id TEXT PRIMARY KEY);
      CREATE TABLE member (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL REFERENCES user(id),
        organizationId TEXT NOT NULL REFERENCES organization(id)
      );
      INSERT INTO user (id) VALUES ('user-1');
      INSERT INTO organization (id) VALUES ('org-1'), ('org-2');
      INSERT INTO member (id, userId, organizationId)
        VALUES ('member-1', 'user-1', 'org-1');
    `)
    migrateCloudSchema(database)

    expect(() => ensurePersonalWorkspace(database, {
      userId: 'user-1',
      organizationId: 'org-2',
    })).toThrow(WorkspaceMembershipNotFoundError)

    expect(() => database.prepare(`
      INSERT INTO workspace (
        id, member_id, organization_id, state, created_at, updated_at
      ) VALUES (?, ?, ?, 'pending', ?, ?)
    `).run('workspace-invalid', 'member-1', 'org-2', 1, 1))
      .toThrow('workspace membership does not belong to organization')
  } finally {
    database.close()
  }
})

test('resolves runtime access only for the owning member and active organization', () => {
  const database = openCloudDatabase({ path: ':memory:' })
  try {
    database.exec(`
      CREATE TABLE user (id TEXT PRIMARY KEY);
      CREATE TABLE organization (id TEXT PRIMARY KEY);
      CREATE TABLE member (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL REFERENCES user(id),
        organizationId TEXT NOT NULL REFERENCES organization(id)
      );
      INSERT INTO user (id) VALUES ('user-1'), ('user-2');
      INSERT INTO organization (id) VALUES ('org-1'), ('org-2');
      INSERT INTO member (id, userId, organizationId) VALUES
        ('member-1', 'user-1', 'org-1'),
        ('member-2', 'user-2', 'org-1'),
        ('member-3', 'user-1', 'org-2');
    `)
    migrateCloudSchema(database)
    const workspace = ensurePersonalWorkspace(database, {
      userId: 'user-1',
      organizationId: 'org-1',
      createId: () => 'workspace-1',
    })

    expect(resolveWorkspaceAccess(database, {
      workspaceId: workspace.id,
      userId: 'user-1',
      organizationId: 'org-1',
    })?.id).toBe('workspace-1')
    expect(resolveWorkspaceAccess(database, {
      workspaceId: workspace.id,
      userId: 'user-2',
      organizationId: 'org-1',
    })).toBeNull()
    expect(resolveWorkspaceAccess(database, {
      workspaceId: workspace.id,
      userId: 'user-1',
      organizationId: 'org-2',
    })).toBeNull()
    expect(resolveWorkspaceAccess(database, {
      workspaceId: 'workspace-guessed',
      userId: 'user-1',
      organizationId: 'org-1',
    })).toBeNull()
  } finally {
    database.close()
  }
})

test('durably deduplicates, leases, retries, and completes ensure-running jobs', () => {
  const database = openCloudDatabase({ path: ':memory:' })
  try {
    database.exec(`
      CREATE TABLE user (id TEXT PRIMARY KEY);
      CREATE TABLE organization (id TEXT PRIMARY KEY);
      CREATE TABLE member (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL REFERENCES user(id),
        organizationId TEXT NOT NULL REFERENCES organization(id)
      );
      INSERT INTO user (id) VALUES ('user-1');
      INSERT INTO organization (id) VALUES ('org-1');
      INSERT INTO member (id, userId, organizationId)
        VALUES ('member-1', 'user-1', 'org-1');
    `)
    migrateCloudSchema(database)

    const first = ensureWorkspaceRunning(database, {
      userId: 'user-1',
      organizationId: 'org-1',
      createId: () => 'workspace-1',
      createJobId: () => 'job-1',
      now: () => 100,
    })
    const repeated = ensureWorkspaceRunning(database, {
      userId: 'user-1',
      organizationId: 'org-1',
      createId: () => 'workspace-duplicate',
      createJobId: () => 'job-duplicate',
      now: () => 150,
    })

    expect(first.workspace.state).toBe('provisioning')
    expect(first.job).toMatchObject({ id: 'job-1', status: 'queued', attempt: 0 })
    expect(repeated.job?.id).toBe('job-1')
    expect(database.query<{ count: number }, []>(
      'SELECT COUNT(*) AS count FROM provisioning_job',
    ).get()?.count).toBe(1)

    const firstClaim = claimProvisioningJob(database, {
      leaseOwner: 'processor-a',
      leaseDurationMs: 50,
      now: () => 200,
    })
    expect(firstClaim).toMatchObject({
      id: 'job-1',
      status: 'running',
      attempt: 1,
      leaseOwner: 'processor-a',
      leaseExpiresAt: 250,
    })
    expect(claimProvisioningJob(database, {
      leaseOwner: 'processor-b',
      now: () => 249,
    })).toBeNull()

    const recoveredClaim = claimProvisioningJob(database, {
      leaseOwner: 'processor-b',
      leaseDurationMs: 50,
      now: () => 251,
    })
    expect(recoveredClaim).toMatchObject({
      id: 'job-1',
      attempt: 2,
      leaseOwner: 'processor-b',
    })
    expect(() => finishProvisioningJob(database, {
      jobId: 'job-1',
      leaseOwner: 'processor-a',
      outcome: 'succeeded',
    })).toThrow(ProvisioningJobLeaseLostError)

    const retry = finishProvisioningJob(database, {
      jobId: 'job-1',
      leaseOwner: 'processor-b',
      outcome: 'failed',
      retryable: true,
      retryDelayMs: 25,
      errorCode: 'worker_unavailable',
      now: () => 275,
    })
    expect(retry).toMatchObject({
      status: 'queued',
      availableAt: 300,
      errorCode: 'worker_unavailable',
    })
    expect(claimProvisioningJob(database, {
      leaseOwner: 'processor-c',
      now: () => 299,
    })).toBeNull()

    const finalClaim = claimProvisioningJob(database, {
      leaseOwner: 'processor-c',
      now: () => 300,
    })
    expect(finalClaim?.attempt).toBe(3)
    const completed = finishProvisioningJob(database, {
      jobId: 'job-1',
      leaseOwner: 'processor-c',
      outcome: 'succeeded',
      now: () => 325,
    })
    expect(completed).toMatchObject({
      status: 'succeeded',
      completedAt: 325,
      leaseOwner: null,
    })

    const ready = ensureWorkspaceRunning(database, {
      userId: 'user-1',
      organizationId: 'org-1',
      now: () => 400,
    })
    expect(ready.workspace.state).toBe('ready')
    expect(ready.job).toBeNull()
  } finally {
    database.close()
  }
})
