import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, LoaderCircle, MailCheck, TriangleAlert } from 'lucide-react'
import type { OrganizationInvitationStatusResponse } from '@nebula-cloud/contracts'
import { authClient } from '../../auth/authClient'
import { CloudBrand } from '../auth/CloudBrand'

type ViewState = OrganizationInvitationStatusResponse['state'] | 'loading' | 'accepting' | 'error'

export function InvitationPage({
  invitationId,
  userEmail,
  onAccepted,
  onBack,
}: {
  invitationId: string
  userEmail: string
  onAccepted: () => void
  onBack: () => void
}) {
  const [state, setState] = useState<ViewState>(invitationId ? 'loading' : 'not_found')
  const [invitation, setInvitation] = useState<OrganizationInvitationStatusResponse | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!invitationId) return
    setState('loading')
    setError('')
    try {
      const response = await fetch(
        `/api/invitations/${encodeURIComponent(invitationId)}/status`,
        { credentials: 'include' },
      )
      if (!response.ok) throw new Error('Could not check this invitation.')
      const result = await response.json() as OrganizationInvitationStatusResponse
      setInvitation(result)
      setState(result.state)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not check this invitation.')
      setState('error')
    }
  }, [invitationId])

  useEffect(() => { void load() }, [load])

  const accept = async () => {
    setState('accepting')
    setError('')
    const result = await authClient.organization.acceptInvitation({ invitationId })
    if (result.error) {
      setError(result.error.message || 'Could not accept this invitation.')
      await load()
      return
    }
    onAccepted()
  }

  const content = (() => {
    if (state === 'loading' || state === 'accepting') {
      return {
        title: state === 'accepting' ? 'Joining organization' : 'Checking invitation',
        body: state === 'accepting'
          ? 'Nubols is adding your account and selecting the organization.'
          : 'Confirming that this invitation belongs to your signed-in account.',
      }
    }
    if (state === 'pending') return {
      title: `Join ${invitation?.organizationName || 'the organization'}`,
      body: `You are signed in as ${userEmail}. Accept to join as ${invitation?.role || 'member'}.`,
    }
    if (state === 'expired') return {
      title: 'Invitation expired',
      body: 'Ask an organization owner or administrator to send a new invitation.',
    }
    if (state === 'already_used') return {
      title: 'Invitation already used',
      body: 'This invitation has already been accepted, rejected, or canceled.',
    }
    if (state === 'wrong_account') return {
      title: 'Different account required',
      body: `This invitation was not sent to ${userEmail}. Sign out and use the invited address.`,
    }
    if (state === 'not_found') return {
      title: 'Invitation not found',
      body: 'The link is incomplete or no longer exists. Check the full link from the invitation email.',
    }
    return {
      title: 'Could not check invitation',
      body: error || 'Please try again.',
    }
  })()

  const busy = state === 'loading' || state === 'accepting'
  return (
    <div className="relative z-[2] flex min-h-screen items-center justify-center px-5 py-12 text-white">
      <div className="ui-border-surface w-full max-w-[460px] rounded-2xl bg-[var(--color-surface-auth)] p-6 shadow-[0_32px_100px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:p-8">
        <CloudBrand onSelect={onBack} />
        <div className="mt-8 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.06] text-white/55">
          {busy
            ? <LoaderCircle size={19} className="animate-spin" />
            : state === 'pending'
              ? <MailCheck size={19} />
              : <TriangleAlert size={19} />}
        </div>
        <h1 className="mt-5 text-3xl font-medium tracking-[-0.04em]">{content.title}</h1>
        <p className="mt-2 text-sm leading-6 text-white/45">{content.body}</p>
        {state === 'pending' && (
          <button
            type="button"
            onClick={() => { void accept() }}
            className="mt-7 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-black transition hover:bg-white/88"
          >
            <ArrowRight size={15} />
            Accept invitation
          </button>
        )}
        {state === 'error' && (
          <button
            type="button"
            onClick={() => { void load() }}
            className="mt-7 flex h-11 w-full items-center justify-center rounded-full bg-white text-sm font-semibold text-black transition hover:bg-white/88"
          >
            Try again
          </button>
        )}
        {!busy && state !== 'pending' && state !== 'error' && (
          <button
            type="button"
            onClick={onAccepted}
            className="mt-7 flex h-11 w-full items-center justify-center rounded-full bg-white/[0.07] text-sm font-medium text-white/65 transition hover:bg-white/[0.1]"
          >
            Continue to Nubols
          </button>
        )}
      </div>
    </div>
  )
}
