import { Component, type ReactNode } from 'react'
import { PublicPageShell } from './PublicPageShell'

export function RecoveryPage({ error = false }: { error?: boolean }) {
  return <PublicPageShell onLaunch={() => window.location.assign('/login')} className="flex min-h-dvh flex-col">
    <main id="main-content" className="mx-auto w-full max-w-[1088px] flex-1 px-6 py-40">
      <p className="text-sm text-muted-foreground">{error ? 'Something went wrong' : '404'}</p>
      <h1 className="mt-4 text-4xl font-medium tracking-tight">{error ? 'Let’s try that again.' : 'Page not found.'}</h1>
      <p className="mt-4 text-muted-foreground">{error ? 'Reload the page, or return home.' : 'This page may have moved, or the link is incorrect.'}</p>
      <div className="mt-8 flex gap-6"><a href="/" className="underline underline-offset-4">Back to home</a>{error ? <button onClick={() => window.location.reload()}>Try again</button> : <a href="/docs" className="underline underline-offset-4">Documentation</a>}</div>
    </main>
  </PublicPageShell>
}
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <RecoveryPage error /> : this.props.children }
}
