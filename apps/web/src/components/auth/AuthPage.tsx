import { useState, type FormEvent } from 'react'
import { ArrowRight, LoaderCircle } from 'lucide-react'
import { authClient } from '../../auth/authClient'
import { CloudBrand } from './CloudBrand'
import { SegmentedControl } from '../ui/SegmentedControl'

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
    <div className="relative z-[2] flex min-h-screen items-center justify-center px-5 py-8 text-[var(--color-text-primary)]">
      <div className="h-[531px] w-full max-w-[420px]">
        <div className="w-full rounded-2xl bg-[var(--color-surface-auth)] p-6 shadow-[0_32px_100px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:p-8">
          <CloudBrand onSelect={onBack} />
        <h1 className="mt-3 text-3xl font-medium tracking-[-0.04em]">
          {mode === 'sign-in' ? 'Welcome back' : 'Create your workspace'}
        </h1>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
          {mode === 'sign-in'
            ? 'Sign in to your organization and personal Linux workspace.'
            : 'Create your account. You can create or join an organization next.'}
        </p>

        <SegmentedControl
          ariaLabel="Authentication mode"
          value={mode}
          options={[{ value: 'sign-in', label: 'Sign in' }, { value: 'sign-up', label: 'Create account' }]}
          onValueChange={nextMode => { setMode(nextMode); setError('') }}
          tone="dark"
          className="mt-6 w-full"
        />

        <form onSubmit={submit} className="mt-6 space-y-4">
          {notice && (
            <p role="status" className="rounded-xl bg-[var(--color-status-warning-surface)] px-3 py-2.5 text-xs leading-5 text-[var(--color-status-warning-strong)]">
              {notice}
            </p>
          )}
          {mode === 'sign-up' && (
            <Field
              label="Name"
              type="text"
              value={name}
              onChange={setName}
              autoComplete="name"
              placeholder="George"
              required
            />
          )}
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            placeholder="you@company.com"
            required
          />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            placeholder="At least 8 characters"
            minLength={8}
            required
          />

          {error && (
            <p role="alert" className="rounded-xl bg-[var(--color-status-danger-surface)] px-3 py-2.5 text-xs leading-5 text-[var(--color-status-danger-strong)]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="group !mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--color-control-primary)] text-sm font-semibold text-[var(--color-control-on-primary)] transition hover:bg-[var(--color-control-primary-hover)] disabled:cursor-not-allowed disabled:opacity-55"
          >
            {submitting ? (
              <LoaderCircle size={15} className="animate-spin" />
            ) : (
              <>
                {mode === 'sign-in' ? 'Sign in' : 'Continue'}
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
              </>
            )}
          </button>
        </form>

        <p className="mt-5 text-center text-[11px] leading-5 text-[var(--color-text-subtle)]">
          Terms and privacy pages will be added before public launch.
        </p>
        </div>
      </div>
    </div>
  )
}

interface FieldProps {
  label: string
  type: string
  value: string
  onChange: (value: string) => void
  autoComplete: string
  placeholder: string
  required?: boolean
  minLength?: number
}

function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
  placeholder,
  required,
  minLength,
}: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-[var(--color-text-muted)]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={event => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        className="h-11 w-full rounded-xl bg-[var(--color-surface-field)] px-3.5 text-sm text-[var(--color-text-primary)] outline-none transition placeholder:text-[var(--color-text-subtle)] focus:bg-[var(--color-surface-field-focus)]"
      />
    </label>
  )
}
