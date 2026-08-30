import { createSQLiteBackup } from '../src/sqliteBackup'

const argumentsList = process.argv.slice(2)
function value(name: string): string {
  const index = argumentsList.indexOf(name)
  if (index < 0 || !argumentsList[index + 1]) {
    throw new Error(`${name} is required`)
  }
  return argumentsList[index + 1]
}

if (argumentsList.includes('-h') || argumentsList.includes('--help')) {
  console.log('Usage: bun run backup --database PATH --output DIRECTORY')
  process.exit(0)
}

const result = await createSQLiteBackup({
  databasePath: value('--database'),
  outputDirectory: value('--output'),
})
console.log(JSON.stringify(result, null, 2))
