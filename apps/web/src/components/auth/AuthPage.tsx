import { useState, type FormEvent } from 'react'
import { ArrowRight, LoaderCircle } from 'lucide-react'
import { authClient } from '../../auth/authClient'
import { ActionButton, FieldLabel, SurfacePanel, TextField } from '../ui/CloudUI'
import { CloudBrand } from './CloudBrand'

interface AuthPageProps {
  onAuthenticated: () => void
  onBack: () => void
  notice?: string
}

export function AuthPage({ onAuthenticated, onBack, notice }: AuthPageProps) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const result = mode === 'sign-up'
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
        : await authClient.signIn.email({ email: email.trim(), password })

      if (result.error) {
        setError(result.error.message || 'Authentication failed')
        return
      }
      onAuthenticated()
    } catch {
      setError('Could not reach the Nebula control plane')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="cloud-state cloud-state--auth">
      <div className="cloud-auth-anchor">
        <SurfacePanel className="cloud-auth-panel">
          <CloudBrand onSelect={onBack} />
          <h1 className="cloud-auth-panel__title">
            {mode === 'sign-in' ? 'Welcome back' : 'Create your workspace'}
          </h1>
          <p className="cloud-auth-panel__copy">
            {mode === 'sign-in'
              ? 'Sign in to your organization and personal Linux workspace.'
              : 'Create your account. You can create or join an organization next.'}
          </p>

          <div className="ui-segmented">
            <span aria-hidden="true" className={mode === 'sign-up' ? 'is-right' : ''} />
            <button type="button" aria-pressed={mode === 'sign-in'} onClick={() => { setMode('sign-in'); setError('') }}>
              Sign in
            </button>
            <button type="button" aria-pressed={mode === 'sign-up'} onClick={() => { setMode('sign-up'); setError('') }}>
              Create account
            </button>
          </div>

          <form onSubmit={submit} className="cloud-auth-form">
          {notice && (
            <p role="status" className="ui-notice ui-notice--warning">
              {notice}
            </p>
          )}
          {mode === 'sign-up' && (
            <FieldLabel label="Name">
              <TextField type="text" value={name} onChange={event => setName(event.target.value)} autoComplete="name" placeholder="George" required />
            </FieldLabel>
          )}
          <FieldLabel label="Email">
            <TextField type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" placeholder="you@company.com" required />
          </FieldLabel>
          <FieldLabel label="Password">
            <TextField type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} placeholder="At least 8 characters" minLength={8} required />
          </FieldLabel>

          {error && (
            <p role="alert" className="ui-notice ui-notice--error">
              {error}
            </p>
          )}

          <ActionButton
            type="submit"
            disabled={submitting}
            tone="primary"
            className="group w-full"
          >
            {submitting ? (
              <LoaderCircle size={15} className="animate-spin" />
            ) : (
              <>
                {mode === 'sign-in' ? 'Sign in' : 'Continue'}
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </ActionButton>
          </form>

          <p className="cloud-auth-panel__legal">
            Review the draft <a href="/legal/terms">terms</a> and <a href="/legal/privacy">privacy</a> surfaces.
          </p>
        </SurfacePanel>
      </div>
    </div>
  )
}
