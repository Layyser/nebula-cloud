import { Database } from 'bun:sqlite'
import { randomBytes } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createSQLiteBackup } from '../apps/control-plane/src/sqliteBackup'

const workerRoot = resolve(process.env.NEBULA_WORKER_DIR?.trim() || '/home/jorge/nebula-worker')
const backupBinary = join(workerRoot, 'bin', 'nebula-workspace-backup')
const temporary = await mkdtemp(join(tmpdir(), 'nubols-recovery-drill-'))

function revision(directory: string): string {
  const result = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: directory })
  return result.exitCode === 0 ? result.stdout.toString().trim() : 'unknown'
}

function dirty(directory: string): boolean {
  const result = Bun.spawnSync(['git', 'status', '--porcelain'], { cwd: directory })
  return result.exitCode !== 0 || Boolean(result.stdout.toString().trim())
}

try {
  const databasePath = join(temporary, 'control-plane.sqlite')
  const database = new Database(databasePath)
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE nebula_migration (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);
    CREATE TABLE recovery_evidence (id TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO nebula_migration VALUES ('fixture', 1);
    INSERT INTO recovery_evidence VALUES ('control-plane', 'CONTROL_PLANE_RESTORED');
  `)
  database.close()
  const controlBackup = await createSQLiteBackup({
    databasePath,
    outputDirectory: join(temporary, 'control-backups'),
  })
  const restoredDatabase = new Database(controlBackup.databasePath, { readonly: true })
  const controlValue = restoredDatabase.query<{ value: string }, []>(`
    SELECT value FROM recovery_evidence WHERE id = 'control-plane'
  `).get()?.value
  restoredDatabase.close()
  if (controlValue !== 'CONTROL_PLANE_RESTORED') throw new Error('control-plane restore verification failed')

  const workspaceSource = join(temporary, 'workspace-source')
  await mkdir(join(workspaceSource, '.nebula'), { recursive: true, mode: 0o700 })
  await writeFile(join(workspaceSource, 'workspace.txt'), 'WORKSPACE_RESTORED\n', { mode: 0o600 })
  await writeFile(join(workspaceSource, '.nebula', 'state.json'), '{"persistent":true}\n', { mode: 0o600 })
  const passphrasePath = join(temporary, 'passphrase')
  await writeFile(passphrasePath, randomBytes(32).toString('base64url'), { mode: 0o600 })
  await chmod(passphrasePath, 0o600)
  const workspaceArchive = join(temporary, 'workspace.nblbk')
  const create = Bun.spawnSync([
    backupBinary, '-mode', 'create', '-source', workspaceSource,
    '-output', workspaceArchive, '-passphrase-file', passphrasePath,
  ])
  if (create.exitCode !== 0) throw new Error(create.stderr.toString() || 'workspace backup failed')
  const workspaceDestination = join(temporary, 'workspace-restored')
  const restore = Bun.spawnSync([
    backupBinary, '-mode', 'restore', '-source', workspaceArchive,
    '-output', workspaceDestination, '-passphrase-file', passphrasePath,
  ])
  if (restore.exitCode !== 0) throw new Error(restore.stderr.toString() || 'workspace restore failed')
  if (await readFile(join(workspaceDestination, 'workspace.txt'), 'utf8') !== 'WORKSPACE_RESTORED\n') {
    throw new Error('workspace restore verification failed')
  }
  const workspaceManifest = JSON.parse(
    await readFile(`${workspaceArchive}.manifest.json`, 'utf8'),
  ) as { sha256: string; bytes: number }
  const evidence = {
    format: 'nubols-local-recovery-drill-v1',
    completedAt: new Date().toISOString(),
    result: 'passed',
    isolatedTemporaryEnvironment: true,
    controlPlane: {
      revision: revision(resolve('.')),
      workingTreeDirty: dirty(resolve('.')),
      sha256: controlBackup.manifest.sha256,
      bytes: controlBackup.manifest.bytes,
      quickCheck: 'ok',
      applicationMarker: controlValue,
    },
    workspace: {
      revision: revision(workerRoot),
      workingTreeDirty: dirty(workerRoot),
      sha256: workspaceManifest.sha256,
      bytes: workspaceManifest.bytes,
      applicationMarker: 'WORKSPACE_RESTORED',
      encryptedAtRest: true,
    },
  }
  console.log(JSON.stringify(evidence, null, 2))
} finally {
  await rm(temporary, { recursive: true, force: true })
}
