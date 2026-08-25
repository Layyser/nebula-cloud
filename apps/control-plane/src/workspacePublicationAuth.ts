import { timingSafeEqual } from 'node:crypto'
import type { WorkerRuntimeAccess } from './workerClient'

export interface WorkspacePublicationRuntimeAccess {
  getRuntimeAccess(input: {
    workspaceId: string
    signal?: AbortSignal
  }): Promise<WorkerRuntimeAccess>
}

function credentialEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length
    && timingSafeEqual(leftBuffer, rightBuffer)
}

export async function workspacePublicationAuthenticated(input: {
  request: Request
  workspaceId: string
  worker: WorkspacePublicationRuntimeAccess
  workspaceEnabled: (workspaceId: string) => boolean
}): Promise<boolean> {
  const authorization = input.request.headers.get('authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) return false
  const presentedToken = authorization.slice('Bearer '.length)
  if (!presentedToken || !input.workspaceEnabled(input.workspaceId)) return false
  try {
    const access = await input.worker.getRuntimeAccess({
      workspaceId: input.workspaceId,
      signal: input.request.signal,
    })
    return access.workspaceId.length > 0
      && credentialEqual(presentedToken, access.accessToken)
  } catch {
    return false
  }
}
