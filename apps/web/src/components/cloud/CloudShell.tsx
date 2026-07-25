import { useState, type ComponentType, type ReactNode } from 'react'
import { Building2, Check, ChevronUp, LogOut } from 'lucide-react'
import { NebulaMark } from '@nebula/runtime-ui'
import type { CloudOrganization } from '../organization/OrganizationGate'

interface NavigationItem {
  id: string
  label: string
  icon: ComponentType<{ size?: number }>
  path: string
}

interface CloudShellProps {
  pathname: string
  navigation: NavigationItem[]
  onNavigate: (path: string) => void
  user: { name: string; email: string }
  activeOrganization: CloudOrganization
  organizations: CloudOrganization[]
  onSelectOrganization: (organizationId: string) => Promise<void>
  onSignOut: () => Promise<void>
  children: ReactNode
}

export function CloudShell({
  pathname,
  navigation,
  onNavigate,
  user,
  activeOrganization,
  organizations,
  onSelectOrganization,
  onSignOut,
  children,
}: CloudShellProps) {
  const [accountOpen, setAccountOpen] = useState(false)
  const initial = user.name.trim().slice(0, 1).toUpperCase() || 'N'

  return (
    <div className="relative z-[2] flex h-screen min-h-0 bg-[#090a0a] text-white">
      <aside className="flex w-60 shrink-0 flex-col border-r border-white/[0.07] bg-[#111111] px-2">
        <button type="button" onClick={() => onNavigate('/app')} className="flex h-16 items-center gap-2 px-2 text-left">
          <NebulaMark size={24} />
          <span className="nebula-wordmark text-[14px] font-semibold">Nebula</span>
        </button>

        <nav className="space-y-0.5">
          {navigation.map(item => {
            const Icon = item.icon
            const active = item.path === '/app' ? pathname === '/app' : pathname.startsWith(item.path)
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.path)}
                className={`flex h-9 w-full items-center gap-3 rounded-xl px-3 text-[13px] font-medium transition-colors ${active ? 'bg-white/[0.08] text-white/90' : 'text-white/50 hover:bg-white/[0.055] hover:text-white/85'}`}
              >
                <Icon size={15} />
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="relative mt-auto border-t border-white/[0.06] px-1 py-3">
          {accountOpen && (
            <div className="absolute bottom-[calc(100%-3px)] left-1 right-1 overflow-hidden rounded-xl border border-white/[0.09] bg-[#151616] p-1 shadow-[0_18px_50px_rgba(0,0,0,0.45)]">
              <p className="px-2.5 pb-1 pt-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/22">Organizations</p>
              {organizations.map(organization => (
                <button
                  key={organization.id}
                  type="button"
                  onClick={async () => {
                    await onSelectOrganization(organization.id)
                    setAccountOpen(false)
                  }}
                  className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs text-white/50 transition hover:bg-white/[0.055] hover:text-white/75"
                >
                  <Building2 size={13} className="text-white/28" />
                  <span className="min-w-0 flex-1 truncate">{organization.name}</span>
                  {organization.id === activeOrganization.id && <Check size={12} className="text-emerald-300/65" />}
                </button>
              ))}
              <div className="mx-2 my-1 border-t border-white/[0.06]" />
              <button
                type="button"
                onClick={() => void onSignOut()}
                className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs text-white/45 transition hover:bg-red-400/[0.07] hover:text-red-200/70"
              >
                <LogOut size={13} />
                Sign out
              </button>
            </div>
          )}

          <button
            type="button"
            aria-expanded={accountOpen}
            onClick={() => setAccountOpen(open => !open)}
            className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition hover:bg-white/[0.045]"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-violet-300/20 bg-violet-500/60 text-[10px] font-semibold">{initial}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] text-white/75">{user.name}</span>
              <span className="block truncate text-[10px] text-white/32">{activeOrganization.name}</span>
            </span>
            <ChevronUp size={13} className={`text-white/25 transition-transform ${accountOpen ? '' : 'rotate-180'}`} />
          </button>
        </div>
      </aside>

      <main className="cloud-grid min-w-0 flex-1 overflow-y-auto bg-[#090a0a]">
        {children}
      </main>
    </div>
  )
}
