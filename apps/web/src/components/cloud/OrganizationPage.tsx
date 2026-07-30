import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { LoaderCircle, Mail, ShieldCheck, UserRound, UsersRound } from 'lucide-react'
import { authClient } from '../../auth/authClient'
import type { CloudOrganization } from '../organization/OrganizationGate'

interface OrganizationMember {
  id: string
  role: string
  user: {
    id: string
    name: string
    email: string
    image?: string | null
  }
}

interface OrganizationInvitation {
  id: string
  email: string
  role: string
  status: string
  expiresAt: Date | string
}

export function OrganizationPage({ organization }: { organization: CloudOrganization }) {
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'member' | 'admin'>('member')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [organizationResult, invitationResult] = await Promise.all([
      authClient.organization.getFullOrganization({
        query: { organizationId: organization.id },
      }),
      authClient.organization.listInvitations({
        query: { organizationId: organization.id },
      }),
    ])
    if (organizationResult.error) {
      setError(organizationResult.error.message || 'Could not load organization members')
    } else {
      setMembers((organizationResult.data?.members || []) as OrganizationMember[])
    }
    if (!invitationResult.error) {
      setInvitations((invitationResult.data || []) as OrganizationInvitation[])
    }
    setLoading(false)
  }, [organization.id])

  useEffect(() => {
    void load()
  }, [load])

  const invite = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setNotice('')
    setSubmitting(true)
    const result = await authClient.organization.inviteMember({
      organizationId: organization.id,
      email: email.trim(),
      role,
    })
    if (result.error) {
      setError(result.error.message || 'Could not create the invitation')
    } else {
      setEmail('')
      setNotice('Invitation created. Email delivery will be connected before launch.')
      await load()
    }
    setSubmitting(false)
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 lg:px-10 lg:py-10">
      <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-white/25">Organization</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-medium tracking-[-0.04em] text-white/90">{organization.name}</h1>
          <p className="mt-2 text-sm text-white/38">Members, roles, and invitations are managed by Better Auth.</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-xs text-white/40">
          <ShieldCheck size={14} className="text-emerald-300/60" />
          Organization access active
        </div>
      </div>

      <div className="mt-8 grid gap-5 xl:grid-cols-[1fr_360px]">
        <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.018]">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
            <div>
              <h2 className="text-sm font-medium text-white/75">Members</h2>
              <p className="mt-1 text-xs text-white/28">{members.length} people in this organization</p>
            </div>
            <UsersRound size={16} className="text-white/25" />
          </div>
          {loading ? (
            <div className="flex h-32 items-center justify-center text-white/25">
              <LoaderCircle size={16} className="animate-spin" />
            </div>
          ) : members.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-white/30">No members found.</p>
          ) : (
            members.map(member => (
              <div key={member.id} className="flex items-center gap-3 border-b border-white/[0.05] px-5 py-3.5 last:border-0">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.07] bg-white/[0.04] text-xs font-semibold text-white/60">
                  {member.user.name.slice(0, 1).toUpperCase() || <UserRound size={14} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-white/72">{member.user.name}</span>
                  <span className="block truncate text-xs text-white/28">{member.user.email}</span>
                </span>
                <span className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-white/38">
                  {member.role}
                </span>
              </div>
            ))
          )}
        </section>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-white/[0.07] bg-white/[0.018] p-5">
            <div className="flex items-center gap-2">
              <Mail size={15} className="text-white/30" />
              <h2 className="text-sm font-medium text-white/75">Invite a member</h2>
            </div>
            <form onSubmit={invite} className="mt-4 space-y-3">
              <input
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                required
                placeholder="person@company.com"
                className="h-10 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-white/[0.17]"
              />
              <div className="grid grid-cols-2 rounded-xl border border-white/[0.08] bg-black/20 p-0.5 text-xs">
                {(['member', 'admin'] as const).map(option => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setRole(option)}
                    className={`h-8 rounded-[10px] capitalize transition ${role === option ? 'bg-white/[0.1] text-white/75' : 'text-white/30 hover:text-white/55'}`}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-white text-xs font-semibold text-black transition hover:bg-white/88 disabled:opacity-55"
              >
                {submitting && <LoaderCircle size={13} className="animate-spin" />}
                Create invitation
              </button>
            </form>
            {error && <p role="alert" className="mt-3 text-xs leading-5 text-red-200/75">{error}</p>}
            {notice && <p className="mt-3 text-xs leading-5 text-emerald-200/60">{notice}</p>}
          </section>

          {invitations.length > 0 && (
            <section className="rounded-2xl border border-white/[0.07] bg-white/[0.018] p-5">
              <h2 className="text-sm font-medium text-white/75">Pending invitations</h2>
              <div className="mt-3 space-y-3">
                {invitations.map(invitation => (
                  <div key={invitation.id} className="min-w-0">
                    <p className="truncate text-xs text-white/55">{invitation.email}</p>
                    <p className="mt-0.5 text-[10px] capitalize text-white/25">{invitation.role} · {invitation.status}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}
