import { expect, test } from 'bun:test'
import {
  claimProvisioningJob,
  ensurePersonalWorkspace,
  ensureWorkspaceRunning,
  finishProvisioningJob,
  getOrganizationUsageSummary,
  getOrganizationMembers,
  getPersonalUsageSummary,
  listOrganizationAuditEvents,
  migrateCloudSchema,
  openCloudDatabase,
  ProvisioningJobLeaseLostError,
  recordAuditEvent,
  recordUsageEvent,
  rotateOrganizationJoinCode,
  resolveWorkspaceAccess,
  UsageAccessDeniedError,
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
        organizationId TEXT NOT NULL REFERENCES organization(id),
        role TEXT NOT NULL DEFAULT 'member'
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
    ).get()?.count).toBe(10)
  } finally {
    database.close()
  }
})

test('records immutable bounded audit events and restricts the organization stream', () => {
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
      INSERT INTO user (id) VALUES ('owner'), ('member'), ('outsider');
      INSERT INTO organization (id) VALUES ('org-1');
      INSERT INTO member (id, userId, organizationId, role) VALUES
        ('owner-membership', 'owner', 'org-1', 'owner'),
        ('member-membership', 'member', 'org-1', 'member');
    `)
    migrateCloudSchema(database)

    recordAuditEvent(database, {
      eventId: 'event-1',
      userId: 'member',
      organizationId: 'org-1',
      action: 'operator.ensure_running_requested',
      targetType: 'workspace',
      targetId: 'workspace-1',
      metadata: { scheduled: true },
      now: () => 10,
    })
    recordAuditEvent(database, {
      eventId: 'event-2',
      userId: 'owner',
      organizationId: 'org-1',
      action: 'organization.access_code_rotated',
      targetType: 'organization',
      targetId: 'org-1',
      now: () => 20,
    })

    expect(listOrganizationAuditEvents(database, {
      userId: 'owner',
      organizationId: 'org-1',
    })).toEqual([
      expect.objectContaining({ eventId: 'event-2', occurredAt: 20 }),
      expect.objectContaining({
        eventId: 'event-1',
        metadata: { scheduled: true },
        occurredAt: 10,
      }),
    ])
    expect(() => listOrganizationAuditEvents(database, {
      userId: 'member',
      organizationId: 'org-1',
    })).toThrow('cannot administer')
    expect(() => recordAuditEvent(database, {
      userId: 'outsider',
      organizationId: 'org-1',
      action: 'operator.restart_requested',
      targetType: 'workspace',
      targetId: 'workspace-1',
    })).toThrow('cannot administer')
    expect(() => recordAuditEvent(database, {
      userId: 'member',
      organizationId: 'org-1',
      action: 'operator.restart_requested',
      targetType: 'workspace',
      targetId: 'workspace-1',
      metadata: { detail: 'x'.repeat(257) },
    })).toThrow('at most 256 characters')
    expect(() => database.prepare(
      'UPDATE audit_event SET result = ? WHERE event_id = ?',
    ).run('failure', 'event-1')).toThrow('append-only')
    expect(() => database.prepare(
      'DELETE FROM audit_event WHERE event_id = ?',
    ).run('event-1')).toThrow('append-only')
  } finally {
    database.close()
  }
})

test('manages organization access codes and disabled memberships', () => {
  const database = openCloudDatabase({ path: ':memory:' })
  try {
    database.exec(`
      CREATE TABLE user (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL
      );
      CREATE TABLE organization (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL
      );
      CREATE TABLE member (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL REFERENCES user(id),
        organizationId TEXT NOT NULL REFERENCES organization(id),
        role TEXT NOT NULL DEFAULT 'member',
        createdAt INTEGER NOT NULL
      );
      INSERT INTO user (id, name, email) VALUES
        ('owner', 'Owner', 'owner@example.com'),
        ('member', 'Member', 'member@example.com');
      INSERT INTO organization (id, name, slug) VALUES ('org-1', 'Nubols', 'nubols');
      INSERT INTO member (id, userId, organizationId, role, createdAt) VALUES
        ('owner-membership', 'owner', 'org-1', 'owner', 1),
        ('member-membership', 'member', 'org-1', 'member', 2);
    `)
    migrateCloudSchema(database)

    expect(rotateOrganizationJoinCode(database, {
      userId: 'owner',
      organizationId: 'org-1',
      lookupKey: 'ABCDEF123456',
      now: () => 10,
    })).toBe('ABCDEF123456')
    expect(getOrganizationMembers(database, {
      userId: 'owner',
      organizationId: 'org-1',
    }).members).toHaveLength(2)
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
        organizationId TEXT NOT NULL REFERENCES organization(id),
        role TEXT NOT NULL DEFAULT 'member'
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
        organizationId TEXT NOT NULL REFERENCES organization(id),
        role TEXT NOT NULL DEFAULT 'member'
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
        organizationId TEXT NOT NULL REFERENCES organization(id),
        role TEXT NOT NULL DEFAULT 'member'
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

test('requires live ownership or an administrative role for workspace access', () => {
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
        VALUES ('user-1'), ('user-2'), ('user-admin'), ('user-owner');
      INSERT INTO organization (id) VALUES ('org-1'), ('org-2');
      INSERT INTO member (id, userId, organizationId, role) VALUES
        ('member-1', 'user-1', 'org-1', 'member'),
        ('member-2', 'user-2', 'org-1', 'member'),
        ('member-3', 'user-1', 'org-2', 'member'),
        ('member-admin', 'user-admin', 'org-1', 'admin'),
        ('member-owner', 'user-owner', 'org-1', 'owner');
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
      workspaceId: workspace.id,
      userId: 'user-admin',
      organizationId: 'org-1',
    })?.id).toBe('workspace-1')
    expect(resolveWorkspaceAccess(database, {
      workspaceId: workspace.id,
      userId: 'user-owner',
      organizationId: 'org-1',
    })?.id).toBe('workspace-1')
    expect(resolveWorkspaceAccess(database, {
      workspaceId: 'workspace-guessed',
      userId: 'user-1',
      organizationId: 'org-1',
    })).toBeNull()

    database.prepare('DELETE FROM member WHERE id = ?').run('member-admin')
    expect(resolveWorkspaceAccess(database, {
      workspaceId: workspace.id,
      userId: 'user-admin',
      organizationId: 'org-1',
    })).toBeNull()
  } finally {
    database.close()
  }
})

test('deduplicates usage and authorizes personal and organization summaries', () => {
  const database = openCloudDatabase({ path: ':memory:' })
  try {
    database.exec(`
      CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE organization (id TEXT PRIMARY KEY);
      CREATE TABLE member (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL REFERENCES user(id),
        organizationId TEXT NOT NULL REFERENCES organization(id),
        role TEXT NOT NULL DEFAULT 'member'
      );
      INSERT INTO user (id, name) VALUES
        ('owner', 'Owner'),
        ('user-1', 'Jorge'),
        ('user-2', 'Alex'),
        ('outsider', 'Outsider');
      INSERT INTO organization (id) VALUES ('org-1'), ('org-2');
      INSERT INTO member (id, userId, organizationId, role) VALUES
        ('owner-member', 'owner', 'org-1', 'owner'),
        ('member-1', 'user-1', 'org-1', 'member'),
        ('member-2', 'user-2', 'org-1', 'member'),
        ('outsider-member', 'outsider', 'org-2', 'owner');
    `)
    migrateCloudSchema(database)
    const workspace1 = ensurePersonalWorkspace(database, {
      userId: 'user-1', organizationId: 'org-1', createId: () => 'workspace-1',
    })
    const workspace2 = ensurePersonalWorkspace(database, {
      userId: 'user-2', organizationId: 'org-1', createId: () => 'workspace-2',
    })
    const base = {
      organizationId: 'org-1', provider: 'openai', model: 'gpt-test',
      cachedTokens: 5, occurredAt: 100, receivedAt: 101,
    }
    const first = {
      ...base, eventId: 'turn-1', membershipId: 'member-1',
      workspaceId: workspace1.id, sessionId: 'chat-a', sessionDisplayName: 'First session',
      inputTokens: 100, outputTokens: 20, reasoningTokens: 4,
      estimatedCostMicrousd: 2_500, cacheSavingsMicrousd: 500,
    }
    expect(recordUsageEvent(database, first)).toBeTrue()
    expect(recordUsageEvent(database, first)).toBeFalse()
    expect(recordUsageEvent(database, {
      ...first,
      eventId: 'cost-backfill',
      estimatedCostMicrousd: 0,
      cacheSavingsMicrousd: 0,
    })).toBeTrue()
    expect(recordUsageEvent(database, {
      ...first,
      eventId: 'cost-backfill',
      estimatedCostMicrousd: 1_250,
      cacheSavingsMicrousd: 250,
    })).toBeTrue()
    expect(database.query<{
      estimated_cost_microusd: number
      cache_savings_microusd: number
    }, []>(`
      SELECT estimated_cost_microusd, cache_savings_microusd
      FROM usage_event
      WHERE event_id = 'cost-backfill'
    `).get()).toEqual({
      estimated_cost_microusd: 1_250,
      cache_savings_microusd: 250,
    })
    database.run("DELETE FROM usage_event WHERE event_id = 'cost-backfill'")
    recordUsageEvent(database, {
      ...base, eventId: 'turn-2', membershipId: 'member-1',
      workspaceId: workspace1.id, sessionId: 'chat-b',
      inputTokens: 30, outputTokens: 10, estimatedCostMicrousd: 1_000, occurredAt: 200,
    })
    recordUsageEvent(database, {
      ...base, eventId: 'turn-3', membershipId: 'member-2',
      workspaceId: workspace2.id, sessionId: 'chat-c',
      inputTokens: 50, outputTokens: 15, estimatedCostMicrousd: 750, occurredAt: 300,
    })

    const personal = getPersonalUsageSummary(database, {
      userId: 'user-1', organizationId: 'org-1', since: 0, rangeDays: 30,
    })
    expect(personal.totals).toEqual({
      modelTurns: 2, inputTokens: 130, outputTokens: 30,
      cachedTokens: 10, reasoningTokens: 4, totalTokens: 160,
      estimatedCostMicrousd: 3_500, cacheSavingsMicrousd: 500,
    })
    expect(personal.sessions.map(session => session.sessionId))
      .toEqual(['chat-b', 'chat-a'])
    expect(personal.sessions.find(session => session.sessionId === 'chat-a')?.displayName)
      .toBe('First session')
    expect(personal.models).toEqual([expect.objectContaining({
      provider: 'openai', model: 'gpt-test', totalTokens: 160,
    })])
    expect(personal.timeline).toEqual([expect.objectContaining({
      date: '1970-01-01', totalTokens: 160,
    })])
    expect(personal.modelTimeline).toEqual([expect.objectContaining({
      date: '1970-01-01', provider: 'openai', model: 'gpt-test', totalTokens: 160,
    })])

    const filteredPersonal = getPersonalUsageSummary(database, {
      userId: 'user-1', organizationId: 'org-1', since: 150, rangeDays: 7,
    })
    expect(filteredPersonal.rangeDays).toBe(7)
    expect(filteredPersonal.totals).toMatchObject({ modelTurns: 1, totalTokens: 40 })

    const organization = getOrganizationUsageSummary(database, {
      userId: 'owner', organizationId: 'org-1', since: 0, rangeDays: 30,
    })
    expect(organization.totals).toEqual({
      modelTurns: 3, inputTokens: 180, outputTokens: 45,
      cachedTokens: 15, reasoningTokens: 4, totalTokens: 225,
      estimatedCostMicrousd: 4_250, cacheSavingsMicrousd: 500,
    })
    expect(organization.members.find(member => member.membershipId === 'member-2'))
      .toMatchObject({ name: 'Alex', modelTurns: 1, totalTokens: 65 })
    expect(organization.members.find(member => member.membershipId === 'owner-member'))
      .toMatchObject({ modelTurns: 0, totalTokens: 0 })

    expect(() => getOrganizationUsageSummary(database, {
      userId: 'user-1', organizationId: 'org-1', since: 0, rangeDays: 30,
    })).toThrow(UsageAccessDeniedError)
    expect(() => getOrganizationUsageSummary(database, {
      userId: 'outsider', organizationId: 'org-1', since: 0, rangeDays: 30,
    })).toThrow(UsageAccessDeniedError)
    expect(() => recordUsageEvent(database, {
      ...base, eventId: 'cross-scope', membershipId: 'member-2',
      workspaceId: workspace1.id, sessionId: 'chat-x',
      inputTokens: 1, outputTokens: 1,
    })).toThrow('usage event scope does not match workspace ownership')
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
        organizationId TEXT NOT NULL REFERENCES organization(id),
        role TEXT NOT NULL DEFAULT 'member'
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
