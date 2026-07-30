import { Check, LoaderCircle } from 'lucide-react'
import type {
  WorkspaceStartupProgress,
  WorkspaceStartupStage,
} from '../../runtime/workspaceStartup'
import { BrandLockup, StatusGlyph, SurfacePanel } from '../ui/CloudUI'

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
    <div className="cloud-state">
      <SurfacePanel className="cloud-state__panel cloud-startup">
        <BrandLockup surface="cloud" />
        <h1 className="cloud-state__title">
          Opening your operator
        </h1>
        <p className="cloud-state__copy">
          Your persistent home is kept while compute starts around it.
        </p>
        <div className="cloud-startup__steps">
          {stages.map((stage, index) => {
            const complete = index < current
            const active = index === current
            return (
              <div
                key={stage.id}
                className={`cloud-startup__step ${
                  active ? 'is-active' : ''
                }`}
              >
                <StatusGlyph state={complete ? 'complete' : active ? 'active' : 'pending'}>
                  {complete
                    ? <Check strokeWidth={2.25} />
                    : active
                      ? <LoaderCircle className="animate-spin" />
                      : <span className="ui-status-glyph__dot" />}
                </StatusGlyph>
                <span>{stage.label}</span>
              </div>
            )
          })}
        </div>
      </SurfacePanel>
    </div>
  )
}
