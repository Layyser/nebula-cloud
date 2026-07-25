import { useState, type FormEvent } from 'react'
import { ArrowRight, LoaderCircle } from 'lucide-react'
import { NebulaMark } from '@nebula/runtime-ui'
import { authClient } from '../../auth/authClient'

interface AuthPageProps {
  onAuthenticated: () => void
  onBack: () => void
}

export function AuthPage({ onAuthenticated, onBack }: AuthPageProps) {
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
    <div className="relative z-[2] flex min-h-screen items-center justify-center px-5 py-8 text-white">
      <div className="min-h-[612px] w-full max-w-[420px]">
        <div className="w-full rounded-2xl border border-white/[0.09] bg-[#0d0e0f]/90 p-6 shadow-[0_32px_100px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:p-8">
          <div className="flex h-6 items-center gap-2.5">
            <button
              type="button"
              onClick={onBack}
              className="flex h-6 cursor-pointer items-center gap-2.5 text-sm font-semibold leading-none text-white/80 transition hover:text-white"
            >
              <NebulaMark size={24} />
              <span className="nebula-wordmark leading-none">Nebula</span>
            </button>
            <span className="h-4 w-px bg-white/[0.12]" />
            <span className="flex h-6 items-center text-[10px] font-medium uppercase leading-none tracking-[0.18em] text-white/30">
              Cloud
            </span>
          </div>
        <h1 className="mt-3 text-3xl font-medium tracking-[-0.04em]">
          {mode === 'sign-in' ? 'Welcome back' : 'Create your workspace'}
        </h1>
        <p className="mt-2 text-sm leading-6 text-white/45">
          {mode === 'sign-in'
            ? 'Sign in to your organization and personal Linux workspace.'
            : 'Create your account. You can create or join an organization next.'}
        </p>

        <div className="relative mt-6 grid grid-cols-2 rounded-xl border border-white/[0.08] bg-black/20 p-0.5 text-sm">
          <span
            aria-hidden="true"
            className={`absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-[10px] bg-white/[0.1] shadow-sm transition-transform duration-300 ease-out ${
              mode === 'sign-up' ? 'translate-x-full' : 'translate-x-0'
            }`}
          />
          <button
            type="button"
            onClick={() => { setMode('sign-in'); setError('') }}
            className={`relative z-10 h-9 rounded-[10px] transition-colors duration-300 ${
              mode === 'sign-in' ? 'text-white' : 'text-white/40 hover:text-white/70'
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => { setMode('sign-up'); setError('') }}
            className={`relative z-10 h-9 rounded-[10px] transition-colors duration-300 ${
              mode === 'sign-up' ? 'text-white' : 'text-white/40 hover:text-white/70'
            }`}
          >
            Create account
          </button>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
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
            <p role="alert" className="rounded-xl border border-red-400/15 bg-red-400/[0.07] px-3 py-2.5 text-xs leading-5 text-red-200/80">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="group flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-black transition hover:bg-white/88 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {submitting ? (
              <LoaderCircle size={15} className="animate-spin" />
            ) : (
              <>
                {mode === 'sign-in' ? 'Sign in' : 'Continue'}
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </form>

        <p className="mt-5 text-center text-[11px] leading-5 text-white/25">
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
      <span className="mb-1.5 block text-xs font-medium text-white/55">{label}</span>
      <input
        type={type}
        value={value}
        onChange={event => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        className="h-11 w-full rounded-xl border border-white/[0.09] bg-black/25 px-3.5 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-white/[0.18] focus:bg-black/35"
      />
    </label>
  )
}
