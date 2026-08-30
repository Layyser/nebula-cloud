import { expect, test } from 'bun:test'
import {
  applyStripeBillingProjection,
  applyStripeInvoiceProjection,
  assignStripeOperatorSeat,
  assignWorkspaceWorker,
  beginEmailDelivery,
  claimProvisioningJob,
  ContactRateLimitError,
  createContactRequest,
  deleteContactRequestsCreatedBefore,
  ensurePersonalWorkspace,
  ensureWorkspaceRunning,
  finishProvisioningJob,
  getBillingCustomer,
  getBillingSubscription,
  getPublishedServiceBySlug,
  getWorkspaceOwnerIdentity,
  getOrganizationUsageSummary,
  getOrganizationInvitationStatus,
  getEmailDelivery,
  getOrganizationDashboardSummary,
  getOperatorEntitlement,
  getStripeEvent,
  getWorkerHost,
  getOrganizationMembers,
  getPersonalUsageSummary,
  getPlatformControl,
  hasActiveOperatorEntitlement,
  listOrganizationAuditEvents,
  listContactRequests,
  listPublishedServices,
  listPlatformControls,
  markEmailDeliveryFailed,
  markEmailDeliverySent,
  migrateCloudSchema,
  openCloudDatabase,
  ProvisioningJobLeaseLostError,
  recordAuditEvent,
  recordPlatformOperationAuditEvent,
  recordUsageEvent,
  recordWorkerHealth,
  projectEmailDeliveryStatus,
  registerStripeEvent,
  revokePublishedService,
  revokeOrganizationPublishedServices,
  revokeOperatorEntitlement,
  revokeStripeOperatorSeat,
  rotateOrganizationJoinCode,
  resolveWorkspaceAccess,
  setWorkerHostScheduling,
  setContactNotificationResult,
  setPlatformControl,
  updateContactRequestStatus,
  upsertWorkerHost,
  upsertPublishedService,
  upsertOperatorEntitlement,
  UsageAccessDeniedError,
  isEmailRecipientSuppressed,
  WorkspaceMembershipNotFoundError,
  WorkerPlacementUnavailableError,
} from '../src'

test('classifies invitation acceptance without leaking it to the wrong account', () => {
  const database = openCloudDatabase({ path: ':memory:' })
  try {
    database.exec(`
      CREATE TABLE organization (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE invitation (
        id TEXT PRIMARY KEY,
        organizationId TEXT NOT NULL,
        email TEXT NOT NULL,
        role TEXT,
        status TEXT NOT NULL,
        expiresAt INTEGER NOT NULL
      );
      INSERT INTO organization (id, name) VALUES ('org-1', 'Example Studio');
      INSERT INTO invitation (id, organizationId, email, role, status, expiresAt)
      VALUES
        ('pending', 'org-1', 'invitee@example.com', 'admin', 'pending', 2000),
        ('expired', 'org-1', 'invitee@example.com', 'member', 'pending', 999),
        ('accepted', 'org-1', 'invitee@example.com', 'member', 'accepted', 2000);
    `)
    expect(getOrganizationInvitationStatus(database, {
      invitationId: 'pending', userEmail: 'INVITEE@example.com', now: () => 1000,
    })).toEqual({
      state: 'pending', organizationName: 'Example Studio', role: 'admin', expiresAt: 2000,
    })
    expect(getOrganizationInvitationStatus(database, {
      invitationId: 'expired', userEmail: 'invitee@example.com', now: () => 1000,
    })).toEqual({ state: 'expired' })
    expect(getOrganizationInvitationStatus(database, {
      invitationId: 'accepted', userEmail: 'invitee@example.com', now: () => 1000,
    })).toEqual({ state: 'already_used' })
    expect(getOrganizationInvitationStatus(database, {
      invitationId: 'pending', userEmail: 'someone@example.com', now: () => 1000,
    })).toEqual({ state: 'wrong_account' })
    expect(getOrganizationInvitationStatus(database, {
      invitationId: 'missing', userEmail: 'invitee@example.com', now: () => 1000,
    })).toEqual({ state: 'not_found' })
  } finally {
    database.close()
  }
})

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
    expect(tables).toContain('published_service')
    expect(tables).toContain('billing_customer')
    expect(tables).toContain('subscription')
    expect(tables).toContain('stripe_event')
    expect(tables).toContain('platform_control')
    expect(tables).toContain('platform_control_audit_event')
    expect(tables).toContain('platform_operation_audit_event')
    expect(tables).toContain('email_delivery')
    expect(database.query<{ count: number }, []>(
      'SELECT COUNT(*) AS count FROM nebula_migration',
    ).get()?.count).toBe(24)
  } finally {
    database.close()
  }
})

test('records body-free email diagnostics and suppresses permanent delivery failures', () => {
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
    const recipientHash = 'a'.repeat(64)
    beginEmailDelivery(database, {
      id: 'delivery-1', provider: 'resend', kind: 'organization-invitation',
      recipientHash, now: () => 100,
    })
    expect(markEmailDeliverySent(database, {
      id: 'delivery-1', providerMessageId: 'provider-1', now: () => 110,
    })?.status).toBe('sent')
    expect(projectEmailDeliveryStatus(database, {
      providerMessageId: 'provider-1', status: 'delayed', now: () => 120,
    })?.status).toBe('delayed')
    expect(projectEmailDeliveryStatus(database, {
      providerMessageId: 'provider-1', status: 'delivered', now: () => 130,
    })?.status).toBe('delivered')
    expect(projectEmailDeliveryStatus(database, {
      providerMessageId: 'provider-1', status: 'delayed', now: () => 140,
    })?.status).toBe('delivered')
    expect(isEmailRecipientSuppressed(database, recipientHash)).toBe(false)
    expect(projectEmailDeliveryStatus(database, {
      providerMessageId: 'provider-1', status: 'complained', now: () => 150,
    })?.status).toBe('complained')
    expect(isEmailRecipientSuppressed(database, recipientHash)).toBe(true)
    expect(getEmailDelivery(database, 'delivery-1')).toMatchObject({
      providerMessageId: 'provider-1', status: 'complained', recipientHash,
    })

    beginEmailDelivery(database, {
      id: 'delivery-2', provider: 'resend', kind: 'password-reset',
      recipientHash: 'b'.repeat(64), now: () => 200,
    })
    expect(markEmailDeliveryFailed(database, {
      id: 'delivery-2', errorCode: 'provider_rejected', now: () => 210,
    })?.status).toBe('failed')
    const columns = database.query<{ name: string }, []>('PRAGMA table_info(email_delivery)')
      .all().map(column => column.name)
    expect(columns).not.toContain('email')
    expect(columns).not.toContain('body')
  } finally {
    database.close()
  }
})

test('persists platform kill switches with append-only bounded audit evidence', () => {
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

    expect(listPlatformControls(database)).toEqual([
      { name: 'provisioning', paused: false, reason: '', updatedBy: 'schema-migration', updatedAt: 0 },
      { name: 'publication', paused: false, reason: '', updatedBy: 'schema-migration', updatedAt: 0 },
      { name: 'workspace_start', paused: false, reason: '', updatedBy: 'schema-migration', updatedAt: 0 },
    ])
    expect(setPlatformControl(database, {
      name: 'workspace_start',
      paused: true,
      reason: 'Investigating worker instability',
      actor: 'jorge@nubols.com',
      eventId: 'control-event-1',
      now: () => 100,
    })).toEqual({
      name: 'workspace_start',
      paused: true,
      reason: 'Investigating worker instability',
      updatedBy: 'jorge@nubols.com',
      updatedAt: 100,
    })
    expect(getPlatformControl(database, 'workspace_start').paused).toBe(true)
    expect(database.query<{
      actor: string
      control_name: string
      previous_paused: number
      paused: number
      result: string
      reason: string
    }, []>('SELECT * FROM platform_control_audit_event').get()).toMatchObject({
      actor: 'jorge@nubols.com',
      control_name: 'workspace_start',
      previous_paused: 0,
      paused: 1,
      result: 'success',
      reason: 'Investigating worker instability',
    })
    expect(() => database.exec(
      "UPDATE platform_control_audit_event SET reason = 'changed'",
    )).toThrow('append-only')
    expect(() => setPlatformControl(database, {
      name: 'publication',
      paused: true,
      reason: '',
      actor: 'admin',
    })).toThrow('1 to 256')
    recordPlatformOperationAuditEvent(database, {
      actor: 'jorge@nubols.com',
      action: 'worker.drain',
      targetType: 'worker_host',
      targetId: 'worker-a',
      metadata: { reason: 'Maintenance', schedulable: false },
      eventId: 'operation-event-1',
      now: () => 101,
    })
    expect(database.query<{
      actor: string
      action: string
      target_type: string
      target_id: string
      result: string
      metadata_json: string
    }, []>('SELECT * FROM platform_operation_audit_event').get()).toMatchObject({
      actor: 'jorge@nubols.com',
      action: 'worker.drain',
      target_type: 'worker_host',
      target_id: 'worker-a',
      result: 'success',
      metadata_json: JSON.stringify({ reason: 'Maintenance', schedulable: false }),
    })
    expect(() => database.exec(
      "DELETE FROM platform_operation_audit_event",
    )).toThrow('append-only')
  } finally {
    database.close()
  }
})

test('migrates legacy publications to permanent public access without changing slugs', () => {
  const database = openCloudDatabase({ path: ':memory:' })
  try {
    database.exec(`
      CREATE TABLE nebula_migration (
        id TEXT PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
      CREATE TABLE member (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        organizationId TEXT NOT NULL
      );
      CREATE TABLE workspace (
        id TEXT PRIMARY KEY,
        member_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        state TEXT NOT NULL
      );
      CREATE TABLE organization_member_state (
        member_id TEXT PRIMARY KEY,
        disabled INTEGER NOT NULL
      );
      CREATE TABLE published_service (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        protocol TEXT NOT NULL,
        target_port INTEGER NOT NULL,
        state TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        revoked_at INTEGER,
        UNIQUE (workspace_id, name)
      );
      INSERT INTO member VALUES ('membership-1', 'owner', 'org-1');
      INSERT INTO workspace VALUES ('workspace-1', 'membership-1', 'org-1', 'ready');
      INSERT INTO published_service VALUES (
        'publication-1', 'workspace-1', 'api', 'stable-opaque-slug',
        'http', 3000, 'active', 10, 20, NULL
      );
    `)
    const insertMigration = database.prepare(
      'INSERT INTO nebula_migration (id, applied_at) VALUES (?, 1)',
    )
    for (const id of [
      '0001_workspace',
      '0002_workspace_membership_organization_guard',
      '0003_validate_existing_workspace_ownership',
      '0004_provisioning_job',
      '0005_usage_event',
      '0006_usage_event_cost',
      '0007_usage_event_details',
      '0008_usage_session_display_name',
      '0009_organization_control_plane',
      '0010_audit_event',
      '0011_worker_host_registry',
      '0012_worker_health_reported_capacity',
      '0013_contact_request',
      '0014_published_service',
    ]) insertMigration.run(id)

    migrateCloudSchema(database)
    const migrated = getPublishedServiceBySlug(database, 'stable-opaque-slug')
    expect(migrated).toMatchObject({
      id: 'publication-1',
      visibility: 'public',
      authPolicy: 'none',
      accessTokenHash: null,
      protocol: 'http',
      ingressPort: null,
    })
    expect(migrated!.expiresAt).toBeNull()
    expect(getPublishedServiceBySlug(database, 'stable-opaque-slug', Number.MAX_SAFE_INTEGER))
      .toMatchObject({ id: 'publication-1', expiresAt: null })
  } finally {
    database.close()
  }
})

test('publishes only workspace-scoped ports with stable opaque slugs and revocation', () => {
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
      INSERT INTO user (id) VALUES ('owner'), ('peer-owner');
      INSERT INTO organization (id) VALUES ('org-1'), ('org-2');
      INSERT INTO member (id, userId, organizationId, role)
        VALUES
          ('membership-1', 'owner', 'org-1', 'owner'),
          ('membership-2', 'peer-owner', 'org-2', 'owner');
    `)
    migrateCloudSchema(database)
    const workspace = ensurePersonalWorkspace(database, {
      userId: 'owner',
      organizationId: 'org-1',
      createId: () => 'workspace-1',
      now: () => 10,
    })
    expect(getWorkspaceOwnerIdentity(database, workspace.id)).toEqual({
      workspaceId: 'workspace-1',
      userId: 'owner',
      organizationId: 'org-1',
    })
    database.prepare("UPDATE workspace SET state = 'ready' WHERE id = ?")
      .run(workspace.id)

    const first = upsertPublishedService(database, {
      id: 'publication-1',
      workspaceId: workspace.id,
      name: 'web',
      slug: 'opaque-slug-one',
      targetPort: 3000,
      visibility: 'public',
      authPolicy: 'none',
      expiresAt: 600_020,
      maximumActive: 2,
      now: () => 20,
    })
    expect(first).toMatchObject({
      name: 'web', slug: 'opaque-slug-one', targetPort: 3000, state: 'active',
    })
    const updated = upsertPublishedService(database, {
      id: 'ignored-new-id',
      workspaceId: workspace.id,
      name: 'web',
      slug: 'ignored-new-slug',
      targetPort: 8080,
      visibility: 'private',
      authPolicy: 'token',
      accessTokenHash: 'a'.repeat(64),
      expiresAt: 600_030,
      maximumActive: 2,
      now: () => 30,
    })
    expect(updated).toMatchObject({
      id: 'publication-1', slug: 'opaque-slug-one', targetPort: 8080,
      visibility: 'private', authPolicy: 'token', expiresAt: 600_030,
    })
    upsertPublishedService(database, {
      id: 'publication-2', workspaceId: workspace.id, name: 'api',
      slug: 'opaque-slug-two', targetPort: 4000, maximumActive: 2,
      visibility: 'public', authPolicy: 'none', expiresAt: 600_040,
      now: () => 40,
    })
    expect(() => upsertPublishedService(database, {
      id: 'publication-3', workspaceId: workspace.id, name: 'docs',
      slug: 'opaque-slug-three', targetPort: 5000, maximumActive: 2,
      visibility: 'public', authPolicy: 'none', expiresAt: 600_050,
      now: () => 50,
    })).toThrow('Published service limit reached')
    expect(() => upsertPublishedService(database, {
      id: 'publication-runtime', workspaceId: workspace.id, name: 'runtime',
      slug: 'opaque-runtime-slug', targetPort: 7777,
      visibility: 'public', authPolicy: 'none', expiresAt: 600_050,
      now: () => 50,
    })).toThrow('port is invalid')

    const peerWorkspace = ensurePersonalWorkspace(database, {
      userId: 'peer-owner',
      organizationId: 'org-2',
      createId: () => 'workspace-2',
      now: () => 50,
    })
    database.prepare("UPDATE workspace SET state = 'ready' WHERE id = ?")
      .run(peerWorkspace.id)
    const peerTCP = upsertPublishedService(database, {
      id: 'peer-publication-1', workspaceId: peerWorkspace.id, name: 'minecraft',
      slug: 'peer-opaque-slug-one', targetPort: 25565, protocol: 'tcp',
      visibility: 'public', authPolicy: 'none', expiresAt: null,
      tcpIngressPortMinimum: 20000, tcpIngressPortMaximum: 20002,
      maximumActive: 2, now: () => 50,
    })
    expect(peerTCP).toMatchObject({ protocol: 'tcp', targetPort: 25565, ingressPort: 20000 })
    const peerHTTP = upsertPublishedService(database, {
      id: 'peer-publication-2', workspaceId: peerWorkspace.id, name: 'web',
      slug: 'peer-opaque-slug-two', targetPort: 4000, protocol: 'http',
      visibility: 'public', authPolicy: 'none', expiresAt: null,
      maximumActive: 2, now: () => 50,
    })
    expect(peerHTTP.ingressPort).toBeNull()
    expect(listPublishedServices(database, peerWorkspace.id, 60).map(service => service.name))
      .toEqual(['minecraft', 'web'])
    expect(() => upsertPublishedService(database, {
      id: 'peer-publication-3', workspaceId: peerWorkspace.id, name: 'docs',
      slug: 'peer-opaque-slug-three', targetPort: 5000,
      visibility: 'public', authPolicy: 'none', expiresAt: null,
      maximumActive: 2, now: () => 50,
    })).toThrow('Published service limit reached')

    expect(listPublishedServices(database, workspace.id, 60).map(service => service.name))
      .toEqual(['web', 'api'])
    expect(getPublishedServiceBySlug(database, 'opaque-slug-one', 60)).toMatchObject({
      targetPort: 8080,
      accessTokenHash: 'a'.repeat(64),
    })
    expect(() => upsertPublishedService(database, {
      id: 'invalid-private', workspaceId: workspace.id, name: 'private',
      slug: 'invalid-private', targetPort: 5001,
      visibility: 'private', authPolicy: 'token', expiresAt: 600_060,
      now: () => 60,
    })).toThrow('access policy is invalid')
    expect(() => upsertPublishedService(database, {
      id: 'invalid-ttl', workspaceId: workspace.id, name: 'short',
      slug: 'invalid-ttl', targetPort: 5002,
      visibility: 'public', authPolicy: 'none', expiresAt: 61_000,
      now: () => 60,
    })).toThrow('TTL is invalid')
    expect(revokePublishedService(database, {
      workspaceId: workspace.id,
      name: 'web',
      now: () => 40,
    })).toMatchObject({ state: 'revoked', revokedAt: 40 })
    expect(getPublishedServiceBySlug(database, 'opaque-slug-one', 60)).toBeNull()
    expect(listPublishedServices(database, workspace.id, 60).map(service => service.name))
      .toEqual(['api'])
    upsertPublishedService(database, {
      id: 'publication-3', workspaceId: workspace.id, name: 'docs',
      slug: 'opaque-slug-three', targetPort: 5000, maximumActive: 2,
      visibility: 'public', authPolicy: 'none', expiresAt: null,
      now: () => 70,
    })
    expect(getPublishedServiceBySlug(database, 'opaque-slug-two', 600_040)).toBeNull()
    expect(listPublishedServices(database, workspace.id, 600_040).map(service => service.name))
      .toEqual(['docs'])
    expect(getPublishedServiceBySlug(database, 'opaque-slug-three', Number.MAX_SAFE_INTEGER))
      .toMatchObject({ name: 'docs', expiresAt: null })
    database.exec(`
      INSERT INTO organization_member_state (
        member_id, disabled, disabled_by, disabled_at, updated_at
      ) VALUES ('membership-1', 1, 'owner', 50, 50)
    `)
    expect(getWorkspaceOwnerIdentity(database, workspace.id)).toBeNull()
    expect(getPublishedServiceBySlug(database, 'opaque-slug-two', 60)).toBeNull()
    expect(revokeOrganizationPublishedServices(database, {
      organizationId: 'org-1',
      now: () => 80,
    }).map(service => service.name)).toEqual(['api', 'docs'])
    expect(listPublishedServices(database, workspace.id, 80)).toEqual([])
    expect(listPublishedServices(database, peerWorkspace.id, 80).map(service => service.name))
      .toEqual(['minecraft', 'web'])
  } finally {
    database.close()
  }
})

test('enforces an organization publication ceiling across separate workspaces', () => {
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
      INSERT INTO user (id) VALUES ('user-1'), ('user-2');
      INSERT INTO organization (id) VALUES ('org-1');
      INSERT INTO member (id, userId, organizationId)
      VALUES
        ('member-1', 'user-1', 'org-1'),
        ('member-2', 'user-2', 'org-1');
    `)
    migrateCloudSchema(database)
    const first = ensurePersonalWorkspace(database, {
      userId: 'user-1', organizationId: 'org-1', createId: () => 'workspace-1', now: () => 1,
    })
    const second = ensurePersonalWorkspace(database, {
      userId: 'user-2', organizationId: 'org-1', createId: () => 'workspace-2', now: () => 1,
    })
    upsertPublishedService(database, {
      id: 'publication-1', workspaceId: first.id, name: 'api', slug: 'slug-one',
      targetPort: 3000, visibility: 'public', authPolicy: 'none', expiresAt: null,
      maximumOrganizationActive: 1, now: () => 2,
    })
    expect(() => upsertPublishedService(database, {
      id: 'publication-2', workspaceId: second.id, name: 'web', slug: 'slug-two',
      targetPort: 4000, visibility: 'public', authPolicy: 'none', expiresAt: null,
      maximumOrganizationActive: 1, now: () => 3,
    })).toThrow('Organization published service limit reached')

    revokePublishedService(database, { workspaceId: first.id, name: 'api', now: () => 4 })
    expect(upsertPublishedService(database, {
      id: 'publication-2', workspaceId: second.id, name: 'web', slug: 'slug-two',
      targetPort: 4000, visibility: 'public', authPolicy: 'none', expiresAt: null,
      maximumOrganizationActive: 1, now: () => 5,
    })).toMatchObject({ workspaceId: second.id, state: 'active' })
  } finally {
    database.close()
  }
})

test('persists idempotent contact requests and enforces durable source and email limits', () => {
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
    const base = {
      name: 'Ada Lovelace',
      email: 'ADA@example.test',
      organization: 'Analytical Engines',
      topic: 'sales' as const,
      message: 'We need isolated build environments for our team.',
      sourceHash: 'source-hash-that-is-long-enough',
      privacyVersion: '2026-08-24',
      now: () => 100,
      maximumPerSource: 2,
      maximumPerEmail: 2,
    }
    const first = createContactRequest(database, { ...base, id: 'request-1' })
    expect(first.created).toBe(true)
    expect(first.request).toMatchObject({
      id: 'request-1',
      email: 'ada@example.test',
      notificationStatus: 'pending',
    })
    expect(createContactRequest(database, { ...base, id: 'request-1' }).created).toBe(false)

    const sent = setContactNotificationResult(database, {
      requestId: 'request-1',
      status: 'sent',
      providerMessageId: 'provider-1',
      now: () => 110,
    })
    expect(sent).toMatchObject({
      notificationStatus: 'sent',
      providerMessageId: 'provider-1',
    })

    createContactRequest(database, { ...base, id: 'request-2' })
    expect(() => createContactRequest(database, {
      ...base,
      id: 'request-3',
    })).toThrow(ContactRateLimitError)
  } finally {
    database.close()
  }
})

test('lists, advances, filters, updates, and expires contact requests', () => {
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
    const create = (id: string, timestamp: number) => createContactRequest(database, {
      id,
      name: 'Ada Lovelace',
      email: `${id}@example.test`,
      topic: 'sales',
      message: 'We need isolated build environments for our team.',
      sourceHash: `source-hash-that-is-long-enough-${id}`,
      privacyVersion: '2026-08-24',
      now: () => timestamp,
      maximumPerSource: 10,
      maximumPerEmail: 10,
    })
    create('request-a', 100)
    create('request-b', 200)
    create('request-c', 200)

    const firstPage = listContactRequests(database, { limit: 2 })
    expect(firstPage.requests.map(request => request.id)).toEqual([
      'request-c', 'request-b',
    ])
    expect(firstPage.nextCursor).toEqual({ createdAt: 200, id: 'request-b' })
    expect(listContactRequests(database, {
      limit: 2,
      before: firstPage.nextCursor,
    }).requests.map(request => request.id)).toEqual(['request-a'])

    expect(updateContactRequestStatus(database, {
      requestId: 'request-b',
      status: 'qualified',
      now: () => 250,
    })).toMatchObject({ id: 'request-b', status: 'qualified', updatedAt: 250 })
    expect(listContactRequests(database, {
      status: 'qualified',
    }).requests.map(request => request.id)).toEqual(['request-b'])
    expect(updateContactRequestStatus(database, {
      requestId: 'missing',
      status: 'closed',
    })).toBeNull()
    expect(() => updateContactRequestStatus(database, {
      requestId: 'request-b',
      status: 'deleted' as 'closed',
    })).toThrow('status is invalid')

    expect(deleteContactRequestsCreatedBefore(database, 150)).toBe(1)
    expect(listContactRequests(database).requests.map(request => request.id)).toEqual([
      'request-c', 'request-b',
    ])
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

test('persists Stripe events before idempotent and out-of-order billing projection', () => {
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
      INSERT INTO organization (id) VALUES ('org-1');
    `)
    migrateCloudSchema(database)

    const registered = registerStripeEvent(database, {
      stripeEventId: 'evt_registered',
      type: 'customer.created',
      eventCreatedAt: 50,
      receivedAt: 55,
    })
    expect(registered.inserted).toBe(true)
    expect(registerStripeEvent(database, {
      stripeEventId: 'evt_registered',
      type: 'customer.created',
      eventCreatedAt: 50,
      receivedAt: 60,
    }).inserted).toBe(false)
    expect(getStripeEvent(database, 'evt_registered')).toMatchObject({
      processingResult: 'pending',
      receivedAt: 55,
      attemptCount: 0,
    })

    const currentInput = {
      event: {
        stripeEventId: 'evt_current',
        type: 'customer.subscription.updated',
        eventCreatedAt: 200,
        receivedAt: 210,
      },
      organizationId: 'org-1',
      customer: {
        stripeCustomerId: 'cus_1',
        billingEmail: 'billing@example.com',
        country: 'es',
      },
      subscription: {
        stripeSubscriptionId: 'sub_1',
        stripePriceId: 'price_beta',
        status: 'active',
        entitledSeats: 3,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: 1_000,
      },
      now: () => 220,
    }
    expect(applyStripeBillingProjection(database, currentInput)).toMatchObject({
      duplicate: false,
      processingResult: 'applied',
      customer: { stripeCustomerId: 'cus_1', country: 'ES' },
      subscription: { status: 'active', entitledSeats: 3 },
    })
    expect(applyStripeBillingProjection(database, currentInput)).toMatchObject({
      duplicate: true,
      processingResult: 'applied',
    })
    expect(getStripeEvent(database, 'evt_current')).toMatchObject({
      processingResult: 'applied',
      processedAt: 220,
      attemptCount: 1,
    })

    const stale = applyStripeBillingProjection(database, {
      event: {
        stripeEventId: 'evt_stale',
        type: 'customer.subscription.updated',
        eventCreatedAt: 100,
      },
      organizationId: 'org-1',
      customer: {
        stripeCustomerId: 'cus_stale',
        billingEmail: 'old@example.com',
        country: 'US',
      },
      subscription: {
        stripeSubscriptionId: 'sub_stale',
        stripePriceId: 'price_old',
        status: 'canceled',
        entitledSeats: 0,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: 500,
      },
      now: () => 230,
    })
    expect(stale.processingResult).toBe('ignored')
    expect(getBillingCustomer(database, 'org-1')).toMatchObject({
      stripeCustomerId: 'cus_1',
      billingEmail: 'billing@example.com',
      lastEventCreatedAt: 200,
    })
    expect(getBillingSubscription(database, 'org-1')).toMatchObject({
      stripeSubscriptionId: 'sub_1',
      status: 'active',
      entitledSeats: 3,
      lastEventCreatedAt: 200,
    })
    expect(getStripeEvent(database, 'evt_stale')).toMatchObject({
      processingResult: 'ignored',
      attemptCount: 1,
    })

    expect(() => applyStripeBillingProjection(database, {
      event: {
        stripeEventId: 'evt_failed',
        type: 'customer.subscription.updated',
        eventCreatedAt: 300,
      },
      organizationId: 'missing-org',
      now: () => 310,
    })).toThrow('Billing organization was not found')
    expect(getStripeEvent(database, 'evt_failed')).toMatchObject({
      processingResult: 'failed',
      processingMessage: 'Billing organization was not found',
      attemptCount: 1,
    })
    database.exec("INSERT INTO organization (id) VALUES ('missing-org')")
    expect(applyStripeBillingProjection(database, {
      event: {
        stripeEventId: 'evt_failed',
        type: 'customer.subscription.updated',
        eventCreatedAt: 300,
      },
      organizationId: 'missing-org',
      now: () => 320,
    })).toMatchObject({ duplicate: true, processingResult: 'ignored' })
    expect(getStripeEvent(database, 'evt_failed')).toMatchObject({
      processingResult: 'ignored',
      attemptCount: 2,
    })
  } finally {
    database.close()
  }
})

test('assigns purchased seats explicitly and applies one fixed fourteen-day payment grace', () => {
  const database = openCloudDatabase({ path: ':memory:' })
  try {
    database.exec(`
      CREATE TABLE user (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT 'User',
        email TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE organization (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT 'Organization');
      CREATE TABLE member (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL REFERENCES user(id),
        organizationId TEXT NOT NULL REFERENCES organization(id),
        role TEXT NOT NULL DEFAULT 'member',
        createdAt INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO user (id) VALUES ('owner'), ('user-1'), ('user-2'), ('user-3');
      INSERT INTO organization (id) VALUES ('org-1');
      INSERT INTO member (id, userId, organizationId, role) VALUES
        ('owner-member', 'owner', 'org-1', 'owner'),
        ('member-1', 'user-1', 'org-1', 'member'),
        ('member-2', 'user-2', 'org-1', 'member'),
        ('member-3', 'user-3', 'org-1', 'member');
    `)
    migrateCloudSchema(database)
    const base = 1_000_000
    const periodEnd = base + 30 * 24 * 60 * 60 * 1000
    applyStripeBillingProjection(database, {
      event: {
        stripeEventId: 'evt_subscription_initial',
        type: 'customer.subscription.created',
        eventCreatedAt: base - 1_000,
      },
      organizationId: 'org-1',
      subscription: {
        stripeSubscriptionId: 'sub_1',
        stripePriceId: 'price_1',
        status: 'active',
        entitledSeats: 2,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: periodEnd,
      },
      now: () => base,
    })

    expect(() => assignStripeOperatorSeat(database, {
      userId: 'user-1', organizationId: 'org-1', membershipId: 'member-1', now: () => base,
    })).toThrow('The user cannot administer this organization')

    for (const membershipId of ['member-1', 'member-2']) {
      expect(assignStripeOperatorSeat(database, {
        userId: 'owner', organizationId: 'org-1', membershipId, now: () => base,
      })).toMatchObject({ membershipId, source: 'stripe', state: 'active' })
    }
    expect(() => assignStripeOperatorSeat(database, {
      userId: 'owner', organizationId: 'org-1', membershipId: 'member-3', now: () => base,
    })).toThrow('All purchased Operator seats are already assigned')

    const failedAt = base + 1_000
    const graceEndsAt = failedAt + 14 * 24 * 60 * 60 * 1000
    expect(applyStripeInvoiceProjection(database, {
      event: {
        stripeEventId: 'evt_invoice_failed_1',
        type: 'invoice.payment_failed',
        eventCreatedAt: failedAt,
      },
      stripeSubscriptionId: 'sub_1',
      now: () => failedAt,
    }).subscription).toMatchObject({ paymentState: 'grace', graceEndsAt })
    expect(getOperatorEntitlement(database, {
      membershipId: 'member-1', organizationId: 'org-1',
    })).toMatchObject({ state: 'grace', endsAt: graceEndsAt })
    expect(hasActiveOperatorEntitlement(database, {
      membershipId: 'member-1', organizationId: 'org-1', now: graceEndsAt - 1,
    })).toBe(true)
    expect(hasActiveOperatorEntitlement(database, {
      membershipId: 'member-1', organizationId: 'org-1', now: graceEndsAt,
    })).toBe(false)

    expect(applyStripeInvoiceProjection(database, {
      event: {
        stripeEventId: 'evt_invoice_failed_2',
        type: 'invoice.payment_failed',
        eventCreatedAt: failedAt + 2 * 24 * 60 * 60 * 1000,
      },
      stripeSubscriptionId: 'sub_1',
      now: () => failedAt + 2 * 24 * 60 * 60 * 1000,
    }).subscription?.graceEndsAt).toBe(graceEndsAt)

    expect(applyStripeInvoiceProjection(database, {
      event: {
        stripeEventId: 'evt_invoice_paid',
        type: 'invoice.paid',
        eventCreatedAt: failedAt + 3 * 24 * 60 * 60 * 1000,
      },
      stripeSubscriptionId: 'sub_1',
      now: () => failedAt + 3 * 24 * 60 * 60 * 1000,
    }).subscription).toMatchObject({ paymentState: 'current', graceEndsAt: null })
    expect(getOperatorEntitlement(database, {
      membershipId: 'member-1', organizationId: 'org-1',
    })).toMatchObject({ state: 'active', endsAt: periodEnd })

    const delayedFailureAt = failedAt + 4 * 24 * 60 * 60 * 1000
    const delayedGraceEndsAt = delayedFailureAt + 14 * 24 * 60 * 60 * 1000
    expect(applyStripeInvoiceProjection(database, {
      event: {
        stripeEventId: 'evt_invoice_failed_delayed',
        type: 'invoice.payment_failed',
        eventCreatedAt: delayedFailureAt,
      },
      stripeSubscriptionId: 'sub_1',
      now: () => delayedGraceEndsAt + 1,
    }).subscription).toMatchObject({
      paymentState: 'delinquent',
      graceEndsAt: delayedGraceEndsAt,
    })
    expect(applyStripeInvoiceProjection(database, {
      event: {
        stripeEventId: 'evt_invoice_failed_after_deadline',
        type: 'invoice.payment_failed',
        eventCreatedAt: delayedGraceEndsAt + 2,
      },
      stripeSubscriptionId: 'sub_1',
      now: () => delayedGraceEndsAt + 2,
    }).subscription).toMatchObject({
      paymentState: 'delinquent',
      graceEndsAt: delayedGraceEndsAt,
    })
    expect(getOrganizationMembers(database, {
      userId: 'owner', organizationId: 'org-1',
    })).toMatchObject({
      operatorSeats: {
        purchased: 2,
        assigned: 2,
        paymentState: 'delinquent',
        graceEndsAt: delayedGraceEndsAt,
      },
      members: expect.arrayContaining([
        expect.objectContaining({
          membershipId: 'member-1',
          operatorEntitlement: expect.objectContaining({ state: 'suspended' }),
        }),
      ]),
    })
    applyStripeInvoiceProjection(database, {
      event: {
        stripeEventId: 'evt_invoice_paid_after_deadline',
        type: 'invoice.paid',
        eventCreatedAt: delayedGraceEndsAt + 3,
      },
      stripeSubscriptionId: 'sub_1',
      now: () => delayedGraceEndsAt + 3,
    })

    expect(() => applyStripeBillingProjection(database, {
      event: {
        stripeEventId: 'evt_quantity_too_small',
        type: 'customer.subscription.updated',
        eventCreatedAt: failedAt + 4 * 24 * 60 * 60 * 1000,
      },
      organizationId: 'org-1',
      subscription: {
        stripeSubscriptionId: 'sub_1',
        stripePriceId: 'price_1',
        status: 'active',
        entitledSeats: 1,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: periodEnd,
      },
    })).toThrow('Stripe seat quantity cannot be lower than assigned Operator seats')

    expect(revokeStripeOperatorSeat(database, {
      userId: 'owner', organizationId: 'org-1', membershipId: 'member-1', now: () => base + 5,
    })).toMatchObject({ source: 'stripe', state: 'revoked' })
    expect(assignStripeOperatorSeat(database, {
      userId: 'owner', organizationId: 'org-1', membershipId: 'member-3', now: () => base + 6,
    })).toMatchObject({ membershipId: 'member-3', source: 'stripe', state: 'active' })
    expect(listOrganizationAuditEvents(database, {
      userId: 'owner', organizationId: 'org-1', limit: 20,
    }).map(event => event.action).sort()).toEqual([
      'billing.operator_seat.assigned',
      'billing.operator_seat.assigned',
      'billing.operator_seat.assigned',
      'billing.operator_seat.revoked',
    ])
  } finally {
    database.close()
  }
})

test('projects expiring beta grants through the provider-neutral entitlement boundary', () => {
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
      INSERT INTO member (id, userId, organizationId, role)
        VALUES ('member-1', 'user-1', 'org-1', 'member');
    `)
    migrateCloudSchema(database)

    expect(() => upsertOperatorEntitlement(database, {
      membershipId: 'member-1', organizationId: 'org-1',
      state: 'active', source: 'beta', startsAt: 100, endsAt: null,
    })).toThrow('Beta entitlements must expire')
    expect(() => upsertOperatorEntitlement(database, {
      membershipId: 'member-1', organizationId: 'org-2',
      state: 'active', source: 'admin', startsAt: 100, endsAt: null,
    })).toThrow('Entitlement membership was not found')

    const entitlement = upsertOperatorEntitlement(database, {
      membershipId: 'member-1', organizationId: 'org-1',
      state: 'active', source: 'beta', startsAt: 100, endsAt: 200,
      now: () => 110,
    })
    expect(entitlement).toMatchObject({
      membershipId: 'member-1', organizationId: 'org-1', kind: 'operator',
      state: 'active', source: 'beta', startsAt: 100, endsAt: 200,
    })
    expect(hasActiveOperatorEntitlement(database, {
      membershipId: 'member-1', organizationId: 'org-1', now: 150,
    })).toBe(true)
    expect(hasActiveOperatorEntitlement(database, {
      membershipId: 'member-1', organizationId: 'org-1', now: 200,
    })).toBe(false)

    expect(revokeOperatorEntitlement(database, {
      membershipId: 'member-1', organizationId: 'org-1', now: () => 160,
    })?.state).toBe('revoked')
    expect(getOperatorEntitlement(database, {
      membershipId: 'member-1', organizationId: 'org-1',
    })?.createdAt).toBe(110)
    expect(hasActiveOperatorEntitlement(database, {
      membershipId: 'member-1', organizationId: 'org-1', now: 170,
    })).toBe(false)
  } finally {
    database.close()
  }
})

test('builds role-aware dashboard metrics only from persisted organization state', () => {
  const database = openCloudDatabase({ path: ':memory:' })
  try {
    database.exec(`
      CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL);
      CREATE TABLE organization (id TEXT PRIMARY KEY);
      CREATE TABLE member (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL REFERENCES user(id),
        organizationId TEXT NOT NULL REFERENCES organization(id),
        role TEXT NOT NULL DEFAULT 'member'
      );
      INSERT INTO user (id, name, email) VALUES
        ('owner', 'Owner', 'owner@example.com'),
        ('member', 'Member', 'member@example.com');
      INSERT INTO organization (id) VALUES ('org-1');
      INSERT INTO member (id, userId, organizationId, role) VALUES
        ('owner-member', 'owner', 'org-1', 'owner'),
        ('regular-member', 'member', 'org-1', 'member');
    `)
    migrateCloudSchema(database)
    const ownerWorkspace = ensurePersonalWorkspace(database, {
      userId: 'owner', organizationId: 'org-1', createId: () => 'workspace-owner', now: () => 90_000,
    })
    const memberWorkspace = ensurePersonalWorkspace(database, {
      userId: 'member', organizationId: 'org-1', createId: () => 'workspace-member', now: () => 90_000,
    })
    upsertWorkerHost(database, {
      id: 'worker-1', name: 'Worker 1', provider: 'local', region: 'local',
      baseURL: 'http://127.0.0.1:7780', credentialKeyId: 'worker-token',
      totalMemoryBytes: 8_192, totalCpuMillis: 8_000,
      totalDiskBytes: 16_384, totalWorkspaceSlots: 4, now: () => 100_000,
    })
    recordWorkerHealth(database, {
      workerHostId: 'worker-1', state: 'healthy', now: () => 100_000,
    })
    for (const workspace of [ownerWorkspace, memberWorkspace]) {
      assignWorkspaceWorker(database, {
        workspaceId: workspace.id,
        requirements: { memoryBytes: 1_024, cpuMillis: 1_000, diskBytes: 2_048 },
        now: () => 100_000,
      })
    }
    database.prepare("UPDATE workspace SET state = 'ready' WHERE id = ?")
      .run(ownerWorkspace.id)

    const failed = ensureWorkspaceRunning(database, {
      userId: 'member', organizationId: 'org-1', createJobId: () => 'job-failed', now: () => 100_100,
    })
    expect(failed.job?.id).toBe('job-failed')
    const claimed = claimProvisioningJob(database, { leaseOwner: 'processor', now: () => 100_100 })
    finishProvisioningJob(database, {
      jobId: claimed!.id,
      leaseOwner: 'processor',
      outcome: 'failed',
      retryable: false,
      now: () => 100_200,
    })

    for (const event of [
      { eventId: 'turn-owner-1', membershipId: 'owner-member', workspaceId: ownerWorkspace.id, sessionId: 'session-a', inputTokens: 100, outputTokens: 20, estimatedCostMicrousd: 1_000 },
      { eventId: 'turn-owner-2', membershipId: 'owner-member', workspaceId: ownerWorkspace.id, sessionId: 'session-a', inputTokens: 50, outputTokens: 10, estimatedCostMicrousd: 500 },
      { eventId: 'turn-member-1', membershipId: 'regular-member', workspaceId: memberWorkspace.id, sessionId: 'session-a', inputTokens: 80, outputTokens: 40, estimatedCostMicrousd: 900 },
    ]) {
      recordUsageEvent(database, {
        ...event,
        organizationId: 'org-1',
        provider: 'openai',
        model: 'gpt-test',
        occurredAt: 100_300,
        receivedAt: 100_300,
      })
    }
    for (const membershipId of ['owner-member', 'regular-member']) {
      upsertOperatorEntitlement(database, {
        membershipId,
        organizationId: 'org-1',
        state: 'active',
        source: 'beta',
        startsAt: 90_000,
        endsAt: 130_000,
        now: () => 100_400,
      })
    }

    expect(getOrganizationDashboardSummary(database, {
      userId: 'owner', organizationId: 'org-1', since: 90_000,
      heartbeatMaxAgeMs: 30_000, now: () => 120_000,
    })).toEqual({
      organizationId: 'org-1',
      scope: 'organization',
      rangeDays: 30,
      enabledMembers: 2,
      entitledMembers: 2,
      operators: { ready: 1, total: 2 },
      usage: { sessions: 2, modelTurns: 3, totalTokens: 300, estimatedCostMicrousd: 2_400 },
      provisioningFailures: 1,
      workers: { healthy: 1, total: 1 },
    })
    expect(getOrganizationDashboardSummary(database, {
      userId: 'member', organizationId: 'org-1', since: 90_000,
      heartbeatMaxAgeMs: 30_000, now: () => 120_000,
    })).toMatchObject({
      scope: 'personal',
      enabledMembers: null,
      entitledMembers: 1,
      operators: { ready: 0, total: 1 },
      usage: { sessions: 1, modelTurns: 1, totalTokens: 120, estimatedCostMicrousd: 900 },
      provisioningFailures: 1,
      workers: { healthy: 1, total: 1 },
    })
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

test('places workspaces deterministically and reserves worker capacity atomically', () => {
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
      INSERT INTO user (id) VALUES ('user-1'), ('user-2'), ('user-3');
      INSERT INTO organization (id) VALUES ('org-1');
      INSERT INTO member (id, userId, organizationId) VALUES
        ('member-1', 'user-1', 'org-1'),
        ('member-2', 'user-2', 'org-1'),
        ('member-3', 'user-3', 'org-1');
    `)
    migrateCloudSchema(database)
    for (const id of ['a-worker', 'b-worker']) {
      upsertWorkerHost(database, {
        id,
        name: id,
        provider: 'local',
        region: 'local-1',
        baseURL: `http://${id}:7780`,
        credentialKeyId: `${id}-credential`,
        totalMemoryBytes: 2048,
        totalCpuMillis: 2000,
        totalDiskBytes: 4096,
        totalWorkspaceSlots: 2,
        now: () => 10,
      })
      recordWorkerHealth(database, {
        workerHostId: id,
        state: 'healthy',
        now: () => 100,
      })
    }
    const workspaces = ['user-1', 'user-2', 'user-3'].map((userId, index) =>
      ensurePersonalWorkspace(database, {
        userId,
        organizationId: 'org-1',
        createId: () => `workspace-${index + 1}`,
      }))
    const requirements = {
      memoryBytes: 1024,
      cpuMillis: 500,
      diskBytes: 1024,
    }

    const first = assignWorkspaceWorker(database, {
      workspaceId: workspaces[0]!.id,
      requirements,
      now: () => 110,
    })
    const second = assignWorkspaceWorker(database, {
      workspaceId: workspaces[1]!.id,
      requirements,
      now: () => 111,
    })
    const third = assignWorkspaceWorker(database, {
      workspaceId: workspaces[2]!.id,
      requirements,
      now: () => 112,
    })

    expect(first.workerHost.id).toBe('a-worker')
    expect(second.workerHost.id).toBe('b-worker')
    expect(third.workerHost.id).toBe('a-worker')
    expect(getWorkerHost(database, 'a-worker')).toMatchObject({
      reservedMemoryBytes: 2048,
      reservedWorkspaceSlots: 2,
    })
    expect(getWorkerHost(database, 'b-worker')).toMatchObject({
      reservedMemoryBytes: 1024,
      reservedWorkspaceSlots: 1,
    })
  } finally {
    database.close()
  }
})

test('keeps assignments sticky and excludes draining, stale, and full workers', () => {
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
      INSERT INTO user (id) VALUES ('user-1'), ('user-2');
      INSERT INTO organization (id) VALUES ('org-1');
      INSERT INTO member (id, userId, organizationId) VALUES
        ('member-1', 'user-1', 'org-1'),
        ('member-2', 'user-2', 'org-1');
    `)
    migrateCloudSchema(database)
    for (const id of ['draining-worker', 'healthy-worker']) {
      upsertWorkerHost(database, {
        id,
        name: id,
        provider: 'local',
        region: 'local-1',
        baseURL: `http://${id}:7780`,
        credentialKeyId: `${id}-credential`,
        totalMemoryBytes: 1024,
        totalCpuMillis: 1000,
        totalDiskBytes: 2048,
        totalWorkspaceSlots: 1,
      })
      recordWorkerHealth(database, {
        workerHostId: id,
        state: 'healthy',
        now: () => 100,
      })
    }
    setWorkerHostScheduling(database, {
      workerHostId: 'draining-worker',
      schedulable: false,
      state: 'draining',
      now: () => 101,
    })
    const firstWorkspace = ensurePersonalWorkspace(database, {
      userId: 'user-1',
      organizationId: 'org-1',
      createId: () => 'workspace-1',
    })
    const secondWorkspace = ensurePersonalWorkspace(database, {
      userId: 'user-2',
      organizationId: 'org-1',
      createId: () => 'workspace-2',
    })
    const requirements = {
      memoryBytes: 1024,
      cpuMillis: 1000,
      diskBytes: 2048,
    }

    const first = assignWorkspaceWorker(database, {
      workspaceId: firstWorkspace.id,
      requirements,
      now: () => 110,
    })
    expect(first.workerHost.id).toBe('healthy-worker')

    recordWorkerHealth(database, {
      workerHostId: 'healthy-worker',
      state: 'unavailable',
      errorCode: 'health_check_failed',
      now: () => 120,
    })
    const repeated = assignWorkspaceWorker(database, {
      workspaceId: firstWorkspace.id,
      requirements: { memoryBytes: 1, cpuMillis: 1, diskBytes: 1 },
      now: () => 121,
    })
    expect(repeated.workerHost.id).toBe('healthy-worker')
    expect(repeated.workspace.reservedMemoryBytes).toBe(1024)

    expect(() => assignWorkspaceWorker(database, {
      workspaceId: secondWorkspace.id,
      requirements,
      now: () => 121,
    })).toThrow(WorkerPlacementUnavailableError)
  } finally {
    database.close()
  }
})

test('persists worker-reported capacity in bounded health history', () => {
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
    upsertWorkerHost(database, {
      id: 'worker-a', name: 'Worker A', provider: 'local', region: 'local',
      baseURL: 'http://worker-a:7780', credentialKeyId: 'worker-a-token',
      totalMemoryBytes: 4096, totalCpuMillis: 4000,
      totalDiskBytes: 8192, totalWorkspaceSlots: 2,
    })
    recordWorkerHealth(database, {
      workerHostId: 'worker-a', state: 'healthy', now: () => 100,
      capacity: {
        totalMemoryBytes: 4096, reservedMemoryBytes: 1024,
        totalCpuMillis: 4000, reservedCpuMillis: 1000,
        totalDiskBytes: 8192, reservedDiskBytes: 2048,
        totalWorkspaceSlots: 2, reservedWorkspaceSlots: 1,
      },
    })
    expect(database.query<{
      total_memory_bytes: number
      reserved_memory_bytes: number
      total_cpu_millis: number
      reserved_cpu_millis: number
      total_disk_bytes: number
      reserved_disk_bytes: number
      total_workspace_slots: number
      reserved_workspace_slots: number
    }, []>('SELECT * FROM worker_health_sample').get()).toMatchObject({
      total_memory_bytes: 4096,
      reserved_memory_bytes: 1024,
      total_cpu_millis: 4000,
      reserved_cpu_millis: 1000,
      total_disk_bytes: 8192,
      reserved_disk_bytes: 2048,
      total_workspace_slots: 2,
      reserved_workspace_slots: 1,
    })
  } finally {
    database.close()
  }
})
