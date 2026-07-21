import type { ComponentType, ReactNode } from 'react'
import { NebulaMark } from '@nebula/runtime-ui'

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
  children: ReactNode
}

export function CloudShell({ pathname, navigation, onNavigate, children }: CloudShellProps) {
  return (
    <div className="relative z-[2] flex h-screen min-h-0 bg-[#090a0a] text-white">
      <aside className="flex w-60 shrink-0 flex-col border-r border-white/[0.07] bg-[#111111] px-2">
        <button type="button" onClick={() => onNavigate('/app')} className="flex h-16 items-center gap-2 px-2 text-left">
          <NebulaMark />
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

        <div className="mt-auto border-t border-white/[0.06] px-2 py-4">
          <div className="flex items-center gap-2.5 rounded-xl px-1 py-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-violet-300/20 bg-violet-500/60 text-[10px] font-semibold">G</span>
            <span className="min-w-0">
              <span className="block truncate text-[12px] text-white/75">George</span>
              <span className="block truncate text-[10px] text-white/32">Nebula organization</span>
            </span>
          </div>
        </div>
      </aside>

      <main className="cloud-grid min-w-0 flex-1 overflow-y-auto bg-[#090a0a]">
        {children}
      </main>
    </div>
  )
}
