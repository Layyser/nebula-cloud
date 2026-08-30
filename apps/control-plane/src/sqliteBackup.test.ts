import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createSQLiteBackup } from './sqliteBackup'

test('creates a private consistent SQLite snapshot and checksum manifest', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nubols-sqlite-backup-'))
  const source = join(directory, 'source.sqlite')
  const database = new Database(source)
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE nebula_migration (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);
    CREATE TABLE evidence (value TEXT NOT NULL);
    INSERT INTO nebula_migration VALUES ('0001', 1), ('0002', 2);
    INSERT INTO evidence VALUES ('consistent-value');
  `)
  database.close()

  const result = await createSQLiteBackup({
    databasePath: source,
    outputDirectory: join(directory, 'backups'),
    now: () => new Date('2026-08-30T12:00:00.000Z'),
  })
  expect(result.manifest).toMatchObject({
    format: 'nubols-control-plane-sqlite-backup-v1',
    createdAt: '2026-08-30T12:00:00.000Z',
    migrationCount: 2,
  })
  expect(result.manifest.sha256).toMatch(/^[a-f0-9]{64}$/)
  expect((await stat(result.databasePath)).mode & 0o777).toBe(0o600)
  expect(JSON.parse(await readFile(result.manifestPath, 'utf8'))).toEqual(result.manifest)
  const restored = new Database(result.databasePath, { readonly: true })
  expect(restored.query<{ value: string }, []>('SELECT value FROM evidence').get()?.value)
    .toBe('consistent-value')
  restored.close()
})
