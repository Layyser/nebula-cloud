import { expect, test } from 'bun:test'
import { migrateCloudSchema, openCloudDatabase } from '@nebula-cloud/database'
import { WorkerAdministration } from '../src/workerAdministration'

function administration() {
  const database = openCloudDatabase({ path: ':memory:' })
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
  return { database, administration: new WorkerAdministration(database) }
}

test('registers workers unschedulable by default and applies lifecycle actions', () => {
  const fixture = administration()
  try {
    const registered = fixture.administration.register({
      id: 'worker-a',
      name: 'Worker A',
      provider: 'local',
      region: 'local',
      baseURL: 'http://127.0.0.1:7780',
      credentialKeyId: 'worker-a-token',
      capacity: {
        memoryBytes: 4096,
        cpuMillis: 4000,
        diskBytes: 8192,
        workspaceSlots: 2,
      },
    })
    expect(registered).toMatchObject({
      id: 'worker-a',
      enabled: true,
      schedulable: false,
      state: 'unknown',
    })

    expect(fixture.administration.update('worker-a', { action: 'resume' }))
      .toMatchObject({ enabled: true, schedulable: true, state: 'unknown' })
    expect(fixture.administration.update('worker-a', { action: 'drain' }))
      .toMatchObject({ enabled: true, schedulable: false, state: 'draining' })
    expect(fixture.administration.update('worker-a', { action: 'disable' }))
      .toMatchObject({ enabled: false, schedulable: false, state: 'unavailable' })
    expect(fixture.administration.update('worker-a', { action: 'enable' }))
      .toMatchObject({ enabled: true, schedulable: false, state: 'unknown' })
  } finally {
    fixture.database.close()
  }
})

test('updates worker configuration without changing reservations', () => {
  const fixture = administration()
  try {
    fixture.administration.register({
      id: 'worker-a',
      name: 'Worker A',
      provider: 'local',
      region: 'local',
      baseURL: 'http://127.0.0.1:7780',
      credentialKeyId: 'worker-a-token',
      capacity: {
        memoryBytes: 4096,
        cpuMillis: 4000,
        diskBytes: 8192,
        workspaceSlots: 2,
      },
    })
    const updated = fixture.administration.update('worker-a', {
      name: 'Worker Alpha',
      region: 'fsn1',
      capacity: { workspaceSlots: 4 },
    })
    expect(updated).toMatchObject({
      name: 'Worker Alpha',
      region: 'fsn1',
      capacity: { workspaceSlots: 4 },
      reserved: { workspaceSlots: 0 },
    })
    expect(fixture.administration.list()).toHaveLength(1)
    expect(fixture.administration.update('missing', { action: 'drain' })).toBeNull()
  } finally {
    fixture.database.close()
  }
})
