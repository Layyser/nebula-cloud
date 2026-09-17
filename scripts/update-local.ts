import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

export function localPlan(components: string, rollout: string, workspaces: string): string[] {
  const selected = new Set(components.trim().split(/\s+/))
  if (![...selected].every(c => ['frontend', 'cloud', 'agent', 'worker', 'rollout'].includes(c))) throw new Error('Unknown component')
  if (!['on-restart', 'force'].includes(rollout)) throw new Error('Use on-restart or force')
  const targets = workspaces.trim().split(/\s+/).filter(Boolean)
  if (targets.some(t => t !== '--all' && !/^[a-zA-Z0-9_-]+$/.test(t)) || (targets.includes('--all') && targets.length !== 1)) throw new Error('Use workspace IDs or --all')
  if (selected.has('rollout') && (selected.size !== 1 || rollout !== 'force')) throw new Error('rollout must be used alone with force')
  const force = rollout === 'force' && (selected.has('agent') || selected.has('rollout'))
  if (rollout === 'force' && !force) throw new Error('Force requires agent or rollout')
  if (force && !targets.length) throw new Error('Force requires explicit WORKSPACES=<IDs> or --all')
  if (!force && targets.length) throw new Error('WORKSPACES is only used with force')
  return [
    ...['frontend', 'agent', 'worker'].filter(c => selected.has(c)).map(c => `check-${c}`),
    ...(selected.has('frontend') ? ['package-frontend'] : []),
    ...(selected.has('cloud') || selected.has('frontend') || selected.has('agent') || selected.has('worker') ? ['check-cloud'] : []),
    ...(selected.has('agent') ? ['image-agent'] : []),
    ...(selected.has('worker') ? ['restart-worker'] : []),
    ...(selected.has('cloud') || selected.has('frontend') ? ['restart-cloud'] : []),
    ...(force ? ['rollout-force'] : []),
  ]
}

if (import.meta.main) {
  const args = Bun.argv.slice(2)
  const option = (name: string, fallback: string) => args.includes(name) ? args[args.indexOf(name) + 1] ?? '' : fallback
  try {
    if (args.some((arg, i) => i % 2 === 0 && !['--components', '--rollout', '--workspaces', '--dry-run'].includes(arg))) throw new Error('Unknown option')
    const components = option('--components', 'cloud')
    const rollout = option('--rollout', 'on-restart')
    const workspaces = option('--workspaces', '')
    const plan = localPlan(components, rollout, workspaces)
    const cloud = resolve(import.meta.dir, '..')
    if (cloud !== '/home/jorge/nebula-cloud') throw new Error('This local-only pipeline requires the /home/jorge development checkout')
    const repo = (name: string) => name === 'cloud' ? cloud : resolve(cloud, `../nebula-${name}`)
    const bun = process.execPath
    const workerURL = new URL(process.env.NEBULA_WORKER_BIND || 'http://127.0.0.1:7780')
    if (workerURL.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(workerURL.hostname) || workerURL.username || workerURL.password || workerURL.pathname !== '/' || workerURL.search || workerURL.hash) throw new Error('Local pipeline requires a loopback worker URL')
    if (process.env.NEBULA_WORKSPACE_IMAGE && process.env.NEBULA_WORKSPACE_IMAGE !== 'nebula-workspace:dev') throw new Error('Local pipeline only publishes nebula-workspace:dev')
    if (plan.includes('image-agent') || plan.includes('rollout-force')) {
      for (const file of [resolve(repo('worker'), '.env'), resolve(cloud, 'apps/control-plane/.env')]) {
        const value = existsSync(file) ? readFileSync(file, 'utf8').match(/^\s*(?:export\s+)?NEBULA_WORKSPACE_IMAGE\s*=\s*([^\r\n]+)/m)?.[1].trim().replace(/^['"]|['"]$/g, '') : undefined
        if (value && value !== 'nebula-workspace:dev') throw new Error('Local services must pin nebula-workspace:dev; refusing to change their specs')
      }
    }
    console.log(`Local plan: ${plan.join(' → ')}; rollout=${rollout}`)
    if (args.includes('--dry-run')) process.exit(0)
    const run = (cwd: string, command: string[], env = {}) => {
      const result = Bun.spawnSync(command, { cwd, env: { ...process.env, ...env }, stdout: 'inherit', stderr: 'inherit' })
      if (result.exitCode !== 0) throw new Error(`Failed: ${command[0]} ${command[1] ?? ''}`)
    }
    const packageFrontend = () => {
      const file = resolve(repo('frontend'), 'package.json')
      const pkg = JSON.parse(readFileSync(file, 'utf8'))
      if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error('Frontend version must be major.minor.patch')
      const [major, minor, patch] = pkg.version.split('.').map(Number)
      let next = patch + 1
      while (existsSync(resolve(cloud, `vendor/nebula-runtime-ui-${major}.${minor}.${next}.tgz`))) next++
      pkg.version = `${major}.${minor}.${next}`
      writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n')
      run(repo('frontend'), [bun, 'pm', 'pack', '--destination', resolve(cloud, 'vendor')])
      const archive = `vendor/nebula-runtime-ui-${pkg.version}.tgz`
      const checksumFile = resolve(cloud, 'vendor/SHA256SUMS')
      const hash = createHash('sha256').update(readFileSync(resolve(cloud, archive))).digest('hex')
      writeFileSync(checksumFile, readFileSync(checksumFile, 'utf8').trimEnd() + `\n${hash}  ${archive}\n`)
      run(cloud, [bun, 'add', '--cwd', 'apps/web', `@nebula/runtime-ui@file:../../${archive}`])
      run(cloud, [bun, 'install', '--frozen-lockfile'])
    }
    for (const action of plan) {
      console.log(`\n== ${action} ==`)
      switch (action) {
        case 'check-frontend': run(repo('frontend'), [bun, 'test']); run(repo('frontend'), [bun, 'run', 'build']); break
        case 'check-agent': run(repo('agent'), ['make', '-j2', 'test']); run(repo('agent'), ['make', '-j2', 'nebula']); break
        case 'check-worker': for (const target of ['test', 'integration', 'image-contract', 'browser-image-contract', 'build']) run(repo('worker'), ['make', ...(existsSync('/home/jorge/.local/go/bin/go') ? ['GO=/home/jorge/.local/go/bin/go'] : []), target]); break
        case 'package-frontend': packageFrontend(); break
        case 'check-cloud': run(cloud, [bun, 'test']); run(cloud, [bun, 'run', 'build']); break
        case 'image-agent': run(repo('worker'), ['bash', 'scripts/build-workspace-image.sh'], { NEBULA_WORKSPACE_IMAGE: 'nebula-workspace:dev', NEBULA_IMAGE_VERSION: 'dev', NEBULA_CORE_DIR: repo('agent') }); break
        case 'restart-worker': run(cloud, ['sudo', '-n', 'systemctl', 'restart', 'nebula-worker']); run(cloud, ['curl', '--fail', '--retry', '10', '--retry-connrefused', '--retry-delay', '1', 'http://127.0.0.1:7780/health/ready']); break
        case 'restart-cloud':
          if (Bun.spawnSync(['systemctl', '--user', 'is-active', '--quiet', 'nebula-cloud-control-plane']).exitCode === 0) {
            run(cloud, ['systemctl', '--user', 'restart', 'nebula-cloud-control-plane'])
            run(cloud, ['curl', '--fail', '--retry', '10', '--retry-connrefused', '--retry-delay', '1', 'http://127.0.0.1:7790/health/ready'])
          } else console.log('Control-plane service is not active; start bun run dev to use the new build.')
          break
        case 'rollout-force': run(repo('worker'), ['bash', 'scripts/rollout-workspace.sh', ...workspaces.trim().split(/\s+/)], { SKIP_AGENT_BUILD: '1', SKIP_IMAGE_BUILD: '1', NEBULA_WORKSPACE_IMAGE: 'nebula-workspace:dev', NEBULA_WORKER_BIND: workerURL.toString().replace(/\/$/, '') }); break
      }
    }
    console.log(rollout === 'on-restart' && plan.includes('image-agent') ? 'Image published. Running operators are unchanged; the next operator Restart adopts it.' : 'Local pipeline complete.')
  } catch (error) { console.error(error instanceof Error ? error.message : error); process.exit(1) }
}
