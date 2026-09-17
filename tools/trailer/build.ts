import { mkdir, copyFile, readFile, writeFile, chmod, readdir, cp } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'

await mkdir('dist/assets', { recursive: true })
await copyFile('renders/minecraft-cursor-clean.mp4', 'dist/assets/minecraft-proof-cut.mp4')
await cp('renders/minecraft-frames', 'dist/assets/minecraft-frames', { recursive: true })
const require = createRequire(import.meta.url)
const build = await Bun.build({ entrypoints: ['./scene.tsx', './hooks-entry.ts', './yours-entry.ts', './working-entry.ts'], outdir: './dist', naming: '[name].[ext]', define: { 'import.meta.env': '{}' }, target: 'browser', format: 'iife', plugins: [{ name: 'single-react', setup(builder) {
  builder.onResolve({ filter: /^react(?:-dom)?(?:\/.*)?$/ }, args => ({ path: require.resolve(args.path) }))
  builder.onResolve({ filter: /^@xterm\/xterm$/ }, () => ({ path: resolve('terminal-preview-driver.ts') }))
  builder.onResolve({ filter: /\?raw$/ }, args => ({ path: resolve(args.resolveDir, args.path.slice(0, -4)), namespace: 'raw-asset' }))
  builder.onLoad({ filter: /.*/, namespace: 'raw-asset' }, async args => ({ contents: await readFile(args.path, 'utf8'), loader: 'text' }))
} }], loader: { '.glsl': 'text', '.svg': 'file' }, minify: false })
if (!build.success) throw new Error(build.logs.join('\n'))
await copyFile('index.html', 'dist/index.html')
await copyFile('hooks-scene.css', 'dist/hooks-scene.css')
await copyFile('yours-scene.css', 'dist/yours-scene.css')
await copyFile('working-scene.css', 'dist/working-scene.css')
// Consume the application's compiled Tailwind and semantic tokens unchanged.
// Build Cloud first after changing shared component classes.
const appAssets = resolve('../../apps/web/dist/assets')
const assetNames = await readdir(appAssets)
const appCSS = assetNames.find(name => /^index-.*\.css$/.test(name))
if (!appCSS) throw new Error('Build nebula-cloud before building the trailer.')
for (const asset of assetNames) {
  if (!asset.endsWith('.js')) await copyFile(resolve(appAssets, asset), resolve('dist/assets', asset))
}
// These platform-only fallback faces are unused by this scene; keep the actual
// bundled app fonts without asking the renderer to resolve OS emoji fonts.
await writeFile('dist/assets/app.css', (await readFile(resolve(appAssets, appCSS), 'utf8'))
  .replace(/@import\s+url\([^)]*\);?/g, '')
  .replace(/["'](?:Apple Color Emoji|Segoe UI Emoji|Segoe UI Symbol)["']/gi, 'sans-serif')
  .replace(/["']?SFMono-Regular["']?/gi, 'monospace'))
// Preserve the exact existing wordmark styling, then apply trailer-only sizing.
const sharedCSS = await readFile(resolve('../../../nebula-frontend/src/index.css'), 'utf8')
const wordmark = sharedCSS.match(/\.nebula-wordmark\s*\{[^}]+\}/)![0]
await writeFile('dist/style.css', wordmark + '\n' + await readFile('style.css', 'utf8'))
await copyFile('sidebar-scene.css', 'dist/sidebar-scene.css')
await copyFile('terminal-scene.css', 'dist/terminal-scene.css')
await chmod('dist/assets/segoeui.ttf', 0o644).catch(() => {})
await writeFile('dist/assets/segoeui.ttf', await readFile('/mnt/c/Windows/Fonts/segoeui.ttf'))
await writeFile('dist/assets/consola.ttf', await readFile('/mnt/c/Windows/Fonts/consola.ttf'))
// Same Courier Prime family used by the app; bundle it for offline rendering.
const css = await (await fetch('https://fonts.googleapis.com/css2?family=Courier+Prime:wght@700', { headers: { 'User-Agent': 'Mozilla/5.0' } })).text()
const url = css.match(/url\((https:[^)]+)\)/)?.[1]
if (!url) throw new Error('Could not resolve the existing Courier Prime font')
await writeFile('dist/assets/courier-prime.woff2', Buffer.from(await (await fetch(url)).arrayBuffer()))
// Independent composition avoids multiple roots in the combined Studio project.
await mkdir('hooks-dist', { recursive: true })
await copyFile('hooks.html', 'hooks-dist/index.html')
await cp('dist/assets', 'hooks-dist/assets', { recursive: true })
for (const name of await readdir('dist')) {
  if (name.endsWith('.svg') || ['hooks-entry.js', 'style.css', 'hooks-scene.css'].includes(name)) {
    await copyFile(`dist/${name}`, `hooks-dist/${name}`)
  }
}
await mkdir('yours-dist', { recursive: true })
await copyFile('yours.html', 'yours-dist/index.html')
await cp('dist/assets', 'yours-dist/assets', { recursive: true })
for (const name of ['yours-entry.js', 'style.css', 'yours-scene.css']) {
  await copyFile(`dist/${name}`, `yours-dist/${name}`)
}
await mkdir('working-dist', { recursive: true })
await copyFile('working.html', 'working-dist/index.html')
await cp('dist/assets', 'working-dist/assets', { recursive: true })
for (const name of ['working-entry.js', 'style.css', 'working-scene.css']) {
  await copyFile(`dist/${name}`, `working-dist/${name}`)
}
console.log('Built trailer preview and standalone compositions with original components.')
if (process.env.TRAILER_EXPORT_2K === '1') {
  await cp('dist', 'export-2k', { recursive: true })
  const html = (await readFile('dist/index.html', 'utf8'))
    .replace('data-width="1920" data-height="1080"', 'data-width="2560" data-height="1440"')
    .replace('</head>', '<style>html,body{width:2560px;height:1440px}#opening{transform:scale(1.3333333333333333);transform-origin:0 0}</style></head>')
  await writeFile('export-2k/index.html', html)
  if (process.env.TRAILER_EXPORT_TAIL === '1') {
    await cp('export-2k', 'renders/export-tail', { recursive: true })
    const tail = html.replace('data-duration="73.26"', 'data-duration="9.2666666667" data-proof-start="64" data-proof-duration="9.2666666667"')
      .replace('data-start="64.26"', 'data-start="0.26"')
      .replace(/<section[^>]+>/g, tag => tag.replace(/\sdata-(start|duration|track-index)="[^"]*"/g, ''))
    await writeFile('renders/export-tail/index.html', tail)
  }
}
if (process.env.TRAILER_PROOF === '1') {
  await cp('dist', 'proof-dist', { recursive: true })
  let html = await readFile('dist/index.html', 'utf8')
  html = html.replace(/data-duration="[\d.]+"/, 'data-duration="8" data-proof-start="35"')
  html = html.replace(/<section[^>]+>/g, tag => tag.replace(/\sdata-(start|duration|track-index)="[^"]*"/g, ''))
  await writeFile('proof-dist/index.html', html)
}
