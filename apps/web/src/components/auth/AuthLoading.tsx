import { LoaderCircle } from 'lucide-react'
import { BrandLockup, StatusGlyph, SurfacePanel } from '../ui/CloudUI'

export function AuthLoading({ label = 'Opening Nebula' }: { label?: string }) {
  return (
    <div className="cloud-state">
      <SurfacePanel className="cloud-loading">
        <BrandLockup surface="cloud" />
        <div className="cloud-loading__status">
          <StatusGlyph state="active"><LoaderCircle className="animate-spin" /></StatusGlyph>
          <span>{label}</span>
        </div>
      </SurfacePanel>
    </div>
  )
}
