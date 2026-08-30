import { Database } from 'bun:sqlite'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { chmod, mkdir, stat, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'

export interface SQLiteBackupManifest {
  format: 'nubols-control-plane-sqlite-backup-v1'
  createdAt: string
  databaseFile: string
  bytes: number
  sha256: string
  migrationCount: number
}

export async function createSQLiteBackup(input: {
  databasePath: string
  outputDirectory: string
  now?: () => Date
}): Promise<{ databasePath: string; manifestPath: string; manifest: SQLiteBackupManifest }> {
  const source = resolve(input.databasePath.trim())
  const outputDirectory = resolve(input.outputDirectory.trim())
  if (!input.databasePath.trim() || !input.outputDirectory.trim()) {
    throw new Error('Database path and output directory are required')
  }
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 })
  await chmod(outputDirectory, 0o700)
  const createdAt = (input.now ?? (() => new Date()))()
  const stamp = createdAt.toISOString().replaceAll(':', '-').replaceAll('.', '-')
  const identifier = randomUUID().slice(0, 8)
  const databaseFilename = `nebula-cloud-${stamp}-${identifier}.sqlite`
  const target = resolve(outputDirectory, databaseFilename)
  if (target === source) throw new Error('Backup destination must differ from the source database')

  const database = new Database(source, { readonly: true })
  try {
    const integrity = database.query<{ quick_check: string }, []>('PRAGMA quick_check').get()
    if (integrity?.quick_check !== 'ok') throw new Error('Source SQLite quick_check failed')
    database.query('VACUUM INTO ?').run(target)
  } finally {
    database.close()
  }
  await chmod(target, 0o600)
  const backup = new Database(target, { readonly: true })
  let migrationCount = 0
  try {
    const integrity = backup.query<{ quick_check: string }, []>('PRAGMA quick_check').get()
    if (integrity?.quick_check !== 'ok') throw new Error('Backup SQLite quick_check failed')
    migrationCount = backup.query<{ count: number }, []>(`
      SELECT COUNT(*) AS count FROM nebula_migration
    `).get()?.count ?? 0
  } finally {
    backup.close()
  }
  const file = await stat(target)
  const manifest: SQLiteBackupManifest = {
    format: 'nubols-control-plane-sqlite-backup-v1',
    createdAt: createdAt.toISOString(),
    databaseFile: basename(target),
    bytes: file.size,
    sha256: await fileSHA256(target),
    migrationCount,
  }
  const manifestPath = `${target}.manifest.json`
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  })
  return { databasePath: target, manifestPath, manifest }
}

async function fileSHA256(path: string): Promise<string> {
  const hash = createHash('sha256')
  await new Promise<void>((resolvePromise, reject) => {
    const stream = createReadStream(path)
    stream.on('data', chunk => hash.update(chunk))
    stream.once('error', reject)
    stream.once('end', resolvePromise)
  })
  return hash.digest('hex')
}
