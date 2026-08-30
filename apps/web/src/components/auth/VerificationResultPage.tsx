import { CheckCircle2, TriangleAlert } from 'lucide-react'
import { CloudBrand } from './CloudBrand'

export function VerificationResultPage({
  errorCode,
  authenticated,
  onContinue,
  onBack,
}: {
  errorCode: string
  authenticated: boolean
  onContinue: () => void
  onBack: () => void
}) {
  const failed = Boolean(errorCode)
  return (
    <div className="relative z-[2] flex min-h-screen items-center justify-center px-5 text-[var(--color-text-primary)]">
      <div className="ui-border-surface w-full max-w-[420px] rounded-2xl bg-[var(--color-surface-auth)] p-6 shadow-[0_32px_100px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:p-8">
        <CloudBrand onSelect={onBack} />
        <div className="mt-8 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.06] text-white/55">
          {failed ? <TriangleAlert size={19} /> : <CheckCircle2 size={19} />}
        </div>
        <h1 className="mt-5 text-3xl font-medium tracking-[-0.04em]">
          {failed ? 'Verification link unavailable' : 'Email verified'}
        </h1>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
          {failed
            ? 'This verification link has expired or was already used. Sign in to request a fresh link.'
            : authenticated
              ? 'Your address is verified and your Nubols account is ready.'
              : 'Your address is verified. Sign in to continue.'}
        </p>
        <button
          type="button"
          onClick={onContinue}
          className="mt-7 flex h-11 w-full items-center justify-center rounded-full bg-[var(--color-control-primary)] text-sm font-semibold text-[var(--color-control-on-primary)] transition hover:bg-[var(--color-control-primary-hover)]"
        >
          {authenticated ? 'Continue to Nubols' : 'Go to sign in'}
        </button>
      </div>
    </div>
  )
}
