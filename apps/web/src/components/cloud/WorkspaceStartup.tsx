import { Check } from 'lucide-react'
import type {
  WorkspaceStartupProgress,
  WorkspaceStartupStage,
} from '../../runtime/workspaceStartup'
import { CloudBrand } from '../auth/CloudBrand'

const stages: Array<{
  id: Exclude<WorkspaceStartupStage, 'ready'>
  label: string
}> = [
  { id: 'resolving', label: 'Resolving workspace' },
  { id: 'provisioning', label: 'Provisioning container' },
  { id: 'starting', label: 'Starting Nebula' },
]

function stageIndex(stage: WorkspaceStartupStage): number {
  if (stage === 'ready') return stages.length
  return stages.findIndex(candidate => candidate.id === stage)
}

export function WorkspaceStartup({
  progress,
}: {
  progress: WorkspaceStartupProgress
}) {
  const current = stageIndex(progress.stage)
  return (
    <div className="relative z-[2] flex min-h-screen items-center justify-center px-5 text-white">
      <div className="w-full max-w-sm rounded-2xl bg-[var(--color-surface-auth)] p-6 shadow-[0_32px_100px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <CloudBrand />
        <h1 className="mt-6 text-xl font-medium tracking-[-0.025em] text-white/90">
          Opening your operator
        </h1>
        <p className="mt-2 text-xs leading-5 text-white/38">
          Your persistent home is kept while compute starts around it.
        </p>
        <div className="mt-6 space-y-1">
          {stages.map((stage, index) => {
            const complete = index < current
            const active = index === current
            return (
              <div
                key={stage.id}
                className={`flex h-10 items-center gap-3 rounded-xl px-3 transition-colors duration-300 ${
                  active ? 'bg-[var(--color-surface-field)] text-white/80' : 'text-white/30'
                }`}
              >
                {active
                  ? (
                      <span className="block h-[19px] w-[19px] shrink-0 animate-spin rounded-full border-2 border-white/55 border-r-transparent" />
                    )
                  : (
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                        complete
                          ? 'border-[var(--color-border-success)] bg-[var(--color-status-success-surface)] text-[var(--color-status-success)]'
                          : 'border-white/[0.08] text-white/18'
                      }`}
                      >
                        {complete
                          ? <Check size={11} strokeWidth={2.25} />
                          : <span className="h-1 w-1 rounded-full bg-current" />}
                      </span>
                    )}
                <span className="text-xs">{stage.label}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
