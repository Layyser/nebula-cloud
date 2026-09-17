import { expect, test } from 'bun:test'
import { resolve } from 'node:path'

test('production scripts parse and reject execution outside a staged release', () => {
  for (const name of ['deploy-release.sh', 'stage-production.sh']) {
    expect(Bun.spawnSync(['bash', '-n', resolve(import.meta.dir, '../scripts', name)]).exitCode).toBe(0)
  }
  const result = Bun.spawnSync(['bash', 'scripts/deploy-release.sh'], { cwd: resolve(import.meta.dir, '..') })
  expect(result.exitCode).toBe(2)
})
