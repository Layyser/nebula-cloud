import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { localPlan } from './update-local'

// The user owns the SSH master and credentials; this command never opens one.
if (import.meta.main) {
  const cloud = resolve(import.meta.dir, '..')
  const socket = '/home/jorge/.ssh/nubols-control'
  const run = (command: string[], cwd = cloud, input?: string) => {
    const result = Bun.spawnSync(command, { cwd, stdin: input ? new TextEncoder().encode(input) : undefined, stdout: 'inherit', stderr: 'inherit' })
    if (result.exitCode) throw new Error(`Command failed: ${command[0]}`)
  }
  try {
    const [rollout = 'on-restart', workspaces = ''] = Bun.argv.slice(2)
    localPlan('agent', rollout, workspaces) // shared validation of rollout/target IDs
    run(['ssh', '-S', socket, '-O', 'check', 'nubols'])
    const revisions: string[] = []
    for (const name of ['agent', 'frontend', 'worker', 'cloud']) {
      const cwd = resolve(cloud, `../nebula-${name}`)
      const output = (args: string[]) => {
        const p = Bun.spawnSync(['git', ...args], { cwd })
        if (p.exitCode) throw new Error(`Git failed in ${name}`)
        return p.stdout.toString().trim()
      }
      if (output(['status', '--porcelain'])) throw new Error(`Commit changes in nebula-${name} first`)
      const revision = output(['rev-parse', 'HEAD'])
      if (output(['ls-remote', 'origin', 'refs/heads/main']).split(/\s+/)[0] !== revision) throw new Error(`Push nebula-${name} main first`)
      revisions.push(revision)
    }
    run(['make', 'release-check', `BUN=${process.execPath}`])
    const release = `release-${new Date().toISOString().replace(/[^0-9]/g, '')}-${revisions[3].slice(0, 12)}`
    const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`
    run(['ssh', '-S', socket, '-o', 'BatchMode=yes', 'nubols',
      `bash -s -- ${[release, rollout, workspaces, ...revisions].map(quote).join(' ')}`], cloud,
      readFileSync(resolve(cloud, 'scripts/stage-production.sh'), 'utf8'))
    console.log(`Production deployed: /opt/nubols/releases/${release}`)
    run(['ssh', '-S', socket, '-O', 'exit', 'nubols'])
  } catch (error) { console.error(error); process.exit(1) }
}
