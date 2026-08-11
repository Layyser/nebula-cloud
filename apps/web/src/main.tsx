import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@nebula/runtime-ui/styles.css'
import './cloud.css'

async function start() {
  const search = new URLSearchParams(window.location.search)
  const landingPreview = search.get('landing-preview')
  const previewMode = landingPreview === 'runtime'
    ? landingPreview
    : import.meta.env.DEV
      ? search.get('preview')
      : null

  let app
  if (previewMode) {
    const preview = await import('./preview/CloudPreview')
    const fixtures = await import('./preview/cloudPreviewFixtures')
    if (fixtures.isCloudPreviewMode(previewMode)) {
      app = <preview.CloudPreview mode={previewMode} />
    }
  }

  if (!app) {
    const { default: App } = await import('./App')
    app = <App />
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>{app}</StrictMode>,
  )
}

void start()
