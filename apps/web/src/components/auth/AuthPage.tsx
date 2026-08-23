import { useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, LoaderCircle } from 'lucide-react'
import { authClient } from '../../auth/authClient'
import { CloudBrand } from './CloudBrand'
import { SegmentedControl } from '../ui/SegmentedControl'

interface AuthPageProps {
  onAuthenticated: () => void
  onBack: () => void
  notice?: string
  initialMode?: AuthMode
  resetToken?: string
}

type AuthMode = 'sign-in' | 'sign-up' | 'forgot-password' | 'reset-password'

export function AuthPage({
  onAuthenticated,
  onBack,
  notice,
  initialMode = 'sign-in',
  resetToken = '',
}: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [verificationRequired, setVerificationRequired] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setSuccess('')
    setVerificationRequired(false)
    setSubmitting(true)

    try {
      if (mode === 'forgot-password') {
        const result = await authClient.requestPasswordReset({
          email: email.trim(),
          redirectTo: `${window.location.origin}/reset-password`,
        })
        if (result.error) {
          setError(result.error.message || 'Could not request a password reset')
          return
        }
        setSuccess('If this email exists, a password reset link is on its way.')
        return
      }

      if (mode === 'reset-password') {
        if (!resetToken) {
          setError('This password reset link is invalid or incomplete.')
          return
        }
        const result = await authClient.resetPassword({
          newPassword: password,
          token: resetToken,
        })
        if (result.error) {
          setError(result.error.message || 'Could not reset your password')
          return
        }
        setMode('sign-in')
        setPassword('')
        setSuccess('Password updated. Sign in with your new password.')
        window.history.replaceState(null, '', '/login')
        return
      }

      const result = mode === 'sign-up'
        ? await authClient.signUp.email({
            name: name.trim(),
            email: email.trim(),
            password,
            callbackURL: `${window.location.origin}/app`,
          })
        : await authClient.signIn.email({ email: email.trim(), password })

      if (result.error) {
        setError(result.error.message || 'Authentication failed')
        setVerificationRequired(result.error.code === 'EMAIL_NOT_VERIFIED')
        return
      }
      if (mode === 'sign-up' && result.data.token === null) {
        setSuccess('Check your email to verify your account before signing in.')
        return
      }
      onAuthenticated()
    } catch {
      setError('Could not reach the Nebula control plane')
    } finally {
      setSubmitting(false)
    }
  }

  const resendVerification = async () => {
    setError('')
    setSuccess('')
    setSubmitting(true)
    try {
      const result = await authClient.sendVerificationEmail({
        email: email.trim(),
        callbackURL: `${window.location.origin}/app`,
      })
      if (result.error) {
        setError(result.error.message || 'Could not resend the verification email')
        return
      }
      setSuccess('A fresh verification link is on its way.')
      setVerificationRequired(false)
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
          {mode === 'sign-in'
            ? 'Welcome back'
            : mode === 'sign-up'
              ? 'Create your workspace'
              : mode === 'forgot-password'
                ? 'Reset your password'
                : 'Choose a new password'}
        </h1>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
          {mode === 'sign-in'
            ? 'Sign in to your organization and personal Linux workspace.'
            : mode === 'sign-up'
              ? 'Create your account. You can create or join an organization next.'
              : mode === 'forgot-password'
                ? 'Enter your email and we will send a secure reset link.'
                : 'Use at least eight characters for your new password.'}
        </p>

        {(mode === 'sign-in' || mode === 'sign-up') ? (
          <SegmentedControl
            ariaLabel="Authentication mode"
            value={mode}
            options={[{ value: 'sign-in', label: 'Sign in' }, { value: 'sign-up', label: 'Create account' }]}
            onValueChange={nextMode => {
              setMode(nextMode)
              setError('')
              setSuccess('')
              setVerificationRequired(false)
            }}
            tone="dark"
            className="mt-6 w-full"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setMode('sign-in')
              setError('')
              setSuccess('')
              setVerificationRequired(false)
            }}
            className="mt-6 inline-flex items-center gap-2 text-sm text-[var(--color-text-muted)] transition hover:text-[var(--color-text-primary)]"
          >
            <ArrowLeft size={14} />
            Back to sign in
          </button>
        )}

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
          {mode !== 'reset-password' && (
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              placeholder="you@company.com"
              required
            />
          )}
          {mode !== 'forgot-password' && (
            <Field
              label={mode === 'reset-password' ? 'New password' : 'Password'}
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              placeholder="At least 8 characters"
              minLength={8}
              required
            />
          )}

          {mode === 'sign-in' && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setMode('forgot-password')
                  setError('')
                  setSuccess('')
                  setVerificationRequired(false)
                }}
                className="text-xs text-[var(--color-text-muted)] transition hover:text-[var(--color-text-primary)]"
              >
                Forgot password?
              </button>
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-xl bg-[var(--color-status-danger-surface)] px-3 py-2.5 text-xs leading-5 text-[var(--color-status-danger-strong)]">
              {error}
            </p>
          )}
          {success && (
            <p role="status" className="rounded-xl bg-[var(--color-status-success-surface)] px-3 py-2.5 text-xs leading-5 text-[var(--color-status-success-strong)]">
              {success}
            </p>
          )}
          {verificationRequired && email.trim() && (
            <button
              type="button"
              disabled={submitting}
              onClick={() => void resendVerification()}
              className="text-xs font-medium text-[var(--color-text-muted)] transition hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-55"
            >
              Resend verification email
            </button>
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
                {mode === 'sign-in'
                  ? 'Sign in'
                  : mode === 'forgot-password'
                    ? 'Send reset link'
                    : mode === 'reset-password'
                      ? 'Update password'
                      : 'Continue'}
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
